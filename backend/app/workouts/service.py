import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from itertools import groupby
from typing import Any

from sqlalchemy import case, delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.exercises.service import visible_to
from app.models import Exercise, WorkoutSession, WorkoutSet

NOT_FOUND = 404
CONFLICT = 409
WORKOUT_NOT_FOUND_MESSAGE = "Workout not found"
SET_NOT_FOUND_MESSAGE = "Set not found"
EXERCISE_NOT_FOUND_MESSAGE = "Exercise not found"
WORKOUT_IN_PROGRESS_MESSAGE = "A workout is already in progress"
# Far more than a real session holds; bounds the size of one workout response.
MAX_SETS_PER_WORKOUT = 500
# Epley's formula: one-rep max = weight * (1 + reps / 30).
EPLEY_DIVISOR = 30
# Above this many reps the estimate says more about endurance than strength.
MAX_REPS_FOR_ESTIMATE = 12
KG_PRECISION = Decimal("0.0001")


@dataclass(frozen=True)
class NewSet:
    exercise_id: uuid.UUID
    reps: int
    weight_kg: Decimal
    rpe: Decimal | None


@dataclass(frozen=True)
class LoggedSet:
    workout_set: WorkoutSet
    exercise_name: str


@dataclass(frozen=True)
class WorkoutDetail:
    workout: WorkoutSession
    sets: list[LoggedSet]


@dataclass(frozen=True)
class LastSets:
    workout_id: uuid.UUID
    started_at: datetime
    sets: list[LoggedSet]


@dataclass(frozen=True)
class _SummarySet:
    reps: int
    weight_kg: Decimal
    exercise_name: str


@dataclass(frozen=True)
class WorkoutSummary:
    workout: WorkoutSession
    set_count: int
    # Each exercise once, in the order it was first logged.
    exercise_names: list[str]
    # Weight times reps, added up over every set.
    volume_kg: Decimal


@dataclass(frozen=True)
class WorkoutHistoryPage:
    items: list[WorkoutSummary]
    total: int


@dataclass(frozen=True)
class RecordSet:
    workout_id: uuid.UUID
    achieved_at: datetime
    reps: int
    weight_kg: Decimal
    estimated_1rm_kg: Decimal | None


@dataclass(frozen=True)
class ExerciseRecords:
    heaviest: RecordSet | None
    best_estimated_1rm: RecordSet | None


def _workout_not_found() -> AppError:
    return AppError(status_code=NOT_FOUND, message=WORKOUT_NOT_FOUND_MESSAGE)


def _set_not_found() -> AppError:
    return AppError(status_code=NOT_FOUND, message=SET_NOT_FOUND_MESSAGE)


def _own_workout(
    db: Session, user_id: uuid.UUID, workout_id: uuid.UUID, *, lock: bool = False
) -> WorkoutSession:
    """The user's workout, or a 404 that does not reveal whether it exists.

    Locking it makes requests that change the same workout take turns.
    """
    query = (
        select(WorkoutSession)
        .where(WorkoutSession.id == workout_id, WorkoutSession.user_id == user_id)
        .execution_options(populate_existing=True)
    )
    workout = db.scalars(query.with_for_update() if lock else query).one_or_none()
    if workout is None:
        raise _workout_not_found()
    return workout


def _logged_sets(
    db: Session,
    workout_id: uuid.UUID,
    *,
    exercise_id: uuid.UUID | None = None,
    set_id: uuid.UUID | None = None,
) -> list[LoggedSet]:
    query = (
        select(WorkoutSet, Exercise.name)
        .join(Exercise, Exercise.id == WorkoutSet.exercise_id)
        .where(WorkoutSet.session_id == workout_id)
        .order_by(WorkoutSet.position)
        .execution_options(populate_existing=True)
    )
    if exercise_id is not None:
        query = query.where(WorkoutSet.exercise_id == exercise_id)
    if set_id is not None:
        query = query.where(WorkoutSet.id == set_id)
    return [
        LoggedSet(workout_set=workout_set, exercise_name=exercise_name)
        for workout_set, exercise_name in db.execute(query)
    ]


def _detail(db: Session, workout: WorkoutSession) -> WorkoutDetail:
    return WorkoutDetail(workout=workout, sets=_logged_sets(db, workout.id))


def start_workout(db: Session, user_id: uuid.UUID, now: datetime) -> WorkoutDetail:
    # A unique index allows one unfinished workout per user; ON CONFLICT turns a
    # second one into "no row", even when two requests arrive together.
    workout = db.scalars(
        pg_insert(WorkoutSession)
        .values(user_id=user_id, started_at=now)
        .on_conflict_do_nothing(
            index_elements=[WorkoutSession.user_id],
            index_where=WorkoutSession.ended_at.is_(None),
        )
        .returning(WorkoutSession)
    ).one_or_none()
    if workout is None:
        raise AppError(status_code=CONFLICT, message=WORKOUT_IN_PROGRESS_MESSAGE)
    db.commit()
    return WorkoutDetail(workout=workout, sets=[])


def get_active_workout(db: Session, user_id: uuid.UUID) -> WorkoutDetail | None:
    workout = db.scalars(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user_id, WorkoutSession.ended_at.is_(None))
        .execution_options(populate_existing=True)
    ).one_or_none()
    return _detail(db, workout) if workout is not None else None


def get_workout(
    db: Session, user_id: uuid.UUID, workout_id: uuid.UUID
) -> WorkoutDetail:
    return _detail(db, _own_workout(db, user_id, workout_id))


def finish_workout(
    db: Session, user_id: uuid.UUID, workout_id: uuid.UUID, now: datetime
) -> WorkoutDetail:
    """End the workout. Finishing it again keeps the first end time."""
    workout = _own_workout(db, user_id, workout_id, lock=True)
    if workout.ended_at is not None:
        return _detail(db, workout)
    finished = db.scalars(
        update(WorkoutSession)
        .where(WorkoutSession.id == workout.id)
        # Never earlier than the start, even if the server clock stepped back.
        .values(ended_at=func.greatest(WorkoutSession.started_at, now))
        .returning(WorkoutSession)
        .execution_options(populate_existing=True)
    ).one()
    db.commit()
    return _detail(db, finished)


def delete_workout(db: Session, user_id: uuid.UUID, workout_id: uuid.UUID) -> None:
    workout = _own_workout(db, user_id, workout_id, lock=True)
    # The database deletes the workout's sets with it.
    db.execute(delete(WorkoutSession).where(WorkoutSession.id == workout.id))
    db.commit()


def add_set(
    db: Session, user_id: uuid.UUID, workout_id: uuid.UUID, new_set: NewSet
) -> LoggedSet:
    workout = _own_workout(db, user_id, workout_id, lock=True)
    exercise_name = db.scalar(
        select(Exercise.name).where(
            Exercise.id == new_set.exercise_id, visible_to(user_id)
        )
    )
    if exercise_name is None:
        raise AppError(status_code=NOT_FOUND, message=EXERCISE_NOT_FOUND_MESSAGE)

    set_count, last_position = db.execute(
        select(func.count(), func.coalesce(func.max(WorkoutSet.position), 0)).where(
            WorkoutSet.session_id == workout.id
        )
    ).one()
    if set_count >= MAX_SETS_PER_WORKOUT:
        raise AppError(
            status_code=CONFLICT,
            message=(
                f"This workout has reached its limit of {MAX_SETS_PER_WORKOUT} sets"
            ),
        )

    workout_set = db.scalars(
        pg_insert(WorkoutSet)
        .values(
            session_id=workout.id,
            exercise_id=new_set.exercise_id,
            position=last_position + 1,
            reps=new_set.reps,
            weight_kg=new_set.weight_kg,
            rpe=new_set.rpe,
        )
        .returning(WorkoutSet)
    ).one()
    db.commit()
    return LoggedSet(workout_set=workout_set, exercise_name=exercise_name)


def update_set(
    db: Session,
    user_id: uuid.UUID,
    workout_id: uuid.UUID,
    set_id: uuid.UUID,
    changes: Mapping[str, Any],
) -> LoggedSet:
    workout = _own_workout(db, user_id, workout_id, lock=True)
    if changes:
        db.execute(
            update(WorkoutSet)
            .where(WorkoutSet.id == set_id, WorkoutSet.session_id == workout.id)
            .values(**changes)
        )
    updated = _logged_sets(db, workout.id, set_id=set_id)
    if not updated:
        raise _set_not_found()
    db.commit()
    return updated[0]


def delete_set(
    db: Session, user_id: uuid.UUID, workout_id: uuid.UUID, set_id: uuid.UUID
) -> None:
    workout = _own_workout(db, user_id, workout_id, lock=True)
    deleted_id = db.scalar(
        delete(WorkoutSet)
        .where(WorkoutSet.id == set_id, WorkoutSet.session_id == workout.id)
        .returning(WorkoutSet.id)
    )
    if deleted_id is None:
        raise _set_not_found()
    db.commit()


def _summarise(workout: WorkoutSession, sets: list[_SummarySet]) -> WorkoutSummary:
    return WorkoutSummary(
        workout=workout,
        set_count=len(sets),
        # dict.fromkeys drops repeats while keeping first-logged order.
        exercise_names=list(dict.fromkeys(logged.exercise_name for logged in sets)),
        volume_kg=sum((logged.weight_kg * logged.reps for logged in sets), Decimal(0)),
    )


def list_history(
    db: Session, user_id: uuid.UUID, limit: int, offset: int
) -> WorkoutHistoryPage:
    """A page of the user's finished workouts, newest first."""
    finished = (
        WorkoutSession.user_id == user_id,
        WorkoutSession.ended_at.is_not(None),
    )
    total = db.scalar(select(func.count()).select_from(WorkoutSession).where(*finished))
    workouts = db.scalars(
        select(WorkoutSession)
        .where(*finished)
        .order_by(WorkoutSession.started_at.desc(), WorkoutSession.id)
        .limit(limit)
        .offset(offset)
        .execution_options(populate_existing=True)
    ).all()

    # One query for the whole page's sets, rather than one per workout.
    rows = db.execute(
        select(
            WorkoutSet.session_id, WorkoutSet.reps, WorkoutSet.weight_kg, Exercise.name
        )
        .join(Exercise, Exercise.id == WorkoutSet.exercise_id)
        .where(WorkoutSet.session_id.in_([workout.id for workout in workouts]))
        .order_by(WorkoutSet.session_id, WorkoutSet.position)
    )
    sets_by_workout = {
        workout_id: [
            _SummarySet(reps=row.reps, weight_kg=row.weight_kg, exercise_name=row.name)
            for row in workout_rows
        ]
        for workout_id, workout_rows in groupby(rows, key=lambda row: row.session_id)
    }
    return WorkoutHistoryPage(
        items=[
            _summarise(workout, sets_by_workout.get(workout.id, []))
            for workout in workouts
        ],
        total=total or 0,
    )


def estimate_one_rep_max(weight_kg: Decimal, reps: int) -> Decimal | None:
    """The Epley estimate of a one-rep max, or None when reps are too high to trust."""
    if reps < 1 or reps > MAX_REPS_FOR_ESTIMATE:
        return None
    if reps == 1:
        return weight_kg
    return (weight_kg * (EPLEY_DIVISOR + reps) / EPLEY_DIVISOR).quantize(KG_PRECISION)


def get_records(
    db: Session, user_id: uuid.UUID, exercise_id: uuid.UUID
) -> ExerciseRecords:
    """The user's best sets of an exercise across their finished workouts."""
    completed_sets = (
        select(
            WorkoutSession.id,
            WorkoutSession.started_at,
            WorkoutSet.reps,
            WorkoutSet.weight_kg,
        )
        .join(WorkoutSession, WorkoutSession.id == WorkoutSet.session_id)
        .where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.ended_at.is_not(None),
            WorkoutSet.exercise_id == exercise_id,
            WorkoutSet.reps > 0,
        )
    )
    # A record that is later only matched stays with the set that set it.
    earliest_first = (WorkoutSession.started_at, WorkoutSet.position)
    # Orders sets the same way as the Epley estimate, without dividing.
    estimate_rank = case(
        (WorkoutSet.reps == 1, WorkoutSet.weight_kg * EPLEY_DIVISOR),
        else_=WorkoutSet.weight_kg * (EPLEY_DIVISOR + WorkoutSet.reps),
    )

    heaviest = db.execute(
        completed_sets.order_by(
            WorkoutSet.weight_kg.desc(), WorkoutSet.reps.desc(), *earliest_first
        ).limit(1)
    ).one_or_none()
    best_estimate = db.execute(
        completed_sets.where(WorkoutSet.reps <= MAX_REPS_FOR_ESTIMATE)
        .order_by(estimate_rank.desc(), *earliest_first)
        .limit(1)
    ).one_or_none()

    def to_record(row: Any) -> RecordSet | None:
        if row is None:
            return None
        return RecordSet(
            workout_id=row.id,
            achieved_at=row.started_at,
            reps=row.reps,
            weight_kg=row.weight_kg,
            estimated_1rm_kg=estimate_one_rep_max(row.weight_kg, row.reps),
        )

    return ExerciseRecords(
        heaviest=to_record(heaviest), best_estimated_1rm=to_record(best_estimate)
    )


def get_last_sets(
    db: Session, user_id: uuid.UUID, exercise_id: uuid.UUID
) -> LastSets | None:
    """The exercise's sets from the user's latest finished workout that has any."""
    has_the_exercise = (
        select(WorkoutSet.id)
        .where(
            WorkoutSet.session_id == WorkoutSession.id,
            WorkoutSet.exercise_id == exercise_id,
        )
        .exists()
    )
    workout = db.execute(
        select(WorkoutSession.id, WorkoutSession.started_at)
        .where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.ended_at.is_not(None),
            has_the_exercise,
        )
        .order_by(WorkoutSession.started_at.desc(), WorkoutSession.id)
        .limit(1)
    ).one_or_none()
    if workout is None:
        return None
    return LastSets(
        workout_id=workout.id,
        started_at=workout.started_at,
        sets=_logged_sets(db, workout.id, exercise_id=exercise_id),
    )

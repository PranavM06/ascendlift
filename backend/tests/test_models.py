import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    BodyweightEntry,
    DailyInsight,
    Exercise,
    Food,
    InsightStatus,
    RoutineTemplate,
    TargetHistory,
    TemplateExercise,
    UnitPreference,
    User,
    WorkoutSession,
    WorkoutSet,
)

pytestmark = pytest.mark.integration

TODAY = date(2026, 10, 8)
NOW = datetime(2026, 10, 8, 18, 30, tzinfo=UTC)


def add_user(session: Session, apple_sub: str = "apple-sub-1") -> User:
    user = User(apple_sub=apple_sub)
    session.add(user)
    session.flush()
    return user


def add_exercise(
    session: Session, name: str = "Back Squat", owner_id: uuid.UUID | None = None
) -> Exercise:
    exercise = Exercise(name=name, muscle_groups=["quads"], owner_id=owner_id)
    session.add(exercise)
    session.flush()
    return exercise


def add_template(session: Session, user: User) -> RoutineTemplate:
    template = RoutineTemplate(user_id=user.id, name="Push Day")
    session.add(template)
    session.flush()
    return template


def add_workout_session(
    session: Session, user: User, template_id: uuid.UUID | None = None
) -> WorkoutSession:
    workout = WorkoutSession(user_id=user.id, started_at=NOW, template_id=template_id)
    session.add(workout)
    session.flush()
    return workout


def test_new_user_gets_id_utc_timezone_and_lbs_by_default(db_session: Session) -> None:
    # Act
    user = add_user(db_session)
    db_session.refresh(user)

    # Assert
    assert isinstance(user.id, uuid.UUID)
    assert user.timezone == "UTC"
    assert user.unit_preference is UnitPreference.LBS
    assert user.created_at is not None


def test_two_users_cannot_share_an_apple_account(db_session: Session) -> None:
    # Arrange
    add_user(db_session, apple_sub="same-sub")

    # Act / Assert
    with pytest.raises(IntegrityError):
        add_user(db_session, apple_sub="same-sub")


def test_database_rejects_an_unknown_unit_preference(db_session: Session) -> None:
    # Act / Assert
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO users (apple_sub, unit_preference) "
                "VALUES ('sub-stone', 'stone')"
            )
        )


def test_bodyweight_is_stored_in_kg_without_losing_precision(
    db_session: Session,
) -> None:
    # Arrange
    user = add_user(db_session)
    weight_of_225_lb_in_kg = Decimal("102.0583")

    # Act
    entry = BodyweightEntry(
        user_id=user.id, entry_date=TODAY, weight_kg=weight_of_225_lb_in_kg
    )
    db_session.add(entry)
    db_session.flush()
    db_session.refresh(entry)

    # Assert
    assert entry.weight_kg == weight_of_225_lb_in_kg


def test_user_has_at_most_one_bodyweight_entry_per_day(db_session: Session) -> None:
    # Arrange
    user = add_user(db_session)
    db_session.add(
        BodyweightEntry(user_id=user.id, entry_date=TODAY, weight_kg=Decimal("80"))
    )
    db_session.flush()

    # Act / Assert
    db_session.add(
        BodyweightEntry(user_id=user.id, entry_date=TODAY, weight_kg=Decimal("81"))
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_target_history_rejects_negative_calories(db_session: Session) -> None:
    # Arrange
    user = add_user(db_session)

    # Act / Assert
    db_session.add(
        TargetHistory(
            user_id=user.id,
            calories=-1,
            protein_g=150,
            carbs_g=200,
            fat_g=60,
            effective_date=TODAY,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_seeded_exercise_names_are_unique(db_session: Session) -> None:
    # Arrange
    add_exercise(db_session, name="Deadlift")

    # Act / Assert
    with pytest.raises(IntegrityError):
        add_exercise(db_session, name="Deadlift")


def test_user_can_add_a_custom_exercise_named_like_a_seeded_one(
    db_session: Session,
) -> None:
    # Arrange
    user = add_user(db_session)
    add_exercise(db_session, name="Deadlift")

    # Act
    custom = add_exercise(db_session, name="Deadlift", owner_id=user.id)

    # Assert
    assert custom.owner_id == user.id


def test_workout_set_can_be_saved_without_rpe(db_session: Session) -> None:
    # Arrange
    user = add_user(db_session)
    workout = add_workout_session(db_session, user)
    exercise = add_exercise(db_session)

    # Act
    workout_set = WorkoutSet(
        session_id=workout.id,
        exercise_id=exercise.id,
        position=1,
        reps=5,
        weight_kg=Decimal("100"),
    )
    db_session.add(workout_set)
    db_session.flush()

    # Assert
    assert workout_set.rpe is None


@pytest.mark.parametrize(
    ("reps", "rpe"),
    [(-1, None), (5, Decimal("10.5")), (5, Decimal("0.5"))],
)
def test_workout_set_rejects_negative_reps_and_out_of_range_rpe(
    db_session: Session, reps: int, rpe: Decimal | None
) -> None:
    # Arrange
    user = add_user(db_session)
    workout = add_workout_session(db_session, user)
    exercise = add_exercise(db_session)

    # Act / Assert
    db_session.add(
        WorkoutSet(
            session_id=workout.id,
            exercise_id=exercise.id,
            position=1,
            reps=reps,
            weight_kg=Decimal("100"),
            rpe=rpe,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_template_exercise_rejects_rep_range_with_min_above_max(
    db_session: Session,
) -> None:
    # Arrange
    user = add_user(db_session)
    template = add_template(db_session, user)
    exercise = add_exercise(db_session)

    # Act / Assert
    db_session.add(
        TemplateExercise(
            template_id=template.id,
            exercise_id=exercise.id,
            position=1,
            target_sets=3,
            rep_min=12,
            rep_max=8,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_deleting_a_template_keeps_workouts_started_from_it(
    db_session: Session,
) -> None:
    # Arrange
    user = add_user(db_session)
    template = add_template(db_session, user)
    workout = add_workout_session(db_session, user, template_id=template.id)

    # Act
    db_session.execute(delete(RoutineTemplate).where(RoutineTemplate.id == template.id))
    db_session.refresh(workout)

    # Assert
    assert workout.template_id is None


def test_deleting_a_user_deletes_their_workouts_and_sets(db_session: Session) -> None:
    # Arrange
    user = add_user(db_session)
    workout = add_workout_session(db_session, user)
    exercise = add_exercise(db_session)
    db_session.add(
        WorkoutSet(
            session_id=workout.id,
            exercise_id=exercise.id,
            position=1,
            reps=5,
            weight_kg=Decimal("100"),
        )
    )
    db_session.flush()

    # Act
    db_session.execute(delete(User).where(User.id == user.id))

    # Assert
    assert db_session.scalar(select(func.count()).select_from(WorkoutSession)) == 0
    assert db_session.scalar(select(func.count()).select_from(WorkoutSet)) == 0


def test_food_source_id_is_unique(db_session: Session) -> None:
    # Arrange
    def usda_food() -> Food:
        return Food(
            source_id="usda:171077",
            name="Chicken breast",
            serving_size=Decimal("100"),
            serving_unit="g",
            calories=Decimal("165"),
            protein_g=Decimal("31"),
            carbs_g=Decimal("0"),
            fat_g=Decimal("3.6"),
        )

    db_session.add(usda_food())
    db_session.flush()

    # Act / Assert
    db_session.add(usda_food())
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_daily_insight_round_trips_json_and_starts_pending(db_session: Session) -> None:
    # Arrange
    user = add_user(db_session)
    stats_snapshot = {"weekly_volume_kg": 12500, "prs": ["Back Squat"]}

    # Act
    insight = DailyInsight(
        user_id=user.id, insight_date=TODAY, stats_snapshot=stats_snapshot
    )
    db_session.add(insight)
    db_session.flush()
    db_session.refresh(insight)

    # Assert
    assert insight.status is InsightStatus.PENDING
    assert insight.insight is None
    assert insight.stats_snapshot == stats_snapshot


def test_user_has_at_most_one_insight_per_day(db_session: Session) -> None:
    # Arrange
    user = add_user(db_session)
    db_session.add(DailyInsight(user_id=user.id, insight_date=TODAY))
    db_session.flush()

    # Act / Assert
    db_session.add(DailyInsight(user_id=user.id, insight_date=TODAY))
    with pytest.raises(IntegrityError):
        db_session.flush()

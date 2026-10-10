import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.responses import MAX_OFFSET
from app.db.base import MAX_RPE, MIN_RPE
from app.workouts.service import LastSets, LoggedSet, WorkoutDetail, WorkoutSummary

DEFAULT_HISTORY_PAGE_SIZE = 20
MAX_HISTORY_PAGE_SIZE = 50
MAX_REPS = 1000
MAX_WEIGHT_KG = 2000
# Matches the four decimal places the weight columns keep.
WEIGHT_DECIMAL_PLACES = 4
RPE_STEP = Decimal("0.5")

Reps = Annotated[int, Field(ge=0, le=MAX_REPS)]
WeightKg = Annotated[
    Decimal, Field(ge=0, le=MAX_WEIGHT_KG, decimal_places=WEIGHT_DECIMAL_PLACES)
]
Rpe = Annotated[Decimal, Field(ge=MIN_RPE, le=MAX_RPE, multiple_of=RPE_STEP)]


class SetCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exercise_id: uuid.UUID
    reps: Reps
    weight_kg: WeightKg
    rpe: Rpe | None = None


class SetUpdate(BaseModel):
    """Fields left out are not changed. Sending `rpe` as null clears it."""

    model_config = ConfigDict(extra="forbid")

    reps: Reps | None = None
    weight_kg: WeightKg | None = None
    rpe: Rpe | None = None

    @field_validator("reps", "weight_kg")
    @classmethod
    def forbid_null(cls, value: Decimal | int | None) -> Decimal | int:
        if value is None:
            raise ValueError("must not be null")
        return value


class ExerciseSummary(BaseModel):
    id: uuid.UUID
    name: str


class SetResponse(BaseModel):
    id: uuid.UUID
    exercise: ExerciseSummary
    position: int
    reps: int
    # Decimals are sent as strings, e.g. "102.0583", so no precision is lost.
    weight_kg: Decimal
    rpe: Decimal | None

    @classmethod
    def from_logged_set(cls, logged: LoggedSet) -> Self:
        workout_set = logged.workout_set
        return cls(
            id=workout_set.id,
            exercise=ExerciseSummary(
                id=workout_set.exercise_id, name=logged.exercise_name
            ),
            position=workout_set.position,
            reps=workout_set.reps,
            weight_kg=workout_set.weight_kg,
            rpe=workout_set.rpe,
        )


class WorkoutResponse(BaseModel):
    id: uuid.UUID
    started_at: datetime
    # Null while the workout is in progress.
    ended_at: datetime | None
    template_id: uuid.UUID | None
    sets: list[SetResponse]

    @classmethod
    def from_detail(cls, detail: WorkoutDetail) -> Self:
        workout = detail.workout
        return cls(
            id=workout.id,
            started_at=workout.started_at,
            ended_at=workout.ended_at,
            template_id=workout.template_id,
            sets=[SetResponse.from_logged_set(logged) for logged in detail.sets],
        )


class HistoryQuery(BaseModel):
    """Query parameters for listing finished workouts."""

    model_config = ConfigDict(extra="forbid")

    limit: int = Field(
        default=DEFAULT_HISTORY_PAGE_SIZE, ge=1, le=MAX_HISTORY_PAGE_SIZE
    )
    offset: int = Field(default=0, ge=0, le=MAX_OFFSET)


class WorkoutSummaryResponse(BaseModel):
    id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None
    template_id: uuid.UUID | None
    set_count: int
    # Each exercise once, in the order it was first logged.
    exercise_names: list[str]
    # Weight times reps, added up over every set.
    volume_kg: Decimal

    @classmethod
    def from_summary(cls, summary: WorkoutSummary) -> Self:
        workout = summary.workout
        return cls(
            id=workout.id,
            started_at=workout.started_at,
            ended_at=workout.ended_at,
            template_id=workout.template_id,
            set_count=summary.set_count,
            exercise_names=summary.exercise_names,
            volume_kg=summary.volume_kg,
        )


class RecordSetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    workout_id: uuid.UUID
    # When the workout that holds the set started.
    achieved_at: datetime
    reps: int
    weight_kg: Decimal
    # Null when the set has too many reps for a trustworthy estimate.
    estimated_1rm_kg: Decimal | None


class RecordsResponse(BaseModel):
    """A user's best sets of one exercise. Null until they have logged it."""

    model_config = ConfigDict(from_attributes=True)

    heaviest: RecordSetResponse | None
    best_estimated_1rm: RecordSetResponse | None


class LastSetsResponse(BaseModel):
    """What the user did for one exercise the last time they trained it."""

    workout_id: uuid.UUID
    started_at: datetime
    sets: list[SetResponse]

    @classmethod
    def from_last_sets(cls, last: LastSets) -> Self:
        return cls(
            workout_id=last.workout_id,
            started_at=last.started_at,
            sets=[SetResponse.from_logged_set(logged) for logged in last.sets],
        )

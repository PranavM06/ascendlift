import uuid
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.models import Equipment, Exercise, MuscleGroup

MAX_EXERCISE_NAME_LENGTH = 100
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100

ExerciseName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=MAX_EXERCISE_NAME_LENGTH
    ),
]


class ExerciseQuery(BaseModel):
    """Query parameters for listing exercises."""

    model_config = ConfigDict(extra="forbid")

    search: ExerciseName | None = None
    muscle_group: MuscleGroup | None = None
    equipment: Equipment | None = None
    limit: int = Field(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE)
    offset: int = Field(default=0, ge=0)


class ExerciseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: ExerciseName
    muscle_groups: list[MuscleGroup] = Field(min_length=1)
    equipment: Equipment | None = None

    @field_validator("muscle_groups")
    @classmethod
    def forbid_repeated_muscle_groups(
        cls, value: list[MuscleGroup]
    ) -> list[MuscleGroup]:
        if len(set(value)) != len(value):
            raise ValueError("must not list a muscle group twice")
        return value


class ExerciseResponse(BaseModel):
    id: uuid.UUID
    name: str
    muscle_groups: list[str]
    equipment: str | None
    # True for an exercise the user added; false for one from the shared library.
    is_custom: bool

    @classmethod
    def from_exercise(cls, exercise: Exercise) -> Self:
        return cls(
            id=exercise.id,
            name=exercise.name,
            muscle_groups=exercise.muscle_groups,
            equipment=exercise.equipment,
            is_custom=exercise.owner_id is not None,
        )

import uuid
from decimal import Decimal
from typing import Annotated, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.exercises.schemas import NO_CONTROL_CHARACTERS
from app.templates.service import TemplateDetail, TemplateItem
from app.workouts.schemas import ExerciseSummary, Rpe, WeightKg

MAX_TEMPLATE_NAME_LENGTH = 100
MAX_NOTES_LENGTH = 2000
MAX_TEMPLATE_EXERCISES = 50
MAX_TARGET_SETS = 20
MAX_TARGET_REPS = 100
# Notes may span lines, so only the NUL byte Postgres text cannot store is barred.
NO_NUL_BYTES = r"^[^\x00]*$"

TemplateName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_TEMPLATE_NAME_LENGTH,
        pattern=NO_CONTROL_CHARACTERS,
    ),
]
Notes = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, max_length=MAX_NOTES_LENGTH, pattern=NO_NUL_BYTES
    ),
]
TargetReps = Annotated[int, Field(ge=1, le=MAX_TARGET_REPS)]


class TemplateExerciseWrite(BaseModel):
    """One exercise of a template: how many sets, and the rep range to aim for."""

    model_config = ConfigDict(extra="forbid")

    exercise_id: uuid.UUID
    target_sets: int = Field(ge=1, le=MAX_TARGET_SETS)
    rep_min: TargetReps
    rep_max: TargetReps
    target_weight_kg: WeightKg | None = None
    target_rpe: Rpe | None = None

    @model_validator(mode="after")
    def require_ordered_rep_range(self) -> Self:
        if self.rep_max < self.rep_min:
            raise ValueError("rep_max must not be below rep_min")
        return self


class TemplateWrite(BaseModel):
    """A whole template. Used to create one and to replace one."""

    model_config = ConfigDict(extra="forbid")

    name: TemplateName
    notes: Notes | None = None
    # In the order the exercises are performed.
    exercises: list[TemplateExerciseWrite] = Field(
        min_length=1, max_length=MAX_TEMPLATE_EXERCISES
    )

    @field_validator("notes")
    @classmethod
    def treat_blank_notes_as_none(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("exercises")
    @classmethod
    def forbid_repeated_exercises(
        cls, value: list[TemplateExerciseWrite]
    ) -> list[TemplateExerciseWrite]:
        exercise_ids = [planned.exercise_id for planned in value]
        if len(set(exercise_ids)) != len(exercise_ids):
            raise ValueError("must not list an exercise twice")
        return value


class TemplateExerciseResponse(BaseModel):
    id: uuid.UUID
    exercise: ExerciseSummary
    position: int
    target_sets: int
    rep_min: int
    rep_max: int
    target_weight_kg: Decimal | None
    target_rpe: Decimal | None

    @classmethod
    def from_item(cls, item: TemplateItem) -> Self:
        row = item.row
        return cls(
            id=row.id,
            exercise=ExerciseSummary(id=row.exercise_id, name=item.exercise_name),
            position=row.position,
            target_sets=row.target_sets,
            rep_min=row.rep_min,
            rep_max=row.rep_max,
            target_weight_kg=row.target_weight_kg,
            target_rpe=row.target_rpe,
        )


class TemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    notes: str | None
    exercises: list[TemplateExerciseResponse]

    @classmethod
    def from_detail(cls, detail: TemplateDetail) -> Self:
        return cls(
            id=detail.template.id,
            name=detail.template.name,
            notes=detail.template.notes,
            exercises=[
                TemplateExerciseResponse.from_item(item) for item in detail.exercises
            ],
        )

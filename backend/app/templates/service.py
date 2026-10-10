import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from itertools import groupby

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.exercises.service import visible_to
from app.models import Exercise, RoutineTemplate, TemplateExercise

NOT_FOUND = 404
CONFLICT = 409
TEMPLATE_NOT_FOUND_MESSAGE = "Template not found"
EXERCISE_NOT_FOUND_MESSAGE = "Exercise not found"
# Keeps the unpaged template list, and one account's rows, bounded.
MAX_TEMPLATES_PER_USER = 100


@dataclass(frozen=True)
class PlannedExercise:
    exercise_id: uuid.UUID
    target_sets: int
    rep_min: int
    rep_max: int
    target_weight_kg: Decimal | None
    target_rpe: Decimal | None


@dataclass(frozen=True)
class TemplateContent:
    name: str
    notes: str | None
    # In the order the exercises are performed.
    exercises: Sequence[PlannedExercise]


@dataclass(frozen=True)
class TemplateItem:
    row: TemplateExercise
    exercise_name: str


@dataclass(frozen=True)
class TemplateDetail:
    template: RoutineTemplate
    exercises: list[TemplateItem]


def _template_not_found() -> AppError:
    return AppError(status_code=NOT_FOUND, message=TEMPLATE_NOT_FOUND_MESSAGE)


def _own_template(
    db: Session, user_id: uuid.UUID, template_id: uuid.UUID, *, lock: bool = False
) -> RoutineTemplate:
    """The user's template, or a 404 that does not reveal whether it exists."""
    query = (
        select(RoutineTemplate)
        .where(RoutineTemplate.id == template_id, RoutineTemplate.user_id == user_id)
        .execution_options(populate_existing=True)
    )
    template = db.scalars(query.with_for_update() if lock else query).one_or_none()
    if template is None:
        raise _template_not_found()
    return template


def require_own_template(
    db: Session, user_id: uuid.UUID, template_id: uuid.UUID
) -> None:
    """Raise the 404 unless the template belongs to the user."""
    _own_template(db, user_id, template_id)


def _items_by_template(
    db: Session, template_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[TemplateItem]]:
    # One query for every template's exercises, rather than one per template.
    rows = db.execute(
        select(TemplateExercise, Exercise.name)
        .join(Exercise, Exercise.id == TemplateExercise.exercise_id)
        .where(TemplateExercise.template_id.in_(template_ids))
        .order_by(TemplateExercise.template_id, TemplateExercise.position)
        .execution_options(populate_existing=True)
    )
    return {
        template_id: [
            TemplateItem(row=row, exercise_name=exercise_name)
            for row, exercise_name in template_rows
        ]
        for template_id, template_rows in groupby(
            rows, key=lambda found: found[0].template_id
        )
    }


def _detail(db: Session, template: RoutineTemplate) -> TemplateDetail:
    items = _items_by_template(db, [template.id])
    return TemplateDetail(template=template, exercises=items.get(template.id, []))


def _require_visible_exercises(
    db: Session, user_id: uuid.UUID, exercises: Sequence[PlannedExercise]
) -> None:
    exercise_ids = {planned.exercise_id for planned in exercises}
    visible_count = db.scalar(
        select(func.count())
        .select_from(Exercise)
        .where(Exercise.id.in_(exercise_ids), visible_to(user_id))
    )
    if visible_count != len(exercise_ids):
        raise AppError(status_code=NOT_FOUND, message=EXERCISE_NOT_FOUND_MESSAGE)


def _insert_exercises(
    db: Session, template_id: uuid.UUID, exercises: Sequence[PlannedExercise]
) -> None:
    db.execute(
        pg_insert(TemplateExercise).values(
            [
                {
                    "template_id": template_id,
                    "exercise_id": planned.exercise_id,
                    "position": position,
                    "target_sets": planned.target_sets,
                    "rep_min": planned.rep_min,
                    "rep_max": planned.rep_max,
                    "target_weight_kg": planned.target_weight_kg,
                    "target_rpe": planned.target_rpe,
                }
                for position, planned in enumerate(exercises, start=1)
            ]
        )
    )


def list_templates(db: Session, user_id: uuid.UUID) -> list[TemplateDetail]:
    templates = db.scalars(
        select(RoutineTemplate)
        .where(RoutineTemplate.user_id == user_id)
        # The "C" collation sorts the same way whatever locale the database uses.
        .order_by(func.lower(RoutineTemplate.name).collate("C"), RoutineTemplate.id)
        .limit(MAX_TEMPLATES_PER_USER)
        .execution_options(populate_existing=True)
    ).all()
    items = _items_by_template(db, [template.id for template in templates])
    return [
        TemplateDetail(template=template, exercises=items.get(template.id, []))
        for template in templates
    ]


def get_template(
    db: Session, user_id: uuid.UUID, template_id: uuid.UUID
) -> TemplateDetail:
    return _detail(db, _own_template(db, user_id, template_id))


def create_template(
    db: Session, user_id: uuid.UUID, content: TemplateContent
) -> TemplateDetail:
    # Two requests arriving together can each pass this check and overshoot by
    # one, which is acceptable for a limit that only guards against runaway growth.
    owned_count = db.scalar(
        select(func.count())
        .select_from(RoutineTemplate)
        .where(RoutineTemplate.user_id == user_id)
    )
    if (owned_count or 0) >= MAX_TEMPLATES_PER_USER:
        raise AppError(
            status_code=CONFLICT,
            message=f"You have reached the limit of {MAX_TEMPLATES_PER_USER} templates",
        )
    _require_visible_exercises(db, user_id, content.exercises)

    template = db.scalars(
        pg_insert(RoutineTemplate)
        .values(user_id=user_id, name=content.name, notes=content.notes)
        .returning(RoutineTemplate)
    ).one()
    _insert_exercises(db, template.id, content.exercises)
    db.commit()
    return _detail(db, template)


def replace_template(
    db: Session, user_id: uuid.UUID, template_id: uuid.UUID, content: TemplateContent
) -> TemplateDetail:
    """Swap the template's name, notes and exercises for the ones given."""
    template = _own_template(db, user_id, template_id, lock=True)
    _require_visible_exercises(db, user_id, content.exercises)

    replaced = db.scalars(
        update(RoutineTemplate)
        .where(RoutineTemplate.id == template.id)
        .values(name=content.name, notes=content.notes)
        .returning(RoutineTemplate)
        .execution_options(populate_existing=True)
    ).one()
    db.execute(
        delete(TemplateExercise).where(TemplateExercise.template_id == template.id)
    )
    _insert_exercises(db, template.id, content.exercises)
    db.commit()
    return _detail(db, replaced)


def delete_template(db: Session, user_id: uuid.UUID, template_id: uuid.UUID) -> None:
    template = _own_template(db, user_id, template_id, lock=True)
    # The database deletes the template's exercises with it, and clears the
    # link from any workout that was started from it.
    db.execute(delete(RoutineTemplate).where(RoutineTemplate.id == template.id))
    db.commit()

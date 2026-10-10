import uuid
from dataclasses import dataclass

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Equipment, Exercise, MuscleGroup

CONFLICT = 409
DUPLICATE_NAME_MESSAGE = "You already have an exercise with that name"
# Keeps one account from growing the table, and its own searches, without bound.
MAX_CUSTOM_EXERCISES_PER_USER = 500


@dataclass(frozen=True)
class ExerciseFilters:
    search: str | None = None
    muscle_group: MuscleGroup | None = None
    equipment: Equipment | None = None


@dataclass(frozen=True)
class ExercisePage:
    items: list[Exercise]
    total: int


def visible_to(user_id: uuid.UUID) -> ColumnElement[bool]:
    """The shared library plus the user's own exercises."""
    return or_(Exercise.owner_id.is_(None), Exercise.owner_id == user_id)


def _conditions(
    user_id: uuid.UUID, filters: ExerciseFilters
) -> list[ColumnElement[bool]]:
    conditions = [visible_to(user_id)]
    if filters.search is not None:
        # autoescape makes "%" and "_" in the search term match themselves.
        conditions.append(Exercise.name.icontains(filters.search, autoescape=True))
    if filters.muscle_group is not None:
        conditions.append(Exercise.muscle_groups.contains([filters.muscle_group.value]))
    if filters.equipment is not None:
        conditions.append(Exercise.equipment == filters.equipment.value)
    return conditions


def list_exercises(
    db: Session,
    user_id: uuid.UUID,
    filters: ExerciseFilters,
    limit: int,
    offset: int,
) -> ExercisePage:
    conditions = _conditions(user_id, filters)
    # The "C" collation sorts the same way whatever locale the database uses.
    by_name = [func.lower(Exercise.name).collate("C"), Exercise.id]
    # Names that begin with the search term are the likeliest match.
    ordering = (
        [Exercise.name.istartswith(filters.search, autoescape=True).desc(), *by_name]
        if filters.search is not None
        else by_name
    )

    total = db.scalar(select(func.count()).select_from(Exercise).where(*conditions))
    items = db.scalars(
        select(Exercise)
        .where(*conditions)
        .order_by(*ordering)
        .limit(limit)
        .offset(offset)
    ).all()
    return ExercisePage(items=list(items), total=total or 0)


def create_custom_exercise(
    db: Session,
    user_id: uuid.UUID,
    name: str,
    muscle_groups: list[MuscleGroup],
    equipment: Equipment | None,
) -> Exercise:
    # Two requests arriving together can each pass this check and overshoot by
    # one, which is acceptable for a limit that only guards against runaway growth.
    owned_count = db.scalar(
        select(func.count()).select_from(Exercise).where(Exercise.owner_id == user_id)
    )
    if (owned_count or 0) >= MAX_CUSTOM_EXERCISES_PER_USER:
        raise AppError(
            status_code=CONFLICT,
            message=(
                "You have reached the limit of "
                f"{MAX_CUSTOM_EXERCISES_PER_USER} custom exercises"
            ),
        )

    # ON CONFLICT turns a duplicate name into "no row" instead of an error that
    # would abort the transaction.
    created = db.scalars(
        pg_insert(Exercise)
        .values(
            owner_id=user_id,
            name=name,
            muscle_groups=[muscle_group.value for muscle_group in muscle_groups],
            equipment=equipment.value if equipment is not None else None,
        )
        .on_conflict_do_nothing(index_elements=[Exercise.owner_id, Exercise.name])
        .returning(Exercise)
    ).one_or_none()
    if created is None:
        raise AppError(status_code=CONFLICT, message=DUPLICATE_NAME_MESSAGE)
    db.commit()
    return created

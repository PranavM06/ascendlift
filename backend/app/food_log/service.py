import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Food, FoodLogEntry, Meal

NOT_FOUND = 404
CONFLICT = 409
UNPROCESSABLE = 422
FOOD_NOT_FOUND_MESSAGE = "Food not found"
ENTRY_NOT_FOUND_MESSAGE = "Food log entry not found"
# Far more than anyone eats in a day; bounds the size of one day's response.
MAX_ENTRIES_PER_DAY = 200
EARLIEST_ENTRY_DATE = date(2000, 1, 1)
# The server reckons in UTC, where a user ahead of it is already on tomorrow.
LATEST_ENTRY_DATE_OFFSET = timedelta(days=1)
HUNDREDTH = Decimal("0.01")


@dataclass(frozen=True)
class Macros:
    calories: Decimal
    protein_g: Decimal
    carbs_g: Decimal
    fat_g: Decimal


@dataclass(frozen=True)
class NewEntry:
    food_id: uuid.UUID
    servings: Decimal
    meal: Meal
    entry_date: date


@dataclass(frozen=True)
class LoggedFood:
    entry: FoodLogEntry
    food: Food
    # What the logged servings of the food add up to.
    macros: Macros


@dataclass(frozen=True)
class DayLog:
    entry_date: date
    entries: list[LoggedFood]
    totals: Macros


def macros_for(food: Food, servings: Decimal) -> Macros:
    def scaled(per_serving: Decimal) -> Decimal:
        return (per_serving * servings).quantize(HUNDREDTH, rounding=ROUND_HALF_UP)

    return Macros(
        calories=scaled(food.calories),
        protein_g=scaled(food.protein_g),
        carbs_g=scaled(food.carbs_g),
        fat_g=scaled(food.fat_g),
    )


def _total(entries: list[LoggedFood]) -> Macros:
    return Macros(
        calories=sum((logged.macros.calories for logged in entries), Decimal(0)),
        protein_g=sum((logged.macros.protein_g for logged in entries), Decimal(0)),
        carbs_g=sum((logged.macros.carbs_g for logged in entries), Decimal(0)),
        fat_g=sum((logged.macros.fat_g for logged in entries), Decimal(0)),
    )


def _logged(entry: FoodLogEntry, food: Food) -> LoggedFood:
    return LoggedFood(entry=entry, food=food, macros=macros_for(food, entry.servings))


def _entry_not_found() -> AppError:
    return AppError(status_code=NOT_FOUND, message=ENTRY_NOT_FOUND_MESSAGE)


def get_day(db: Session, user_id: uuid.UUID, entry_date: date) -> DayLog:
    """What the user logged on one day, in the order logged, with its totals."""
    rows = db.execute(
        select(FoodLogEntry, Food)
        .join(Food, Food.id == FoodLogEntry.food_id)
        .where(FoodLogEntry.user_id == user_id, FoodLogEntry.entry_date == entry_date)
        .order_by(FoodLogEntry.created_at, FoodLogEntry.id)
        .execution_options(populate_existing=True)
    )
    entries = [_logged(entry, food) for entry, food in rows]
    return DayLog(entry_date=entry_date, entries=entries, totals=_total(entries))


def add_entry(
    db: Session, user_id: uuid.UUID, new_entry: NewEntry, now: datetime
) -> LoggedFood:
    latest_date = now.date() + LATEST_ENTRY_DATE_OFFSET
    if not EARLIEST_ENTRY_DATE <= new_entry.entry_date <= latest_date:
        raise AppError(
            status_code=UNPROCESSABLE,
            message=f"entry_date must be from {EARLIEST_ENTRY_DATE} to {latest_date}",
        )
    food = db.get(Food, new_entry.food_id)
    if food is None:
        raise AppError(status_code=NOT_FOUND, message=FOOD_NOT_FOUND_MESSAGE)

    # Two requests arriving together can each pass this check and overshoot by
    # one, which is acceptable for a limit that only guards against runaway growth.
    day_count = db.scalar(
        select(func.count())
        .select_from(FoodLogEntry)
        .where(
            FoodLogEntry.user_id == user_id,
            FoodLogEntry.entry_date == new_entry.entry_date,
        )
    )
    if (day_count or 0) >= MAX_ENTRIES_PER_DAY:
        raise AppError(
            status_code=CONFLICT,
            message=f"This day has reached its limit of {MAX_ENTRIES_PER_DAY} entries",
        )

    entry = db.scalars(
        pg_insert(FoodLogEntry)
        .values(
            user_id=user_id,
            food_id=food.id,
            servings=new_entry.servings,
            meal=new_entry.meal,
            entry_date=new_entry.entry_date,
            # Set here, not by the database, whose clock stands still for the
            # length of a transaction.
            created_at=now,
        )
        .returning(FoodLogEntry)
    ).one()
    db.commit()
    return _logged(entry, food)


def update_entry(
    db: Session,
    user_id: uuid.UUID,
    entry_id: uuid.UUID,
    changes: Mapping[str, Any],
) -> LoggedFood:
    own_entry = (FoodLogEntry.id == entry_id, FoodLogEntry.user_id == user_id)
    if changes:
        db.execute(update(FoodLogEntry).where(*own_entry).values(**changes))
    row = db.execute(
        select(FoodLogEntry, Food)
        .join(Food, Food.id == FoodLogEntry.food_id)
        .where(*own_entry)
        .execution_options(populate_existing=True)
    ).one_or_none()
    if row is None:
        raise _entry_not_found()
    db.commit()
    entry, food = row
    return _logged(entry, food)


def delete_entry(db: Session, user_id: uuid.UUID, entry_id: uuid.UUID) -> None:
    deleted_id = db.scalar(
        delete(FoodLogEntry)
        .where(FoodLogEntry.id == entry_id, FoodLogEntry.user_id == user_id)
        .returning(FoodLogEntry.id)
    )
    if deleted_id is None:
        raise _entry_not_found()
    db.commit()

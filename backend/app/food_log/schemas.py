import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.food_log.service import DayLog, LoggedFood
from app.foods.schemas import FoodResponse
from app.models import Meal

MAX_SERVINGS = 100
# Matches the two decimal places the servings column keeps.
SERVINGS_DECIMAL_PLACES = 2

Servings = Annotated[
    Decimal, Field(gt=0, le=MAX_SERVINGS, decimal_places=SERVINGS_DECIMAL_PLACES)
]


class FoodLogCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    food_id: uuid.UUID
    servings: Servings
    meal: Meal
    # The day the food was eaten, on the user's own calendar.
    entry_date: date


class FoodLogUpdate(BaseModel):
    """Fields left out are not changed."""

    model_config = ConfigDict(extra="forbid")

    servings: Servings | None = None
    meal: Meal | None = None

    @field_validator("servings", "meal")
    @classmethod
    def forbid_null(cls, value: Decimal | Meal | None) -> Decimal | Meal:
        if value is None:
            raise ValueError("must not be null")
        return value


class MacrosResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # Decimals are sent as strings, e.g. "412.50".
    calories: Decimal
    protein_g: Decimal
    carbs_g: Decimal
    fat_g: Decimal


class FoodLogEntryResponse(MacrosResponse):
    """One logged food. Its nutrients are for the servings logged."""

    id: uuid.UUID
    food: FoodResponse
    servings: Decimal
    meal: Meal
    entry_date: date

    @classmethod
    def from_logged_food(cls, logged: LoggedFood) -> Self:
        entry = logged.entry
        return cls(
            id=entry.id,
            food=FoodResponse.model_validate(logged.food),
            servings=entry.servings,
            meal=entry.meal,
            entry_date=entry.entry_date,
            calories=logged.macros.calories,
            protein_g=logged.macros.protein_g,
            carbs_g=logged.macros.carbs_g,
            fat_g=logged.macros.fat_g,
        )


class DayLogResponse(BaseModel):
    """Everything logged on one day, in the order logged, and what it adds up to."""

    entry_date: date
    totals: MacrosResponse
    entries: list[FoodLogEntryResponse]

    @classmethod
    def from_day_log(cls, day: DayLog) -> Self:
        return cls(
            entry_date=day.entry_date,
            totals=MacrosResponse.model_validate(day.totals),
            entries=[
                FoodLogEntryResponse.from_logged_food(logged) for logged in day.entries
            ],
        )

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

# Bounds on what a person could plausibly aim for in a day. The low calorie
# bound only catches typos; it is not a recommendation.
MIN_CALORIES = 500
MAX_CALORIES = 10_000
MAX_MACRO_GRAMS = 1_000

Calories = Annotated[int, Field(ge=MIN_CALORIES, le=MAX_CALORIES)]
MacroGrams = Annotated[int, Field(ge=0, le=MAX_MACRO_GRAMS)]


class TargetsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    calories: Calories
    protein_g: MacroGrams
    carbs_g: MacroGrams
    fat_g: MacroGrams


class TargetsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    # The first day these targets apply to, on the user's own calendar.
    effective_date: date

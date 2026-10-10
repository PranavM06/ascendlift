import uuid
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.exercises.schemas import NO_CONTROL_CHARACTERS

# One letter matches too much of the catalogue to be worth a request.
MIN_SEARCH_LENGTH = 2
MAX_SEARCH_LENGTH = 100

FoodSearchText = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=MIN_SEARCH_LENGTH,
        max_length=MAX_SEARCH_LENGTH,
        pattern=NO_CONTROL_CHARACTERS,
    ),
]


class FoodQuery(BaseModel):
    """Query parameters for searching foods."""

    model_config = ConfigDict(extra="forbid")

    search: FoodSearchText


class FoodResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    # Null for generic foods.
    brand: str | None
    # Decimals are sent as strings, e.g. "150.00". Nutrients are per serving.
    serving_size: Decimal
    # "g", or "ml" for drinks.
    serving_unit: str
    calories: Decimal
    protein_g: Decimal
    carbs_g: Decimal
    fat_g: Decimal

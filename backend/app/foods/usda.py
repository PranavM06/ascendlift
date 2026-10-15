"""Reads foods from USDA FoodData Central, https://fdc.nal.usda.gov/api-guide"""

import logging
import math
import string
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache
from typing import Annotated, Any, Protocol

import httpx2
from fastapi import Depends

from app.core.config import get_settings

logger = logging.getLogger(__name__)

USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"
USDA_TIMEOUT_SECONDS = 5
SOURCE_ID_PREFIX = "usda:"
# Generic foods ("Egg, whole, raw") as well as packaged ones with a brand.
DATA_TYPES = ("Foundation", "SR Legacy", "Survey (FNDDS)", "Branded")
BRANDED_DATA_TYPE = "Branded"
MAX_RESULTS = 25
HTTP_OK = 200

# Energy in kcal. Some foods carry only one of the calculated values instead.
ENERGY_IDS = (1008, 2048, 2047)
PROTEIN_ID = 1003
CARBS_ID = 1005
FAT_ID = 1004

# USDA gives nutrients per 100 g, or per 100 ml for drinks.
NUTRIENT_BASIS = Decimal(100)
DEFAULT_SERVING_UNIT = "g"
# USDA spells the same two units several ways.
SERVING_UNITS = {"g": "g", "grm": "g", "gm": "g", "ml": "ml", "mlt": "ml"}
HUNDREDTH = Decimal("0.01")
# Far beyond any real food; anything larger is bad data.
MAX_SERVING_SIZE = Decimal(10_000)
MAX_CALORIES = Decimal(20_000)
MAX_MACRO_GRAMS = Decimal(5_000)
MAX_NAME_LENGTH = 255
MAX_BRAND_LENGTH = 100


class FoodSourceError(Exception):
    """The food source could not be reached or sent something unusable."""


@dataclass(frozen=True)
class SourceFood:
    """A food as an external source describes it. Nutrients are per serving."""

    source_id: str
    name: str
    brand: str | None
    serving_size: Decimal
    serving_unit: str
    calories: Decimal
    protein_g: Decimal
    carbs_g: Decimal
    fat_g: Decimal


class FoodSource(Protocol):
    def search(self, query: str) -> list[SourceFood]:
        """The best matches for the query, best first."""
        ...


def _to_decimal(value: Any) -> Decimal | None:
    """A non-negative number as a Decimal; None for anything else."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    if not math.isfinite(value) or value < 0:
        return None
    return Decimal(str(value))


def _tidy(text: Any, max_length: int) -> str | None:
    """Trimmed text, with SHOUTED packaging names put in title case."""
    if not isinstance(text, str):
        return None
    words = " ".join(text.split())
    if not words:
        return None
    readable = string.capwords(words) if words.isupper() else words
    return readable[:max_length].rstrip()


def _nutrients_per_100(raw_nutrients: Any) -> dict[int, Decimal]:
    if not isinstance(raw_nutrients, list):
        return {}
    amounts: dict[int, Decimal] = {}
    for nutrient in raw_nutrients:
        if not isinstance(nutrient, Mapping):
            continue
        amount = _to_decimal(nutrient.get("value"))
        nutrient_id = nutrient.get("nutrientId")
        if isinstance(nutrient_id, int) and amount is not None:
            amounts[nutrient_id] = amount
    return amounts


def _serving(raw: Mapping[str, Any]) -> tuple[Decimal, str]:
    """The label's serving for a packaged food, and 100 g for everything else."""
    size = _to_decimal(raw.get("servingSize"))
    unit = SERVING_UNITS.get(str(raw.get("servingSizeUnit", "")).strip().lower())
    if raw.get("dataType") != BRANDED_DATA_TYPE or size is None or unit is None:
        return NUTRIENT_BASIS, DEFAULT_SERVING_UNIT
    return size.quantize(HUNDREDTH, rounding=ROUND_HALF_UP), unit


def parse_food(raw: Any) -> SourceFood | None:
    """One search result as a food, or None when it lacks what logging needs."""
    if not isinstance(raw, Mapping):
        return None
    food_id = raw.get("fdcId")
    name = _tidy(raw.get("description"), MAX_NAME_LENGTH)
    if isinstance(food_id, bool) or not isinstance(food_id, int) or name is None:
        return None

    per_100 = _nutrients_per_100(raw.get("foodNutrients"))
    energy = next((per_100[key] for key in ENERGY_IDS if key in per_100), None)
    serving_size, serving_unit = _serving(raw)
    if energy is None or not 0 < serving_size <= MAX_SERVING_SIZE:
        return None

    def per_serving(amount_per_100: Decimal) -> Decimal:
        return (amount_per_100 * serving_size / NUTRIENT_BASIS).quantize(
            HUNDREDTH, rounding=ROUND_HALF_UP
        )

    calories = per_serving(energy)
    # A nutrient USDA leaves out is one the food has none of.
    protein_g, carbs_g, fat_g = (
        per_serving(per_100.get(nutrient_id, Decimal(0)))
        for nutrient_id in (PROTEIN_ID, CARBS_ID, FAT_ID)
    )
    if calories > MAX_CALORIES or max(protein_g, carbs_g, fat_g) > MAX_MACRO_GRAMS:
        return None
    return SourceFood(
        source_id=f"{SOURCE_ID_PREFIX}{food_id}",
        name=name,
        brand=_tidy(raw.get("brandName") or raw.get("brandOwner"), MAX_BRAND_LENGTH),
        serving_size=serving_size,
        serving_unit=serving_unit,
        calories=calories,
        protein_g=protein_g,
        carbs_g=carbs_g,
        fat_g=fat_g,
    )


class UsdaFoodSource:
    def __init__(self, api_key: str, http: httpx2.Client) -> None:
        self._api_key = api_key
        self._http = http

    def search(self, query: str) -> list[SourceFood]:
        try:
            response = self._http.post(
                USDA_SEARCH_URL,
                # Sent as a header so the key stays out of URLs, which get logged.
                headers={"X-Api-Key": self._api_key},
                json={
                    "query": query,
                    "dataType": list(DATA_TYPES),
                    "pageSize": MAX_RESULTS,
                },
            )
        except httpx2.HTTPError as exc:
            logger.warning("USDA food search failed: %s", type(exc).__name__)
            raise FoodSourceError("USDA could not be reached") from exc
        if response.status_code != HTTP_OK:
            logger.warning("USDA food search returned %s", response.status_code)
            raise FoodSourceError(f"USDA returned {response.status_code}")

        try:
            body = response.json()
        except ValueError as exc:
            raise FoodSourceError("USDA sent a response that is not JSON") from exc
        raw_foods = body.get("foods") if isinstance(body, Mapping) else None
        if not isinstance(raw_foods, list):
            raise FoodSourceError("USDA sent a response without a list of foods")

        parsed = (parse_food(raw_food) for raw_food in raw_foods)
        # Keyed by source id, so a food USDA lists twice is kept once.
        unique = {food.source_id: food for food in parsed if food is not None}
        return list(unique.values())


@lru_cache
def get_food_source() -> FoodSource:
    # One long-lived client, so searches reuse its connection to USDA.
    http = httpx2.Client(timeout=USDA_TIMEOUT_SECONDS)
    return UsdaFoodSource(get_settings().usda_api_key.get_secret_value(), http)


FoodSourceDep = Annotated[FoodSource, Depends(get_food_source)]

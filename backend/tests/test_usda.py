import json
from collections.abc import Callable
from decimal import Decimal
from typing import Any

import httpx2
import pytest

from app.foods.usda import (
    USDA_SEARCH_URL,
    FoodSourceError,
    SourceFood,
    UsdaFoodSource,
    parse_food,
)

API_KEY = "test-usda-key"
ENERGY_KCAL = 1008
ENERGY_KJ = 1062
ENERGY_ATWATER_GENERAL = 2047
PROTEIN = 1003
FAT = 1004
CARBS = 1005


def nutrient(nutrient_id: int, value: Any) -> dict[str, Any]:
    return {"nutrientId": nutrient_id, "unitName": "G", "value": value}


# Nutrients are per 100 g, the way USDA sends them.
BRANDED_YOGURT: dict[str, Any] = {
    "fdcId": 2038865,
    "description": "GREEK YOGURT",
    "dataType": "Branded",
    "brandOwner": "Chobani, Inc.",
    "brandName": "CHOBANI",
    "servingSize": 150.0,
    "servingSizeUnit": "g",
    "foodNutrients": [
        nutrient(PROTEIN, 8.67),
        nutrient(FAT, 0.0),
        nutrient(CARBS, 10.7),
        nutrient(ENERGY_KCAL, 80.0),
    ],
}
GENERIC_CHICKEN: dict[str, Any] = {
    "fdcId": 171077,
    "description": "Chicken breast, grilled",
    "dataType": "SR Legacy",
    "foodNutrients": [
        nutrient(PROTEIN, 31.02),
        nutrient(FAT, 3.57),
        nutrient(CARBS, 0),
        nutrient(ENERGY_KCAL, 165),
        nutrient(ENERGY_KJ, 690),
    ],
}

Handler = Callable[[httpx2.Request], httpx2.Response]


def source_with(handler: Handler) -> UsdaFoodSource:
    http = httpx2.Client(transport=httpx2.MockTransport(handler))
    return UsdaFoodSource(API_KEY, http)


def source_returning(*raw_foods: Any) -> UsdaFoodSource:
    return source_with(
        lambda request: httpx2.Response(200, json={"foods": list(raw_foods)})
    )


def test_search_sends_the_query_and_keeps_the_key_out_of_the_url() -> None:
    # Arrange
    requests: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        requests.append(request)
        return httpx2.Response(200, json={"foods": []})

    # Act
    found = source_with(handler).search("greek yogurt")

    # Assert
    assert found == []
    assert str(requests[0].url) == USDA_SEARCH_URL
    assert requests[0].headers["X-Api-Key"] == API_KEY
    body = json.loads(requests[0].content)
    assert body["query"] == "greek yogurt"
    assert "Branded" in body["dataType"]
    assert "SR Legacy" in body["dataType"]


def test_a_packaged_food_is_scaled_to_its_label_serving() -> None:
    # Act
    food = parse_food(BRANDED_YOGURT)

    # Assert: 150 g of a food with 80 kcal and 8.67 g protein per 100 g.
    assert food == SourceFood(
        source_id="usda:2038865",
        name="Greek Yogurt",
        brand="Chobani",
        serving_size=Decimal("150.00"),
        serving_unit="g",
        calories=Decimal("120.00"),
        protein_g=Decimal("13.01"),
        carbs_g=Decimal("16.05"),
        fat_g=Decimal("0.00"),
    )


def test_a_generic_food_is_served_by_the_100_grams() -> None:
    # Act
    food = parse_food(GENERIC_CHICKEN)

    # Assert
    assert food == SourceFood(
        source_id="usda:171077",
        name="Chicken breast, grilled",
        brand=None,
        serving_size=Decimal("100"),
        serving_unit="g",
        calories=Decimal("165.00"),
        protein_g=Decimal("31.02"),
        carbs_g=Decimal("0.00"),
        fat_g=Decimal("3.57"),
    )


def test_a_drink_measured_in_millilitres_keeps_that_unit() -> None:
    # Arrange
    cola = {**BRANDED_YOGURT, "servingSize": 355, "servingSizeUnit": "MLT"}

    # Act
    food = parse_food(cola)

    # Assert
    assert food is not None
    assert (food.serving_size, food.serving_unit) == (Decimal("355.00"), "ml")


@pytest.mark.parametrize(
    "serving",
    [
        {"servingSize": 2, "servingSizeUnit": "oz"},
        {"servingSize": None, "servingSizeUnit": "g"},
        {"servingSize": -30, "servingSizeUnit": "g"},
    ],
)
def test_a_packaged_food_without_a_usable_serving_falls_back_to_100_grams(
    serving: dict[str, Any],
) -> None:
    # Act
    food = parse_food({**BRANDED_YOGURT, **serving})

    # Assert
    assert food is not None
    assert (food.serving_size, food.serving_unit) == (Decimal("100"), "g")
    assert food.calories == Decimal("80.00")


def test_calculated_energy_is_used_when_the_measured_value_is_missing() -> None:
    # Arrange
    raw = {
        **GENERIC_CHICKEN,
        "foodNutrients": [
            nutrient(PROTEIN, 20),
            nutrient(ENERGY_ATWATER_GENERAL, 150),
            nutrient(ENERGY_KJ, 628),
        ],
    }

    # Act
    food = parse_food(raw)

    # Assert: a nutrient that is left out counts as none.
    assert food is not None
    assert food.calories == Decimal("150.00")
    assert (food.carbs_g, food.fat_g) == (Decimal("0.00"), Decimal("0.00"))


@pytest.mark.parametrize(
    "raw",
    [
        "not a food",
        {**GENERIC_CHICKEN, "fdcId": None},
        {**GENERIC_CHICKEN, "description": "   "},
        {**GENERIC_CHICKEN, "foodNutrients": [nutrient(PROTEIN, 31.02)]},
        {**GENERIC_CHICKEN, "foodNutrients": [nutrient(ENERGY_KCAL, "165")]},
        {**GENERIC_CHICKEN, "foodNutrients": [nutrient(ENERGY_KCAL, -5)]},
        {**GENERIC_CHICKEN, "foodNutrients": [nutrient(ENERGY_KCAL, 1e9)]},
        {**GENERIC_CHICKEN, "foodNutrients": "none"},
        {**BRANDED_YOGURT, "servingSize": 50_000},
    ],
)
def test_a_result_that_cannot_be_logged_is_left_out(raw: Any) -> None:
    # Act / Assert
    assert parse_food(raw) is None


def test_long_names_are_cut_to_fit_the_columns() -> None:
    # Arrange
    raw = {**BRANDED_YOGURT, "description": "x" * 300, "brandName": "y" * 300}

    # Act
    food = parse_food(raw)

    # Assert
    assert food is not None
    assert len(food.name) == 255
    assert food.brand is not None
    assert len(food.brand) == 100


def test_the_brand_owner_stands_in_for_a_missing_brand_name() -> None:
    # Arrange
    raw = {key: value for key, value in BRANDED_YOGURT.items() if key != "brandName"}

    # Act
    food = parse_food(raw)

    # Assert
    assert food is not None
    assert food.brand == "Chobani, Inc."


def test_search_keeps_usable_foods_in_order_and_each_only_once() -> None:
    # Arrange
    unusable = {"fdcId": 1, "description": "No nutrients", "foodNutrients": []}
    source = source_returning(BRANDED_YOGURT, unusable, GENERIC_CHICKEN, BRANDED_YOGURT)

    # Act
    found = source.search("anything")

    # Assert
    assert [food.source_id for food in found] == ["usda:2038865", "usda:171077"]


@pytest.mark.parametrize("status_code", [403, 429, 500])
def test_search_fails_when_usda_refuses_or_breaks(status_code: int) -> None:
    # Arrange
    source = source_with(lambda request: httpx2.Response(status_code, json={}))

    # Act / Assert
    with pytest.raises(FoodSourceError):
        source.search("chicken")


def test_search_fails_when_usda_cannot_be_reached() -> None:
    # Arrange
    def handler(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectTimeout("timed out", request=request)

    # Act / Assert
    with pytest.raises(FoodSourceError):
        source_with(handler).search("chicken")


@pytest.mark.parametrize(
    "response",
    [
        httpx2.Response(200, text="<html>maintenance</html>"),
        httpx2.Response(200, json=["not", "an", "object"]),
        httpx2.Response(200, json={"foods": "none"}),
    ],
)
def test_search_fails_on_a_response_it_cannot_read(response: httpx2.Response) -> None:
    # Arrange
    source = source_with(lambda request: response)

    # Act / Assert
    with pytest.raises(FoodSourceError):
        source.search("chicken")

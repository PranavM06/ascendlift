from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.foods.service import SEARCH_CACHE_TTL, search_foods
from app.models import Food
from tests.support import (
    CHICKEN,
    YOGURT,
    AppleTokenMinter,
    FakeFoodSource,
    sign_in_as,
)

pytestmark = pytest.mark.integration

NOW = datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
TODAY = datetime.now(UTC).date().isoformat()


@pytest.fixture
def auth_headers(
    api_client: TestClient, apple_tokens: AppleTokenMinter
) -> dict[str, str]:
    return sign_in_as(api_client, apple_tokens, "sub-1")


@pytest.fixture
def other_headers(
    api_client: TestClient, apple_tokens: AppleTokenMinter
) -> dict[str, str]:
    return sign_in_as(api_client, apple_tokens, "sub-2")


def search(
    client: TestClient, headers: dict[str, str], term: str
) -> list[dict[str, Any]]:
    response = client.get("/foods", headers=headers, params={"search": term})
    assert response.status_code == 200, response.text
    foods: list[dict[str, Any]] = response.json()["data"]
    return foods


def recent(client: TestClient, headers: dict[str, str]) -> list[str]:
    response = client.get("/foods/recent", headers=headers)
    assert response.status_code == 200, response.text
    return [food["name"] for food in response.json()["data"]]


def log_food(client: TestClient, headers: dict[str, str], food_id: str) -> None:
    body = {"food_id": food_id, "servings": "1", "meal": "lunch", "entry_date": TODAY}
    response = client.post("/food-log", headers=headers, json=body)
    assert response.status_code == 201, response.text


@pytest.mark.parametrize("path", ["/foods?search=chicken", "/foods/recent"])
def test_foods_require_a_token(api_client: TestClient, path: str) -> None:
    # Act
    response = api_client.get(path)

    # Assert
    assert response.status_code == 401


def test_search_returns_the_sources_foods_best_match_first(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    foods = search(api_client, auth_headers, "chicken")

    # Assert
    assert [food["name"] for food in foods] == ["Chicken breast, grilled", YOGURT.name]
    assert foods[1] == {
        "id": foods[1]["id"],
        "name": "Greek Yogurt",
        "brand": "Chobani",
        "serving_size": "150.00",
        "serving_unit": "g",
        "calories": "120.00",
        "protein_g": "13.01",
        "carbs_g": "16.05",
        "fat_g": "0.00",
    }
    assert foods[0]["brand"] is None


@pytest.mark.parametrize("params", [{}, {"search": "a"}, {"search": "  a  "}])
def test_search_needs_at_least_two_characters(
    api_client: TestClient,
    auth_headers: dict[str, str],
    food_source: FakeFoodSource,
    params: dict[str, str],
) -> None:
    # Act
    response = api_client.get("/foods", headers=auth_headers, params=params)

    # Assert
    assert response.status_code == 422
    assert food_source.queries == []


def test_a_repeated_search_is_answered_without_asking_usda_again(
    api_client: TestClient,
    auth_headers: dict[str, str],
    other_headers: dict[str, str],
    food_source: FakeFoodSource,
) -> None:
    # Arrange
    first = search(api_client, auth_headers, "Greek yogurt")

    # Act: the same words in another case and spacing, from another user.
    again = search(api_client, other_headers, "  greek   YOGURT ")

    # Assert
    assert again == first
    assert food_source.queries == ["greek yogurt"]


def test_a_search_that_grows_when_lower_cased_still_fits_the_cache(
    api_client: TestClient, auth_headers: dict[str, str], food_source: FakeFoodSource
) -> None:
    # Arrange: each "İ" lower-cases to two characters.
    term = "İ" * 100

    # Act
    foods = search(api_client, auth_headers, term)
    search(api_client, auth_headers, term)

    # Assert
    assert len(foods) == 2
    assert len(food_source.queries) == 1
    assert len(food_source.queries[0]) == 100


def test_a_search_with_no_matches_is_remembered_too(
    api_client: TestClient, auth_headers: dict[str, str], food_source: FakeFoodSource
) -> None:
    # Arrange
    food_source.foods = []

    # Act
    first = search(api_client, auth_headers, "zzzz")
    second = search(api_client, auth_headers, "zzzz")

    # Assert
    assert first == second == []
    assert len(food_source.queries) == 1


def test_search_says_so_when_usda_is_down_and_nothing_is_cached(
    api_client: TestClient, auth_headers: dict[str, str], food_source: FakeFoodSource
) -> None:
    # Arrange
    food_source.is_down = True

    # Act
    response = api_client.get(
        "/foods", headers=auth_headers, params={"search": "chicken"}
    )

    # Assert
    assert response.status_code == 503
    assert response.json() == {
        "success": False,
        "data": None,
        "error": "Food search is unavailable right now. Try again shortly.",
    }


def test_a_cached_answer_is_refreshed_once_it_is_a_month_old(
    db_session: Session, food_source: FakeFoodSource
) -> None:
    # Arrange
    search_foods(db_session, food_source, "chicken", NOW)
    almost_expired = NOW + SEARCH_CACHE_TTL - timedelta(seconds=1)

    # Act
    search_foods(db_session, food_source, "chicken", almost_expired)
    searches_while_fresh = len(food_source.queries)
    search_foods(db_session, food_source, "chicken", NOW + SEARCH_CACHE_TTL)

    # Assert
    assert searches_while_fresh == 1
    assert len(food_source.queries) == 2


def test_an_expired_answer_is_still_used_while_usda_is_down(
    db_session: Session, food_source: FakeFoodSource
) -> None:
    # Arrange
    search_foods(db_session, food_source, "chicken", NOW)
    food_source.is_down = True

    # Act
    foods = search_foods(db_session, food_source, "chicken", NOW + SEARCH_CACHE_TTL)

    # Assert
    assert [food.name for food in foods] == [CHICKEN.name, YOGURT.name]


def test_a_food_found_again_is_updated_rather_than_stored_twice(
    db_session: Session, food_source: FakeFoodSource
) -> None:
    # Arrange
    first = search_foods(db_session, food_source, "chicken", NOW)
    food_source.foods = [replace(CHICKEN, calories=Decimal("170.00"))]

    # Act: a different search that turns up the same food, corrected.
    second = search_foods(db_session, food_source, "grilled chicken", NOW)

    # Assert
    assert second[0].id == first[0].id
    assert second[0].calories == Decimal("170.00")
    stored = db_session.scalar(
        select(func.count())
        .select_from(Food)
        .where(Food.source_id == CHICKEN.source_id)
    )
    assert stored == 1


def test_recent_foods_are_empty_before_anything_is_logged(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act / Assert
    assert recent(api_client, auth_headers) == []


def test_recent_foods_list_each_logged_food_once_latest_first(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Arrange
    chicken, yogurt = search(api_client, auth_headers, "chicken")
    log_food(api_client, auth_headers, yogurt["id"])
    log_food(api_client, auth_headers, chicken["id"])
    log_food(api_client, auth_headers, yogurt["id"])

    # Act
    names = recent(api_client, auth_headers)

    # Assert
    assert names == ["Greek Yogurt", "Chicken breast, grilled"]


def test_recent_foods_leave_out_what_other_users_logged(
    api_client: TestClient,
    auth_headers: dict[str, str],
    other_headers: dict[str, str],
) -> None:
    # Arrange
    chicken, _yogurt = search(api_client, auth_headers, "chicken")
    log_food(api_client, other_headers, chicken["id"])

    # Act / Assert
    assert recent(api_client, auth_headers) == []

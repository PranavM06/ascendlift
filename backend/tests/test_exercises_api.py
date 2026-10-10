from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.exercises import service as exercises_service
from tests.support import AppleTokenMinter, sign_in_as

pytestmark = pytest.mark.integration

SEEDED_EXERCISE_COUNT = 678
DEFAULT_PAGE_SIZE = 50
CUSTOM_EXERCISE = {
    "name": "Landmine Twist",
    "muscle_groups": ["abdominals", "shoulders"],
    "equipment": "barbell",
}


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


def list_exercises(
    client: TestClient, headers: dict[str, str], **params: Any
) -> dict[str, Any]:
    response = client.get("/exercises", headers=headers, params=params)
    assert response.status_code == 200, response.text
    page: dict[str, Any] = response.json()["data"]
    return page


def names(page: dict[str, Any]) -> list[str]:
    return [exercise["name"] for exercise in page["items"]]


def test_listing_exercises_requires_a_token(api_client: TestClient) -> None:
    # Act
    response = api_client.get("/exercises")

    # Assert
    assert response.status_code == 401


def test_listing_returns_the_first_page_of_seeded_exercises_by_name(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    page = list_exercises(api_client, auth_headers)

    # Assert
    assert page["total"] == SEEDED_EXERCISE_COUNT
    assert page["limit"] == DEFAULT_PAGE_SIZE
    assert page["offset"] == 0
    assert len(page["items"]) == DEFAULT_PAGE_SIZE
    assert names(page) == sorted(names(page), key=str.lower)
    assert set(page["items"][0]) == {
        "id",
        "name",
        "muscle_groups",
        "equipment",
        "is_custom",
    }
    assert not any(exercise["is_custom"] for exercise in page["items"])


def test_seeded_exercises_are_lifting_movements_with_muscles_and_equipment(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    page = list_exercises(api_client, auth_headers, search="barbell squat", limit=1)

    # Assert
    assert page["items"][0] == {
        "id": page["items"][0]["id"],
        "name": "Barbell Squat",
        "muscle_groups": [
            "quadriceps",
            "calves",
            "glutes",
            "hamstrings",
            "lower_back",
        ],
        "equipment": "barbell",
        "is_custom": False,
    }


def test_search_matches_any_part_of_the_name_ignoring_case(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    page = list_exercises(api_client, auth_headers, search="BENCH press", limit=100)

    # Assert
    assert page["total"] == len(page["items"]) > 1
    assert all("bench press" in name.lower() for name in names(page))


def test_search_lists_names_that_start_with_the_term_first(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    found = names(list_exercises(api_client, auth_headers, search="squat", limit=100))

    # Assert
    starts_with_term = [name.lower().startswith("squat") for name in found]
    assert starts_with_term[0]
    assert not starts_with_term[-1]
    assert starts_with_term == sorted(starts_with_term, reverse=True)


@pytest.mark.parametrize("wildcard", ["%", "_", "\\"])
def test_search_treats_pattern_characters_as_plain_text(
    api_client: TestClient, auth_headers: dict[str, str], wildcard: str
) -> None:
    # Act
    page = list_exercises(api_client, auth_headers, search=wildcard)

    # Assert
    assert page["total"] == 0
    assert page["items"] == []


def test_filters_narrow_the_list_by_muscle_group_and_equipment(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    page = list_exercises(
        api_client, auth_headers, muscle_group="chest", equipment="dumbbell", limit=100
    )

    # Assert
    assert 0 < page["total"] < SEEDED_EXERCISE_COUNT
    assert all("chest" in exercise["muscle_groups"] for exercise in page["items"])
    assert all(exercise["equipment"] == "dumbbell" for exercise in page["items"])


def test_offset_continues_where_the_previous_page_stopped(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Arrange
    first_ten = names(list_exercises(api_client, auth_headers, limit=10))

    # Act
    page = list_exercises(api_client, auth_headers, limit=5, offset=5)

    # Assert
    assert names(page) == first_ten[5:]
    assert page["total"] == SEEDED_EXERCISE_COUNT
    assert page["limit"] == 5
    assert page["offset"] == 5


@pytest.mark.parametrize(
    ("params", "bad_field"),
    [
        pytest.param({"limit": 0}, "limit", id="limit-too-small"),
        pytest.param({"limit": 101}, "limit", id="limit-too-large"),
        pytest.param({"offset": -1}, "offset", id="negative-offset"),
        pytest.param({"muscle_group": "wings"}, "muscle_group", id="bad-muscle"),
        pytest.param({"equipment": "anvil"}, "equipment", id="bad-equipment"),
        pytest.param({"search": "x" * 101}, "search", id="search-too-long"),
        pytest.param({"search": "a\x00b"}, "search", id="search-control-character"),
        pytest.param({"offset": 10**30}, "offset", id="offset-too-large"),
    ],
)
def test_listing_rejects_invalid_query_parameters(
    api_client: TestClient,
    auth_headers: dict[str, str],
    params: dict[str, Any],
    bad_field: str,
) -> None:
    # Act
    response = api_client.get("/exercises", headers=auth_headers, params=params)

    # Assert
    assert response.status_code == 422
    assert bad_field in response.json()["error"]


def test_creating_a_custom_exercise_adds_it_to_the_owners_library(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    response = api_client.post("/exercises", headers=auth_headers, json=CUSTOM_EXERCISE)

    # Assert
    created = response.json()["data"]
    assert response.status_code == 201
    assert created == {**CUSTOM_EXERCISE, "id": created["id"], "is_custom": True}
    page = list_exercises(api_client, auth_headers, search="landmine twist")
    assert page["items"] == [created]


def test_custom_exercise_name_is_trimmed_and_equipment_is_optional(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    response = api_client.post(
        "/exercises",
        headers=auth_headers,
        json={"name": "  Sled Drag  ", "muscle_groups": ["quadriceps"]},
    )

    # Assert
    assert response.status_code == 201
    assert response.json()["data"]["name"] == "Sled Drag"
    assert response.json()["data"]["equipment"] is None


def test_custom_exercises_are_hidden_from_other_users(
    api_client: TestClient,
    auth_headers: dict[str, str],
    other_headers: dict[str, str],
) -> None:
    # Arrange
    api_client.post("/exercises", headers=auth_headers, json=CUSTOM_EXERCISE)

    # Act
    page = list_exercises(api_client, other_headers, search="landmine twist")

    # Assert
    assert page["items"] == []
    assert list_exercises(api_client, other_headers)["total"] == SEEDED_EXERCISE_COUNT
    assert list_exercises(api_client, auth_headers)["total"] == (
        SEEDED_EXERCISE_COUNT + 1
    )


def test_creating_the_same_custom_exercise_twice_is_a_conflict(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Arrange
    api_client.post("/exercises", headers=auth_headers, json=CUSTOM_EXERCISE)

    # Act
    response = api_client.post("/exercises", headers=auth_headers, json=CUSTOM_EXERCISE)

    # Assert
    assert response.status_code == 409
    assert response.json() == {
        "success": False,
        "data": None,
        "error": "You already have an exercise with that name",
    }


def test_custom_exercises_stop_at_the_per_user_limit(
    api_client: TestClient,
    auth_headers: dict[str, str],
    other_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(exercises_service, "MAX_CUSTOM_EXERCISES_PER_USER", 1)
    api_client.post("/exercises", headers=auth_headers, json=CUSTOM_EXERCISE)

    # Act
    over_limit = api_client.post(
        "/exercises", headers=auth_headers, json={**CUSTOM_EXERCISE, "name": "Other"}
    )
    someone_else = api_client.post(
        "/exercises", headers=other_headers, json=CUSTOM_EXERCISE
    )

    # Assert
    assert over_limit.status_code == 409
    assert over_limit.json()["error"] == (
        "You have reached the limit of 1 custom exercises"
    )
    assert someone_else.status_code == 201


def test_two_users_can_each_create_an_exercise_with_the_same_name(
    api_client: TestClient,
    auth_headers: dict[str, str],
    other_headers: dict[str, str],
) -> None:
    # Arrange
    api_client.post("/exercises", headers=auth_headers, json=CUSTOM_EXERCISE)

    # Act
    response = api_client.post(
        "/exercises", headers=other_headers, json=CUSTOM_EXERCISE
    )

    # Assert
    assert response.status_code == 201


@pytest.mark.parametrize(
    ("changes", "bad_field"),
    [
        pytest.param({"name": "   "}, "name", id="blank-name"),
        pytest.param({"name": "x" * 101}, "name", id="name-too-long"),
        pytest.param({"name": "Sled\x00Drag"}, "name", id="name-control-character"),
        pytest.param({"muscle_groups": []}, "muscle_groups", id="no-muscles"),
        pytest.param({"muscle_groups": ["wings"]}, "muscle_groups", id="bad-muscle"),
        pytest.param(
            {"muscle_groups": ["chest", "chest"]}, "muscle_groups", id="repeated-muscle"
        ),
        pytest.param({"equipment": "anvil"}, "equipment", id="bad-equipment"),
        pytest.param({"owner_id": None}, "owner_id", id="unknown-field"),
    ],
)
def test_creating_an_exercise_rejects_invalid_input(
    api_client: TestClient,
    auth_headers: dict[str, str],
    changes: dict[str, Any],
    bad_field: str,
) -> None:
    # Act
    response = api_client.post(
        "/exercises", headers=auth_headers, json={**CUSTOM_EXERCISE, **changes}
    )

    # Assert
    assert response.status_code == 422
    assert bad_field in response.json()["error"]


def test_creating_an_exercise_requires_a_token(api_client: TestClient) -> None:
    # Act
    response = api_client.post("/exercises", json=CUSTOM_EXERCISE)

    # Assert
    assert response.status_code == 401

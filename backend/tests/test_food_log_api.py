import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.food_log import service as food_log_service
from tests.support import AppleTokenMinter, sign_in_as

pytestmark = pytest.mark.integration

TODAY_DATE = datetime.now(UTC).date()
TODAY = TODAY_DATE.isoformat()
YESTERDAY = (TODAY_DATE - timedelta(days=1)).isoformat()
ZERO_TOTALS = {"calories": "0", "protein_g": "0", "carbs_g": "0", "fat_g": "0"}


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


@pytest.fixture
def foods(api_client: TestClient, auth_headers: dict[str, str]) -> dict[str, str]:
    """The ids of the two foods the fake USDA knows: 'chicken' and 'yogurt'."""
    response = api_client.get(
        "/foods", headers=auth_headers, params={"search": "anything"}
    )
    assert response.status_code == 200, response.text
    chicken, yogurt = response.json()["data"]
    return {"chicken": chicken["id"], "yogurt": yogurt["id"]}


def log_food(
    client: TestClient, headers: dict[str, str], food_id: str, **overrides: Any
) -> dict[str, Any]:
    body = {
        "food_id": food_id,
        "servings": "1",
        "meal": "lunch",
        "entry_date": TODAY,
        **overrides,
    }
    response = client.post("/food-log", headers=headers, json=body)
    assert response.status_code == 201, response.text
    entry: dict[str, Any] = response.json()["data"]
    return entry


def read_day(
    client: TestClient, headers: dict[str, str], entry_date: str = TODAY
) -> dict[str, Any]:
    response = client.get(
        "/food-log", headers=headers, params={"entry_date": entry_date}
    )
    assert response.status_code == 200, response.text
    day: dict[str, Any] = response.json()["data"]
    return day


def test_the_food_log_requires_a_token(api_client: TestClient) -> None:
    # Act
    responses = [
        api_client.get("/food-log", params={"entry_date": TODAY}),
        api_client.post("/food-log", json={}),
        api_client.patch(f"/food-log/{uuid.uuid4()}", json={}),
        api_client.delete(f"/food-log/{uuid.uuid4()}"),
    ]

    # Assert
    assert [response.status_code for response in responses] == [401] * 4


def test_logging_a_food_returns_its_nutrients_for_the_servings_eaten(
    api_client: TestClient, auth_headers: dict[str, str], foods: dict[str, str]
) -> None:
    # Act: 1.5 servings of chicken at 165 kcal, 31.02 P, 0 C, 3.57 F each.
    entry = log_food(
        api_client, auth_headers, foods["chicken"], servings="1.5", meal="dinner"
    )

    # Assert
    assert entry == {
        "id": entry["id"],
        "food": entry["food"],
        "servings": "1.50",
        "meal": "dinner",
        "entry_date": TODAY,
        "calories": "247.50",
        "protein_g": "46.53",
        "carbs_g": "0.00",
        "fat_g": "5.36",
    }
    assert entry["food"]["id"] == foods["chicken"]
    assert entry["food"]["name"] == "Chicken breast, grilled"


def test_a_day_lists_its_entries_in_the_order_logged_with_totals(
    api_client: TestClient, auth_headers: dict[str, str], foods: dict[str, str]
) -> None:
    # Arrange
    first = log_food(api_client, auth_headers, foods["chicken"], servings="1.5")
    second = log_food(
        api_client, auth_headers, foods["yogurt"], servings="2", meal="breakfast"
    )

    # Act
    day = read_day(api_client, auth_headers)

    # Assert: 247.50 + 240.00 kcal, and so on for each macro.
    assert day == {
        "entry_date": TODAY,
        "totals": {
            "calories": "487.50",
            "protein_g": "72.55",
            "carbs_g": "32.10",
            "fat_g": "5.36",
        },
        "entries": [first, second],
    }


def test_a_day_with_nothing_logged_has_zero_totals(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    day = read_day(api_client, auth_headers)

    # Assert
    assert day == {"entry_date": TODAY, "totals": ZERO_TOTALS, "entries": []}


def test_a_day_holds_only_that_days_entries_of_that_user(
    api_client: TestClient,
    auth_headers: dict[str, str],
    other_headers: dict[str, str],
    foods: dict[str, str],
) -> None:
    # Arrange
    mine = log_food(api_client, auth_headers, foods["chicken"])
    log_food(api_client, auth_headers, foods["yogurt"], entry_date=YESTERDAY)
    log_food(api_client, other_headers, foods["yogurt"])

    # Act
    day = read_day(api_client, auth_headers)

    # Assert
    assert day["entries"] == [mine]


def test_reading_a_day_needs_a_valid_date(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    missing = api_client.get("/food-log", headers=auth_headers)
    malformed = api_client.get(
        "/food-log", headers=auth_headers, params={"entry_date": "10/10/2026"}
    )

    # Assert
    assert (missing.status_code, malformed.status_code) == (422, 422)


def test_logging_an_unknown_food_is_not_found(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Arrange
    body = {
        "food_id": str(uuid.uuid4()),
        "servings": "1",
        "meal": "lunch",
        "entry_date": TODAY,
    }

    # Act
    response = api_client.post("/food-log", headers=auth_headers, json=body)

    # Assert
    assert response.status_code == 404
    assert response.json()["error"] == "Food not found"


@pytest.mark.parametrize(
    "overrides",
    [
        {"servings": "0"},
        {"servings": "-1"},
        {"servings": "100.01"},
        {"servings": "1.005"},
        {"meal": "brunch"},
        {"entry_date": "not-a-date"},
        {"entry_date": "1999-12-31"},
        {"entry_date": (TODAY_DATE + timedelta(days=2)).isoformat()},
        {"notes": "extra field"},
    ],
)
def test_logging_rejects_values_out_of_range(
    api_client: TestClient,
    auth_headers: dict[str, str],
    foods: dict[str, str],
    overrides: dict[str, str],
) -> None:
    # Arrange
    body = {
        "food_id": foods["chicken"],
        "servings": "1",
        "meal": "lunch",
        "entry_date": TODAY,
        **overrides,
    }

    # Act
    response = api_client.post("/food-log", headers=auth_headers, json=body)

    # Assert
    assert response.status_code == 422
    assert read_day(api_client, auth_headers)["entries"] == []


def test_food_can_be_logged_for_tomorrow_for_users_ahead_of_utc(
    api_client: TestClient, auth_headers: dict[str, str], foods: dict[str, str]
) -> None:
    # Arrange
    tomorrow = (TODAY_DATE + timedelta(days=1)).isoformat()

    # Act
    entry = log_food(api_client, auth_headers, foods["chicken"], entry_date=tomorrow)

    # Assert
    assert entry["entry_date"] == tomorrow


def test_a_day_takes_no_more_than_its_limit_of_entries(
    api_client: TestClient,
    auth_headers: dict[str, str],
    foods: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(food_log_service, "MAX_ENTRIES_PER_DAY", 1)
    log_food(api_client, auth_headers, foods["chicken"])
    body = {
        "food_id": foods["yogurt"],
        "servings": "1",
        "meal": "lunch",
        "entry_date": TODAY,
    }

    # Act
    full_day = api_client.post("/food-log", headers=auth_headers, json=body)
    other_day = api_client.post(
        "/food-log", headers=auth_headers, json={**body, "entry_date": YESTERDAY}
    )

    # Assert
    assert full_day.status_code == 409
    assert other_day.status_code == 201


def test_editing_an_entry_changes_only_the_fields_sent(
    api_client: TestClient, auth_headers: dict[str, str], foods: dict[str, str]
) -> None:
    # Arrange
    entry = log_food(api_client, auth_headers, foods["chicken"], meal="lunch")

    # Act
    response = api_client.patch(
        f"/food-log/{entry['id']}", headers=auth_headers, json={"servings": "2"}
    )

    # Assert
    assert response.status_code == 200, response.text
    edited = response.json()["data"]
    assert edited == {
        **entry,
        "servings": "2.00",
        "calories": "330.00",
        "protein_g": "62.04",
        "fat_g": "7.14",
    }
    assert read_day(api_client, auth_headers)["entries"] == [edited]


def test_editing_can_move_an_entry_to_another_meal(
    api_client: TestClient, auth_headers: dict[str, str], foods: dict[str, str]
) -> None:
    # Arrange
    entry = log_food(api_client, auth_headers, foods["chicken"], meal="lunch")

    # Act
    response = api_client.patch(
        f"/food-log/{entry['id']}", headers=auth_headers, json={"meal": "snack"}
    )

    # Assert
    assert response.json()["data"] == {**entry, "meal": "snack"}


def test_editing_with_nothing_to_change_returns_the_entry(
    api_client: TestClient, auth_headers: dict[str, str], foods: dict[str, str]
) -> None:
    # Arrange
    entry = log_food(api_client, auth_headers, foods["chicken"])

    # Act
    response = api_client.patch(
        f"/food-log/{entry['id']}", headers=auth_headers, json={}
    )

    # Assert
    assert response.json()["data"] == entry


@pytest.mark.parametrize(
    "changes",
    [
        {"servings": None},
        {"meal": None},
        {"servings": "0"},
        {"meal": "brunch"},
        {"entry_date": YESTERDAY},
    ],
)
def test_editing_rejects_values_out_of_range(
    api_client: TestClient,
    auth_headers: dict[str, str],
    foods: dict[str, str],
    changes: dict[str, Any],
) -> None:
    # Arrange
    entry = log_food(api_client, auth_headers, foods["chicken"])

    # Act
    response = api_client.patch(
        f"/food-log/{entry['id']}", headers=auth_headers, json=changes
    )

    # Assert
    assert response.status_code == 422
    assert read_day(api_client, auth_headers)["entries"] == [entry]


def test_deleting_an_entry_takes_it_off_the_day(
    api_client: TestClient, auth_headers: dict[str, str], foods: dict[str, str]
) -> None:
    # Arrange
    kept = log_food(api_client, auth_headers, foods["chicken"])
    removed = log_food(api_client, auth_headers, foods["yogurt"])

    # Act
    response = api_client.delete(f"/food-log/{removed['id']}", headers=auth_headers)
    again = api_client.delete(f"/food-log/{removed['id']}", headers=auth_headers)

    # Assert
    assert response.status_code == 200
    assert again.status_code == 404
    day = read_day(api_client, auth_headers)
    assert day["entries"] == [kept]
    assert day["totals"]["calories"] == "165.00"


def test_another_users_entry_cannot_be_edited_or_deleted(
    api_client: TestClient,
    auth_headers: dict[str, str],
    other_headers: dict[str, str],
    foods: dict[str, str],
) -> None:
    # Arrange
    entry = log_food(api_client, auth_headers, foods["chicken"])

    # Act
    edit = api_client.patch(
        f"/food-log/{entry['id']}", headers=other_headers, json={"servings": "9"}
    )
    delete = api_client.delete(f"/food-log/{entry['id']}", headers=other_headers)

    # Assert
    assert (edit.status_code, delete.status_code) == (404, 404)
    assert edit.json()["error"] == "Food log entry not found"
    assert read_day(api_client, auth_headers)["entries"] == [entry]

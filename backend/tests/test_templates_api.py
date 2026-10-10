import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.templates import service as templates_service
from tests.support import AppleTokenMinter, sign_in_as

pytestmark = pytest.mark.integration

Headers = dict[str, str]

UNKNOWN_ID = str(uuid.uuid4())
TEMPLATE_NOT_FOUND = {"success": False, "data": None, "error": "Template not found"}
EXERCISE_NOT_FOUND = {"success": False, "data": None, "error": "Exercise not found"}


@pytest.fixture
def auth_headers(api_client: TestClient, apple_tokens: AppleTokenMinter) -> Headers:
    return sign_in_as(api_client, apple_tokens, "sub-1")


@pytest.fixture
def other_headers(api_client: TestClient, apple_tokens: AppleTokenMinter) -> Headers:
    return sign_in_as(api_client, apple_tokens, "sub-2")


def exercise_id_named(client: TestClient, headers: Headers, name: str) -> str:
    response = client.get(
        "/exercises", headers=headers, params={"search": name, "limit": 1}
    )
    exercise_id: str = response.json()["data"]["items"][0]["id"]
    return exercise_id


@pytest.fixture
def squat_id(api_client: TestClient, auth_headers: Headers) -> str:
    return exercise_id_named(api_client, auth_headers, "Barbell Squat")


@pytest.fixture
def deadlift_id(api_client: TestClient, auth_headers: Headers) -> str:
    return exercise_id_named(api_client, auth_headers, "Barbell Deadlift")


def planned(exercise_id: str, **fields: Any) -> dict[str, Any]:
    return {
        "exercise_id": exercise_id,
        "target_sets": 3,
        "rep_min": 5,
        "rep_max": 8,
        **fields,
    }


def create_template(
    client: TestClient, headers: Headers, exercises: list[dict[str, Any]], **fields: Any
) -> dict[str, Any]:
    body = {"name": "Leg Day", "exercises": exercises, **fields}
    response = client.post("/templates", headers=headers, json=body)
    assert response.status_code == 201, response.text
    template: dict[str, Any] = response.json()["data"]
    return template


def list_templates(client: TestClient, headers: Headers) -> list[dict[str, Any]]:
    response = client.get("/templates", headers=headers)
    assert response.status_code == 200, response.text
    templates: list[dict[str, Any]] = response.json()["data"]
    return templates


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/templates"),
        ("POST", "/templates"),
        ("GET", f"/templates/{UNKNOWN_ID}"),
        ("PUT", f"/templates/{UNKNOWN_ID}"),
        ("DELETE", f"/templates/{UNKNOWN_ID}"),
    ],
)
def test_every_template_endpoint_requires_a_token(
    api_client: TestClient, method: str, path: str
) -> None:
    # Act
    response = api_client.request(method, path)

    # Assert
    assert response.status_code == 401


def test_creating_a_template_keeps_its_exercises_in_order(
    api_client: TestClient, auth_headers: Headers, squat_id: str, deadlift_id: str
) -> None:
    # Act
    template = create_template(
        api_client,
        auth_headers,
        [
            planned(squat_id, target_weight_kg=100, target_rpe=8),
            planned(deadlift_id, target_sets=1, rep_min=5, rep_max=5),
        ],
        notes="  Belt on for the top sets.  ",
    )

    # Assert
    assert template == {
        "id": template["id"],
        "name": "Leg Day",
        "notes": "Belt on for the top sets.",
        "exercises": [
            {
                "id": template["exercises"][0]["id"],
                "exercise": {"id": squat_id, "name": "Barbell Squat"},
                "position": 1,
                "target_sets": 3,
                "rep_min": 5,
                "rep_max": 8,
                "target_weight_kg": "100.0000",
                "target_rpe": "8.0",
            },
            {
                "id": template["exercises"][1]["id"],
                "exercise": {"id": deadlift_id, "name": "Barbell Deadlift"},
                "position": 2,
                "target_sets": 1,
                "rep_min": 5,
                "rep_max": 5,
                "target_weight_kg": None,
                "target_rpe": None,
            },
        ],
    }
    reread = api_client.get(f"/templates/{template['id']}", headers=auth_headers)
    assert reread.json()["data"] == template


def test_listing_returns_the_users_templates_by_name(
    api_client: TestClient,
    auth_headers: Headers,
    other_headers: Headers,
    squat_id: str,
) -> None:
    # Arrange
    push = create_template(api_client, auth_headers, [planned(squat_id)], name="Push")
    legs = create_template(api_client, auth_headers, [planned(squat_id)], name="Legs")
    create_template(api_client, other_headers, [planned(squat_id)], name="Theirs")

    # Act
    templates = list_templates(api_client, auth_headers)

    # Assert
    assert templates == [legs, push]


def test_listing_is_empty_for_a_new_user(
    api_client: TestClient, auth_headers: Headers
) -> None:
    # Act
    templates = list_templates(api_client, auth_headers)

    # Assert
    assert templates == []


def test_replacing_a_template_swaps_its_name_notes_and_exercises(
    api_client: TestClient, auth_headers: Headers, squat_id: str, deadlift_id: str
) -> None:
    # Arrange
    template = create_template(
        api_client, auth_headers, [planned(squat_id), planned(deadlift_id)], notes="Old"
    )

    # Act
    response = api_client.put(
        f"/templates/{template['id']}",
        headers=auth_headers,
        json={"name": "Pull Day", "exercises": [planned(deadlift_id, target_sets=5)]},
    )

    # Assert
    replaced = response.json()["data"]
    assert response.status_code == 200
    assert replaced["id"] == template["id"]
    assert replaced["name"] == "Pull Day"
    assert replaced["notes"] is None
    assert [
        (item["exercise"]["id"], item["position"], item["target_sets"])
        for item in replaced["exercises"]
    ] == [(deadlift_id, 1, 5)]
    assert list_templates(api_client, auth_headers) == [replaced]


def test_deleting_a_template_removes_it(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    template = create_template(api_client, auth_headers, [planned(squat_id)])

    # Act
    response = api_client.delete(f"/templates/{template['id']}", headers=auth_headers)

    # Assert
    assert response.status_code == 200
    assert response.json() == {"success": True, "data": None, "error": None}
    assert list_templates(api_client, auth_headers) == []


def test_another_users_template_cannot_be_read_or_changed(
    api_client: TestClient,
    auth_headers: Headers,
    other_headers: Headers,
    squat_id: str,
) -> None:
    # Arrange
    template = create_template(api_client, auth_headers, [planned(squat_id)])
    path = f"/templates/{template['id']}"
    replacement = {"name": "Mine now", "exercises": [planned(squat_id)]}

    # Act
    responses = [
        api_client.get(path, headers=other_headers),
        api_client.put(path, headers=other_headers, json=replacement),
        api_client.delete(path, headers=other_headers),
        api_client.post(
            "/workouts", headers=other_headers, json={"template_id": template["id"]}
        ),
    ]

    # Assert
    assert [response.status_code for response in responses] == [404] * 4
    assert all(response.json() == TEMPLATE_NOT_FOUND for response in responses)
    assert list_templates(api_client, auth_headers) == [template]


def test_a_template_that_does_not_exist_is_not_found(
    api_client: TestClient, auth_headers: Headers
) -> None:
    # Act
    response = api_client.get(f"/templates/{UNKNOWN_ID}", headers=auth_headers)

    # Assert
    assert response.status_code == 404
    assert response.json() == TEMPLATE_NOT_FOUND


def test_a_template_cannot_use_another_users_exercise(
    api_client: TestClient,
    auth_headers: Headers,
    other_headers: Headers,
    squat_id: str,
) -> None:
    # Arrange
    theirs = api_client.post(
        "/exercises",
        headers=other_headers,
        json={"name": "Sled Drag", "muscle_groups": ["quadriceps"]},
    ).json()["data"]

    # Act
    response = api_client.post(
        "/templates",
        headers=auth_headers,
        json={"name": "Legs", "exercises": [planned(squat_id), planned(theirs["id"])]},
    )

    # Assert
    assert response.status_code == 404
    assert response.json() == EXERCISE_NOT_FOUND
    assert list_templates(api_client, auth_headers) == []


@pytest.mark.parametrize(
    ("changes", "bad_field"),
    [
        pytest.param({"name": "   "}, "name", id="blank-name"),
        pytest.param({"name": "x" * 101}, "name", id="name-too-long"),
        pytest.param({"name": "Leg\x00Day"}, "name", id="name-control-character"),
        pytest.param({"notes": "x" * 2001}, "notes", id="notes-too-long"),
        pytest.param({"notes": "Belt\x00on"}, "notes", id="notes-nul-byte"),
        pytest.param({"exercises": []}, "exercises", id="no-exercises"),
        pytest.param({"owner": "someone"}, "owner", id="unknown-field"),
    ],
)
def test_creating_a_template_rejects_invalid_input(
    api_client: TestClient,
    auth_headers: Headers,
    squat_id: str,
    changes: dict[str, Any],
    bad_field: str,
) -> None:
    # Arrange
    body = {"name": "Leg Day", "exercises": [planned(squat_id)], **changes}

    # Act
    response = api_client.post("/templates", headers=auth_headers, json=body)

    # Assert
    assert response.status_code == 422
    assert bad_field in response.json()["error"]


@pytest.mark.parametrize(
    ("changes", "bad_field"),
    [
        pytest.param({"target_sets": 0}, "target_sets", id="no-sets"),
        pytest.param({"target_sets": 21}, "target_sets", id="too-many-sets"),
        pytest.param({"rep_min": 0}, "rep_min", id="rep-min-zero"),
        pytest.param({"rep_max": 101}, "rep_max", id="rep-max-too-high"),
        pytest.param({"rep_min": 9, "rep_max": 8}, "rep_max", id="range-backwards"),
        pytest.param({"target_weight_kg": -1}, "target_weight_kg", id="negative"),
        pytest.param({"target_rpe": 10.5}, "target_rpe", id="rpe-too-high"),
        pytest.param({"exercise_id": "squat"}, "exercise_id", id="bad-exercise-id"),
        pytest.param({"position": 4}, "position", id="unknown-field"),
    ],
)
def test_creating_a_template_rejects_an_invalid_exercise_plan(
    api_client: TestClient,
    auth_headers: Headers,
    squat_id: str,
    changes: dict[str, Any],
    bad_field: str,
) -> None:
    # Arrange
    body = {"name": "Leg Day", "exercises": [{**planned(squat_id), **changes}]}

    # Act
    response = api_client.post("/templates", headers=auth_headers, json=body)

    # Assert
    assert response.status_code == 422
    assert bad_field in response.json()["error"]


def test_a_template_cannot_list_the_same_exercise_twice(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Act
    response = api_client.post(
        "/templates",
        headers=auth_headers,
        json={"name": "Legs", "exercises": [planned(squat_id), planned(squat_id)]},
    )

    # Assert
    assert response.status_code == 422
    assert "exercises" in response.json()["error"]


def test_templates_stop_at_the_per_user_limit(
    api_client: TestClient,
    auth_headers: Headers,
    squat_id: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(templates_service, "MAX_TEMPLATES_PER_USER", 1)
    create_template(api_client, auth_headers, [planned(squat_id)])

    # Act
    response = api_client.post(
        "/templates",
        headers=auth_headers,
        json={"name": "One more", "exercises": [planned(squat_id)]},
    )

    # Assert
    assert response.status_code == 409
    assert response.json()["error"] == "You have reached the limit of 1 templates"


def test_a_workout_started_from_a_template_remembers_it(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    template = create_template(api_client, auth_headers, [planned(squat_id)])

    # Act
    response = api_client.post(
        "/workouts", headers=auth_headers, json={"template_id": template["id"]}
    )

    # Assert
    workout = response.json()["data"]
    assert response.status_code == 201
    assert workout["template_id"] == template["id"]
    assert workout["sets"] == []
    active = api_client.get("/workouts/active", headers=auth_headers).json()["data"]
    assert active["template_id"] == template["id"]


def test_a_workout_cannot_start_from_a_template_that_does_not_exist(
    api_client: TestClient, auth_headers: Headers
) -> None:
    # Act
    response = api_client.post(
        "/workouts", headers=auth_headers, json={"template_id": UNKNOWN_ID}
    )

    # Assert
    assert response.status_code == 404
    assert response.json() == TEMPLATE_NOT_FOUND
    active = api_client.get("/workouts/active", headers=auth_headers).json()["data"]
    assert active is None


def test_deleting_a_template_keeps_the_workouts_started_from_it(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    template = create_template(api_client, auth_headers, [planned(squat_id)])
    workout = api_client.post(
        "/workouts", headers=auth_headers, json={"template_id": template["id"]}
    ).json()["data"]

    # Act
    api_client.delete(f"/templates/{template['id']}", headers=auth_headers)

    # Assert
    reread = api_client.get(f"/workouts/{workout['id']}", headers=auth_headers)
    assert reread.status_code == 200
    assert reread.json()["data"]["template_id"] is None


def test_starting_a_workout_rejects_unknown_fields(
    api_client: TestClient, auth_headers: Headers
) -> None:
    # Act
    response = api_client.post(
        "/workouts", headers=auth_headers, json={"started_at": "2020-01-01T00:00:00Z"}
    )

    # Assert
    assert response.status_code == 422

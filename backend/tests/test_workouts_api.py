import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.workouts import service as workouts_service
from tests.support import AppleTokenMinter, sign_in_as

pytestmark = pytest.mark.integration

Headers = dict[str, str]

UNKNOWN_ID = str(uuid.uuid4())
WORKOUT_NOT_FOUND = {"success": False, "data": None, "error": "Workout not found"}
SET_NOT_FOUND = {"success": False, "data": None, "error": "Set not found"}
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


def start_workout(client: TestClient, headers: Headers) -> dict[str, Any]:
    response = client.post("/workouts", headers=headers)
    assert response.status_code == 201, response.text
    workout: dict[str, Any] = response.json()["data"]
    return workout


def finish_workout(
    client: TestClient, headers: Headers, workout_id: str
) -> dict[str, Any]:
    response = client.post(f"/workouts/{workout_id}/finish", headers=headers)
    assert response.status_code == 200, response.text
    workout: dict[str, Any] = response.json()["data"]
    return workout


def add_set(
    client: TestClient,
    headers: Headers,
    workout_id: str,
    exercise_id: str,
    **fields: Any,
) -> dict[str, Any]:
    body = {"exercise_id": exercise_id, "reps": 5, "weight_kg": 100, **fields}
    response = client.post(f"/workouts/{workout_id}/sets", headers=headers, json=body)
    assert response.status_code == 201, response.text
    logged_set: dict[str, Any] = response.json()["data"]
    return logged_set


def read_workout(
    client: TestClient, headers: Headers, workout_id: str
) -> dict[str, Any]:
    response = client.get(f"/workouts/{workout_id}", headers=headers)
    assert response.status_code == 200, response.text
    workout: dict[str, Any] = response.json()["data"]
    return workout


def last_sets(client: TestClient, headers: Headers, exercise_id: str) -> Any:
    response = client.get(
        "/workouts/last-sets", headers=headers, params={"exercise_id": exercise_id}
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/workouts"),
        ("GET", "/workouts/active"),
        ("GET", f"/workouts/last-sets?exercise_id={UNKNOWN_ID}"),
        ("GET", f"/workouts/{UNKNOWN_ID}"),
        ("DELETE", f"/workouts/{UNKNOWN_ID}"),
        ("POST", f"/workouts/{UNKNOWN_ID}/finish"),
        ("POST", f"/workouts/{UNKNOWN_ID}/sets"),
        ("PATCH", f"/workouts/{UNKNOWN_ID}/sets/{UNKNOWN_ID}"),
        ("DELETE", f"/workouts/{UNKNOWN_ID}/sets/{UNKNOWN_ID}"),
    ],
)
def test_every_workout_endpoint_requires_a_token(
    api_client: TestClient, method: str, path: str
) -> None:
    # Act
    response = api_client.request(method, path)

    # Assert
    assert response.status_code == 401


def test_starting_a_workout_returns_an_empty_workout_in_progress(
    api_client: TestClient, auth_headers: Headers
) -> None:
    # Act
    workout = start_workout(api_client, auth_headers)

    # Assert
    assert set(workout) == {"id", "started_at", "ended_at", "template_id", "sets"}
    assert workout["started_at"] is not None
    assert workout["ended_at"] is None
    assert workout["template_id"] is None
    assert workout["sets"] == []


def test_a_second_workout_cannot_start_while_one_is_in_progress(
    api_client: TestClient, auth_headers: Headers
) -> None:
    # Arrange
    start_workout(api_client, auth_headers)

    # Act
    response = api_client.post("/workouts", headers=auth_headers)

    # Assert
    assert response.status_code == 409
    assert response.json()["error"] == "A workout is already in progress"


def test_each_user_has_their_own_workout_in_progress(
    api_client: TestClient, auth_headers: Headers, other_headers: Headers
) -> None:
    # Arrange
    mine = start_workout(api_client, auth_headers)

    # Act
    theirs = start_workout(api_client, other_headers)

    # Assert
    assert theirs["id"] != mine["id"]


def test_active_workout_is_null_when_none_is_in_progress(
    api_client: TestClient, auth_headers: Headers
) -> None:
    # Act
    response = api_client.get("/workouts/active", headers=auth_headers)

    # Assert
    assert response.status_code == 200
    assert response.json() == {"success": True, "data": None, "error": None}


def test_active_workout_returns_the_workout_in_progress_with_its_sets(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    logged_set = add_set(api_client, auth_headers, workout["id"], squat_id)

    # Act
    response = api_client.get("/workouts/active", headers=auth_headers)

    # Assert
    assert response.json()["data"] == {**workout, "sets": [logged_set]}


def test_logging_a_set_records_it_in_kg_at_full_precision(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)

    # Act: 225 lb, converted to kg by the app.
    logged_set = add_set(
        api_client,
        auth_headers,
        workout["id"],
        squat_id,
        reps=3,
        weight_kg=102.0583,
        rpe=8.5,
    )

    # Assert
    assert logged_set == {
        "id": logged_set["id"],
        "exercise": {"id": squat_id, "name": "Barbell Squat"},
        "position": 1,
        "reps": 3,
        "weight_kg": "102.0583",
        "rpe": "8.5",
    }
    assert read_workout(api_client, auth_headers, workout["id"])["sets"] == [logged_set]


def test_sets_are_numbered_in_the_order_they_are_logged(
    api_client: TestClient, auth_headers: Headers, squat_id: str, deadlift_id: str
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)

    # Act
    first = add_set(api_client, auth_headers, workout["id"], squat_id)
    second = add_set(api_client, auth_headers, workout["id"], deadlift_id)
    third = add_set(api_client, auth_headers, workout["id"], squat_id)

    # Assert
    assert [first["position"], second["position"], third["position"]] == [1, 2, 3]
    assert first["rpe"] is None
    sets = read_workout(api_client, auth_headers, workout["id"])["sets"]
    assert [logged["id"] for logged in sets] == [first["id"], second["id"], third["id"]]


def test_a_set_can_use_the_users_own_exercise(
    api_client: TestClient, auth_headers: Headers
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    custom = api_client.post(
        "/exercises",
        headers=auth_headers,
        json={"name": "Sled Drag", "muscle_groups": ["quadriceps"]},
    ).json()["data"]

    # Act
    logged_set = add_set(api_client, auth_headers, workout["id"], custom["id"])

    # Assert
    assert logged_set["exercise"] == {"id": custom["id"], "name": "Sled Drag"}


def test_a_set_cannot_use_another_users_exercise(
    api_client: TestClient, auth_headers: Headers, other_headers: Headers
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    theirs = api_client.post(
        "/exercises",
        headers=other_headers,
        json={"name": "Sled Drag", "muscle_groups": ["quadriceps"]},
    ).json()["data"]

    # Act
    response = api_client.post(
        f"/workouts/{workout['id']}/sets",
        headers=auth_headers,
        json={"exercise_id": theirs["id"], "reps": 5, "weight_kg": 100},
    )

    # Assert
    assert response.status_code == 404
    assert response.json() == EXERCISE_NOT_FOUND


def test_a_set_cannot_use_an_exercise_that_does_not_exist(
    api_client: TestClient, auth_headers: Headers
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)

    # Act
    response = api_client.post(
        f"/workouts/{workout['id']}/sets",
        headers=auth_headers,
        json={"exercise_id": UNKNOWN_ID, "reps": 5, "weight_kg": 100},
    )

    # Assert
    assert response.status_code == 404
    assert response.json() == EXERCISE_NOT_FOUND


@pytest.mark.parametrize(
    ("changes", "bad_field"),
    [
        pytest.param({"reps": -1}, "reps", id="negative-reps"),
        pytest.param({"reps": 1001}, "reps", id="too-many-reps"),
        pytest.param({"reps": 2.5}, "reps", id="fractional-reps"),
        pytest.param({"weight_kg": -1}, "weight_kg", id="negative-weight"),
        pytest.param({"weight_kg": 2000.5}, "weight_kg", id="weight-too-heavy"),
        pytest.param({"weight_kg": 100.00001}, "weight_kg", id="weight-too-precise"),
        pytest.param({"weight_kg": None}, "weight_kg", id="missing-weight"),
        pytest.param({"rpe": 0.5}, "rpe", id="rpe-too-low"),
        pytest.param({"rpe": 10.5}, "rpe", id="rpe-too-high"),
        pytest.param({"rpe": 8.3}, "rpe", id="rpe-not-a-half-step"),
        pytest.param({"exercise_id": "squat"}, "exercise_id", id="bad-exercise-id"),
        pytest.param({"position": 9}, "position", id="unknown-field"),
    ],
)
def test_logging_a_set_rejects_invalid_input(
    api_client: TestClient,
    auth_headers: Headers,
    squat_id: str,
    changes: dict[str, Any],
    bad_field: str,
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    body = {"exercise_id": squat_id, "reps": 5, "weight_kg": 100, **changes}

    # Act
    response = api_client.post(
        f"/workouts/{workout['id']}/sets", headers=auth_headers, json=body
    )

    # Assert
    assert response.status_code == 422
    assert bad_field in response.json()["error"]


def test_a_workout_stops_accepting_sets_at_the_limit(
    api_client: TestClient,
    auth_headers: Headers,
    squat_id: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(workouts_service, "MAX_SETS_PER_WORKOUT", 1)
    workout = start_workout(api_client, auth_headers)
    add_set(api_client, auth_headers, workout["id"], squat_id)

    # Act
    response = api_client.post(
        f"/workouts/{workout['id']}/sets",
        headers=auth_headers,
        json={"exercise_id": squat_id, "reps": 5, "weight_kg": 100},
    )

    # Assert
    assert response.status_code == 409
    assert response.json()["error"] == "This workout has reached its limit of 1 sets"


def test_editing_a_set_changes_only_the_fields_sent(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    logged_set = add_set(api_client, auth_headers, workout["id"], squat_id, rpe=8)

    # Act
    response = api_client.patch(
        f"/workouts/{workout['id']}/sets/{logged_set['id']}",
        headers=auth_headers,
        json={"reps": 6},
    )

    # Assert
    assert response.status_code == 200
    assert response.json()["data"] == {**logged_set, "reps": 6}
    assert read_workout(api_client, auth_headers, workout["id"])["sets"] == [
        {**logged_set, "reps": 6}
    ]


def test_editing_a_set_can_clear_its_rpe(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    logged_set = add_set(api_client, auth_headers, workout["id"], squat_id, rpe=8)

    # Act
    response = api_client.patch(
        f"/workouts/{workout['id']}/sets/{logged_set['id']}",
        headers=auth_headers,
        json={"rpe": None, "weight_kg": 105},
    )

    # Assert
    assert response.json()["data"] == {
        **logged_set,
        "rpe": None,
        "weight_kg": "105.0000",
    }


def test_an_empty_set_edit_changes_nothing(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    logged_set = add_set(api_client, auth_headers, workout["id"], squat_id)

    # Act
    response = api_client.patch(
        f"/workouts/{workout['id']}/sets/{logged_set['id']}",
        headers=auth_headers,
        json={},
    )

    # Assert
    assert response.status_code == 200
    assert response.json()["data"] == logged_set


@pytest.mark.parametrize(
    ("body", "bad_field"),
    [
        pytest.param({"reps": None}, "reps", id="null-reps"),
        pytest.param({"weight_kg": None}, "weight_kg", id="null-weight"),
        pytest.param({"reps": -1}, "reps", id="negative-reps"),
        pytest.param({"rpe": 11}, "rpe", id="rpe-too-high"),
        pytest.param({"exercise_id": UNKNOWN_ID}, "exercise_id", id="unknown-field"),
    ],
)
def test_editing_a_set_rejects_invalid_input(
    api_client: TestClient,
    auth_headers: Headers,
    squat_id: str,
    body: dict[str, Any],
    bad_field: str,
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    logged_set = add_set(api_client, auth_headers, workout["id"], squat_id)

    # Act
    response = api_client.patch(
        f"/workouts/{workout['id']}/sets/{logged_set['id']}",
        headers=auth_headers,
        json=body,
    )

    # Assert
    assert response.status_code == 422
    assert bad_field in response.json()["error"]


def test_deleting_a_set_keeps_the_other_sets_in_order(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    first = add_set(api_client, auth_headers, workout["id"], squat_id)
    second = add_set(api_client, auth_headers, workout["id"], squat_id)
    third = add_set(api_client, auth_headers, workout["id"], squat_id)

    # Act
    response = api_client.delete(
        f"/workouts/{workout['id']}/sets/{second['id']}", headers=auth_headers
    )

    # Assert
    assert response.status_code == 200
    assert response.json() == {"success": True, "data": None, "error": None}
    assert read_workout(api_client, auth_headers, workout["id"])["sets"] == [
        first,
        third,
    ]
    fourth = add_set(api_client, auth_headers, workout["id"], squat_id)
    assert fourth["position"] == third["position"] + 1


def test_a_set_is_not_found_through_a_different_workout(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    earlier = start_workout(api_client, auth_headers)
    logged_set = add_set(api_client, auth_headers, earlier["id"], squat_id)
    finish_workout(api_client, auth_headers, earlier["id"])
    later = start_workout(api_client, auth_headers)
    path = f"/workouts/{later['id']}/sets/{logged_set['id']}"

    # Act
    edit = api_client.patch(path, headers=auth_headers, json={"reps": 1})
    removal = api_client.delete(path, headers=auth_headers)

    # Assert
    assert (edit.status_code, edit.json()) == (404, SET_NOT_FOUND)
    assert (removal.status_code, removal.json()) == (404, SET_NOT_FOUND)


def test_another_users_workout_cannot_be_read_or_changed(
    api_client: TestClient,
    auth_headers: Headers,
    other_headers: Headers,
    squat_id: str,
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    logged_set = add_set(api_client, auth_headers, workout["id"], squat_id)
    workout_path = f"/workouts/{workout['id']}"
    set_path = f"{workout_path}/sets/{logged_set['id']}"
    new_set = {"exercise_id": squat_id, "reps": 5, "weight_kg": 100}

    # Act
    responses = [
        api_client.get(workout_path, headers=other_headers),
        api_client.post(f"{workout_path}/finish", headers=other_headers),
        api_client.post(f"{workout_path}/sets", headers=other_headers, json=new_set),
        api_client.patch(set_path, headers=other_headers, json={"reps": 1}),
        api_client.delete(set_path, headers=other_headers),
        api_client.delete(workout_path, headers=other_headers),
    ]

    # Assert
    assert [response.status_code for response in responses] == [404] * 6
    assert all(response.json() == WORKOUT_NOT_FOUND for response in responses)
    unchanged = read_workout(api_client, auth_headers, workout["id"])
    assert unchanged == {**workout, "sets": [logged_set]}


def test_reading_a_workout_that_does_not_exist_is_not_found(
    api_client: TestClient, auth_headers: Headers
) -> None:
    # Act
    response = api_client.get(f"/workouts/{UNKNOWN_ID}", headers=auth_headers)

    # Assert
    assert response.status_code == 404
    assert response.json() == WORKOUT_NOT_FOUND


def test_a_malformed_workout_id_is_rejected(
    api_client: TestClient, auth_headers: Headers
) -> None:
    # Act
    response = api_client.get("/workouts/not-a-uuid", headers=auth_headers)

    # Assert
    assert response.status_code == 422


def test_finishing_a_workout_ends_it_and_allows_the_next_one_to_start(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    logged_set = add_set(api_client, auth_headers, workout["id"], squat_id)

    # Act
    finished = finish_workout(api_client, auth_headers, workout["id"])

    # Assert
    assert finished["ended_at"] is not None
    assert finished["ended_at"] >= finished["started_at"]
    assert finished["sets"] == [logged_set]
    active = api_client.get("/workouts/active", headers=auth_headers)
    assert active.json()["data"] is None
    assert start_workout(api_client, auth_headers)["id"] != workout["id"]


def test_finishing_a_workout_twice_keeps_the_first_end_time(
    api_client: TestClient, auth_headers: Headers
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    finished = finish_workout(api_client, auth_headers, workout["id"])

    # Act
    finished_again = finish_workout(api_client, auth_headers, workout["id"])

    # Assert
    assert finished_again == finished


def test_a_finished_workout_can_still_be_corrected(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    finish_workout(api_client, auth_headers, workout["id"])

    # Act
    forgotten_set = add_set(api_client, auth_headers, workout["id"], squat_id)

    # Assert
    assert read_workout(api_client, auth_headers, workout["id"])["sets"] == [
        forgotten_set
    ]


def test_deleting_a_workout_removes_it_and_its_sets(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    workout = start_workout(api_client, auth_headers)
    add_set(api_client, auth_headers, workout["id"], squat_id)
    finish_workout(api_client, auth_headers, workout["id"])

    # Act
    response = api_client.delete(f"/workouts/{workout['id']}", headers=auth_headers)

    # Assert
    assert response.status_code == 200
    assert response.json() == {"success": True, "data": None, "error": None}
    reread = api_client.get(f"/workouts/{workout['id']}", headers=auth_headers)
    assert reread.status_code == 404
    assert last_sets(api_client, auth_headers, squat_id) is None


def test_last_sets_is_null_for_an_exercise_never_logged(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Act
    found = last_sets(api_client, auth_headers, squat_id)

    # Assert
    assert found is None


def test_last_sets_come_from_the_most_recent_finished_workout_with_the_exercise(
    api_client: TestClient, auth_headers: Headers, squat_id: str, deadlift_id: str
) -> None:
    # Arrange
    oldest = start_workout(api_client, auth_headers)
    add_set(api_client, auth_headers, oldest["id"], squat_id, weight_kg=90)
    finish_workout(api_client, auth_headers, oldest["id"])

    recent = start_workout(api_client, auth_headers)
    first = add_set(api_client, auth_headers, recent["id"], squat_id, weight_kg=100)
    add_set(api_client, auth_headers, recent["id"], deadlift_id, weight_kg=140)
    second = add_set(api_client, auth_headers, recent["id"], squat_id, weight_kg=105)
    finish_workout(api_client, auth_headers, recent["id"])

    without_squats = start_workout(api_client, auth_headers)
    add_set(api_client, auth_headers, without_squats["id"], deadlift_id)
    finish_workout(api_client, auth_headers, without_squats["id"])

    # Act
    found = last_sets(api_client, auth_headers, squat_id)

    # Assert
    assert found == {
        "workout_id": recent["id"],
        "started_at": recent["started_at"],
        "sets": [first, second],
    }


def test_last_sets_ignore_the_workout_in_progress(
    api_client: TestClient, auth_headers: Headers, squat_id: str
) -> None:
    # Arrange
    finished = start_workout(api_client, auth_headers)
    earlier_set = add_set(api_client, auth_headers, finished["id"], squat_id)
    finish_workout(api_client, auth_headers, finished["id"])
    in_progress = start_workout(api_client, auth_headers)
    add_set(api_client, auth_headers, in_progress["id"], squat_id, weight_kg=110)

    # Act
    found = last_sets(api_client, auth_headers, squat_id)

    # Assert
    assert found["workout_id"] == finished["id"]
    assert found["sets"] == [earlier_set]


def test_last_sets_ignore_other_users_workouts(
    api_client: TestClient,
    auth_headers: Headers,
    other_headers: Headers,
    squat_id: str,
) -> None:
    # Arrange
    theirs = start_workout(api_client, other_headers)
    add_set(api_client, other_headers, theirs["id"], squat_id)
    finish_workout(api_client, other_headers, theirs["id"])

    # Act
    found = last_sets(api_client, auth_headers, squat_id)

    # Assert
    assert found is None


def test_last_sets_requires_a_valid_exercise_id(
    api_client: TestClient, auth_headers: Headers
) -> None:
    # Act
    missing = api_client.get("/workouts/last-sets", headers=auth_headers)
    malformed = api_client.get(
        "/workouts/last-sets", headers=auth_headers, params={"exercise_id": "squat"}
    )

    # Assert
    assert missing.status_code == 422
    assert malformed.status_code == 422
    assert "exercise_id" in malformed.json()["error"]

import copy
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    BodyweightEntry,
    Goal,
    Phase,
    TargetHistory,
    TrainingStyle,
    UnitPreference,
    User,
)
from app.onboarding import service as onboarding_service
from app.onboarding.service import Onboarding
from app.targets.service import Targets
from tests.support import AppleTokenMinter, sign_in_as

pytestmark = pytest.mark.integration

ONBOARDING = {
    "unit_preference": "kg",
    "timezone": "America/Chicago",
    "training_style": "powerlifting",
    "phase": "cut",
    "targets": {"calories": 2400, "protein_g": 180, "carbs_g": 250, "fat_g": 70},
    "bodyweight_kg": "82.5536",
}


@pytest.fixture
def auth_headers(
    api_client: TestClient, apple_tokens: AppleTokenMinter
) -> dict[str, str]:
    return sign_in_as(api_client, apple_tokens, "sub-1")


def onboard(
    client: TestClient, headers: dict[str, str], body: dict[str, Any] | None = None
) -> dict[str, Any]:
    response = client.post("/onboarding", headers=headers, json=body or ONBOARDING)
    assert response.status_code == 200, response.text
    profile: dict[str, Any] = response.json()["data"]
    return profile


def with_changes(**changes: Any) -> dict[str, Any]:
    return {**copy.deepcopy(ONBOARDING), **changes}


def test_onboarding_requires_a_token(api_client: TestClient) -> None:
    # Act
    response = api_client.post("/onboarding", json=ONBOARDING)

    # Assert
    assert response.status_code == 401


def test_a_new_user_has_not_onboarded(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    profile = api_client.get("/users/me", headers=auth_headers).json()["data"]

    # Assert
    assert profile["onboarded_at"] is None


def test_onboarding_saves_the_profile_and_returns_it(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    profile = onboard(api_client, auth_headers)

    # Assert
    assert profile["unit_preference"] == "kg"
    assert profile["timezone"] == "America/Chicago"
    assert profile["onboarded_at"] is not None
    reread = api_client.get("/users/me", headers=auth_headers).json()["data"]
    assert reread == profile


def test_onboarding_saves_the_goal_targets_and_bodyweight(
    api_client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    # Act
    onboard(api_client, auth_headers)

    # Assert
    goal = db_session.scalars(select(Goal)).one()
    targets = db_session.scalars(select(TargetHistory)).one()
    bodyweight = db_session.scalars(select(BodyweightEntry)).one()
    assert (goal.training_style, goal.phase) == (TrainingStyle.POWERLIFTING, Phase.CUT)
    saved_targets = (
        targets.calories,
        targets.protein_g,
        targets.carbs_g,
        targets.fat_g,
    )
    assert saved_targets == (2400, 180, 250, 70)
    assert bodyweight.weight_kg == Decimal("82.5536")
    assert targets.effective_date == bodyweight.entry_date


def test_onboarding_again_replaces_the_answers_and_keeps_the_first_time(
    api_client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    # Arrange
    first = onboard(api_client, auth_headers)
    changed = with_changes(
        unit_preference="lbs",
        phase="bulk",
        targets={"calories": 3000, "protein_g": 200, "carbs_g": 350, "fat_g": 90},
        bodyweight_kg="83",
    )

    # Act
    second = onboard(api_client, auth_headers, changed)

    # Assert
    assert second["unit_preference"] == "lbs"
    assert second["onboarded_at"] == first["onboarded_at"]
    assert db_session.scalars(select(Goal)).one().phase == Phase.BULK
    assert db_session.scalars(select(TargetHistory)).one().calories == 3000
    bodyweight = db_session.scalars(select(BodyweightEntry)).one()
    assert bodyweight.weight_kg == Decimal("83")


def test_onboarding_dates_the_targets_and_bodyweight_in_the_users_timezone(
    db_session: Session,
) -> None:
    # Arrange: 3 a.m. in UTC is still the evening before in Chicago.
    user = User(apple_sub="sub-timezone")
    db_session.add(user)
    db_session.flush()
    answers = Onboarding(
        unit_preference=UnitPreference.LBS,
        timezone="America/Chicago",
        training_style=TrainingStyle.BODYBUILDING,
        phase=Phase.MAINTAIN,
        targets=Targets(calories=2500, protein_g=160, carbs_g=300, fat_g=80),
        bodyweight_kg=Decimal("80"),
    )
    now = datetime(2026, 10, 14, 3, 0, tzinfo=UTC)

    # Act
    onboarding_service.complete_onboarding(db_session, user.id, answers, now)

    # Assert
    targets = db_session.scalars(select(TargetHistory)).one()
    bodyweight = db_session.scalars(select(BodyweightEntry)).one()
    assert targets.effective_date == date(2026, 10, 13)
    assert bodyweight.entry_date == date(2026, 10, 13)


@pytest.mark.parametrize(
    ("body", "bad_field"),
    [
        pytest.param(
            with_changes(timezone="Mars/Olympus_Mons"), "timezone", id="bad-timezone"
        ),
        pytest.param(
            with_changes(unit_preference="stone"), "unit_preference", id="unit"
        ),
        pytest.param(
            with_changes(training_style="zumba"), "training_style", id="style"
        ),
        pytest.param(with_changes(phase="recomp"), "phase", id="phase"),
        pytest.param(with_changes(bodyweight_kg="0"), "bodyweight_kg", id="no-weight"),
        pytest.param(
            with_changes(bodyweight_kg="900"), "bodyweight_kg", id="huge-weight"
        ),
        pytest.param(
            with_changes(bodyweight_kg="80.12345"), "bodyweight_kg", id="weight-places"
        ),
        pytest.param(
            with_changes(
                targets={"calories": 100, "protein_g": 0, "carbs_g": 0, "fat_g": 0}
            ),
            "calories",
            id="too-few-calories",
        ),
        pytest.param(
            with_changes(
                targets={"calories": 2000, "protein_g": -1, "carbs_g": 0, "fat_g": 0}
            ),
            "protein_g",
            id="negative-protein",
        ),
        pytest.param(
            with_changes(targets={"calories": 2000}), "protein_g", id="missing-macros"
        ),
        pytest.param(with_changes(name="Pranav"), "name", id="unknown-field"),
    ],
)
def test_onboarding_rejects_invalid_answers(
    api_client: TestClient,
    auth_headers: dict[str, str],
    body: dict[str, Any],
    bad_field: str,
) -> None:
    # Act
    response = api_client.post("/onboarding", headers=auth_headers, json=body)

    # Assert
    assert response.status_code == 422
    assert bad_field in response.json()["error"]

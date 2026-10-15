import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.auth.tokens import create_access_token
from app.core.config import get_settings
from app.models import User
from tests.support import AppleTokenMinter, bearer, sign_in

pytestmark = pytest.mark.integration

NOT_AUTHENTICATED = {"success": False, "data": None, "error": "Not authenticated"}


@pytest.fixture
def auth_headers(
    api_client: TestClient, apple_tokens: AppleTokenMinter
) -> dict[str, str]:
    pair = sign_in(
        api_client, apple_tokens, name="Pranav", subject="sub-1", email="p@example.com"
    )
    return bearer(pair["access_token"])


def test_profile_requires_a_token(api_client: TestClient) -> None:
    # Act
    response = api_client.get("/users/me")

    # Assert
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_profile_rejects_a_garbage_token(api_client: TestClient) -> None:
    # Act
    response = api_client.get("/users/me", headers=bearer("not-a-jwt"))

    # Assert
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED


def test_profile_rejects_an_expired_token(api_client: TestClient) -> None:
    # Arrange
    issued_long_ago = datetime.now(UTC) - timedelta(days=1)
    expired = create_access_token(uuid.uuid4(), get_settings(), issued_long_ago)

    # Act
    response = api_client.get("/users/me", headers=bearer(expired))

    # Assert
    assert response.status_code == 401


def test_profile_rejects_a_token_for_a_deleted_user(
    api_client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    # Arrange
    db_session.execute(delete(User))

    # Act
    response = api_client.get("/users/me", headers=auth_headers)

    # Assert
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED


def test_profile_returns_the_signed_in_user_without_internal_fields(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    response = api_client.get("/users/me", headers=auth_headers)

    # Assert
    profile = response.json()["data"]
    assert response.status_code == 200
    assert profile["name"] == "Pranav"
    assert profile["email"] == "p@example.com"
    assert profile["timezone"] == "UTC"
    assert profile["unit_preference"] == "lbs"
    assert set(profile) == {
        "id",
        "name",
        "email",
        "timezone",
        "unit_preference",
        "onboarded_at",
        "created_at",
    }


def test_profile_update_changes_only_the_fields_sent(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    response = api_client.patch(
        "/users/me",
        headers=auth_headers,
        json={"timezone": "America/Chicago", "unit_preference": "kg"},
    )

    # Assert
    profile = response.json()["data"]
    assert response.status_code == 200
    assert profile["timezone"] == "America/Chicago"
    assert profile["unit_preference"] == "kg"
    assert profile["name"] == "Pranav"
    reread = api_client.get("/users/me", headers=auth_headers).json()["data"]
    assert reread == profile


def test_profile_update_trims_the_name(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    response = api_client.patch(
        "/users/me", headers=auth_headers, json={"name": "  Pranav M  "}
    )

    # Assert
    assert response.json()["data"]["name"] == "Pranav M"


def test_empty_profile_update_changes_nothing(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Arrange
    before = api_client.get("/users/me", headers=auth_headers).json()["data"]

    # Act
    response = api_client.patch("/users/me", headers=auth_headers, json={})

    # Assert
    assert response.status_code == 200
    assert response.json()["data"] == before


@pytest.mark.parametrize(
    ("body", "bad_field"),
    [
        pytest.param({"timezone": "Mars/Olympus_Mons"}, "timezone", id="bad-timezone"),
        pytest.param({"unit_preference": "stone"}, "unit_preference", id="bad-unit"),
        pytest.param({"name": "   "}, "name", id="blank-name"),
        pytest.param({"apple_sub": "someone-else"}, "apple_sub", id="unknown-field"),
    ],
)
def test_profile_update_rejects_invalid_input(
    api_client: TestClient,
    auth_headers: dict[str, str],
    body: dict[str, Any],
    bad_field: str,
) -> None:
    # Act
    response = api_client.patch("/users/me", headers=auth_headers, json=body)

    # Assert
    assert response.status_code == 422
    assert bad_field in response.json()["error"]


def test_profile_update_requires_a_token(api_client: TestClient) -> None:
    # Act
    response = api_client.patch("/users/me", json={"unit_preference": "kg"})

    # Assert
    assert response.status_code == 401

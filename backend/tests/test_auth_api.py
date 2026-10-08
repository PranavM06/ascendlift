import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.apple import AppleTokenVerifier
from app.auth.deps import get_apple_verifier
from app.auth.tokens import hash_refresh_token
from app.models import RefreshToken, User
from tests.support import (
    RAW_NONCE,
    TEST_APPLE_AUDIENCE,
    AppleTokenMinter,
    UnreachableAppleKeys,
    bearer,
    sign_in,
)

pytestmark = pytest.mark.integration

INVALID_REFRESH_TOKEN = {
    "success": False,
    "data": None,
    "error": "Invalid or expired refresh token",
}
AUTH_REQUESTS_ALLOWED_PER_MINUTE = 10


def user_count(db_session: Session) -> int:
    return db_session.scalar(select(func.count()).select_from(User)) or 0


def test_first_sign_in_creates_the_user_and_returns_a_token_pair(
    api_client: TestClient, apple_tokens: AppleTokenMinter, db_session: Session
) -> None:
    # Arrange
    identity_token = apple_tokens.mint(subject="sub-1", email="lifter@example.com")

    # Act
    response = api_client.post(
        "/auth/apple",
        json={"identity_token": identity_token, "nonce": RAW_NONCE, "name": "Pranav"},
    )

    # Assert
    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["token_type"] == "bearer"
    assert body["data"]["expires_in"] == 15 * 60
    assert body["data"]["access_token"]
    assert body["data"]["refresh_token"]
    user = db_session.scalars(select(User)).one()
    assert (user.apple_sub, user.name, user.email) == (
        "sub-1",
        "Pranav",
        "lifter@example.com",
    )


def test_signing_in_again_reuses_the_user_and_keeps_their_name(
    api_client: TestClient, apple_tokens: AppleTokenMinter, db_session: Session
) -> None:
    # Arrange: Apple only sends the name on the very first sign-in.
    sign_in(api_client, apple_tokens, name="Pranav")

    # Act
    sign_in(api_client, apple_tokens, name=None)

    # Assert
    assert user_count(db_session) == 1
    assert db_session.scalars(select(User)).one().name == "Pranav"


def test_a_name_sent_later_fills_in_a_missing_name(
    api_client: TestClient, apple_tokens: AppleTokenMinter, db_session: Session
) -> None:
    # Arrange
    sign_in(api_client, apple_tokens, name=None)

    # Act
    sign_in(api_client, apple_tokens, name="Pranav")

    # Assert
    assert db_session.scalars(select(User)).one().name == "Pranav"


def test_sign_in_with_an_invalid_apple_token_is_rejected_and_creates_no_user(
    api_client: TestClient, apple_tokens: AppleTokenMinter, db_session: Session
) -> None:
    # Arrange
    identity_token = apple_tokens.mint(audience="com.someone.else")

    # Act
    response = api_client.post(
        "/auth/apple", json={"identity_token": identity_token, "nonce": RAW_NONCE}
    )

    # Assert
    assert response.status_code == 401
    assert response.json() == {
        "success": False,
        "data": None,
        "error": "Invalid Apple identity token",
    }
    assert user_count(db_session) == 0


def test_sign_in_returns_503_when_apple_keys_cannot_be_fetched(
    app: FastAPI, api_client: TestClient, apple_tokens: AppleTokenMinter
) -> None:
    # Arrange
    app.dependency_overrides[get_apple_verifier] = lambda: AppleTokenVerifier(
        audiences=(TEST_APPLE_AUDIENCE,), keys=UnreachableAppleKeys()
    )

    # Act
    response = api_client.post(
        "/auth/apple", json={"identity_token": apple_tokens.mint(), "nonce": RAW_NONCE}
    )

    # Assert
    assert response.status_code == 503
    assert response.json()["error"] == "Sign in with Apple is temporarily unavailable"


def test_sign_in_without_a_nonce_is_a_validation_error(
    api_client: TestClient, apple_tokens: AppleTokenMinter
) -> None:
    # Act
    response = api_client.post(
        "/auth/apple", json={"identity_token": apple_tokens.mint()}
    )

    # Assert
    assert response.status_code == 422
    assert "nonce" in response.json()["error"]


def test_refresh_returns_a_new_pair_whose_access_token_works(
    api_client: TestClient, apple_tokens: AppleTokenMinter
) -> None:
    # Arrange
    first_pair = sign_in(api_client, apple_tokens)

    # Act
    response = api_client.post(
        "/auth/refresh", json={"refresh_token": first_pair["refresh_token"]}
    )

    # Assert
    new_pair = response.json()["data"]
    assert response.status_code == 200
    assert new_pair["refresh_token"] != first_pair["refresh_token"]
    profile = api_client.get("/users/me", headers=bearer(new_pair["access_token"]))
    assert profile.status_code == 200


def test_reusing_a_rotated_refresh_token_revokes_the_whole_family(
    api_client: TestClient, apple_tokens: AppleTokenMinter
) -> None:
    # Arrange: a stolen token is used after the real client already rotated it.
    first_pair = sign_in(api_client, apple_tokens)
    rotated = api_client.post(
        "/auth/refresh", json={"refresh_token": first_pair["refresh_token"]}
    ).json()["data"]

    # Act
    reuse = api_client.post(
        "/auth/refresh", json={"refresh_token": first_pair["refresh_token"]}
    )
    after_reuse = api_client.post(
        "/auth/refresh", json={"refresh_token": rotated["refresh_token"]}
    )

    # Assert
    assert reuse.status_code == 401
    assert reuse.json() == INVALID_REFRESH_TOKEN
    assert after_reuse.status_code == 401


def test_expired_refresh_token_is_rejected(
    api_client: TestClient, apple_tokens: AppleTokenMinter, db_session: Session
) -> None:
    # Arrange
    sign_in(api_client, apple_tokens)
    user = db_session.scalars(select(User)).one()
    expired_token = "an-expired-refresh-token"
    db_session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(expired_token),
            family_id=uuid.uuid4(),
            expires_at=datetime.now(UTC) - timedelta(seconds=1),
        )
    )
    db_session.flush()

    # Act
    response = api_client.post("/auth/refresh", json={"refresh_token": expired_token})

    # Assert
    assert response.status_code == 401
    assert response.json() == INVALID_REFRESH_TOKEN


def test_unknown_refresh_token_is_rejected(api_client: TestClient) -> None:
    # Act
    response = api_client.post("/auth/refresh", json={"refresh_token": "never-issued"})

    # Assert
    assert response.status_code == 401
    assert response.json() == INVALID_REFRESH_TOKEN


def test_logout_revokes_the_refresh_token(
    api_client: TestClient, apple_tokens: AppleTokenMinter
) -> None:
    # Arrange
    pair = sign_in(api_client, apple_tokens)

    # Act
    logout = api_client.post(
        "/auth/logout", json={"refresh_token": pair["refresh_token"]}
    )
    refresh = api_client.post(
        "/auth/refresh", json={"refresh_token": pair["refresh_token"]}
    )

    # Assert
    assert logout.status_code == 200
    assert logout.json() == {"success": True, "data": None, "error": None}
    assert refresh.status_code == 401


def test_logout_with_an_old_token_also_revokes_the_tokens_issued_after_it(
    api_client: TestClient, apple_tokens: AppleTokenMinter
) -> None:
    # Arrange
    first_pair = sign_in(api_client, apple_tokens)
    newer_pair = api_client.post(
        "/auth/refresh", json={"refresh_token": first_pair["refresh_token"]}
    ).json()["data"]

    # Act
    api_client.post("/auth/logout", json={"refresh_token": first_pair["refresh_token"]})
    refresh = api_client.post(
        "/auth/refresh", json={"refresh_token": newer_pair["refresh_token"]}
    )

    # Assert
    assert refresh.status_code == 401


def test_logout_with_an_unknown_token_still_succeeds(api_client: TestClient) -> None:
    # Act
    response = api_client.post("/auth/logout", json={"refresh_token": "never-issued"})

    # Assert
    assert response.status_code == 200


def test_refresh_tokens_are_stored_only_as_hashes(
    api_client: TestClient, apple_tokens: AppleTokenMinter, db_session: Session
) -> None:
    # Act
    pair = sign_in(api_client, apple_tokens)

    # Assert
    stored = db_session.scalars(select(RefreshToken)).one()
    assert stored.token_hash != pair["refresh_token"]
    assert stored.token_hash == hash_refresh_token(pair["refresh_token"])


def test_sign_in_attempts_are_rate_limited(
    api_client: TestClient, apple_tokens: AppleTokenMinter
) -> None:
    # Arrange
    body = {
        "identity_token": apple_tokens.mint(audience="com.someone.else"),
        "nonce": RAW_NONCE,
    }
    for _ in range(AUTH_REQUESTS_ALLOWED_PER_MINUTE):
        api_client.post("/auth/apple", json=body)

    # Act
    response = api_client.post("/auth/apple", json=body)

    # Assert
    assert response.status_code == 429
    assert response.json() == {
        "success": False,
        "data": None,
        "error": "Too many requests. Try again shortly.",
    }

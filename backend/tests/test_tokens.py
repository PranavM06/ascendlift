import hashlib
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.auth.tokens import (
    ACCESS_TOKEN_ALGORITHM,
    ACCESS_TOKEN_AUDIENCE,
    ACCESS_TOKEN_ISSUER,
    InvalidAccessTokenError,
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    read_access_token,
)
from app.core.config import get_settings

USER_ID = uuid.UUID("11111111-2222-3333-4444-555555555555")


def encode_with_app_secret(claims: dict[str, object]) -> str:
    secret = get_settings().jwt_secret.get_secret_value()
    return jwt.encode(claims, secret, algorithm=ACCESS_TOKEN_ALGORITHM)


def valid_claims() -> dict[str, object]:
    now = datetime.now(UTC)
    return {
        "sub": str(USER_ID),
        "iss": ACCESS_TOKEN_ISSUER,
        "aud": ACCESS_TOKEN_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }


def test_access_token_round_trips_the_user_id() -> None:
    # Arrange
    settings = get_settings()

    # Act
    token = create_access_token(USER_ID, settings, datetime.now(UTC))

    # Assert
    assert read_access_token(token, settings) == USER_ID


def test_expired_access_token_is_rejected() -> None:
    # Arrange
    settings = get_settings()
    issued_long_ago = datetime.now(UTC) - timedelta(days=1)
    token = create_access_token(USER_ID, settings, issued_long_ago)

    # Act / Assert
    with pytest.raises(InvalidAccessTokenError):
        read_access_token(token, settings)


def test_access_token_signed_with_another_secret_is_rejected() -> None:
    # Arrange
    token = jwt.encode(
        valid_claims(),
        "a-completely-different-secret-of-32-chars",
        algorithm=ACCESS_TOKEN_ALGORITHM,
    )

    # Act / Assert
    with pytest.raises(InvalidAccessTokenError):
        read_access_token(token, get_settings())


@pytest.mark.parametrize(
    "bad_claims",
    [
        pytest.param({"aud": "some-other-app"}, id="wrong-audience"),
        pytest.param({"iss": "someone-else"}, id="wrong-issuer"),
        pytest.param({"sub": "not-a-uuid"}, id="subject-not-a-uuid"),
    ],
)
def test_access_token_with_a_bad_claim_is_rejected(bad_claims: dict[str, str]) -> None:
    # Arrange
    token = encode_with_app_secret({**valid_claims(), **bad_claims})

    # Act / Assert
    with pytest.raises(InvalidAccessTokenError):
        read_access_token(token, get_settings())


def test_access_token_without_an_expiry_is_rejected() -> None:
    # Arrange
    claims = {name: value for name, value in valid_claims().items() if name != "exp"}
    token = encode_with_app_secret(claims)

    # Act / Assert
    with pytest.raises(InvalidAccessTokenError):
        read_access_token(token, get_settings())


def test_garbage_access_token_is_rejected() -> None:
    # Act / Assert
    with pytest.raises(InvalidAccessTokenError):
        read_access_token("not-a-jwt", get_settings())


def test_refresh_tokens_are_long_and_never_repeat() -> None:
    # Act
    tokens = {generate_refresh_token() for _ in range(100)}

    # Assert
    assert len(tokens) == 100
    assert all(len(token) >= 43 for token in tokens)


def test_refresh_token_hash_is_its_sha256_hex_digest() -> None:
    # Act
    token_hash = hash_refresh_token("some-refresh-token")

    # Assert
    assert token_hash == hashlib.sha256(b"some-refresh-token").hexdigest()

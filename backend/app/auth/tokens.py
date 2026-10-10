"""Access tokens (short-lived JWTs) and refresh tokens (opaque random strings)."""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

import jwt

from app.core.config import Settings

# Public claim values, not secrets; the linter flags any name containing "TOKEN".
ACCESS_TOKEN_ALGORITHM = "HS256"  # noqa: S105
ACCESS_TOKEN_ISSUER = "ascendlift-api"  # noqa: S105
ACCESS_TOKEN_AUDIENCE = "ascendlift-app"  # noqa: S105
REQUIRED_CLAIMS = ("sub", "iss", "aud", "iat", "exp")
REFRESH_TOKEN_BYTES = 48


class InvalidAccessTokenError(Exception):
    """The access token is missing, malformed, expired, or not issued by this API."""


def create_access_token(user_id: uuid.UUID, settings: Settings, now: datetime) -> str:
    claims = {
        "sub": str(user_id),
        "iss": ACCESS_TOKEN_ISSUER,
        "aud": ACCESS_TOKEN_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_ttl_minutes),
    }
    return jwt.encode(
        claims, settings.jwt_secret.get_secret_value(), algorithm=ACCESS_TOKEN_ALGORITHM
    )


def read_access_token(token: str, settings: Settings) -> uuid.UUID:
    """Return the user id from a valid access token."""
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[ACCESS_TOKEN_ALGORITHM],
            audience=ACCESS_TOKEN_AUDIENCE,
            issuer=ACCESS_TOKEN_ISSUER,
            options={"require": list(REQUIRED_CLAIMS)},
        )
        return uuid.UUID(claims["sub"])
    except (jwt.PyJWTError, ValueError) as exc:
        raise InvalidAccessTokenError from exc


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(REFRESH_TOKEN_BYTES)


def hash_refresh_token(token: str) -> str:
    # A fast hash is fine here: the token is long and random, not a password.
    return hashlib.sha256(token.encode()).hexdigest()

from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.auth.apple import APPLE_KEYS_URL, AppleTokenVerifier
from app.auth.tokens import InvalidAccessTokenError, read_access_token
from app.core.config import SettingsDep, get_settings
from app.core.errors import AppError
from app.db.session import DbSession
from app.models import User

UNAUTHORIZED = 401
APPLE_KEYS_TIMEOUT_SECONDS = 5

bearer_scheme = HTTPBearer(auto_error=False)


def _not_authenticated() -> AppError:
    return AppError(
        status_code=UNAUTHORIZED,
        message="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


@lru_cache
def get_apple_verifier() -> AppleTokenVerifier:
    # The client caches Apple's key set for five minutes. Its separate per-key
    # cache is left off because it never expires a key Apple has withdrawn.
    keys = PyJWKClient(APPLE_KEYS_URL, timeout=APPLE_KEYS_TIMEOUT_SECONDS)
    return AppleTokenVerifier(audiences=get_settings().apple_audiences, keys=keys)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: DbSession,
    settings: SettingsDep,
) -> User:
    if credentials is None:
        raise _not_authenticated()
    try:
        user_id = read_access_token(credentials.credentials, settings)
    except InvalidAccessTokenError as exc:
        raise _not_authenticated() from exc

    user = db.get(User, user_id)
    if user is None:
        raise _not_authenticated()
    return user


AppleVerifier = Annotated[AppleTokenVerifier, Depends(get_apple_verifier)]
CurrentUser = Annotated[User, Depends(get_current_user)]

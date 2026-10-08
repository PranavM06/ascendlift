from datetime import UTC, datetime

from fastapi import APIRouter, Request

from app.auth.apple import AppleKeysUnavailableError, InvalidAppleTokenError
from app.auth.deps import AppleVerifier
from app.auth.schemas import AppleSignInRequest, RefreshTokenRequest, TokenPairResponse
from app.auth.service import (
    TokenPair,
    rotate_refresh_token,
    sign_in_with_apple,
    sign_out,
)
from app.core.config import SettingsDep
from app.core.errors import AppError
from app.core.rate_limit import AUTH_RATE_LIMIT, limiter
from app.core.responses import ApiResponse, ok
from app.db.session import DbSession

UNAUTHORIZED = 401
SERVICE_UNAVAILABLE = 503

router = APIRouter(prefix="/auth", tags=["auth"])


def _to_response(token_pair: TokenPair) -> TokenPairResponse:
    return TokenPairResponse(
        access_token=token_pair.access_token,
        refresh_token=token_pair.refresh_token,
        expires_in=token_pair.expires_in_seconds,
    )


# The rate limiter reads the client address from `request`, so each limited
# endpoint must accept it even though the endpoint itself does not use it.


@router.post("/apple")
@limiter.limit(AUTH_RATE_LIMIT)
def sign_in(
    request: Request,
    body: AppleSignInRequest,
    db: DbSession,
    settings: SettingsDep,
    verifier: AppleVerifier,
) -> ApiResponse[TokenPairResponse]:
    try:
        identity = verifier.verify(body.identity_token, body.nonce)
    except AppleKeysUnavailableError as exc:
        raise AppError(
            status_code=SERVICE_UNAVAILABLE,
            message="Sign in with Apple is temporarily unavailable",
        ) from exc
    except InvalidAppleTokenError as exc:
        raise AppError(
            status_code=UNAUTHORIZED, message="Invalid Apple identity token"
        ) from exc

    token_pair = sign_in_with_apple(
        db, identity, body.name, settings, datetime.now(UTC)
    )
    return ok(_to_response(token_pair))


@router.post("/refresh")
@limiter.limit(AUTH_RATE_LIMIT)
def refresh(
    request: Request, body: RefreshTokenRequest, db: DbSession, settings: SettingsDep
) -> ApiResponse[TokenPairResponse]:
    token_pair = rotate_refresh_token(
        db, body.refresh_token, settings, datetime.now(UTC)
    )
    return ok(_to_response(token_pair))


@router.post("/logout")
@limiter.limit(AUTH_RATE_LIMIT)
def logout(
    request: Request, body: RefreshTokenRequest, db: DbSession
) -> ApiResponse[None]:
    sign_out(db, body.refresh_token, datetime.now(UTC))
    return ok(None)

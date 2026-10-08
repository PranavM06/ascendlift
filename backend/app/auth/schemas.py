from typing import Literal

from pydantic import BaseModel, Field

from app.users.schemas import PersonName

MAX_IDENTITY_TOKEN_LENGTH = 8192
MIN_NONCE_LENGTH = 16
MAX_NONCE_LENGTH = 128
MAX_REFRESH_TOKEN_LENGTH = 512


class AppleSignInRequest(BaseModel):
    identity_token: str = Field(min_length=1, max_length=MAX_IDENTITY_TOKEN_LENGTH)
    nonce: str = Field(min_length=MIN_NONCE_LENGTH, max_length=MAX_NONCE_LENGTH)
    # Apple gives the app the user's name only on their very first sign-in.
    name: PersonName | None = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=MAX_REFRESH_TOKEN_LENGTH)


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105
    expires_in: int

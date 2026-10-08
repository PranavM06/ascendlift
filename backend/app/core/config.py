from functools import lru_cache
from typing import Annotated, Literal, Self

from fastapi import Depends
from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

DATABASE_DRIVER = "postgresql+psycopg"
MIN_JWT_SECRET_LENGTH = 32
EXPO_GO_AUDIENCE = "host.exp.Exponent"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ASCENDLIFT_",
        env_file=".env",
        frozen=True,
        extra="ignore",
        # Validation errors would otherwise print the URL, password included.
        hide_input_in_errors=True,
    )

    environment: Literal["development", "test", "production"] = "development"
    database_url: str
    # Signs access tokens. Anyone who knows it can impersonate any user.
    jwt_secret: SecretStr = Field(min_length=MIN_JWT_SECRET_LENGTH)
    # The app identifiers Apple identity tokens may be issued for: the bundle id,
    # or "host.exp.Exponent" while developing in Expo Go.
    apple_audiences: tuple[str, ...] = Field(min_length=1)
    access_token_ttl_minutes: int = Field(default=15, gt=0)
    refresh_token_ttl_days: int = Field(default=30, gt=0)

    @field_validator("database_url")
    @classmethod
    def require_postgres_psycopg_url(cls, value: str) -> str:
        try:
            drivername = make_url(value).drivername
        except ArgumentError:
            raise ValueError("is not a valid database URL") from None
        if drivername != DATABASE_DRIVER:
            raise ValueError(f"must start with '{DATABASE_DRIVER}://'")
        return value

    @model_validator(mode="after")
    def forbid_expo_go_audience_in_production(self) -> Self:
        # Every Expo Go app shares this audience, so trusting it would let any of
        # them obtain Apple tokens this API accepts.
        if (
            self.environment == "production"
            and EXPO_GO_AUDIENCE in self.apple_audiences
        ):
            raise ValueError(
                f"apple_audiences must not include '{EXPO_GO_AUDIENCE}' in production"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


SettingsDep = Annotated[Settings, Depends(get_settings)]

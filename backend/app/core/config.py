from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

DATABASE_DRIVER = "postgresql+psycopg"


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


@lru_cache
def get_settings() -> Settings:
    return Settings()

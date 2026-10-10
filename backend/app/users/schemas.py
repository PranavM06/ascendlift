import uuid
from datetime import datetime
from typing import Annotated
from zoneinfo import available_timezones

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from app.models import UnitPreference

MAX_NAME_LENGTH = 100

PersonName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_NAME_LENGTH),
]


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str | None
    email: str | None
    timezone: str
    unit_preference: UnitPreference
    created_at: datetime


class UserUpdate(BaseModel):
    """Fields left out, or sent as null, are not changed."""

    model_config = ConfigDict(extra="forbid")

    name: PersonName | None = None
    timezone: str | None = None
    unit_preference: UnitPreference | None = None

    @field_validator("timezone")
    @classmethod
    def require_iana_timezone(cls, value: str | None) -> str | None:
        if value is not None and value not in available_timezones():
            raise ValueError("must be an IANA timezone name such as 'America/Chicago'")
        return value

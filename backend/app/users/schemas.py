import uuid
from datetime import datetime
from typing import Annotated
from zoneinfo import available_timezones

from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints

from app.models import UnitPreference

MAX_NAME_LENGTH = 100

PersonName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_NAME_LENGTH),
]


def _require_iana_timezone(value: str) -> str:
    if value not in available_timezones():
        raise ValueError("must be an IANA timezone name such as 'America/Chicago'")
    return value


IanaTimezone = Annotated[str, AfterValidator(_require_iana_timezone)]


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str | None
    email: str | None
    timezone: str
    unit_preference: UnitPreference
    # Null until the user finishes onboarding.
    onboarded_at: datetime | None
    created_at: datetime


class UserUpdate(BaseModel):
    """Fields left out, or sent as null, are not changed."""

    model_config = ConfigDict(extra="forbid")

    name: PersonName | None = None
    timezone: IanaTimezone | None = None
    unit_preference: UnitPreference | None = None

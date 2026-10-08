import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Any

from sqlalchemy import DateTime, Enum, ForeignKey, MetaData, Numeric, func
from sqlalchemy.orm import DeclarativeBase, MappedColumn, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

ENUM_COLUMN_LENGTH = 32

# Every weight is stored in kg. Four decimal places keep a value entered in lbs
# exact after converting back for display.
WEIGHT_KG: Numeric[Decimal] = Numeric(8, 4)
RPE: Numeric[Decimal] = Numeric(3, 1)
MIN_RPE = 1
MAX_RPE = 10


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


UuidPk = Annotated[
    uuid.UUID,
    mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    ),
]
CreatedAt = Annotated[
    datetime, mapped_column(DateTime(timezone=True), server_default=func.now())
]


def user_fk(**column_options: Any) -> MappedColumn[uuid.UUID]:
    """A required reference to a user; the row is deleted with the user."""
    return mapped_column(ForeignKey("users.id", ondelete="CASCADE"), **column_options)


def enum_type(enum_class: type[StrEnum], name: str) -> Enum:
    """A string column limited to the enum's values by a CHECK constraint.

    Stored as a string, not a native Postgres enum, so adding a value later is a
    one-line migration.
    """
    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=ENUM_COLUMN_LENGTH,
        values_callable=lambda members: [member.value for member in members],
    )

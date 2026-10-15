import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Uuid,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, UuidPk, enum_type, user_fk
from app.models.enums import Meal


class Food(Base):
    """A food cached from an external source such as USDA FoodData Central."""

    __tablename__ = "foods"
    __table_args__ = (
        CheckConstraint("serving_size > 0", name="serving_size_positive"),
        CheckConstraint(
            "calories >= 0 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0",
            name="nutrients_non_negative",
        ),
    )

    id: Mapped[UuidPk]
    source_id: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    # Who makes it, for packaged foods; null for generic ones such as "Egg, raw".
    brand: Mapped[str | None] = mapped_column(String(100))
    serving_size: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    serving_unit: Mapped[str] = mapped_column(String(20))
    # Nutrients are per serving.
    calories: Mapped[Decimal] = mapped_column(Numeric(7, 2))
    protein_g: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    carbs_g: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    fat_g: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    created_at: Mapped[CreatedAt]


class FoodSearch(Base):
    """What the external source returned for one search, so repeats skip it."""

    __tablename__ = "food_searches"

    id: Mapped[UuidPk]
    # Lower case with single spaces, so "Greek  Yogurt" and "greek yogurt" share
    # a row.
    query: Mapped[str] = mapped_column(String(100), unique=True)
    # Best match first. Foods are never deleted, so the ids stay valid.
    food_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(Uuid))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FoodLogEntry(Base):
    __tablename__ = "food_log_entries"
    __table_args__ = (
        Index(None, "user_id", "entry_date"),
        CheckConstraint("servings > 0", name="servings_positive"),
    )

    id: Mapped[UuidPk]
    user_id: Mapped[uuid.UUID] = user_fk()
    food_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("foods.id"))
    servings: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    meal: Mapped[Meal] = mapped_column(enum_type(Meal, "meal"))
    entry_date: Mapped[date]
    created_at: Mapped[CreatedAt]

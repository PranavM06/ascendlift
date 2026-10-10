import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import WEIGHT_KG, Base, CreatedAt, UuidPk, enum_type, user_fk
from app.models.enums import Phase, TrainingStyle, UnitPreference

SHA256_HEX_LENGTH = 64


class User(Base):
    __tablename__ = "users"

    id: Mapped[UuidPk]
    apple_sub: Mapped[str] = mapped_column(String(255), unique=True)
    email: Mapped[str | None] = mapped_column(String(320))
    name: Mapped[str | None] = mapped_column(String(100))
    # IANA name, e.g. "America/Chicago". Decides when the nightly insight runs.
    timezone: Mapped[str] = mapped_column(String(64), server_default="UTC")
    unit_preference: Mapped[UnitPreference] = mapped_column(
        enum_type(UnitPreference, "unit_preference"),
        server_default=UnitPreference.LBS.value,
    )
    created_at: Mapped[CreatedAt]


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[UuidPk]
    user_id: Mapped[uuid.UUID] = user_fk(index=True)
    # Only the hash is stored, so a database leak does not expose usable tokens.
    token_hash: Mapped[str] = mapped_column(String(SHA256_HEX_LENGTH), unique=True)
    # Tokens descended from one sign-in share a family, so reuse of an old token
    # can revoke all of them.
    family_id: Mapped[uuid.UUID] = mapped_column(index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[CreatedAt]


class BodyweightEntry(Base):
    __tablename__ = "bodyweight_entries"
    __table_args__ = (
        UniqueConstraint("user_id", "entry_date"),
        CheckConstraint("weight_kg > 0", name="weight_positive"),
    )

    id: Mapped[UuidPk]
    user_id: Mapped[uuid.UUID] = user_fk()
    entry_date: Mapped[date]
    weight_kg: Mapped[Decimal] = mapped_column(WEIGHT_KG)
    created_at: Mapped[CreatedAt]


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[UuidPk]
    user_id: Mapped[uuid.UUID] = user_fk(unique=True)
    training_style: Mapped[TrainingStyle] = mapped_column(
        enum_type(TrainingStyle, "training_style")
    )
    phase: Mapped[Phase] = mapped_column(enum_type(Phase, "phase"))
    created_at: Mapped[CreatedAt]


class TargetHistory(Base):
    __tablename__ = "target_history"
    __table_args__ = (
        UniqueConstraint("user_id", "effective_date"),
        CheckConstraint(
            "calories >= 0 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0",
            name="targets_non_negative",
        ),
    )

    id: Mapped[UuidPk]
    user_id: Mapped[uuid.UUID] = user_fk()
    calories: Mapped[int]
    protein_g: Mapped[int]
    carbs_g: Mapped[int]
    fat_g: Mapped[int]
    effective_date: Mapped[date]
    created_at: Mapped[CreatedAt]

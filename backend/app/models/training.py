import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import (
    MAX_RPE,
    MIN_RPE,
    RPE,
    WEIGHT_KG,
    Base,
    CreatedAt,
    UuidPk,
    user_fk,
)

RPE_RANGE = f"BETWEEN {MIN_RPE} AND {MAX_RPE}"


class Exercise(Base):
    __tablename__ = "exercises"
    __table_args__ = (
        # Seeded exercises have no owner; treating NULL owners as equal keeps
        # their names unique too.
        UniqueConstraint("owner_id", "name", postgresql_nulls_not_distinct=True),
    )

    id: Mapped[UuidPk]
    name: Mapped[str] = mapped_column(String(100))
    muscle_groups: Mapped[list[str]] = mapped_column(
        ARRAY(String(50)), server_default="{}"
    )
    equipment: Mapped[str | None] = mapped_column(String(50))
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    created_at: Mapped[CreatedAt]


class RoutineTemplate(Base):
    __tablename__ = "routine_templates"

    id: Mapped[UuidPk]
    user_id: Mapped[uuid.UUID] = user_fk(index=True)
    name: Mapped[str] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[CreatedAt]


class TemplateExercise(Base):
    __tablename__ = "template_exercises"
    __table_args__ = (
        UniqueConstraint("template_id", "position"),
        CheckConstraint("target_sets > 0", name="target_sets_positive"),
        CheckConstraint("rep_min > 0 AND rep_min <= rep_max", name="rep_range_valid"),
        CheckConstraint(
            "target_weight_kg IS NULL OR target_weight_kg >= 0",
            name="target_weight_non_negative",
        ),
        CheckConstraint(
            f"target_rpe IS NULL OR target_rpe {RPE_RANGE}", name="target_rpe_in_range"
        ),
    )

    id: Mapped[UuidPk]
    template_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("routine_templates.id", ondelete="CASCADE")
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id"))
    position: Mapped[int]
    target_sets: Mapped[int]
    rep_min: Mapped[int]
    rep_max: Mapped[int]
    target_weight_kg: Mapped[Decimal | None] = mapped_column(WEIGHT_KG)
    target_rpe: Mapped[Decimal | None] = mapped_column(RPE)
    created_at: Mapped[CreatedAt]


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"
    __table_args__ = (
        Index(None, "user_id", "started_at"),
        CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at", name="ends_after_start"
        ),
    )

    id: Mapped[UuidPk]
    user_id: Mapped[uuid.UUID] = user_fk()
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Kept so insights can compare the work done to the plan; cleared if the
    # template is deleted, so the workout itself survives.
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("routine_templates.id", ondelete="SET NULL")
    )
    created_at: Mapped[CreatedAt]


class WorkoutSet(Base):
    __tablename__ = "workout_sets"
    __table_args__ = (
        UniqueConstraint("session_id", "position"),
        CheckConstraint("reps >= 0", name="reps_non_negative"),
        CheckConstraint("weight_kg >= 0", name="weight_non_negative"),
        CheckConstraint(f"rpe IS NULL OR rpe {RPE_RANGE}", name="rpe_in_range"),
    )

    id: Mapped[UuidPk]
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE")
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercises.id"), index=True
    )
    position: Mapped[int]
    reps: Mapped[int]
    weight_kg: Mapped[Decimal] = mapped_column(WEIGHT_KG)
    rpe: Mapped[Decimal | None] = mapped_column(RPE)
    created_at: Mapped[CreatedAt]

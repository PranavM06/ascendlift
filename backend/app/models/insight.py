import uuid
from datetime import date
from typing import Any

from sqlalchemy import UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, UuidPk, enum_type, user_fk
from app.models.enums import InsightStatus


class DailyInsight(Base):
    __tablename__ = "daily_insights"
    __table_args__ = (UniqueConstraint("user_id", "insight_date"),)

    id: Mapped[UuidPk]
    user_id: Mapped[uuid.UUID] = user_fk()
    insight_date: Mapped[date]
    insight: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # Exactly what Claude was given, so an odd insight can be traced to its input.
    stats_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    status: Mapped[InsightStatus] = mapped_column(
        enum_type(InsightStatus, "insight_status"),
        server_default=InsightStatus.PENDING.value,
    )
    created_at: Mapped[CreatedAt]

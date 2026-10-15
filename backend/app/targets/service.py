import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import TargetHistory


@dataclass(frozen=True)
class Targets:
    """A day's calorie and macro goals, as the user entered them."""

    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int


def targets_on(db: Session, user_id: uuid.UUID, on_date: date) -> TargetHistory | None:
    """The targets in effect on a day: the latest set on or before it."""
    return db.scalars(
        select(TargetHistory)
        .where(
            TargetHistory.user_id == user_id, TargetHistory.effective_date <= on_date
        )
        .order_by(TargetHistory.effective_date.desc())
        .limit(1)
    ).one_or_none()

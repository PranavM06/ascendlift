import uuid
from dataclasses import asdict, dataclass
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import (
    BodyweightEntry,
    Goal,
    Phase,
    TargetHistory,
    TrainingStyle,
    UnitPreference,
    User,
)
from app.targets.service import Targets


@dataclass(frozen=True)
class Onboarding:
    """Everything a new user is asked before they start."""

    unit_preference: UnitPreference
    # IANA name, e.g. "America/Chicago".
    timezone: str
    training_style: TrainingStyle
    phase: Phase
    targets: Targets
    bodyweight_kg: Decimal


def _save_goal(db: Session, user_id: uuid.UUID, answers: Onboarding) -> None:
    goal = {"training_style": answers.training_style, "phase": answers.phase}
    db.execute(
        pg_insert(Goal)
        .values(user_id=user_id, **goal)
        .on_conflict_do_update(index_elements=[Goal.user_id], set_=goal)
    )


def _save_targets(
    db: Session, user_id: uuid.UUID, targets: Targets, effective_date: date
) -> None:
    values = asdict(targets)
    db.execute(
        pg_insert(TargetHistory)
        .values(user_id=user_id, effective_date=effective_date, **values)
        .on_conflict_do_update(
            index_elements=[TargetHistory.user_id, TargetHistory.effective_date],
            set_=values,
        )
    )


def _save_bodyweight(
    db: Session, user_id: uuid.UUID, weight_kg: Decimal, entry_date: date
) -> None:
    db.execute(
        pg_insert(BodyweightEntry)
        .values(user_id=user_id, entry_date=entry_date, weight_kg=weight_kg)
        .on_conflict_do_update(
            index_elements=[BodyweightEntry.user_id, BodyweightEntry.entry_date],
            set_={"weight_kg": weight_kg},
        )
    )


def complete_onboarding(
    db: Session, user_id: uuid.UUID, answers: Onboarding, now: datetime
) -> User:
    """Saves the answers in one transaction and marks the user onboarded.

    Sending the answers again replaces them, so a retry after a dropped
    connection is safe.
    """
    # The targets and first weigh-in belong to the user's own today, which
    # may not be the server's.
    today = now.astimezone(ZoneInfo(answers.timezone)).date()
    _save_goal(db, user_id, answers)
    _save_targets(db, user_id, answers.targets, today)
    _save_bodyweight(db, user_id, answers.bodyweight_kg, today)
    user = db.scalars(
        update(User)
        .where(User.id == user_id)
        .values(
            unit_preference=answers.unit_preference,
            timezone=answers.timezone,
            # Keeps the first time, so answering again does not move it.
            onboarded_at=func.coalesce(User.onboarded_at, now),
        )
        .returning(User)
        .execution_options(populate_existing=True)
    ).one()
    db.commit()
    return user

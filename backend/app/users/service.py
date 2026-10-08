from collections.abc import Mapping
from typing import Any

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import User


def update_profile(db: Session, user: User, changes: Mapping[str, Any]) -> User:
    if not changes:
        return user
    updated = db.scalars(
        update(User)
        .where(User.id == user.id)
        .values(**changes)
        .returning(User)
        .execution_options(populate_existing=True)
    ).one()
    db.commit()
    return updated

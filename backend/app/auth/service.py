import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.auth.apple import AppleIdentity
from app.auth.tokens import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
)
from app.core.config import Settings
from app.core.errors import AppError
from app.models import RefreshToken, User

logger = logging.getLogger(__name__)

UNAUTHORIZED = 401
INVALID_REFRESH_TOKEN_MESSAGE = "Invalid or expired refresh token"  # noqa: S105
SECONDS_PER_MINUTE = 60


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in_seconds: int


def _invalid_refresh_token() -> AppError:
    return AppError(status_code=UNAUTHORIZED, message=INVALID_REFRESH_TOKEN_MESSAGE)


def _details_to_fill_in(
    user: User, identity: AppleIdentity, name: str | None
) -> dict[str, str]:
    offered = {"name": name, "email": identity.email}
    return {
        field: value
        for field, value in offered.items()
        if value and getattr(user, field) is None
    }


def find_or_create_user(db: Session, identity: AppleIdentity, name: str | None) -> User:
    # ON CONFLICT makes two simultaneous first sign-ins safe.
    db.execute(
        pg_insert(User)
        .values(apple_sub=identity.subject, email=identity.email, name=name)
        .on_conflict_do_nothing(index_elements=[User.apple_sub])
    )
    user = db.scalars(select(User).where(User.apple_sub == identity.subject)).one()

    missing = _details_to_fill_in(user, identity, name)
    if not missing:
        return user
    return db.scalars(
        update(User)
        .where(User.id == user.id)
        .values(**missing)
        .returning(User)
        .execution_options(populate_existing=True)
    ).one()


def _issue_token_pair(
    db: Session,
    user_id: uuid.UUID,
    family_id: uuid.UUID,
    settings: Settings,
    now: datetime,
) -> TokenPair:
    refresh_token = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=hash_refresh_token(refresh_token),
            family_id=family_id,
            expires_at=now + timedelta(days=settings.refresh_token_ttl_days),
        )
    )
    return TokenPair(
        access_token=create_access_token(user_id, settings, now),
        refresh_token=refresh_token,
        expires_in_seconds=settings.access_token_ttl_minutes * SECONDS_PER_MINUTE,
    )


def _lock_family_of(db: Session, refresh_token: str) -> RefreshToken | None:
    """Lock the token's whole family and return the token as it now stands.

    Refresh and logout both change every token in a family. Locking the family
    first, always in the same order, makes concurrent requests take turns
    instead of deadlocking or missing a token the other one just issued. The
    token is re-read after the lock is held so a rotation that finished while
    this request waited is seen.
    """
    token_hash = hash_refresh_token(refresh_token)
    family_id = db.scalar(
        select(RefreshToken.family_id).where(RefreshToken.token_hash == token_hash)
    )
    if family_id is None:
        return None
    db.execute(
        select(RefreshToken.id)
        .where(RefreshToken.family_id == family_id)
        .order_by(RefreshToken.id)
        .with_for_update()
    )
    return db.scalars(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .execution_options(populate_existing=True)
    ).one_or_none()


def _revoke_family(db: Session, family_id: uuid.UUID, now: datetime) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )


def sign_in_with_apple(
    db: Session,
    identity: AppleIdentity,
    name: str | None,
    settings: Settings,
    now: datetime,
) -> TokenPair:
    user = find_or_create_user(db, identity, name)
    token_pair = _issue_token_pair(db, user.id, uuid.uuid4(), settings, now)
    db.commit()
    return token_pair


def rotate_refresh_token(
    db: Session, refresh_token: str, settings: Settings, now: datetime
) -> TokenPair:
    """Exchange a refresh token for a new pair; each token works only once."""
    stored = _lock_family_of(db, refresh_token)
    if stored is None:
        raise _invalid_refresh_token()

    user_id, family_id = stored.user_id, stored.family_id
    if stored.revoked_at is not None:
        # A token that was already used is being presented again, so it may
        # have been stolen. Sign out every token descended from that sign-in.
        _revoke_family(db, family_id, now)
        db.commit()
        logger.warning("Refresh token reuse detected for user %s", user_id)
        raise _invalid_refresh_token()
    if stored.expires_at <= now:
        raise _invalid_refresh_token()

    _revoke_family(db, family_id, now)
    token_pair = _issue_token_pair(db, user_id, family_id, settings, now)
    db.commit()
    return token_pair


def sign_out(db: Session, refresh_token: str, now: datetime) -> None:
    """Revoke the token's family. Unknown tokens are ignored."""
    stored = _lock_family_of(db, refresh_token)
    if stored is None:
        return
    _revoke_family(db, stored.family_id, now)
    db.commit()

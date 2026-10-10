"""allow one workout in progress per user

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-09 21:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX_NAME = "uq_workout_sessions_active_user"


def upgrade() -> None:
    op.create_index(
        INDEX_NAME,
        "workout_sessions",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="workout_sessions")

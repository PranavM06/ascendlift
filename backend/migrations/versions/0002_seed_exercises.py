"""seed the exercise library

The exercises come from free-exercise-db (https://github.com/yuhonas/free-exercise-db),
which is in the public domain. Only its lifting categories are kept (strength,
powerlifting, olympic weightlifting, strongman), since the app tracks lifting only.
Muscle groups list the primary muscles first, then the secondary ones.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-09 20:50:00.000000

"""

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SEED_PATH = Path(__file__).resolve().parents[1] / "data" / "exercises.json"

# A snapshot of the columns this migration writes, so later model changes
# cannot alter what it does.
exercises = sa.table(
    "exercises",
    sa.column("name", sa.String(length=100)),
    sa.column("muscle_groups", postgresql.ARRAY(sa.String(length=50))),
    sa.column("equipment", sa.String(length=50)),
    sa.column("owner_id", sa.Uuid()),
)


def load_seed_exercises() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    return rows


def upgrade() -> None:
    op.execute(
        postgresql.insert(exercises)
        .values(load_seed_exercises())
        .on_conflict_do_nothing()
    )


def downgrade() -> None:
    # Fails if a logged set or a template still uses a seeded exercise, rather
    # than deleting that training history.
    seeded_names = [row["name"] for row in load_seed_exercises()]
    op.execute(
        sa.delete(exercises).where(
            exercises.c.owner_id.is_(None), exercises.c.name.in_(seeded_names)
        )
    )

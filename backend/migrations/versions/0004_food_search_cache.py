"""add food brands and the food search cache

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-10 21:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("foods", sa.Column("brand", sa.String(length=100), nullable=True))
    op.create_table(
        "food_searches",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("query", sa.String(length=100), nullable=False),
        sa.Column("food_ids", postgresql.ARRAY(sa.Uuid()), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_food_searches")),
        sa.UniqueConstraint("query", name=op.f("uq_food_searches_query")),
    )


def downgrade() -> None:
    op.drop_table("food_searches")
    op.drop_column("foods", "brand")

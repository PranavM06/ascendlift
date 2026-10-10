"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-08 16:00:55.468191

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Enum-like columns are strings limited by a named CHECK constraint.
ENUM_COLUMN = sa.String(length=32)


def upgrade() -> None:
    op.create_table(
        "foods",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("source_id", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("serving_size", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("serving_unit", sa.String(length=20), nullable=False),
        sa.Column("calories", sa.Numeric(precision=7, scale=2), nullable=False),
        sa.Column("protein_g", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column("carbs_g", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column("fat_g", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "calories >= 0 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0",
            name=op.f("ck_foods_nutrients_non_negative"),
        ),
        sa.CheckConstraint(
            "serving_size > 0", name=op.f("ck_foods_serving_size_positive")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_foods")),
        sa.UniqueConstraint("source_id", name=op.f("uq_foods_source_id")),
    )
    op.create_table(
        "users",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("apple_sub", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column(
            "timezone", sa.String(length=64), server_default="UTC", nullable=False
        ),
        sa.Column(
            "unit_preference",
            ENUM_COLUMN,
            server_default="lbs",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "unit_preference IN ('lbs', 'kg')", name=op.f("ck_users_unit_preference")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("apple_sub", name=op.f("uq_users_apple_sub")),
    )
    op.create_table(
        "bodyweight_entries",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("weight_kg", sa.Numeric(precision=8, scale=4), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "weight_kg > 0", name=op.f("ck_bodyweight_entries_weight_positive")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_bodyweight_entries_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bodyweight_entries")),
        sa.UniqueConstraint(
            "user_id", "entry_date", name=op.f("uq_bodyweight_entries_user_id")
        ),
    )
    op.create_table(
        "daily_insights",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("insight_date", sa.Date(), nullable=False),
        sa.Column("insight", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "stats_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "status",
            ENUM_COLUMN,
            server_default="pending",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'ready', 'failed')",
            name=op.f("ck_daily_insights_insight_status"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_daily_insights_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_daily_insights")),
        sa.UniqueConstraint(
            "user_id", "insight_date", name=op.f("uq_daily_insights_user_id")
        ),
    )
    op.create_table(
        "exercises",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "muscle_groups",
            postgresql.ARRAY(sa.String(length=50)),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("equipment", sa.String(length=50), nullable=True),
        sa.Column("owner_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name=op.f("fk_exercises_owner_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exercises")),
        sa.UniqueConstraint(
            "owner_id",
            "name",
            name=op.f("uq_exercises_owner_id"),
            postgresql_nulls_not_distinct=True,
        ),
    )
    op.create_table(
        "food_log_entries",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("food_id", sa.Uuid(), nullable=False),
        sa.Column("servings", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column(
            "meal",
            ENUM_COLUMN,
            nullable=False,
        ),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "meal IN ('breakfast', 'lunch', 'dinner', 'snack')",
            name=op.f("ck_food_log_entries_meal"),
        ),
        sa.CheckConstraint(
            "servings > 0", name=op.f("ck_food_log_entries_servings_positive")
        ),
        sa.ForeignKeyConstraint(
            ["food_id"], ["foods.id"], name=op.f("fk_food_log_entries_food_id_foods")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_food_log_entries_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_food_log_entries")),
    )
    op.create_index(
        op.f("ix_food_log_entries_user_id"),
        "food_log_entries",
        ["user_id", "entry_date"],
        unique=False,
    )
    op.create_table(
        "goals",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "training_style",
            ENUM_COLUMN,
            nullable=False,
        ),
        sa.Column(
            "phase",
            ENUM_COLUMN,
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "phase IN ('cut', 'bulk', 'maintain')", name=op.f("ck_goals_phase")
        ),
        sa.CheckConstraint(
            "training_style IN ('powerlifting', 'bodybuilding', 'general_strength')",
            name=op.f("ck_goals_training_style"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_goals_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_goals")),
        sa.UniqueConstraint("user_id", name=op.f("uq_goals_user_id")),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_refresh_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_tokens_token_hash")),
    )
    op.create_index(
        op.f("ix_refresh_tokens_family_id"),
        "refresh_tokens",
        ["family_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False
    )
    op.create_table(
        "routine_templates",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_routine_templates_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_routine_templates")),
    )
    op.create_index(
        op.f("ix_routine_templates_user_id"),
        "routine_templates",
        ["user_id"],
        unique=False,
    )
    op.create_table(
        "target_history",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("calories", sa.Integer(), nullable=False),
        sa.Column("protein_g", sa.Integer(), nullable=False),
        sa.Column("carbs_g", sa.Integer(), nullable=False),
        sa.Column("fat_g", sa.Integer(), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "calories >= 0 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0",
            name=op.f("ck_target_history_targets_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_target_history_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_target_history")),
        sa.UniqueConstraint(
            "user_id", "effective_date", name=op.f("uq_target_history_user_id")
        ),
    )
    op.create_table(
        "template_exercises",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("template_id", sa.Uuid(), nullable=False),
        sa.Column("exercise_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("target_sets", sa.Integer(), nullable=False),
        sa.Column("rep_min", sa.Integer(), nullable=False),
        sa.Column("rep_max", sa.Integer(), nullable=False),
        sa.Column("target_weight_kg", sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column("target_rpe", sa.Numeric(precision=3, scale=1), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "rep_min > 0 AND rep_min <= rep_max",
            name=op.f("ck_template_exercises_rep_range_valid"),
        ),
        sa.CheckConstraint(
            "target_rpe IS NULL OR target_rpe BETWEEN 1 AND 10",
            name=op.f("ck_template_exercises_target_rpe_in_range"),
        ),
        sa.CheckConstraint(
            "target_sets > 0", name=op.f("ck_template_exercises_target_sets_positive")
        ),
        sa.CheckConstraint(
            "target_weight_kg IS NULL OR target_weight_kg >= 0",
            name=op.f("ck_template_exercises_target_weight_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["exercise_id"],
            ["exercises.id"],
            name=op.f("fk_template_exercises_exercise_id_exercises"),
        ),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["routine_templates.id"],
            name=op.f("fk_template_exercises_template_id_routine_templates"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_template_exercises")),
        sa.UniqueConstraint(
            "template_id", "position", name=op.f("uq_template_exercises_template_id")
        ),
    )
    op.create_table(
        "workout_sessions",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("template_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at",
            name=op.f("ck_workout_sessions_ends_after_start"),
        ),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["routine_templates.id"],
            name=op.f("fk_workout_sessions_template_id_routine_templates"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_workout_sessions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workout_sessions")),
    )
    op.create_index(
        op.f("ix_workout_sessions_user_id"),
        "workout_sessions",
        ["user_id", "started_at"],
        unique=False,
    )
    op.create_table(
        "workout_sets",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("exercise_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=False),
        sa.Column("weight_kg", sa.Numeric(precision=8, scale=4), nullable=False),
        sa.Column("rpe", sa.Numeric(precision=3, scale=1), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("reps >= 0", name=op.f("ck_workout_sets_reps_non_negative")),
        sa.CheckConstraint(
            "rpe IS NULL OR rpe BETWEEN 1 AND 10",
            name=op.f("ck_workout_sets_rpe_in_range"),
        ),
        sa.CheckConstraint(
            "weight_kg >= 0", name=op.f("ck_workout_sets_weight_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["exercise_id"],
            ["exercises.id"],
            name=op.f("fk_workout_sets_exercise_id_exercises"),
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["workout_sessions.id"],
            name=op.f("fk_workout_sets_session_id_workout_sessions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workout_sets")),
        sa.UniqueConstraint(
            "session_id", "position", name=op.f("uq_workout_sets_session_id")
        ),
    )
    op.create_index(
        op.f("ix_workout_sets_exercise_id"),
        "workout_sets",
        ["exercise_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_workout_sets_exercise_id"), table_name="workout_sets")
    op.drop_table("workout_sets")
    op.drop_index(op.f("ix_workout_sessions_user_id"), table_name="workout_sessions")
    op.drop_table("workout_sessions")
    op.drop_table("template_exercises")
    op.drop_table("target_history")
    op.drop_index(op.f("ix_routine_templates_user_id"), table_name="routine_templates")
    op.drop_table("routine_templates")
    op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_family_id"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("goals")
    op.drop_index(op.f("ix_food_log_entries_user_id"), table_name="food_log_entries")
    op.drop_table("food_log_entries")
    op.drop_table("exercises")
    op.drop_table("daily_insights")
    op.drop_table("bodyweight_entries")
    op.drop_table("users")
    op.drop_table("foods")

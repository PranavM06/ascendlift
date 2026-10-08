import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from app.db.base import Base
from app.db.session import get_engine

ALEMBIC_VERSION_TABLE = "alembic_version"

EXPECTED_TABLES = {
    "users",
    "refresh_tokens",
    "bodyweight_entries",
    "goals",
    "target_history",
    "exercises",
    "routine_templates",
    "template_exercises",
    "workout_sessions",
    "workout_sets",
    "foods",
    "food_log_entries",
    "daily_insights",
}


def application_table_names() -> set[str]:
    return set(inspect(get_engine()).get_table_names()) - {ALEMBIC_VERSION_TABLE}


@pytest.mark.integration
def test_downgrade_removes_every_table_and_upgrade_restores_them(
    alembic_config: Config,
) -> None:
    # Act
    command.downgrade(alembic_config, "base")
    tables_after_downgrade = application_table_names()
    command.upgrade(alembic_config, "head")
    tables_after_upgrade = application_table_names()

    # Assert
    assert tables_after_downgrade == set()
    assert tables_after_upgrade == EXPECTED_TABLES


@pytest.mark.integration
def test_models_match_the_migrated_schema(migrated_database: None) -> None:
    # Act
    with get_engine().connect() as connection:
        differences = compare_metadata(
            MigrationContext.configure(connection), Base.metadata
        )

    # Assert
    assert differences == []

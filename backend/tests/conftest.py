import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

DEFAULT_TEST_DATABASE_URL = (
    "postgresql+psycopg://ascendlift:ascendlift@localhost:5432/ascendlift_test"
)

TEST_DATABASE_SUFFIX = "_test"

# Tests never use ASCENDLIFT_DATABASE_URL from the shell or .env, so they cannot
# run against a development database by accident.
test_database_url = os.environ.get(
    "ASCENDLIFT_TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL
)
if not test_database_url.endswith(TEST_DATABASE_SUFFIX):
    raise RuntimeError(
        "ASCENDLIFT_TEST_DATABASE_URL must name a database ending in "
        f"'{TEST_DATABASE_SUFFIX}'"
    )

os.environ["ASCENDLIFT_ENVIRONMENT"] = "test"
os.environ["ASCENDLIFT_DATABASE_URL"] = test_database_url

from app.db.session import get_engine  # noqa: E402
from app.main import create_app  # noqa: E402

ALEMBIC_INI_PATH = Path(__file__).resolve().parents[1] / "alembic.ini"


@pytest.fixture(scope="session")
def alembic_config() -> Config:
    return Config(str(ALEMBIC_INI_PATH))


@pytest.fixture(scope="session")
def migrated_database(alembic_config: Config) -> None:
    command.upgrade(alembic_config, "head")


@pytest.fixture
def db_session(migrated_database: None) -> Iterator[Session]:
    """A session whose writes are rolled back when the test ends."""
    with get_engine().connect() as connection:
        transaction = connection.begin()
        with Session(
            bind=connection, join_transaction_mode="create_savepoint"
        ) as session:
            yield session
        transaction.rollback()


@pytest.fixture
def app() -> FastAPI:
    return create_app()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client

import os
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

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

from app.main import create_app  # noqa: E402


@pytest.fixture
def app() -> FastAPI:
    return create_app()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client

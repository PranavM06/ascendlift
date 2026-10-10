import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from cryptography.hazmat.primitives.asymmetric import rsa
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
os.environ["ASCENDLIFT_JWT_SECRET"] = "test-only-secret-at-least-32-characters-long"
os.environ["ASCENDLIFT_APPLE_AUDIENCES"] = '["host.exp.Exponent"]'

from app.auth.apple import AppleTokenVerifier  # noqa: E402
from app.auth.deps import get_apple_verifier  # noqa: E402
from app.core.rate_limit import limiter  # noqa: E402
from app.db.session import get_db, get_engine  # noqa: E402
from app.foods.usda import get_food_source  # noqa: E402
from app.main import create_app  # noqa: E402
from tests.support import (  # noqa: E402
    TEST_APPLE_AUDIENCE,
    AppleTokenMinter,
    FakeAppleKeys,
    FakeFoodSource,
    generate_rsa_key,
    jwks_for,
)

ALEMBIC_INI_PATH = Path(__file__).resolve().parents[1] / "alembic.ini"


@pytest.fixture(autouse=True)
def reset_rate_limits() -> None:
    limiter.reset()


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


@pytest.fixture(scope="session")
def apple_private_key() -> rsa.RSAPrivateKey:
    return generate_rsa_key()


@pytest.fixture
def apple_tokens(apple_private_key: rsa.RSAPrivateKey) -> AppleTokenMinter:
    return AppleTokenMinter(private_key=apple_private_key)


@pytest.fixture
def apple_verifier(apple_private_key: rsa.RSAPrivateKey) -> AppleTokenVerifier:
    return AppleTokenVerifier(
        audiences=(TEST_APPLE_AUDIENCE,),
        keys=FakeAppleKeys(jwks_for(apple_private_key)),
    )


@pytest.fixture
def food_source() -> FakeFoodSource:
    return FakeFoodSource()


@pytest.fixture
def app() -> FastAPI:
    return create_app()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def api_client(
    app: FastAPI,
    db_session: Session,
    apple_verifier: AppleTokenVerifier,
    food_source: FakeFoodSource,
) -> Iterator[TestClient]:
    """A client whose requests use the rolled-back session, fake Apple keys and
    a fake USDA."""

    def use_test_session() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = use_test_session
    app.dependency_overrides[get_apple_verifier] = lambda: apple_verifier
    app.dependency_overrides[get_food_source] = lambda: food_source
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    app.dependency_overrides.clear()

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.db.session import get_db


class UnreachableDatabaseSession:
    def execute(self, *args: Any, **kwargs: Any) -> None:
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))


@pytest.mark.integration
def test_health_returns_ok_when_database_is_reachable(client: TestClient) -> None:
    # Act
    response = client.get("/health")

    # Assert
    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "data": {"status": "ok", "database": "ok"},
        "error": None,
    }


def test_health_returns_503_when_database_is_unreachable(
    app: FastAPI, client: TestClient
) -> None:
    # Arrange
    def unreachable_db() -> Iterator[UnreachableDatabaseSession]:
        yield UnreachableDatabaseSession()

    app.dependency_overrides[get_db] = unreachable_db

    # Act
    response = client.get("/health")

    # Assert
    assert response.status_code == 503
    assert response.json() == {
        "success": False,
        "data": None,
        "error": "Database unavailable",
    }


def test_health_error_does_not_leak_connection_details(
    app: FastAPI, client: TestClient
) -> None:
    # Arrange
    def unreachable_db() -> Iterator[UnreachableDatabaseSession]:
        yield UnreachableDatabaseSession()

    app.dependency_overrides[get_db] = unreachable_db

    # Act
    response = client.get("/health")

    # Assert
    assert "connection refused" not in response.text
    assert "SELECT" not in response.text

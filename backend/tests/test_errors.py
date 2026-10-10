from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core.errors import AppError


def test_unknown_route_returns_404_in_envelope(client: TestClient) -> None:
    # Act
    response = client.get("/does-not-exist")

    # Assert
    assert response.status_code == 404
    assert response.json() == {"success": False, "data": None, "error": "Not Found"}


def test_app_error_returns_its_status_and_message_in_envelope(
    app: FastAPI, client: TestClient
) -> None:
    # Arrange
    @app.get("/raises-app-error")
    def raises_app_error() -> None:
        raise AppError(status_code=409, message="Already exists")

    # Act
    response = client.get("/raises-app-error")

    # Assert
    assert response.status_code == 409
    assert response.json() == {
        "success": False,
        "data": None,
        "error": "Already exists",
    }


def test_http_exception_for_bodyless_status_returns_no_body(
    app: FastAPI, client: TestClient
) -> None:
    # Arrange
    @app.get("/no-content")
    def no_content() -> None:
        raise HTTPException(status_code=204)

    # Act
    response = client.get("/no-content")

    # Assert
    assert response.status_code == 204
    assert response.content == b""


def test_http_exception_with_structured_detail_returns_status_phrase(
    app: FastAPI, client: TestClient
) -> None:
    # Arrange
    @app.get("/structured-detail")
    def structured_detail() -> None:
        raise HTTPException(status_code=400, detail={"internal": "shape"})

    # Act
    response = client.get("/structured-detail")

    # Assert
    assert response.status_code == 400
    assert response.json() == {"success": False, "data": None, "error": "Bad Request"}


def test_http_exception_headers_are_preserved(app: FastAPI, client: TestClient) -> None:
    # Arrange
    @app.get("/needs-auth")
    def needs_auth() -> None:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Act
    response = client.get("/needs-auth")

    # Assert
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json()["error"] == "Not authenticated"


def test_invalid_input_returns_422_naming_the_bad_field(
    app: FastAPI, client: TestClient
) -> None:
    # Arrange
    @app.get("/needs-count")
    def needs_count(count: int) -> int:
        return count

    # Act
    response = client.get("/needs-count", params={"count": "not-a-number"})

    # Assert
    body = response.json()
    assert response.status_code == 422
    assert body["success"] is False
    assert body["data"] is None
    assert "count" in body["error"]


def test_unhandled_exception_returns_generic_500_without_details(
    app: FastAPI, client: TestClient
) -> None:
    # Arrange
    @app.get("/explodes")
    def explodes() -> None:
        raise RuntimeError("secret internal detail")

    # Act
    response = client.get("/explodes")

    # Assert
    assert response.status_code == 500
    assert response.json() == {
        "success": False,
        "data": None,
        "error": "Internal server error",
    }

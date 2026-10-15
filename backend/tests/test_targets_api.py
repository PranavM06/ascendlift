from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import TargetHistory, User
from tests.support import AppleTokenMinter, sign_in_as

pytestmark = pytest.mark.integration


@pytest.fixture
def auth_headers(
    api_client: TestClient, apple_tokens: AppleTokenMinter
) -> dict[str, str]:
    return sign_in_as(api_client, apple_tokens, "sub-1")


@pytest.fixture
def other_headers(
    api_client: TestClient, apple_tokens: AppleTokenMinter
) -> dict[str, str]:
    return sign_in_as(api_client, apple_tokens, "sub-2")


def add_targets(
    db: Session, apple_sub: str, effective_date: date, calories: int
) -> None:
    user = db.scalars(select(User).where(User.apple_sub == apple_sub)).one()
    db.add(
        TargetHistory(
            user_id=user.id,
            calories=calories,
            protein_g=150,
            carbs_g=200,
            fat_g=60,
            effective_date=effective_date,
        )
    )
    db.flush()


def targets_on(
    client: TestClient, headers: dict[str, str], on_date: date
) -> dict[str, Any] | None:
    response = client.get(
        "/targets", headers=headers, params={"on_date": on_date.isoformat()}
    )
    assert response.status_code == 200, response.text
    targets: dict[str, Any] | None = response.json()["data"]
    return targets


def test_targets_require_a_token(api_client: TestClient) -> None:
    # Act
    response = api_client.get("/targets", params={"on_date": "2026-10-14"})

    # Assert
    assert response.status_code == 401


def test_targets_require_a_date(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    response = api_client.get("/targets", headers=auth_headers)

    # Assert
    assert response.status_code == 422
    assert "on_date" in response.json()["error"]


def test_a_user_without_targets_gets_null(
    api_client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Act
    targets = targets_on(api_client, auth_headers, date(2026, 10, 14))

    # Assert
    assert targets is None


def test_targets_are_the_latest_set_on_or_before_the_date(
    api_client: TestClient, auth_headers: dict[str, str], db_session: Session
) -> None:
    # Arrange
    add_targets(db_session, "sub-1", date(2026, 10, 1), calories=2500)
    add_targets(db_session, "sub-1", date(2026, 10, 10), calories=2200)

    # Act
    before_any = targets_on(api_client, auth_headers, date(2026, 9, 30))
    first = targets_on(api_client, auth_headers, date(2026, 10, 9))
    on_change = targets_on(api_client, auth_headers, date(2026, 10, 10))
    after = targets_on(api_client, auth_headers, date(2026, 10, 20))

    # Assert
    assert before_any is None
    assert first == {
        "calories": 2500,
        "protein_g": 150,
        "carbs_g": 200,
        "fat_g": 60,
        "effective_date": "2026-10-01",
    }
    assert on_change is not None and on_change["calories"] == 2200
    assert after is not None and after["effective_date"] == "2026-10-10"


def test_targets_are_private_to_their_user(
    api_client: TestClient,
    auth_headers: dict[str, str],
    other_headers: dict[str, str],
    db_session: Session,
) -> None:
    # Arrange
    add_targets(db_session, "sub-1", date(2026, 10, 1), calories=2500)

    # Act
    targets = targets_on(api_client, other_headers, date(2026, 10, 14))

    # Assert
    assert targets is None

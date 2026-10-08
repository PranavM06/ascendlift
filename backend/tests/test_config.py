import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_read_database_url_from_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setenv("ASCENDLIFT_DATABASE_URL", "postgresql+psycopg://u:p@db/name")

    # Act
    settings = Settings(_env_file=None)

    # Assert
    assert settings.database_url == "postgresql+psycopg://u:p@db/name"


def test_settings_fail_fast_when_database_url_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.delenv("ASCENDLIFT_DATABASE_URL", raising=False)

    # Act / Assert
    with pytest.raises(ValidationError, match="database_url"):
        Settings(_env_file=None)


@pytest.mark.parametrize(
    "bad_url",
    [
        "postgres//missing-colon",
        "sqlite:///local.db",
        "postgresql://u:p@db/name",
    ],
)
def test_settings_reject_database_url_that_is_not_postgres_psycopg(
    monkeypatch: pytest.MonkeyPatch, bad_url: str
) -> None:
    # Arrange
    monkeypatch.setenv("ASCENDLIFT_DATABASE_URL", bad_url)

    # Act / Assert
    with pytest.raises(ValidationError, match="database_url"):
        Settings(_env_file=None)


def test_settings_error_does_not_reveal_the_database_password(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setenv("ASCENDLIFT_DATABASE_URL", "mysql://user:hunter2@db/name")

    # Act
    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None)

    # Assert
    assert "hunter2" not in str(error.value)


def test_settings_reject_unknown_environment_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setenv("ASCENDLIFT_ENVIRONMENT", "staging-typo")

    # Act / Assert
    with pytest.raises(ValidationError, match="environment"):
        Settings(_env_file=None)


def test_settings_are_immutable() -> None:
    # Arrange
    settings = Settings(_env_file=None)

    # Act / Assert
    with pytest.raises(ValidationError):
        settings.database_url = "postgresql+psycopg://other"  # type: ignore[misc]

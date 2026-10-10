from collections.abc import Iterator
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

CONNECT_TIMEOUT_SECONDS = 5


@lru_cache
def get_engine() -> Engine:
    return create_engine(
        get_settings().database_url,
        pool_pre_ping=True,
        # Keeps token hashes and personal data out of logged SQL errors.
        hide_parameters=True,
        connect_args={"connect_timeout": CONNECT_TIMEOUT_SECONDS},
    )


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with get_session_factory()() as session:
        yield session


DbSession = Annotated[Session, Depends(get_db)]

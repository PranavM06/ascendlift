import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.responses import ApiResponse, ok
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


class HealthStatus(BaseModel):
    status: Literal["ok"]
    database: Literal["ok"]


@router.get("/health")
def read_health(db: Annotated[Session, Depends(get_db)]) -> ApiResponse[HealthStatus]:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        logger.exception("Health check could not reach the database")
        raise AppError(status_code=503, message="Database unavailable") from exc
    return ok(HealthStatus(status="ok", database="ok"))

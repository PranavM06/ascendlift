import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Request

from app.auth.deps import CurrentUser
from app.core.rate_limit import WRITE_RATE_LIMIT, limiter
from app.core.responses import ApiResponse, ok
from app.db.session import DbSession
from app.food_log import service
from app.food_log.schemas import (
    DayLogResponse,
    FoodLogCreate,
    FoodLogEntryResponse,
    FoodLogUpdate,
)

CREATED = 201

router = APIRouter(prefix="/food-log", tags=["food log"])

# The rate limiter reads the client address from `request`, so each limited
# endpoint must accept it even though the endpoint itself does not use it.


@router.get("")
def read_day(
    entry_date: date, user: CurrentUser, db: DbSession
) -> ApiResponse[DayLogResponse]:
    return ok(DayLogResponse.from_day_log(service.get_day(db, user.id, entry_date)))


@router.post("", status_code=CREATED)
@limiter.limit(WRITE_RATE_LIMIT)
def log_food(
    request: Request, body: FoodLogCreate, user: CurrentUser, db: DbSession
) -> ApiResponse[FoodLogEntryResponse]:
    new_entry = service.NewEntry(
        food_id=body.food_id,
        servings=body.servings,
        meal=body.meal,
        entry_date=body.entry_date,
    )
    logged = service.add_entry(db, user.id, new_entry, datetime.now(UTC))
    return ok(FoodLogEntryResponse.from_logged_food(logged))


@router.patch("/{entry_id}")
@limiter.limit(WRITE_RATE_LIMIT)
def edit_entry(
    request: Request,
    entry_id: uuid.UUID,
    body: FoodLogUpdate,
    user: CurrentUser,
    db: DbSession,
) -> ApiResponse[FoodLogEntryResponse]:
    changes = body.model_dump(exclude_unset=True)
    logged = service.update_entry(db, user.id, entry_id, changes)
    return ok(FoodLogEntryResponse.from_logged_food(logged))


@router.delete("/{entry_id}")
@limiter.limit(WRITE_RATE_LIMIT)
def delete_entry(
    request: Request, entry_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> ApiResponse[None]:
    service.delete_entry(db, user.id, entry_id)
    return ok(None)

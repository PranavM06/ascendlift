import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query, Request

from app.auth.deps import CurrentUser
from app.core.rate_limit import WRITE_RATE_LIMIT, limiter
from app.core.responses import ApiResponse, Page, ok
from app.db.session import DbSession
from app.workouts import service
from app.workouts.schemas import (
    HistoryQuery,
    LastSetsResponse,
    RecordsResponse,
    SetCreate,
    SetResponse,
    SetUpdate,
    WorkoutResponse,
    WorkoutSummaryResponse,
)

CREATED = 201

router = APIRouter(prefix="/workouts", tags=["workouts"])

# The rate limiter reads the client address from `request`, so each limited
# endpoint must accept it even though the endpoint itself does not use it.


@router.post("", status_code=CREATED)
@limiter.limit(WRITE_RATE_LIMIT)
def start_workout(
    request: Request, user: CurrentUser, db: DbSession
) -> ApiResponse[WorkoutResponse]:
    detail = service.start_workout(db, user.id, datetime.now(UTC))
    return ok(WorkoutResponse.from_detail(detail))


@router.get("")
def list_history(
    query: Annotated[HistoryQuery, Query()], user: CurrentUser, db: DbSession
) -> ApiResponse[Page[WorkoutSummaryResponse]]:
    page = service.list_history(db, user.id, query.limit, query.offset)
    return ok(
        Page[WorkoutSummaryResponse](
            items=[WorkoutSummaryResponse.from_summary(item) for item in page.items],
            total=page.total,
            limit=query.limit,
            offset=query.offset,
        )
    )


# The fixed paths are declared before "/{workout_id}" so they are not read as ids.


@router.get("/records")
def read_records(
    exercise_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> ApiResponse[RecordsResponse]:
    return ok(
        RecordsResponse.model_validate(service.get_records(db, user.id, exercise_id))
    )


@router.get("/active")
def read_active_workout(
    user: CurrentUser, db: DbSession
) -> ApiResponse[WorkoutResponse | None]:
    detail = service.get_active_workout(db, user.id)
    return ok(WorkoutResponse.from_detail(detail) if detail is not None else None)


@router.get("/last-sets")
def read_last_sets(
    exercise_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> ApiResponse[LastSetsResponse | None]:
    last = service.get_last_sets(db, user.id, exercise_id)
    return ok(LastSetsResponse.from_last_sets(last) if last is not None else None)


@router.get("/{workout_id}")
def read_workout(
    workout_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> ApiResponse[WorkoutResponse]:
    return ok(WorkoutResponse.from_detail(service.get_workout(db, user.id, workout_id)))


@router.post("/{workout_id}/finish")
@limiter.limit(WRITE_RATE_LIMIT)
def finish_workout(
    request: Request, workout_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> ApiResponse[WorkoutResponse]:
    detail = service.finish_workout(db, user.id, workout_id, datetime.now(UTC))
    return ok(WorkoutResponse.from_detail(detail))


@router.delete("/{workout_id}")
@limiter.limit(WRITE_RATE_LIMIT)
def delete_workout(
    request: Request, workout_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> ApiResponse[None]:
    service.delete_workout(db, user.id, workout_id)
    return ok(None)


@router.post("/{workout_id}/sets", status_code=CREATED)
@limiter.limit(WRITE_RATE_LIMIT)
def log_set(
    request: Request,
    workout_id: uuid.UUID,
    body: SetCreate,
    user: CurrentUser,
    db: DbSession,
) -> ApiResponse[SetResponse]:
    new_set = service.NewSet(
        exercise_id=body.exercise_id,
        reps=body.reps,
        weight_kg=body.weight_kg,
        rpe=body.rpe,
    )
    logged = service.add_set(db, user.id, workout_id, new_set)
    return ok(SetResponse.from_logged_set(logged))


@router.patch("/{workout_id}/sets/{set_id}")
@limiter.limit(WRITE_RATE_LIMIT)
def edit_set(
    request: Request,
    workout_id: uuid.UUID,
    set_id: uuid.UUID,
    body: SetUpdate,
    user: CurrentUser,
    db: DbSession,
) -> ApiResponse[SetResponse]:
    changes = body.model_dump(exclude_unset=True)
    logged = service.update_set(db, user.id, workout_id, set_id, changes)
    return ok(SetResponse.from_logged_set(logged))


@router.delete("/{workout_id}/sets/{set_id}")
@limiter.limit(WRITE_RATE_LIMIT)
def delete_set(
    request: Request,
    workout_id: uuid.UUID,
    set_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> ApiResponse[None]:
    service.delete_set(db, user.id, workout_id, set_id)
    return ok(None)

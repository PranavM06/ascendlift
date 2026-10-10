from typing import Annotated

from fastapi import APIRouter, Query, Request

from app.auth.deps import CurrentUser
from app.core.rate_limit import WRITE_RATE_LIMIT, limiter
from app.core.responses import ApiResponse, Page, ok
from app.db.session import DbSession
from app.exercises.schemas import ExerciseCreate, ExerciseQuery, ExerciseResponse
from app.exercises.service import (
    ExerciseFilters,
    create_custom_exercise,
    list_exercises,
)

CREATED = 201

router = APIRouter(prefix="/exercises", tags=["exercises"])


@router.get("")
def list_visible_exercises(
    query: Annotated[ExerciseQuery, Query()], user: CurrentUser, db: DbSession
) -> ApiResponse[Page[ExerciseResponse]]:
    filters = ExerciseFilters(
        search=query.search,
        muscle_group=query.muscle_group,
        equipment=query.equipment,
    )
    page = list_exercises(db, user.id, filters, query.limit, query.offset)
    return ok(
        Page[ExerciseResponse](
            items=[ExerciseResponse.from_exercise(item) for item in page.items],
            total=page.total,
            limit=query.limit,
            offset=query.offset,
        )
    )


# The rate limiter reads the client address from `request`, so the endpoint
# must accept it even though it does not use it.
@router.post("", status_code=CREATED)
@limiter.limit(WRITE_RATE_LIMIT)
def create_exercise(
    request: Request, body: ExerciseCreate, user: CurrentUser, db: DbSession
) -> ApiResponse[ExerciseResponse]:
    exercise = create_custom_exercise(
        db, user.id, body.name, body.muscle_groups, body.equipment
    )
    return ok(ExerciseResponse.from_exercise(exercise))

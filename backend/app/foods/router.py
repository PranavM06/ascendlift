from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query, Request

from app.auth.deps import CurrentUser
from app.core.rate_limit import FOOD_SEARCH_RATE_LIMIT, limiter
from app.core.responses import ApiResponse, ok
from app.db.session import DbSession
from app.foods import service
from app.foods.schemas import FoodQuery, FoodResponse
from app.foods.usda import FoodSourceDep

router = APIRouter(prefix="/foods", tags=["foods"])


# The rate limiter reads the client address from `request`, so the endpoint
# must accept it even though it does not use it.
@router.get("")
@limiter.limit(FOOD_SEARCH_RATE_LIMIT)
def search_foods(
    request: Request,
    query: Annotated[FoodQuery, Query()],
    user: CurrentUser,
    db: DbSession,
    source: FoodSourceDep,
) -> ApiResponse[list[FoodResponse]]:
    foods = service.search_foods(db, source, query.search, datetime.now(UTC))
    return ok([FoodResponse.model_validate(food) for food in foods])


@router.get("/recent")
def list_recent_foods(
    user: CurrentUser, db: DbSession
) -> ApiResponse[list[FoodResponse]]:
    foods = service.recent_foods(db, user.id)
    return ok([FoodResponse.model_validate(food) for food in foods])

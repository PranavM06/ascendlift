from fastapi import APIRouter

from app.auth.deps import CurrentUser
from app.core.responses import ApiResponse, ok
from app.db.session import DbSession
from app.users.schemas import UserResponse, UserUpdate
from app.users.service import update_profile

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
def read_me(user: CurrentUser) -> ApiResponse[UserResponse]:
    return ok(UserResponse.model_validate(user))


@router.patch("/me")
def update_me(
    body: UserUpdate, user: CurrentUser, db: DbSession
) -> ApiResponse[UserResponse]:
    updated = update_profile(db, user, body.model_dump(exclude_none=True))
    return ok(UserResponse.model_validate(updated))

from datetime import UTC, datetime

from fastapi import APIRouter, Request

from app.auth.deps import CurrentUser
from app.core.rate_limit import WRITE_RATE_LIMIT, limiter
from app.core.responses import ApiResponse, ok
from app.db.session import DbSession
from app.onboarding import service
from app.onboarding.schemas import OnboardingIn
from app.targets.service import Targets
from app.users.schemas import UserResponse

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


# The rate limiter reads the client address from `request`, so the endpoint
# must accept it even though it does not use it.
@router.post("")
@limiter.limit(WRITE_RATE_LIMIT)
def complete_onboarding(
    request: Request, body: OnboardingIn, user: CurrentUser, db: DbSession
) -> ApiResponse[UserResponse]:
    answers = service.Onboarding(
        unit_preference=body.unit_preference,
        timezone=body.timezone,
        training_style=body.training_style,
        phase=body.phase,
        targets=Targets(**body.targets.model_dump()),
        bodyweight_kg=body.bodyweight_kg,
    )
    updated = service.complete_onboarding(db, user.id, answers, datetime.now(UTC))
    return ok(UserResponse.model_validate(updated))

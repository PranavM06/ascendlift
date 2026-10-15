from datetime import date

from fastapi import APIRouter

from app.auth.deps import CurrentUser
from app.core.responses import ApiResponse, ok
from app.db.session import DbSession
from app.targets import service
from app.targets.schemas import TargetsResponse

router = APIRouter(prefix="/targets", tags=["targets"])


@router.get("")
def read_targets(
    on_date: date, user: CurrentUser, db: DbSession
) -> ApiResponse[TargetsResponse | None]:
    targets = service.targets_on(db, user.id, on_date)
    return ok(TargetsResponse.model_validate(targets) if targets else None)

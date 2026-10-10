import uuid

from fastapi import APIRouter, Request

from app.auth.deps import CurrentUser
from app.core.rate_limit import WRITE_RATE_LIMIT, limiter
from app.core.responses import ApiResponse, ok
from app.db.session import DbSession
from app.templates import service
from app.templates.schemas import TemplateResponse, TemplateWrite

CREATED = 201

router = APIRouter(prefix="/templates", tags=["templates"])


def _to_content(body: TemplateWrite) -> service.TemplateContent:
    return service.TemplateContent(
        name=body.name,
        notes=body.notes,
        exercises=[
            service.PlannedExercise(
                exercise_id=planned.exercise_id,
                target_sets=planned.target_sets,
                rep_min=planned.rep_min,
                rep_max=planned.rep_max,
                target_weight_kg=planned.target_weight_kg,
                target_rpe=planned.target_rpe,
            )
            for planned in body.exercises
        ],
    )


@router.get("")
def list_templates(
    user: CurrentUser, db: DbSession
) -> ApiResponse[list[TemplateResponse]]:
    templates = service.list_templates(db, user.id)
    return ok([TemplateResponse.from_detail(detail) for detail in templates])


# The rate limiter reads the client address from `request`, so each limited
# endpoint must accept it even though the endpoint itself does not use it.


@router.post("", status_code=CREATED)
@limiter.limit(WRITE_RATE_LIMIT)
def create_template(
    request: Request, body: TemplateWrite, user: CurrentUser, db: DbSession
) -> ApiResponse[TemplateResponse]:
    detail = service.create_template(db, user.id, _to_content(body))
    return ok(TemplateResponse.from_detail(detail))


@router.get("/{template_id}")
def read_template(
    template_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> ApiResponse[TemplateResponse]:
    detail = service.get_template(db, user.id, template_id)
    return ok(TemplateResponse.from_detail(detail))


@router.put("/{template_id}")
@limiter.limit(WRITE_RATE_LIMIT)
def replace_template(
    request: Request,
    template_id: uuid.UUID,
    body: TemplateWrite,
    user: CurrentUser,
    db: DbSession,
) -> ApiResponse[TemplateResponse]:
    detail = service.replace_template(db, user.id, template_id, _to_content(body))
    return ok(TemplateResponse.from_detail(detail))


@router.delete("/{template_id}")
@limiter.limit(WRITE_RATE_LIMIT)
def delete_template(
    request: Request, template_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> ApiResponse[None]:
    service.delete_template(db, user.id, template_id)
    return ok(None)

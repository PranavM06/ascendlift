import logging
from collections.abc import Mapping
from http import HTTPStatus

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.utils import is_body_allowed_for_status_code
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.responses import fail

logger = logging.getLogger(__name__)

INTERNAL_ERROR_MESSAGE = "Internal server error"


class AppError(Exception):
    """An expected failure whose message is safe to show to the client."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _error_response(
    status_code: int, message: str, headers: Mapping[str, str] | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=fail(message).model_dump(),
        headers=dict(headers) if headers else None,
    )


def _describe_validation_errors(exc: RequestValidationError) -> str:
    return "; ".join(
        f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
        for error in exc.errors()
    )


def _client_message(exc: StarletteHTTPException) -> str:
    # A non-string detail is an internal structure, so fall back to "Bad Request" etc.
    if isinstance(exc.detail, str):
        return exc.detail
    return HTTPStatus(exc.status_code).phrase


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return _error_response(exc.status_code, exc.message)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(
        request: Request, exc: StarletteHTTPException
    ) -> Response:
        if not is_body_allowed_for_status_code(exc.status_code):
            return Response(status_code=exc.status_code, headers=exc.headers)
        return _error_response(exc.status_code, _client_message(exc), exc.headers)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return _error_response(422, _describe_validation_errors(exc))

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error(
            "Unhandled error on %s %s",
            request.method,
            request.url.path,
            exc_info=exc,
        )
        return _error_response(500, INTERNAL_ERROR_MESSAGE)

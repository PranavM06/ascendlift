from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.errors import error_response

AUTH_RATE_LIMIT = "10/minute"
TOO_MANY_REQUESTS = 429
RATE_LIMITED_MESSAGE = "Too many requests. Try again shortly."

# Counts are kept in memory, per client address. That is enough for a single
# server process; more than one process needs a shared store such as Redis.
limiter = Limiter(key_func=get_remote_address)


def register_rate_limiting(app: FastAPI) -> None:
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def handle_rate_limit_exceeded(
        request: Request, exc: RateLimitExceeded
    ) -> JSONResponse:
        return error_response(TOO_MANY_REQUESTS, RATE_LIMITED_MESSAGE)

from fastapi import FastAPI

from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.health.router import router as health_router


def create_app() -> FastAPI:
    # Loading settings here makes a missing required variable stop startup.
    get_settings()

    app = FastAPI(title="AscendLift API")
    register_error_handlers(app)
    app.include_router(health_router)
    return app


app = create_app()

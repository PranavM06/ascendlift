from fastapi import FastAPI

from app.auth.router import router as auth_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.rate_limit import register_rate_limiting
from app.exercises.router import router as exercises_router
from app.food_log.router import router as food_log_router
from app.foods.router import router as foods_router
from app.health.router import router as health_router
from app.onboarding.router import router as onboarding_router
from app.targets.router import router as targets_router
from app.templates.router import router as templates_router
from app.users.router import router as users_router
from app.workouts.router import router as workouts_router


def create_app() -> FastAPI:
    # Loading settings here makes a missing required variable stop startup.
    get_settings()

    app = FastAPI(title="AscendLift API")
    register_error_handlers(app)
    register_rate_limiting(app)
    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(onboarding_router)
    app.include_router(targets_router)
    app.include_router(exercises_router)
    app.include_router(workouts_router)
    app.include_router(templates_router)
    app.include_router(foods_router)
    app.include_router(food_log_router)
    return app


app = create_app()

"""Importing this package registers every table on Base.metadata."""

from app.models.diet import Food, FoodLogEntry
from app.models.enums import (
    Equipment,
    InsightStatus,
    Meal,
    MuscleGroup,
    Phase,
    TrainingStyle,
    UnitPreference,
)
from app.models.insight import DailyInsight
from app.models.training import (
    Exercise,
    RoutineTemplate,
    TemplateExercise,
    WorkoutSession,
    WorkoutSet,
)
from app.models.user import BodyweightEntry, Goal, RefreshToken, TargetHistory, User

__all__ = [
    "BodyweightEntry",
    "DailyInsight",
    "Equipment",
    "Exercise",
    "Food",
    "FoodLogEntry",
    "Goal",
    "InsightStatus",
    "Meal",
    "MuscleGroup",
    "Phase",
    "RefreshToken",
    "RoutineTemplate",
    "TargetHistory",
    "TemplateExercise",
    "TrainingStyle",
    "UnitPreference",
    "User",
    "WorkoutSession",
    "WorkoutSet",
]

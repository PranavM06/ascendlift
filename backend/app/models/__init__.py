"""Importing this package registers every table on Base.metadata."""

from app.models.diet import Food, FoodLogEntry
from app.models.enums import InsightStatus, Meal, Phase, TrainingStyle, UnitPreference
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
    "Exercise",
    "Food",
    "FoodLogEntry",
    "Goal",
    "InsightStatus",
    "Meal",
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

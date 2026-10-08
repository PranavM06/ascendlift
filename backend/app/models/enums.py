from enum import StrEnum


class UnitPreference(StrEnum):
    LBS = "lbs"
    KG = "kg"


class TrainingStyle(StrEnum):
    POWERLIFTING = "powerlifting"
    BODYBUILDING = "bodybuilding"
    GENERAL_STRENGTH = "general_strength"


class Phase(StrEnum):
    CUT = "cut"
    BULK = "bulk"
    MAINTAIN = "maintain"


class Meal(StrEnum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"


class InsightStatus(StrEnum):
    PENDING = "pending"
    READY = "ready"
    FAILED = "failed"

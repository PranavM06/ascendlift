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


class MuscleGroup(StrEnum):
    ABDOMINALS = "abdominals"
    ABDUCTORS = "abductors"
    ADDUCTORS = "adductors"
    BICEPS = "biceps"
    CALVES = "calves"
    CHEST = "chest"
    FOREARMS = "forearms"
    GLUTES = "glutes"
    HAMSTRINGS = "hamstrings"
    LATS = "lats"
    LOWER_BACK = "lower_back"
    MIDDLE_BACK = "middle_back"
    NECK = "neck"
    QUADRICEPS = "quadriceps"
    SHOULDERS = "shoulders"
    TRAPS = "traps"
    TRICEPS = "triceps"


class Equipment(StrEnum):
    BANDS = "bands"
    BARBELL = "barbell"
    BODY_ONLY = "body_only"
    CABLE = "cable"
    DUMBBELL = "dumbbell"
    EXERCISE_BALL = "exercise_ball"
    EZ_CURL_BAR = "ez_curl_bar"
    KETTLEBELLS = "kettlebells"
    MACHINE = "machine"
    MEDICINE_BALL = "medicine_ball"
    OTHER = "other"


class Meal(StrEnum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"


class InsightStatus(StrEnum):
    PENDING = "pending"
    READY = "ready"
    FAILED = "failed"

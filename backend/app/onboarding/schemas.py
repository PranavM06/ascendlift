from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.models import Phase, TrainingStyle, UnitPreference
from app.targets.schemas import TargetsIn
from app.users.schemas import IanaTimezone

# Wide enough for any adult, narrow enough to catch a weight typed in the wrong unit.
MIN_BODYWEIGHT_KG = 20
MAX_BODYWEIGHT_KG = 400
# Matches the four decimal places the weight columns keep.
WEIGHT_DECIMAL_PLACES = 4

BodyweightKg = Annotated[
    Decimal,
    Field(
        ge=MIN_BODYWEIGHT_KG,
        le=MAX_BODYWEIGHT_KG,
        decimal_places=WEIGHT_DECIMAL_PLACES,
    ),
]


class OnboardingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    unit_preference: UnitPreference
    timezone: IanaTimezone
    training_style: TrainingStyle
    phase: Phase
    targets: TargetsIn
    bodyweight_kg: BodyweightKg

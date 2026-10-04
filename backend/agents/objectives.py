"""A deliberately narrow deterministic parser for the documented demo intent."""

from dataclasses import dataclass
import re
from uuid import uuid4

from backend.domain.models import CivicObjective, ObjectiveConstraint, ObjectivePopulation
from backend.orchestration.errors import WorkflowError

EXAMPLE = "Make primary healthcare reachable within 45 minutes for elderly people without cars in rural Tipperary."
PARSER_MODE = "deterministic_template"
PATTERN = re.compile(
    r"Make primary healthcare reachable"
    r"(?: within (?P<minutes>\d+(?:\.\d+)?) minutes)?"
    r" for elderly people without cars in (?P<geography>[A-Za-z ]+)\.?",
    re.IGNORECASE,
)
GEOGRAPHIES = {"tipperary": "Tipperary", "rural tipperary": "rural Tipperary"}


@dataclass(frozen=True)
class CompiledObjective:
    objective: CivicObjective
    assumptions: tuple[str, ...]


def compile_objective(text: str) -> CompiledObjective:
    original = text.strip()
    if not 12 <= len(original) <= 500:
        raise WorkflowError(422, "invalid_objective", "Objective text must contain 12–500 characters.")
    match = PATTERN.fullmatch(" ".join(original.split()))
    if not match:
        raise WorkflowError(
            422, "unsupported_objective", "This parser supports only the documented primary-healthcare template.",
            details={"parser_mode": PARSER_MODE, "example": EXAMPLE},
        )
    geography = GEOGRAPHIES.get(match["geography"].strip().lower())
    if geography is None:
        raise WorkflowError(
            422, "unsupported_objective", "This parser does not support the requested geography.",
            details={"supported_geographies": list(GEOGRAPHIES.values())},
        )
    assumptions = ["Interpreted elderly people as residents aged 65 and older."]
    minutes = float(match["minutes"]) if match["minutes"] else 45.0
    if not 0 < minutes <= 1440:
        raise WorkflowError(422, "invalid_objective", "Maximum journey time must be greater than zero and at most 1440 minutes.")
    if match["minutes"] is None:
        assumptions.append("Maximum journey time omitted; defaulted to 45 minutes.")
    return CompiledObjective(
        objective=CivicObjective(
            id=f"objective-{uuid4()}", text=original, domain="healthcare", target_service="primary_care",
            geography=geography, region_id="tipperary",
            population=ObjectivePopulation(min_age=65, car_access=False),
            constraint=ObjectiveConstraint(maximum_journey_minutes=minutes),
            objective="maximize_accessibility",
        ),
        assumptions=tuple(assumptions),
    )

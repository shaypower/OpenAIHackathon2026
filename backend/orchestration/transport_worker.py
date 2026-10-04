"""Internal subprocess entrypoint for B's small synthetic transport fixture.

Only the server supplies this JSON input. Routing and ranking stay in B's facade.
"""

from datetime import datetime
import json
from types import SimpleNamespace
import sys

from backend.domain.models import CivicObjective, Intervention, SimulationMetrics
from backend.routing.gtfs import TransportError
from backend.simulation.synthetic import fixture
from backend.simulation.service import run_baseline, simulate_candidate, generate_candidates, rank_candidates


def result_data(result):
    return {
        "metrics": result.metrics.model_dump(mode="json"),
        **{name: [item.model_dump(mode="json") for item in getattr(result, name)]
           for name in ("accessibility", "journeys", "evidence", "provenance")},
        "limitations": [*result.assumptions, *result.limitations,
            "All population, services, timetables and walking links in this fixture are synthetic."],
    }


def execute(request):
    if request["action"] == "rank":
        values = [SimpleNamespace(
            intervention=SimpleNamespace(id=item["intervention_id"]),
            result=SimpleNamespace(metrics=SimulationMetrics.model_validate(item["metrics"])),
            simulation_run_id=item["id"],
        ) for item in request["evaluations"]]
        return {"items": [{"intervention_id": item.intervention_id,
            "evaluation_id": item.simulation_run_id, "rank": item.rank,
            "score_components": dict(item.score_components)}
            for item in rank_candidates(values, "gain-changes-v1")]}

    snapshot, _, demand = fixture()
    objective = CivicObjective.model_validate(request["objective"])
    departure = datetime.fromisoformat(request["departure_at"])
    demand = demand.model_copy(update={"id": request["demand_config_id"]})
    baseline = run_baseline(snapshot, objective, departure, demand)
    if request["action"] == "baseline":
        return result_data(baseline)
    if request["action"] == "generate":
        failures = [item for item in baseline.accessibility if item.community_id in request["community_ids"]]
        # Ask B for its bounded catalogue, then skip already evaluated IDs so a
        # refinement never repeats work. B's ordering and shifts remain intact.
        proposals = generate_candidates(snapshot, objective, failures,
            allowed_kinds=request["allowed_kinds"], max_candidates=20,
            diagnostics=baseline.diagnostics)
        seen = set(request["previous_intervention_ids"])
        items = [item for item in proposals if item.id not in seen][:request["max_candidates"]]
        return {"baseline": result_data(baseline), "output": {
            "items": [item.model_dump(mode="json") for item in items]}}
    if request["action"] == "simulate":
        candidate = Intervention.model_validate(request["candidate"])
        result = simulate_candidate(snapshot, objective, departure, demand, baseline, candidate)
        return {"baseline": result_data(baseline), "output": result_data(result)}
    raise ValueError("Unknown internal transport action")


def main():
    try:
        request = json.loads(sys.stdin.read(2_000_001))
        output = {"data": execute(request)}
    except TransportError as exc:
        output = {"error": {"code": exc.code}}
    except Exception:
        output = {"error": {"code": "tool_failed"}}
    sys.stdout.write(json.dumps(output, allow_nan=False))


if __name__ == "__main__":
    main()

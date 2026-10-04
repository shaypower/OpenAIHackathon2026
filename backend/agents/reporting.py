"""Summarize recorded tool facts without asking a model to invent explanations."""

from backend.domain.models import SimulationRun


def summarize_run(run: SimulationRun) -> dict | None:
    if run.status != "succeeded" or run.before is None:
        return None
    metrics = run.after if run.after is not None else run.before
    access = "unknown access percentage" if metrics.access_percent is None else f"{metrics.access_percent:g}% access"
    findings = [
        {"community_id": item.community_id, "code": failure.code,
         "description": failure.description, "evidence_ids": list(failure.evidence_ids)}
        for item in run.accessibility for failure in item.failures
    ]
    return {
        "run_id": run.id, "generated_by": "deterministic_tool_summary", "data_mode": run.data_mode,
        "text": (f"The {run.data_mode} {run.kind} tool result reports {metrics.reachable_residents} of "
                 f"{metrics.cohort_residents} cohort residents reachable ({access}). "
                 "Reported failure reasons below are tool observations. This summary does not establish public verification."),
        "findings": findings,
        "evidence_ids": sorted({reference for finding in findings for reference in finding["evidence_ids"]}),
    }

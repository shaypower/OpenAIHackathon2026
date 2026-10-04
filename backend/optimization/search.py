"""Bounded, stable search over supported timetable-shift proposals."""
from __future__ import annotations

from typing import Iterable

from backend.domain.models import AccessibilityResult, CivicObjective, Intervention, TimetableChange
from backend.routing.gtfs import TransportError

CANDIDATE_CAP = 20
SHIFT_WINDOW_MINUTES = 30
SHIFT_STEP_MINUTES = 5


def _intervention(snapshot, objective: CivicObjective, trip_id: str, shift: int, community_ids: list[str]) -> Intervention:
    return Intervention(
        id=f"timetable:{trip_id}:{shift:+d}m", objective_id=objective.id,
        community_ids=community_ids, name=f"Shift trip {trip_id} by {shift:+d} minutes",
        description="Shift every stop time on one active trip by the stated number of minutes; recompute all affected journeys.",
        changes=[TimetableChange(kind="timetable_change", trip_id=trip_id, shift_minutes=shift)],
        features=[], evidence_ids=[e.id for e in snapshot.evidence], data_mode=snapshot.data_mode,
    )


def generate_candidates(snapshot, objective: CivicObjective, failures: Iterable[AccessibilityResult],
                        allowed_kinds: Iterable[str] = ("timetable_change",), max_candidates: int = CANDIDATE_CAP,
                        diagnostics: Iterable[object] = ()) -> list[Intervention]:
    if not 1 <= max_candidates <= CANDIDATE_CAP:
        raise TransportError("candidate_limit", f"max_candidates must be from 1 to {CANDIDATE_CAP}.")
    kinds = set(allowed_kinds)
    unsupported = kinds - {"timetable_change"}
    if unsupported:
        raise TransportError("unsupported_change", f"Unsupported intervention kind(s): {sorted(unsupported)}.")
    if "timetable_change" not in kinds:
        return []
    if not snapshot.trip_changes_supported:
        raise TransportError("unsupported_operational_assumptions", "Trip changes are disabled until vehicle/block and capacity assumptions are supported by the snapshot.")
    failed_ids = {a.community_id for a in failures}
    missed = [d for d in diagnostics if d.community_id in failed_ids]
    trip_ids = sorted({d.trip_id for d in missed})
    values = []
    for trip_id in trip_ids:
        affected = sorted({d.community_id for d in missed if d.trip_id == trip_id})
        for shift in range(-SHIFT_WINDOW_MINUTES, SHIFT_WINDOW_MINUTES + 1, SHIFT_STEP_MINUTES):
            if shift:
                values.append(_intervention(snapshot, objective, trip_id, shift, affected))
    values.sort(key=lambda item: (abs(item.changes[0].shift_minutes), item.changes[0].shift_minutes, item.id))
    return values[:max_candidates]

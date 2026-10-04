"""Run the bundled accessibility scenario and export map-ready GeoJSON."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from backend.main import simulate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode",
        choices=["baseline", "intervention", "flood_baseline", "flood_intervention"],
        default="intervention",
    )
    parser.add_argument("--target", type=int, default=45, help="Access target in minutes (5–240).")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("backend/data/demo_simulation_result.geojson"),
        help="GeoJSON output path, relative to the current directory unless absolute.",
    )
    args = parser.parse_args()

    result = simulate(args.mode, args.target)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

    metadata = result["metadata"]
    summary = metadata["selected_summary"]
    delta = metadata["change_vs_comparison"]
    print(f"Scenario: {metadata['scenario_title']}")
    print(f"Mode: {args.mode} | access target: {args.target} minutes")
    print(
        f"Within target: {summary['reached_within_target']}/{summary['population_65_plus_without_car']} "
        f"({summary['coverage_pct']}%)"
    )
    print(f"Change vs {metadata['comparison_mode']}: {delta['additional_people_reached']} people")
    print("Areas outside target:")
    if metadata["areas_outside_target"]:
        for area in metadata["areas_outside_target"]:
            minutes = "no path" if area["travel_minutes"] is None else f"{area['travel_minutes']} min"
            print(f"  - {area['area']}: {minutes} ({area['people_65_plus_without_car']} illustrative people)")
    else:
        print("  - none in this illustrative scenario")
    print(f"GeoJSON written to: {args.output}")
    print("Caution: all demand, facility, timetable and closure inputs are synthetic demo assumptions.")


if __name__ == "__main__":
    main()

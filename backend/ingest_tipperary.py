"""Download and standardize public census/access layers for County Tipperary.

Raw downloads are retained under backend/data/raw (git-ignored). Processed,
reproducible GeoJSON/CSV outputs are written under backend/data/processed.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import re
import statistics
import time
import zipfile
from pathlib import Path
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from io import TextIOWrapper

from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "backend" / "data" / "raw"
PROCESSED_DIR = ROOT / "backend" / "data" / "processed"
BOUNDARY_LAYER = (
    "https://services-eu1.arcgis.com/BuS9rtTsYEV5C0xh/arcgis/rest/services/"
    "Small_Area_National_Statistical_Boundaries_2022_Ungeneralised_view/FeatureServer/0/query"
)
BOUNDARY_QUERY = BOUNDARY_LAYER + "?" + urlencode({
    "where": "COUNTY_ENGLISH IN ('NORTH TIPPERARY','SOUTH TIPPERARY')",
    "outFields": "*",
    "returnGeometry": "true",
    "outSR": "4326",
    "resultRecordCount": "2000",
    "f": "geojson",
})
MDSI01_URL = "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/MDSI01/JSON-stat/2.0/en"

SOURCES = {
    "cso_saps_2022_small_area.csv": {
        "url": "https://www.cso.ie/en/media/csoie/census/census2022/SAPS_2022_Small_Area_UR_171024.csv",
        "source_id": "cso-saps-2022",
        "vintage": "Census 2022; Small Area Population Statistics",
    },
    "cso_mdsi01_2026.json": {
        "url": MDSI01_URL,
        "source_id": "cso-mdsi01-2026",
        "vintage": "Measuring Distance to Services in Ireland 2026, table MDSI01",
    },
    "pobal_hp_deprivation_2022.csv": {
        "url": "https://www.pobal.ie/wp-content/uploads/2024/01/hp-deprivation-index-scores-2022.csv",
        "source_id": "pobal-hp-2022",
        "vintage": "Pobal HP Deprivation Index 2022; Electoral Division geography",
    },
    "naptan_stop_points.csv": {
        "url": "https://www.transportforireland.ie/transitData/Data/NaPTAN_Stop_Points.csv",
        "source_id": "naptan",
        "vintage": "NTA NaPTAN stop-points snapshot",
    },
    "nta_gtfs_all.zip": {
        "url": "https://www.transportforireland.ie/transitData/Data/GTFS_All.zip",
        "source_id": "nta-gtfs",
        "vintage": "NTA / TFI all-operator static GTFS snapshot",
    },
    "tipperary_cso_small_areas_2022.geojson": {
        "url": BOUNDARY_QUERY,
        "source_id": "tailte-cso-small-area-boundaries-2022",
        "vintage": "Tailte Éireann CSO Small Areas 2022, combined North and South Tipperary coverage",
    },
}

AGE_65_PLUS_FIELDS = [
    "T1_1AGE65_69T",
    "T1_1AGE70_74T",
    "T1_1AGE75_79T",
    "T1_1AGE80_84T",
    "T1_1AGEGE_85T",
]

MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024
DOWNLOAD_TIMEOUT_SECONDS = 60
TRANSIENT_RETRIES = 2
SNAPSHOT_DIR = PROCESSED_DIR / "tipperary-cso-2022-v1"
CSO_SAPS_URL = SOURCES["cso_saps_2022_small_area.csv"]["url"]
BOUNDARY_SOURCE_URL = (
    BOUNDARY_QUERY
)


def _file_timestamp(path: Path) -> str:
    return dt.datetime.fromtimestamp(path.stat().st_mtime, dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _assert_geometry_valid(geometry: dict, label: str) -> None:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type not in {"Polygon", "MultiPolygon"} or not coordinates:
        raise ValueError(f"{label}: expected Polygon or MultiPolygon geometry")
    polygons = [coordinates] if geometry_type == "Polygon" else coordinates
    for polygon in polygons:
        for ring in polygon:
            if len(ring) < 4 or ring[0] != ring[-1]:
                raise ValueError(f"{label}: polygon ring is not closed or has fewer than four points")
            for coordinate in ring:
                if len(coordinate) < 2:
                    raise ValueError(f"{label}: coordinate is missing longitude or latitude")
                longitude, latitude = float(coordinate[0]), float(coordinate[1])
                if not math.isfinite(longitude) or not math.isfinite(latitude):
                    raise ValueError(f"{label}: non-finite coordinate")
                if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
                    raise ValueError(f"{label}: coordinate is outside WGS84 longitude/latitude bounds")
    geom = shape(geometry)
    if geom.is_empty or not geom.is_valid:
        raise ValueError(f"{label}: empty or invalid polygon topology")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_sources(force: bool = False) -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {"schema_version": 1, "sources": {}}
    for filename, source in SOURCES.items():
        path = RAW_DIR / filename
        if force or not path.exists():
            temp = path.with_suffix(path.suffix + ".part")
            last_error = None
            for attempt in range(TRANSIENT_RETRIES + 1):
                try:
                    request = Request(
                        source["url"],
                        headers={"User-Agent": "CivicAccessLab/0.1 (open-data research)"},
                    )
                    digest = hashlib.sha256()
                    byte_count = 0
                    with urlopen(request, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response:
                        declared = response.headers.get("Content-Length")
                        if declared and int(declared) > MAX_DOWNLOAD_BYTES:
                            raise RuntimeError(f"{filename}: declared size exceeds download limit")
                        with temp.open("wb") as output:
                            while True:
                                block = response.read(1024 * 1024)
                                if not block:
                                    break
                                byte_count += len(block)
                                if byte_count > MAX_DOWNLOAD_BYTES:
                                    raise RuntimeError(f"{filename}: download exceeds {MAX_DOWNLOAD_BYTES} byte limit")
                                output.write(block)
                                digest.update(block)
                    if declared and byte_count != int(declared):
                        raise RuntimeError(f"{filename}: received {byte_count} bytes, expected {declared}")
                    temp.replace(path)
                    sha256 = digest.hexdigest()
                    size = byte_count
                    last_error = None
                    break
                except HTTPError as error:
                    temp.unlink(missing_ok=True)
                    if error.code != 429 and error.code < 500:
                        raise
                    last_error = error
                    if attempt < TRANSIENT_RETRIES:
                        time.sleep(0.5 * (attempt + 1))
                except (TimeoutError, URLError) as error:
                    last_error = error
                    temp.unlink(missing_ok=True)
                    if attempt < TRANSIENT_RETRIES:
                        time.sleep(0.5 * (attempt + 1))
                except Exception:
                    temp.unlink(missing_ok=True)
                    raise
            if last_error is not None:
                raise RuntimeError(f"Failed to download {filename} after bounded retries") from last_error
        else:
            sha256 = _sha256(path)
            size = path.stat().st_size
        manifest["sources"][filename] = {
            **source,
            "bytes": size,
            "sha256": sha256,
            "acquired_at": _file_timestamp(path),
        }
        print(f"{filename}: {size:,} bytes · sha256 {sha256[:16]}…")

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    (PROCESSED_DIR / "source_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def _read_boundaries() -> tuple[dict[str, dict], object]:
    data = json.loads((RAW_DIR / "tipperary_cso_small_areas_2022.geojson").read_text(encoding="utf-8"))
    boundaries: dict[str, dict] = {}
    geometries = []
    for feature in data["features"]:
        props = feature["properties"]
        code = str(props["SA_PUB2022"])
        if code in boundaries:
            raise ValueError(f"Duplicate Small Area boundary code: {code}")
        boundaries[code] = feature
        _assert_geometry_valid(feature["geometry"], f"Small Area {code}")
        geom = shape(feature["geometry"])
        geometries.append(geom)
    return boundaries, unary_union(geometries)


def _parse_int(row: dict[str, str], key: str) -> int:
    value = row.get(key, "").strip()
    if value in {"", ":", "..", "-"}:
        raise ValueError(f"Missing or suppressed value for {key} in {row.get('GEOGID')}")
    return int(float(value))


def _ordered_category_ids(dataset: dict, dimension_id: str) -> list[str]:
    index = dataset["dimension"][dimension_id]["category"]["index"]
    if isinstance(index, dict):
        return [key for key, _ in sorted(index.items(), key=lambda pair: pair[1])]
    return list(index)


def _mdsi_gp_medians(path: Path) -> dict[str, dict[str, float | None]]:
    dataset = json.loads(path.read_text(encoding="utf-8"))
    dimension_ids = dataset["id"]
    sizes = dataset["size"]
    category_ids = {dimension: _ordered_category_ids(dataset, dimension) for dimension in dimension_ids}
    stat_dim, year_dim, service_dim, area_dim = dimension_ids
    stat_i = {value: category_ids[stat_dim].index(value) for value in ("MDSI01C02", "MDSI01C06")}
    year_i = category_ids[year_dim].index("2026")
    service_i = category_ids[service_dim].index("160")  # General Practitioner (GP)
    area_positions = {guid: i for i, guid in enumerate(category_ids[area_dim])}
    values = dataset["value"]

    def value_at(statistic: str, area_position: int) -> float | None:
        flat = (((stat_i[statistic] * sizes[1] + year_i) * sizes[2] + service_i) * sizes[3] + area_position)
        value = values[flat]
        return None if value is None else float(value)

    result = {}
    for guid, position in area_positions.items():
        result[guid] = {
            "person_median_km": value_at("MDSI01C02", position),
            "dwelling_median_km": value_at("MDSI01C06", position),
        }
    return result


def _read_pobal(path: Path) -> dict[str, dict[str, str]]:
    with path.open(encoding="cp1252", newline="") as stream:
        return {row["ED_ID_STR"].strip(): row for row in csv.DictReader(stream)}


def _validate_gtfs_feed(path: Path) -> dict:
    """Stream required GTFS tables and validate identifiers without routing trips."""
    required = {
        "stops.txt": {"stop_id", "stop_lat", "stop_lon"},
        "routes.txt": {"route_id"},
        "trips.txt": {"trip_id", "route_id", "service_id"},
        "stop_times.txt": {"trip_id", "stop_id", "stop_sequence"},
        "calendar.txt": {"service_id", "start_date", "end_date"},
        "calendar_dates.txt": {"service_id", "date", "exception_type"},
    }
    counts = {}
    keys: dict[str, set[str]] = {"stops": set(), "routes": set(), "trips": set(), "services": set()}
    error_counts: dict[str, int] = {}
    date_bounds: list[str] = []

    def add_error(name: str) -> None:
        error_counts[name] = error_counts.get(name, 0) + 1

    def valid_date(value: str) -> bool:
        try:
            return len(value) == 8 and dt.datetime.strptime(value, "%Y%m%d").strftime("%Y%m%d") == value
        except ValueError:
            return False

    def valid_time(value: str) -> bool:
        if not re.fullmatch(r"\d{1,2}:\d{2}:\d{2}", value):
            return False
        _, minute, second = (int(part) for part in value.split(":"))
        return minute < 60 and second < 60

    with zipfile.ZipFile(path) as gtfs_zip:
        members = {name.rsplit("/", 1)[-1]: name for name in gtfs_zip.namelist()}
        missing_tables = sorted(set(required) - members.keys())
        if missing_tables:
            raise ValueError(f"GTFS missing required tables: {missing_tables}")

        for filename, fields in required.items():
            with gtfs_zip.open(members[filename]) as binary_stream:
                reader = csv.DictReader(TextIOWrapper(binary_stream, encoding="utf-8-sig", newline=""))
                if not fields <= set(reader.fieldnames or []):
                    raise ValueError(f"GTFS {filename} missing required columns: {sorted(fields - set(reader.fieldnames or []))}")
                count = 0
                for row in reader:
                    count += 1
                    if filename == "stops.txt":
                        identifier = row["stop_id"].strip()
                        if not identifier or identifier in keys["stops"]:
                            add_error("empty_or_duplicate_stop_id")
                        keys["stops"].add(identifier)
                        try:
                            longitude, latitude = float(row["stop_lon"]), float(row["stop_lat"])
                            if not (-180 <= longitude <= 180 and -90 <= latitude <= 90 and math.isfinite(longitude + latitude)):
                                add_error("invalid_stop_coordinate")
                        except (ValueError, TypeError):
                            add_error("invalid_stop_coordinate")
                    elif filename == "routes.txt":
                        identifier = row["route_id"].strip()
                        if not identifier or identifier in keys["routes"]:
                            add_error("empty_or_duplicate_route_id")
                        keys["routes"].add(identifier)
                    elif filename == "trips.txt":
                        identifier = row["trip_id"].strip()
                        if not identifier or identifier in keys["trips"]:
                            add_error("empty_or_duplicate_trip_id")
                        keys["trips"].add(identifier)
                        if row["route_id"] not in keys["routes"]:
                            add_error("trip_route_not_found")
                    elif filename == "calendar.txt":
                        identifier = row["service_id"].strip()
                        if not identifier or identifier in keys["services"]:
                            add_error("empty_or_duplicate_calendar_service_id")
                        keys["services"].add(identifier)
                        start, end = row["start_date"], row["end_date"]
                        if not valid_date(start) or not valid_date(end) or start > end:
                            add_error("invalid_calendar_date_range")
                        else:
                            date_bounds.extend([start, end])
                        for day in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"):
                            if row.get(day) not in {"0", "1"}:
                                add_error("invalid_calendar_weekday_flag")
                    elif filename == "calendar_dates.txt":
                        if row["exception_type"] not in {"1", "2"} or not valid_date(row["date"]):
                            add_error("invalid_calendar_exception")
                        else:
                            date_bounds.append(row["date"])
                counts[filename] = count

        # Verify trip service IDs against regular calendars and exception-only services.
        calendar_services = set()
        exception_services = set()
        for filename, target in (("calendar.txt", calendar_services), ("calendar_dates.txt", exception_services)):
            with gtfs_zip.open(members[filename]) as binary_stream:
                for row in csv.DictReader(TextIOWrapper(binary_stream, encoding="utf-8-sig", newline="")):
                    target.add(row["service_id"])
        available_services = calendar_services | exception_services
        for filename in ("trips.txt",):
            with gtfs_zip.open(members[filename]) as binary_stream:
                for row in csv.DictReader(TextIOWrapper(binary_stream, encoding="utf-8-sig", newline="")):
                    if row["service_id"] not in available_services:
                        add_error("trip_service_not_found")
        # Stream stop_times once more to check referenced trip/stop IDs and sequences.
        with gtfs_zip.open(members["stop_times.txt"]) as binary_stream:
            reader = csv.DictReader(TextIOWrapper(binary_stream, encoding="utf-8-sig", newline=""))
            if "arrival_time" not in (reader.fieldnames or []) or "departure_time" not in (reader.fieldnames or []):
                raise ValueError("GTFS stop_times.txt is missing arrival_time or departure_time")
            for row in reader:
                if row["trip_id"] not in keys["trips"]:
                    add_error("stop_time_trip_not_found")
                if row["stop_id"] not in keys["stops"]:
                    add_error("stop_time_stop_not_found")
                if not row["stop_sequence"].isdigit():
                    add_error("invalid_stop_sequence")
                for time_field in ("arrival_time", "departure_time"):
                    if not valid_time(row[time_field]):
                        add_error("invalid_stop_time_value")

    return {
        "feed_sha256": _sha256(path),
        "table_row_counts": counts,
        "unique_stop_ids": len(keys["stops"]),
        "unique_route_ids": len(keys["routes"]),
        "unique_trip_ids": len(keys["trips"]),
        "service_date_min": min(date_bounds) if date_bounds else None,
        "service_date_max": max(date_bounds) if date_bounds else None,
        "foreign_key_and_format_errors": error_counts,
        "structurally_valid": not error_counts,
        "note": "Structural feed check only; does not calculate or validate journeys, transfer feasibility, stop-time chronology, or passenger access.",
    }


def _point_in_county(geom: object, longitude: float, latitude: float) -> bool:
    return geom.covers(Point(longitude, latitude))


def _screening_candidates(features: list[dict], limit: int = 10) -> list[dict]:
    candidates = []
    for feature in features:
        p = feature["properties"]
        distance = p["cso_gp_person_median_distance_km_2026"]
        estimated_people = p["older_no_car_population_estimate"]
        if distance is None or estimated_people is None or estimated_people <= 0:
            continue
        candidates.append({
            "sa_code": p["sa_code"],
            "electoral_division": p["ed_name"],
            "urban_rural_category": p["urban_rural_category"],
            "estimated_older_no_car_population": estimated_people,
            "cso_median_gp_distance_km_all_persons": distance,
            "screening_exposure_person_km": round(estimated_people * distance, 1),
            "pobal_ed_category": p["pobal_ed_category"],
            "interpretation": "Prioritization prompt only; combines an ecological target-population proxy with an all-person median distance.",
        })
    candidates.sort(key=lambda row: row["screening_exposure_person_km"], reverse=True)
    return candidates[:limit]


def process_sources() -> dict:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    boundaries, county_geometry = _read_boundaries()
    census_path = RAW_DIR / "cso_saps_2022_small_area.csv"
    pobal = _read_pobal(RAW_DIR / "pobal_hp_deprivation_2022.csv")
    mdsi = _mdsi_gp_medians(RAW_DIR / "cso_mdsi01_2026.json")
    gtfs_validation = _validate_gtfs_feed(RAW_DIR / "nta_gtfs_all.zip")
    area_by_guid = {
        props["SA_GUID_2022"]: (code, props)
        for code, feature in boundaries.items()
        for props in [feature["properties"]]
    }

    joined: dict[str, dict] = {}
    census_codes_seen: set[str] = set()
    with census_path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            code = row["GEOGID"].strip()
            if code not in boundaries:
                continue
            if code in census_codes_seen:
                raise ValueError(f"Duplicate Census Small Area code in matching vintage: {code}")
            census_codes_seen.add(code)
            feature = boundaries[code]
            boundary = feature["properties"]
            ed_code = str(boundary["ED_ID_STR"]).strip()
            if ed_code not in pobal:
                raise ValueError(f"Pobal ED join failed for {ed_code} / Small Area {code}")
            age_65_plus = sum(_parse_int(row, field) for field in AGE_65_PLUS_FIELDS)
            population = _parse_int(row, "T1_1AGETT")
            no_car_households = _parse_int(row, "T15_1_NC")
            total_car_availability_households = _parse_int(row, "T15_1_TC")
            no_car_share = (
                no_car_households / total_car_availability_households
                if total_car_availability_households
                else None
            )
            pobal_row = pobal[ed_code]
            gp_distance = mdsi.get(boundary["SA_GUID_2022"], {})
            sa_props = {
                "sa_code": code,
                "sa_guid_2022": boundary["SA_GUID_2022"],
                "ed_code": ed_code,
                "ed_name": boundary["ED_ENGLISH"],
                "census_vintage": 2022,
                "population_total": population,
                "population_65_plus": age_65_plus,
                "households_no_car": no_car_households,
                "households_car_availability_total": total_car_availability_households,
                "no_car_household_share": round(no_car_share, 6) if no_car_share is not None else None,
                "older_no_car_population_estimate": (
                    round(age_65_plus * no_car_share, 1) if no_car_share is not None else None
                ),
                "older_no_car_estimate_method": "ecological proxy: population_65_plus × no-car-household share; not an observed age-by-car cross-tabulation",
                "urban_rural_category": row["UR_Category_Desc"],
                "legacy_administrative_area": boundary["COUNTY_ENGLISH"],
                "county": "Tipperary",
                "pobal_ed_index_relative_weighted": float(pobal_row["Index22_ED_std_rel_wt"]),
                "pobal_ed_category": pobal_row["Index22_ED_rel_wt_lab"],
                "pobal_geography_level": "Electoral Division (not Small Area)",
                "cso_gp_person_median_distance_km_2026": gp_distance.get("person_median_km"),
                "cso_gp_dwelling_median_distance_km_2026": gp_distance.get("dwelling_median_km"),
                "cso_health_distance_measure": "published median distance to nearest GP; not transit journey time",
                "screening_exposure_person_km": (
                    round(age_65_plus * no_car_share * gp_distance["person_median_km"], 1)
                    if no_car_share is not None and gp_distance.get("person_median_km") is not None
                    else None
                ),
            }
            joined[code] = {
                "type": "Feature",
                "geometry": feature["geometry"],
                "properties": sa_props,
            }

    expected_codes = set(boundaries)
    if set(joined) != expected_codes:
        missing = sorted(expected_codes - set(joined))
        raise ValueError(f"Census join coverage {len(joined)}/{len(boundaries)}; missing codes: {missing[:8]}")
    if len(joined) != len(set(joined)):
        raise ValueError("Duplicate Small Area codes in joined output")

    csv_path = PROCESSED_DIR / "tipperary_census_access_screen.csv"
    features_path = PROCESSED_DIR / "tipperary_census_access_screen.geojson"
    fields = list(next(iter(joined.values()))["properties"])
    with csv_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(feature["properties"] for feature in joined.values())

    output_fc = {
        "type": "FeatureCollection",
        "name": "tipperary_census_access_screen",
        "crs": {"type": "name", "properties": {"name": "OGC:CRS84"}},
        "metadata": {
            "county": "Tipperary (North and South Tipperary statistical legacy areas combined)",
            "feature_count": len(joined),
            "source_vintages": {"census": 2022, "pobal": 2022, "cso_health_distance": 2026},
            "crs": "OGC:CRS84 / WGS 84 longitude-latitude",
            "notes": [
                "CSO age totals and households without a car are separate area-level measures.",
                "older_no_car_population_estimate is an ecological proxy, not a directly observed count of people aged 65+ without a car.",
                "Pobal deprivation values are Electoral Division measures carried as contextual attributes; they are not Small Area scores.",
                "CSO GP distances are published straight-line/distance statistics, not scheduled public-transport travel times.",
            ],
        },
        "features": list(joined.values()),
    }
    features_path.write_text(json.dumps(output_fc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    candidates = _screening_candidates(list(joined.values()))
    candidate_features = [joined[candidate["sa_code"]] for candidate in candidates]
    candidate_fc = {
        "type": "FeatureCollection",
        "name": "tipperary_initial_screening_candidates",
        "metadata": {
            "county": "Tipperary",
            "selection": "Top 10 Small Areas by estimated older no-car population × CSO 2026 all-person median GP distance.",
            "warning": "Exploratory screening only. The demographic term is ecological; the distance applies to all persons. This is not a validated deprivation or public-transport accessibility score.",
            "crs": "OGC:CRS84 / WGS 84 longitude-latitude",
        },
        "features": candidate_features,
    }
    candidates_path = PROCESSED_DIR / "tipperary_screening_candidates.geojson"
    candidates_path.write_text(json.dumps(candidate_fc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    candidate_csv_path = PROCESSED_DIR / "tipperary_screening_candidates.csv"
    with candidate_csv_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(candidates[0]))
        writer.writeheader()
        writer.writerows(candidates)

    # Export only stops inside the combined Census-2022 small-area union. Keep
    # the official stop ID, native coordinate fields, status and update date.
    stop_features = []
    total_inside_stops = active_inside_stops = 0
    active_naptan_by_code: dict[str, dict[str, str]] = {}
    stop_csv = RAW_DIR / "naptan_stop_points.csv"
    with stop_csv.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            try:
                latitude, longitude = float(row["Latitude"]), float(row["Longitude"])
            except (TypeError, ValueError):
                continue
            if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                continue
            if not _point_in_county(county_geometry, longitude, latitude):
                continue
            total_inside_stops += 1
            if row["Status"].strip().lower() == "active":
                active_inside_stops += 1
                active_naptan_by_code[row["AtcoCode"]] = row
            stop_features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
                "properties": {
                    "atco_code": row["AtcoCode"],
                    "common_name": row["CommonName"],
                    "common_name_ga": row["CommonNameGA"],
                    "stop_type": row["StopType"],
                    "bus_stop_type": row["BusStopType"],
                    "wheelchair_boarding": row.get("WheelchairBoarding", ""),
                    "status": row["Status"],
                    "modification_datetime": row["ModificationDateTime"],
                    "coordinate_source": "NaPTAN Latitude/Longitude fields (WGS 84); ITM Easting/Northing retained in raw download",
                },
            })

    stops_path = PROCESSED_DIR / "tipperary_naptan_stops.geojson"
    stops_fc = {
        "type": "FeatureCollection",
        "name": "tipperary_naptan_stops",
        "metadata": {
            "county": "Tipperary",
            "feature_count": total_inside_stops,
            "active_stop_count": active_inside_stops,
            "crs": "OGC:CRS84 / WGS 84 longitude-latitude",
            "source": "NTA NaPTAN Stop Points",
        },
        "features": stop_features,
    }
    stops_path.write_text(json.dumps(stops_fc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    # Keep the GTFS stop vocabulary and wheelchair field alongside NaPTAN IDs.
    # GTFS stop_id is used as the NaPTAN AtcoCode join key in this feed.
    gtfs_stop_features = []
    gtfs_stop_ids: set[str] = set()
    with zipfile.ZipFile(RAW_DIR / "nta_gtfs_all.zip") as gtfs_zip:
        with gtfs_zip.open("stops.txt") as binary_stream:
            text_stream = TextIOWrapper(binary_stream, encoding="utf-8-sig", newline="")
            for row in csv.DictReader(text_stream):
                try:
                    longitude = float(row["stop_lon"])
                    latitude = float(row["stop_lat"])
                except (TypeError, ValueError):
                    continue
                if not _point_in_county(county_geometry, longitude, latitude):
                    continue
                stop_id = row["stop_id"]
                gtfs_stop_ids.add(stop_id)
                naptan_row = active_naptan_by_code.get(stop_id)
                gtfs_stop_features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
                    "properties": {
                        "gtfs_stop_id": stop_id,
                        "naptan_atco_code": stop_id if naptan_row else None,
                        "stop_code": row.get("stop_code", ""),
                        "stop_name": row.get("stop_name", ""),
                        "wheelchair_boarding": row.get("wheelchair_boarding", ""),
                        "location_type": row.get("location_type", ""),
                        "parent_station": row.get("parent_station", ""),
                        "naptan_name": naptan_row.get("CommonName", "") if naptan_row else None,
                        "source_vintage": "current downloaded TFI static GTFS feed",
                    },
                })
    gtfs_stops_path = PROCESSED_DIR / "tipperary_gtfs_stops.geojson"
    gtfs_stops_fc = {
        "type": "FeatureCollection",
        "name": "tipperary_gtfs_stops",
        "metadata": {
            "county": "Tipperary",
            "feature_count": len(gtfs_stop_features),
            "matched_to_active_naptan_atco_code": sum(1 for f in gtfs_stop_features if f["properties"]["naptan_atco_code"]),
            "crs": "OGC:CRS84 / WGS 84 longitude-latitude",
            "source": "NTA / TFI static GTFS stops.txt; coordinates retained as stop_lat/stop_lon",
        },
        "features": gtfs_stop_features,
    }
    gtfs_stops_path.write_text(json.dumps(gtfs_stops_fc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    population_total = sum(f["properties"]["population_total"] for f in joined.values())
    population_65_plus = sum(f["properties"]["population_65_plus"] for f in joined.values())
    no_car_households = sum(f["properties"]["households_no_car"] for f in joined.values())
    households_total = sum(f["properties"]["households_car_availability_total"] for f in joined.values())
    gp_distances = [
        f["properties"]["cso_gp_person_median_distance_km_2026"]
        for f in joined.values()
        if f["properties"]["cso_gp_person_median_distance_km_2026"] is not None
    ]
    report = {
        "county": "Tipperary",
        "small_area_count": len(joined),
        "census_boundary_join_unmatched": len(set(boundaries) - census_codes_seen),
        "rejected_records": 0,
        "missingness": {
            "population_65_plus_residents": 0,
            "no_car_households": 0,
            "target_cohort_residents": len(joined),
            "services": len(joined),
            "scheduled_journeys": len(joined),
        },
        "census_population_2022": population_total,
        "population_65_plus_2022": population_65_plus,
        "households_no_car_2022": no_car_households,
        "private_households_car_availability_total_2022": households_total,
        "no_car_household_share": round(no_car_households / households_total, 6) if households_total else None,
        "older_no_car_population_estimate": round(sum(f["properties"]["older_no_car_population_estimate"] for f in joined.values()), 1),
        "older_no_car_estimate_note": "Exploratory ecological proxy only; not included as target-cohort residents in the normalized Community snapshot because age and car ownership are separate marginals.",
        "pobal_unmatched_small_areas": 0,
        "cso_gp_median_distance_populated_areas": len(gp_distances),
        "cso_gp_person_median_distance_min_km": min(gp_distances) if gp_distances else None,
        "cso_gp_person_median_distance_max_km": max(gp_distances) if gp_distances else None,
        "cso_gp_person_median_distance_median_of_small_area_medians_km": statistics.median(gp_distances) if gp_distances else None,
        "naptan_stops_in_area": total_inside_stops,
        "naptan_active_stops_in_area": active_inside_stops,
        "gtfs_stops_in_area": len(gtfs_stop_features),
        "gtfs_stops_matched_to_active_naptan": sum(1 for stop_id in gtfs_stop_ids if stop_id in active_naptan_by_code),
        "gtfs_validation": gtfs_validation,
        "screening_candidate_method": "Top Small Areas by estimated older_no_car_population × CSO 2026 all-person median GP distance; ecological and descriptive only.",
        "initial_screening_candidates": candidates,
        "processed_files": [
            "tipperary_census_access_screen.geojson",
            "tipperary_census_access_screen.csv",
            "tipperary_screening_candidates.geojson",
            "tipperary_screening_candidates.csv",
            "tipperary_naptan_stops.geojson",
            "tipperary_gtfs_stops.geojson",
        ],
    }
    (PROCESSED_DIR / "tipperary_ingestion_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    build_snapshot(boundaries, joined)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return report


def _walk_coordinates(value):
    if isinstance(value, (list, tuple)):
        if len(value) >= 2 and all(isinstance(part, (int, float)) for part in value[:2]):
            yield float(value[0]), float(value[1])
        else:
            for child in value:
                yield from _walk_coordinates(child)


def build_snapshot(boundaries: dict[str, dict], joined: dict[str, dict]) -> dict:
    """Write the shared-model snapshot for B/C; no ecological target cohort."""
    from backend.domain.models import Community, PopulationProfile, Provenance

    snapshot_acquired_at = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    raw_manifest_path = PROCESSED_DIR / "source_manifest.json"
    raw_manifest = json.loads(raw_manifest_path.read_text(encoding="utf-8")) if raw_manifest_path.exists() else {"sources": {}}

    def acquired_at(filename: str) -> str:
        source_info = raw_manifest.get("sources", {}).get(filename, {})
        value = source_info.get("acquired_at")
        if value:
            return value
        return _file_timestamp(RAW_DIR / filename)

    boundary_provenance = Provenance(
        id="prov-tailte-cso-small-areas-2022",
        source="Tailte Éireann / CSO",
        dataset="Census 2022 Small Area Statistical Boundaries",
        source_url=BOUNDARY_SOURCE_URL,
        source_updated_at=None,
        ingested_at=acquired_at("tipperary_cso_small_areas_2022.geojson"),
        licence="CC BY 4.0",
        data_mode="real",
    )
    census_provenance = Provenance(
        id="prov-cso-saps-2022",
        source="Central Statistics Office Ireland",
        dataset="Census 2022 Small Area Population Statistics",
        source_url=CSO_SAPS_URL,
        source_updated_at=None,
        ingested_at=acquired_at("cso_saps_2022_small_area.csv"),
        licence="CC BY 4.0",
        data_mode="real",
    )
    provenance = [boundary_provenance, census_provenance]
    communities = []
    rejected = []
    for code in sorted(joined):
        feature = joined[code]
        try:
            if not re.fullmatch(r"\d{9}(?:/(?:\d{2}|\d{9}))*", code):
                raise ValueError("Small Area public code must retain its official numeric source ID or slash-delimited merged-area ID")
            _assert_geometry_valid(feature["geometry"], f"Small Area {code}")
            geom = shape(feature["geometry"])
            if geom.is_empty or not geom.is_valid:
                raise ValueError("geometry is empty or topologically invalid")
            if geom.geom_type not in {"Polygon", "MultiPolygon"}:
                raise ValueError("geometry must be Polygon or MultiPolygon")
            geometry = mapping(geom)
            coordinates = list(_walk_coordinates(geometry["coordinates"]))
            if not coordinates or any(not math.isfinite(x) or not math.isfinite(y) for x, y in coordinates):
                raise ValueError("geometry has missing or non-finite coordinates")
            if any(not (-180 <= x <= 180 and -90 <= y <= 90) for x, y in coordinates):
                raise ValueError("geometry coordinates are outside WGS84 longitude/latitude bounds")
            representative = geom.representative_point()
            props = feature["properties"]
            profile = PopulationProfile(
                total_residents=props["population_total"],
                aged_65_plus_residents=props["population_65_plus"],
                no_car_households=props["households_no_car"],
                target_cohort_residents=None,
                cohort_method="unknown",
                provenance_ids=[census_provenance.id],
            )
            community = Community(
                id=f"cso-sa-2022-{code}",
                name=f"Small Area {code}",
                region_id="tipperary",
                center=(representative.x, representative.y),
                geometry=geometry,
                population=profile,
                data_mode="real",
                provenance_ids=[boundary_provenance.id, census_provenance.id],
            )
            communities.append(community.model_dump(mode="json"))
        except Exception as error:
            rejected.append({"sa_code": code, "reason": str(error)})
    if rejected:
        raise ValueError(f"Snapshot validation rejected {len(rejected)} communities; first: {rejected[0]}")

    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    files = {
        "communities.json": communities,
        "provenance.json": [item.model_dump(mode="json") for item in provenance],
    }
    checksums = {}
    for filename, records in files.items():
        path = SNAPSHOT_DIR / filename
        path.write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        checksums[filename] = _sha256(path)
    manifest = {
        "schema_version": 1,
        "dataset_id": "tipperary-cso-2022-v1",
        "region_id": "tipperary",
        "geography_vintage": "Census 2022 Small Areas / Tailte Éireann 2022 boundaries",
        "data_mode": "real",
        "ingested_at": snapshot_acquired_at,
        "coordinate_system": "EPSG:4326",
        "files": {
            "communities": {"path": "communities.json", "sha256": checksums["communities.json"]},
            "provenance": {"path": "provenance.json", "sha256": checksums["provenance.json"]},
        },
        "record_counts": {"communities": len(communities), "provenance": len(provenance)},
        "rejected_records": len(rejected),
        "missing_fields": ["population.target_cohort_residents", "services", "scheduled_journeys"],
        "cohort_method": "unknown",
        "cohort_note": "CSO age counts and no-car household counts are separate marginals; their person-level intersection is not identified.",
    }
    (SNAPSHOT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def load_snapshot(snapshot_dir: Path = SNAPSHOT_DIR) -> tuple[dict, list, list]:
    """Validate hashes, shared DTOs, and provenance references before use."""
    from backend.domain.models import Community, Provenance

    manifest = json.loads((snapshot_dir / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1:
        raise ValueError("Unsupported snapshot schema_version")
    records = {}
    root = snapshot_dir.resolve()
    for key, entry in manifest["files"].items():
        relative = Path(entry["path"])
        path = (snapshot_dir / relative).resolve()
        if path.parent != root or not path.is_file():
            raise ValueError(f"Snapshot file path is missing or escapes snapshot: {relative}")
        if _sha256(path) != entry["sha256"]:
            raise ValueError(f"Snapshot checksum mismatch: {relative}")
        records[key] = json.loads(path.read_text(encoding="utf-8"))
    communities = [Community.model_validate(record) for record in records["communities"]]
    provenance = [Provenance.model_validate(record) for record in records["provenance"]]
    provenance_ids = {item.id for item in provenance}
    if len(provenance_ids) != len(provenance):
        raise ValueError("Duplicate provenance IDs")
    community_ids = [item.id for item in communities]
    if len(set(community_ids)) != len(community_ids):
        raise ValueError("Duplicate community IDs")
    for community in communities:
        refs = set(community.provenance_ids) | set(community.population.provenance_ids)
        if not refs <= provenance_ids:
            raise ValueError(f"Unresolved provenance for {community.id}: {sorted(refs - provenance_ids)}")
        _assert_geometry_valid(community.geometry.model_dump(mode="python"), community.id)
    if manifest.get("record_counts", {}).get("communities") != len(communities):
        raise ValueError("Snapshot community record count does not match manifest")
    return manifest, communities, provenance


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="Download any missing official raw files.")
    parser.add_argument("--force-download", action="store_true", help="Refresh all raw downloads.")
    parser.add_argument("--process-only", action="store_true", help="Process already-downloaded raw files only.")
    args = parser.parse_args()
    if not args.process_only:
        download_sources(force=args.force_download)
    process_sources()


if __name__ == "__main__":
    main()

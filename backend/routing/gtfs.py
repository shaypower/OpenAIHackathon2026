"""Small, strict GTFS timetable reader. Times remain seconds on a service day."""
from __future__ import annotations

import csv
import re
import zipfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable, Mapping
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class TransportError(ValueError):
    """Stable error boundary for callers of the transport engine."""
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class Stop:
    id: str
    name: str
    lat: float
    lon: float


@dataclass(frozen=True)
class Route:
    id: str
    route_type: int
    mode: str


@dataclass(frozen=True)
class Trip:
    id: str
    route_id: str
    service_id: str


@dataclass(frozen=True)
class StopTime:
    trip_id: str
    stop_id: str
    sequence: int
    arrival_seconds: int
    departure_seconds: int


@dataclass(frozen=True)
class Calendar:
    service_id: str
    start_date: date
    end_date: date
    weekdays: tuple[bool, ...]  # Monday first


@dataclass(frozen=True)
class TransitFeed:
    timezone: str
    stops: Mapping[str, Stop]
    routes: Mapping[str, Route]
    trips: Mapping[str, Trip]
    stop_times: Mapping[str, tuple[StopTime, ...]]
    calendars: Mapping[str, Calendar]
    exceptions: Mapping[tuple[str, date], int]

    def active_service_ids(self, service_date: date) -> set[str]:
        active = {
            sid for sid, cal in self.calendars.items()
            if cal.start_date <= service_date <= cal.end_date and cal.weekdays[service_date.weekday()]
        }
        for (sid, exception_date), exception_type in self.exceptions.items():
            if exception_date == service_date:
                if exception_type == 1:
                    active.add(sid)
                else:
                    active.discard(sid)
        return active


_TIME = re.compile(r"^(\d{1,3}):([0-5]\d):([0-5]\d)$")


def parse_gtfs_time(value: str) -> int:
    """Parse HH:MM:SS to seconds from service-day midnight (HH may exceed 24)."""
    match = _TIME.fullmatch(str(value))
    if not match:
        raise TransportError("invalid_feed", f"Invalid GTFS time {value!r}; expected HH:MM:SS.")
    hours, minutes, seconds = map(int, match.groups())
    return hours * 3600 + minutes * 60 + seconds


def _date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(f"{value[:4]}-{value[4:6]}-{value[6:8]}")
    except (ValueError, TypeError):
        raise TransportError("invalid_feed", f"Invalid GTFS date in {field}: {value!r}.") from None


def _rows(tables: Mapping[str, Iterable[Mapping[str, str]]], name: str, required: bool = True):
    rows = tables.get(name)
    if rows is None:
        if required:
            raise TransportError("invalid_feed", f"Required GTFS table {name}.txt is missing.")
        return []
    return [dict(row) for row in rows]


def _unique(rows: list[dict], key: str, table: str) -> dict[str, dict]:
    result = {}
    for row in rows:
        value = row.get(key, "").strip()
        if not value or value in result:
            raise TransportError("invalid_feed", f"Missing or duplicate {key} in {table}.txt: {value!r}.")
        result[value] = row
    return result


def parse_gtfs(tables: Mapping[str, Iterable[Mapping[str, str]]], timezone_name: str | None = None) -> TransitFeed:
    """Parse the GTFS tables used by routing and validate all supported references."""
    agencies = _rows(tables, "agency", required=False)
    agency_zones = {r.get("agency_timezone", "").strip() for r in agencies if r.get("agency_timezone", "").strip()}
    if timezone_name:
        agency_zones.add(timezone_name)
    if len(agency_zones) != 1:
        raise TransportError("invalid_feed", "A single explicit agency timezone is required.")
    zone = next(iter(agency_zones))
    try:
        ZoneInfo(zone)
    except ZoneInfoNotFoundError:
        raise TransportError("invalid_feed", f"Unknown agency timezone {zone!r}.") from None

    stop_rows = _unique(_rows(tables, "stops"), "stop_id", "stops")
    stops = {}
    for sid, row in stop_rows.items():
        try:
            lat, lon = float(row["stop_lat"]), float(row["stop_lon"])
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError
        except (ValueError, KeyError):
            raise TransportError("invalid_feed", f"Invalid coordinates for stop {sid!r}.") from None
        stops[sid] = Stop(sid, row.get("stop_name", sid), lat, lon)

    agency_ids = {r.get("agency_id", "").strip() for r in agencies if r.get("agency_id", "").strip()}
    route_rows = _unique(_rows(tables, "routes"), "route_id", "routes")
    mode_names = {0: "tram", 1: "rail", 2: "rail", 3: "bus", 4: "ferry", 5: "cable_car", 6: "gondola", 7: "funicular"}
    routes = {}
    for rid, row in route_rows.items():
        try:
            route_type = int(row["route_type"])
        except (ValueError, KeyError):
            raise TransportError("invalid_feed", f"Invalid route_type for route {rid!r}.") from None
        agency_id = row.get("agency_id", "").strip()
        if agency_ids and agency_id and agency_id not in agency_ids:
            raise TransportError("invalid_feed", f"Route {rid!r} references unknown agency {agency_id!r}.")
        if not agency_ids and agency_id:
            raise TransportError("invalid_feed", f"Route {rid!r} references an agency but agency.txt is missing.")
        if len(agency_ids) > 1 and not agency_id:
            raise TransportError("invalid_feed", f"Route {rid!r} must identify its agency in a multi-agency feed.")
        routes[rid] = Route(rid, route_type, mode_names.get(route_type, "transit"))

    cal_rows = _unique(_rows(tables, "calendar", required=False), "service_id", "calendar")
    calendars = {}
    for sid, row in cal_rows.items():
        try:
            weekdays = tuple(row[d].strip() == "1" for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"))
            if any(row[d].strip() not in ("0", "1") for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")):
                raise ValueError
            start, end = _date(row["start_date"], "calendar.start_date"), _date(row["end_date"], "calendar.end_date")
            if start > end:
                raise ValueError
        except (ValueError, KeyError):
            raise TransportError("invalid_feed", f"Invalid calendar row for service {sid!r}.") from None
        calendars[sid] = Calendar(sid, start, end, weekdays)

    exception_rows = _rows(tables, "calendar_dates", required=False)
    exceptions = {}
    for row in exception_rows:
        sid = row.get("service_id", "").strip()
        try:
            d, kind = _date(row["date"], "calendar_dates.date"), int(row["exception_type"])
        except (ValueError, KeyError):
            raise TransportError("invalid_feed", "Invalid calendar_dates row.") from None
        if kind not in (1, 2) or (sid, d) in exceptions:
            raise TransportError("invalid_feed", f"Invalid or duplicate service exception for {sid!r} on {d}.")
        exceptions[(sid, d)] = kind
    if not calendars and not exceptions:
        raise TransportError("invalid_feed", "GTFS needs calendar.txt, calendar_dates.txt, or both.")

    trip_rows = _unique(_rows(tables, "trips"), "trip_id", "trips")
    trips = {}
    known_services = set(calendars) | {sid for sid, _ in exceptions}
    for tid, row in trip_rows.items():
        rid, sid = row.get("route_id", "").strip(), row.get("service_id", "").strip()
        if rid not in routes or sid not in known_services:
            raise TransportError("invalid_feed", f"Trip {tid!r} references unknown route or service.")
        trips[tid] = Trip(tid, rid, sid)
    trip_services = {trip.service_id for trip in trips.values()}
    if {sid for sid, _ in exceptions} - (set(calendars) | trip_services):
        raise TransportError("invalid_feed", "calendar_dates references a service absent from calendar.txt and trips.txt.")

    times_by_trip: dict[str, list[StopTime]] = {tid: [] for tid in trips}
    seen_seq = set()
    for row in _rows(tables, "stop_times"):
        tid, sid = row.get("trip_id", "").strip(), row.get("stop_id", "").strip()
        if tid not in trips or sid not in stops:
            raise TransportError("invalid_feed", f"stop_times references unknown trip or stop ({tid!r}, {sid!r}).")
        try:
            seq = int(row["stop_sequence"])
            arr, dep = parse_gtfs_time(row["arrival_time"]), parse_gtfs_time(row["departure_time"])
            if seq < 0 or arr > dep or (tid, seq) in seen_seq:
                raise ValueError
        except (ValueError, KeyError):
            raise TransportError("invalid_feed", f"Invalid or duplicate stop_time sequence for trip {tid!r}.") from None
        seen_seq.add((tid, seq))
        times_by_trip[tid].append(StopTime(tid, sid, seq, arr, dep))
    stop_times = {}
    for tid, values in times_by_trip.items():
        values.sort(key=lambda x: x.sequence)
        if len(values) < 2:
            raise TransportError("invalid_feed", f"Trip {tid!r} needs at least two stop_times.")
        for a, b in zip(values, values[1:]):
            if a.sequence >= b.sequence or a.departure_seconds > b.arrival_seconds:
                raise TransportError("invalid_feed", f"Trip {tid!r} has non-chronological stop_times.")
        stop_times[tid] = tuple(values)
    return TransitFeed(zone, stops, routes, trips, stop_times, calendars, exceptions)


def read_gtfs_directory(directory: str | Path, timezone_name: str | None = None) -> TransitFeed:
    """Read the supported CSV tables from a feed directory without extra packages."""
    root = Path(directory)
    tables = {}
    for name in ("agency", "stops", "routes", "trips", "stop_times", "calendar", "calendar_dates"):
        path = root / f"{name}.txt"
        if path.exists():
            with path.open("r", encoding="utf-8-sig", newline="") as stream:
                tables[name] = list(csv.DictReader(stream))
    return parse_gtfs(tables, timezone_name)


def read_gtfs_archive(archive: str | Path, timezone_name: str | None = None) -> TransitFeed:
    """Read a checked GTFS zip without extracting untrusted archive paths."""
    tables = {}
    supported = {"agency", "stops", "routes", "trips", "stop_times", "calendar", "calendar_dates"}
    try:
        with zipfile.ZipFile(archive) as bundle:
            for member in bundle.namelist():
                candidate = Path(member)
                if candidate.name.endswith(".txt") and candidate.stem in supported and not candidate.is_absolute() and ".." not in candidate.parts:
                    if candidate.stem in tables:
                        raise TransportError("invalid_feed", f"GTFS archive contains duplicate {candidate.name} tables.")
                    tables[candidate.stem] = list(csv.DictReader(bundle.read(member).decode("utf-8-sig").splitlines()))
    except (OSError, zipfile.BadZipFile, UnicodeDecodeError) as exc:
        raise TransportError("invalid_feed", f"Cannot read GTFS archive: {exc}.") from None
    return parse_gtfs(tables, timezone_name)

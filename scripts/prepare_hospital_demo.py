"""Build the attributed, offline hospital screening context from an OSM extract.

Usage: .venv/bin/python scripts/prepare_hospital_demo.py /tmp/civic-placement/osm.json
The input is an Overpass `out geom` response for the three bounded search areas.
"""
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys

from shapely.geometry import Polygon, LineString, box, shape, mapping
from shapely.ops import polygonize, transform, unary_union
from shapely import make_valid

ROOT = Path(__file__).resolve().parents[1]
AREAS = {"nenagh-tyone": (-8.1951, 52.8577), "thurles-west": (-7.827, 52.678), "roscrea": (-7.797, 52.957)}
R = 6378137


def kind(tags):
    if tags.get("building") not in (None, "no"):
        return "building"
    if "highway" in tags or "railway" in tags:
        return "transport"
    if "waterway" in tags or tags.get("natural") in ("water", "wetland"):
        return "water"
    if tags.get("landuse") in ("forest", "cemetery", "recreation_ground") or tags.get("natural") == "wood" or tags.get("leisure") in ("park", "pitch", "sports_centre", "playground", "golf_course"):
        return "protected-land"


def local_geometry(geometry, origin):
    lon, lat = origin
    return transform(lambda x, y, z=None: ((x-lon)*math.pi/180*R*math.cos(lat*math.pi/180), (y-lat)*math.pi/180*R), geometry)


def main():
    raw = Path(sys.argv[1]).read_bytes()
    source = json.loads(raw)
    if source.get("remark") or not source.get("elements"):
        raise ValueError("Incomplete or empty OSM response")
    features = []
    for element in source["elements"]:
        category = kind(element.get("tags", {}))
        if not category:
            continue
        if element["type"] == "relation":
            lines = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]]) for m in element.get("members", [])
                     if m.get("role") == "outer" and len(m.get("geometry", [])) >= 2]
            geometry = unary_union(list(polygonize(lines)))
            if geometry.is_empty:
                raise ValueError(f"Unresolved building relation {element['id']}")
        else:
            points = [(p["lon"], p["lat"]) for p in element.get("geometry", [])]
            if len(points) < 2:
                raise ValueError(f"Missing obstacle geometry {element['id']}")
            geometry = Polygon(points) if len(points) >= 4 and points[0] == points[-1] and category != "transport" else LineString(points)
        geometry = make_valid(geometry)
        features.append({"type": "Feature", "id": f"osm-{element['type']}-{element['id']}",
                         "geometry": mapping(geometry), "properties": {"kind": category,
                         "name": element.get("tags", {}).get("name", category), "height": 9 if category == "building" else 0}})
    if sum(f["properties"]["kind"] == "building" for f in features) < 50:
        raise ValueError("Insufficient building context")
    contexts = {}
    for area_id, origin in AREAS.items():
        lon, lat = origin
        bounds = [lon-.014, lat-.008, lon+.014, lat+.008]
        region = box(*bounds)
        nearby = [f for f in features if shape(f["geometry"]).intersects(region)]
        expanded = [local_geometry(shape(f["geometry"]), origin).buffer(15 if f["properties"]["kind"] == "transport" else 8, cap_style=3, join_style=2) for f in nearby]
        obstruction = unary_union(expanded)
        roads = unary_union([local_geometry(shape(f["geometry"]), origin) for f in nearby if f["properties"]["kind"] == "transport"])
        candidates = sorted(((e,n) for e in range(-750,751,25) for n in range(-750,751,25) if math.hypot(e,n)<=750), key=lambda p:(math.hypot(*p),p))
        center = None
        clearance_region = local_geometry(region, origin)
        for east,north in candidates:
            envelope = box(east-100,north-100,east+100,north+100)
            if not clearance_region.contains(envelope.buffer(15)) or envelope.intersects(obstruction):
                continue
            # Do not propose an isolated clearing with no mapped transport nearby.
            if envelope.distance(roads) > 150:
                continue
            center = [lon+east/R/math.cos(lat*math.pi/180)*180/math.pi, lat+north/R*180/math.pi]
            break
        contexts[area_id] = {"bounds": bounds, "features": nearby, "screenedCenter": center,
                             "searchRadiusM": 750, "siteSideM": 200}
        print(area_id, len(nearby), "obstacles; clear center:", center)
    census_path = ROOT / "backend/data/processed/tipperary-cso-2022-v1/communities.json"
    census = json.loads(census_path.read_text())
    if isinstance(census, dict):
        census = census.get("communities", census.get("items", []))
    communities = []
    for c in census:
        if min(local_geometry(shape({"type":"Point","coordinates":c["center"]}), origin).distance(shape({"type":"Point","coordinates":[0,0]})) for origin in AREAS.values()) > 4500:
            continue
        pop = c["population"]
        communities.append({"id":c["id"],"name":c["name"],"center":c["center"],
            "geometry":mapping(shape(c["geometry"]).simplify(0.000025,preserve_topology=True)),
            "residents":pop["total_residents"],"olderResidents":pop["aged_65_plus_residents"],"noCarHouseholds":pop["no_car_households"]})
    output = {"schemaVersion":1,"capturedAt":datetime.now(timezone.utc).isoformat(),
        "osmBase":source.get("osm3s",{}).get("timestamp_osm_base"),"osmSha256":hashlib.sha256(raw).hexdigest(),
        "sourceUrl":source.get("source", "https://overpass-api.de/api/interpreter"), "attribution":"© OpenStreetMap contributors · ODbL 1.0; Census 2022 / CSO / Tailte Éireann · CC BY 4.0",
        "censusDataset":"tipperary-cso-2022-v1","censusSha256":hashlib.sha256(census_path.read_bytes()).hexdigest(),
        "areas":contexts,"communities":communities,
        "limitations":["Mapped-obstacle screening only; no ownership, zoning, flood or clinical approval.",
            "Nearby population sums Census Small Areas whose centres fall within each straight-line radius; it is not a travel-time catchment or forecast of patients."]}
    target = ROOT / "src/frontend/public/data/hospital-context.json"
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(output,separators=(",",":"),allow_nan=False)+"\n")
    print(len(communities),"Census areas;",target.stat().st_size,"bytes")


if __name__ == "__main__":
    main()

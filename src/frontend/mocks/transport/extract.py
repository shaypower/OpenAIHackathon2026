"""Rebuild the small display network from captured public geometry; no routing engine.

Usage: python3 src/frontend/mocks/transport/extract.py <local-link.zip> <feeder.json> <contingency.json>
Input road JSON: OSRM Route responses with steps=true/geometries=geojson.
Never imports a backend or copies GTFS times into the synthetic scenario.
"""
import csv
import hashlib
import io
import json
import math
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

archive, feeder_file, alternate_file = map(Path, sys.argv[1:4])
z = zipfile.ZipFile(archive)
def rows(name):
    return csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8-sig"))
all_stops = {r["stop_id"]: r for r in rows("stops.txt")}
all_trips = list(rows("trips.txt"))
all_times = list(rows("stop_times.txt"))
feed = next(rows("feed_info.txt"))
acquired = datetime.now(timezone.utc).isoformat()
sources = [{
    "id": "nta-local-link-shapes", "name": "National Transport Authority",
    "dataset": "Local Link GTFS — selected 391 / 854 patterns", "kind": "gtfs-shape",
    "url": "https://www.transportforireland.ie/transitData/PT_Data.html",
    "downloadUrl": "https://www.transportforireland.ie/transitData/Data/GTFS_Local_Link.zip",
    "licence": "CC BY 4.0", "acquiredAt": acquired,
    "version": feed["feed_version"], "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
    "validFrom": feed["feed_start_date"], "validUntil": feed["feed_end_date"],
    "limitations": "Selected published patterns only. Not live positions, a full GTFS reader or a verified timetable evaluation.",
}, {
    "id": "osm-road-context", "name": "OpenStreetMap contributors / OSRM",
    "dataset": "Captured driving paths for synthetic feeder and contingency", "kind": "road-path",
    "url": "https://www.openstreetmap.org/copyright", "licence": "ODbL 1.0",
    "acquiredAt": acquired, "version": "captured-road-paths-2026-10-04",
    "sha256": hashlib.sha256(feeder_file.read_bytes()+alternate_file.read_bytes()).hexdigest(),
    "limitations": "Driving geometry only. No bus permission, pedestrian accessibility, capacity, timetable or closure validation. Proposed services are synthetic.",
}]
network = {"schemaVersion": 1, "sources": sources, "routes": [], "stops": [], "edges": []}
stops = {}
def point(record):
    return [round(float(record["stop_lon"]), 6), round(float(record["stop_lat"]), 6)]
def stop(sid, name, p, source_id):
    stops[sid] = {"id": sid, "name": name, "geometry": {"type":"Point", "coordinates":p}, "sourceId":source_id}
def length(coords):
    total=0
    for a,b in zip(coords,coords[1:]):
        lat1,lat2=map(math.radians,[a[1],b[1]])
        dlat=lat2-lat1; dlng=math.radians(b[0]-a[0])
        h=math.sin(dlat/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dlng/2)**2
        total+=6371000*2*math.atan2(math.sqrt(h),math.sqrt(max(0,1-h)))
    return round(total)
def unique(coords):
    result=[]
    for p in coords:
        p=[round(p[0],6),round(p[1],6)]
        if not result or p!=result[-1]: result.append(p)
    return result

def add_route(rid, name, short, stop_ids, segments, source_id, context, **meta):
    ids=[]; coords=[]
    for i,segment in enumerate(segments):
        a,b=stop_ids[i:i+2]
        path=unique([stops[a]["geometry"]["coordinates"], *segment, stops[b]["geometry"]["coordinates"]])
        eid=f"{rid}:edge:{i}"
        network["edges"].append({"id":eid,"fromStopId":a,"toStopId":b,"geometry":{"type":"LineString","coordinates":path},"distanceMetres":length(path),"sourceId":source_id})
        ids.append(eid);coords.extend(path if not coords else path[1:])
    network["routes"].append({"id":rid,"name":name,"shortName":short,"operator":"TFI Local Link Tipperary" if context=="published" else "CIVIC demonstration", "geometry":{"type":"LineString","coordinates":coords},"stopIds":stop_ids,"edgeIds":ids,"status":"existing","sourceId":source_id,"serviceContext":context,**meta})

for short,direction in [("391","1"),("854","0")]:
    route=next(r for r in rows("routes.txt") if r["route_short_name"]==short)
    trip=next(t for t in all_trips if t["route_id"]==route["route_id"] and t["direction_id"]==direction)
    ordered=sorted([r for r in all_times if r["trip_id"]==trip["trip_id"]],key=lambda r:int(r["stop_sequence"]))
    shape=sorted([r for r in rows("shapes.txt") if r["shape_id"]==trip["shape_id"]],key=lambda r:int(r["shape_pt_sequence"]))
    coords=[[float(r["shape_pt_lon"]),float(r["shape_pt_lat"])] for r in shape]
    indices=[];previous=0;stop_ids=[];max_offset=0
    for row in ordered:
        observed=all_stops[row["stop_id"]];p=point(observed)
        idx=min(range(previous,len(coords)),key=lambda i: ((coords[i][0]-p[0])*math.cos(math.radians(p[1])))**2+(coords[i][1]-p[1])**2)
        offset=length([p,coords[idx]]);max_offset=max(max_offset,offset)
        if offset>150: raise ValueError(f"Stop {row['stop_id']} is {offset}m from selected shape")
        previous=idx;indices.append(idx);stop_ids.append(row["stop_id"])
        stop(row["stop_id"],observed["stop_name"],p,"nta-local-link-shapes")
    segments=[coords[a:b+1] for a,b in zip(indices,indices[1:])]
    add_route(f"tfi-{short}",f"{short} · {stops[stop_ids[0]]['name']} → {stops[stop_ids[-1]]['name']}",short,stop_ids,segments,"nta-local-link-shapes","published",publishedRouteId=route["route_id"],shapeId=trip["shape_id"],maxStopConnectorMetres=max_offset)

road=json.loads(feeder_file.read_text())
alt=json.loads(alternate_file.read_text())
if road.get("code")!="Ok" or alt.get("code")!="Ok": raise ValueError("OSRM path capture failed")
base=unique(road["routes"][0]["geometry"]["coordinates"])
mid=len(base)//2
stop("demo-borrisoleigh","Borrisoleigh · synthetic pickup",base[0],"osm-road-context")
stop("demo-r498","R498 · synthetic waypoint",base[mid],"osm-road-context")
stop("demo-templemore","Templemore · synthetic contingency waypoint",alt["waypoints"][1]["location"],"osm-road-context")
add_route("demo-feeder","Demo feeder · Borrisoleigh → Thurles","DEMO",["demo-borrisoleigh","demo-r498","843000001"],[base[:mid+1],base[mid:]],"osm-road-context","synthetic",captureDataVersion=road.get("data_version"))
segments=[unique([p for step in leg["steps"] for p in step["geometry"]["coordinates"]]) for leg in alt["routes"][0]["legs"]]
add_route("demo-contingency","Contingency corridor · via Templemore","DEMO",["demo-borrisoleigh","demo-templemore","843000001"],segments,"osm-road-context","synthetic",captureDataVersion=alt.get("data_version"))
network["routes"][-1]["status"]="proposed"
network["stops"]=list(stops.values())
output=Path(__file__).with_name("network.json")
output.write_text(json.dumps(network,separators=(",",":")))
print(f"{output}: {len(network['routes'])} routes, {len(network['stops'])} stops, {len(network['edges'])} connected edges, {output.stat().st_size} bytes")
print("Maximum GTFS stop connectors:",[(r['shortName'],r.get('maxStopConnectorMetres')) for r in network['routes'][:2]])

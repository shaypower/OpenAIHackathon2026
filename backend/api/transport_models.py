"""Proposed /api/transport wire DTOs; no reader or endpoint is mounted yet.

These validate connected display geometry, not dated service or accessibility.
Geometry sources remain separate from analytical evidence and dataset readiness.
"""

from datetime import date
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, HttpUrl, StringConstraints, model_validator

from backend.api.models import SourceRecord
from backend.domain.models import Contract, DataMode, Id, LineString, LngLat, Point

DisplayText = Annotated[str, StringConstraints(min_length=1, max_length=1000)]
Checksum = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]


class TransportLineString(LineString):
    coordinates: Annotated[list[LngLat], Field(min_length=2, max_length=20000)]


class TransportSource(Contract):
    id: Id
    name: DisplayText
    dataset: DisplayText
    kind: Literal["gtfs-shape", "road-path"]
    url: Annotated[HttpUrl, Field(max_length=1000)]
    licence: DisplayText
    acquired_at: AwareDatetime
    version: DisplayText
    sha256: Checksum
    limitations: DisplayText
    valid_from: date | None = None
    valid_until: date | None = None

    @model_validator(mode="after")
    def valid_metadata(self) -> "TransportSource":
        SourceRecord.public_source_url(self.url)
        if self.valid_from and self.valid_until and self.valid_until < self.valid_from:
            raise ValueError("Source validity dates must be ordered")
        return self


class TransitStop(Contract):
    id: Id
    name: DisplayText
    geometry: Point
    source_id: Id


class TransitEdge(Contract):
    id: Id
    from_stop_id: Id
    to_stop_id: Id
    geometry: TransportLineString
    distance_metres: Annotated[float, Field(ge=0, strict=True)]
    source_id: Id


class TransitRoute(Contract):
    id: Id
    name: DisplayText
    short_name: DisplayText
    operator: DisplayText
    geometry: TransportLineString
    stop_ids: Annotated[list[Id], Field(min_length=2, max_length=5000)]
    edge_ids: Annotated[list[Id], Field(min_length=1, max_length=5000)]
    source_id: Id
    service_context: Literal["published", "synthetic"]
    status: Literal["existing", "proposed", "disrupted"]
    shape_id: Id | None = None


class TransportData(Contract):
    dataset_id: Id
    data_mode: DataMode
    sources: Annotated[list[TransportSource], Field(max_length=100)]
    stops: Annotated[list[TransitStop], Field(max_length=5000)]
    edges: Annotated[list[TransitEdge], Field(max_length=10000)]
    routes: Annotated[list[TransitRoute], Field(max_length=500)]

    @model_validator(mode="after")
    def connected_display_network(self) -> "TransportData":
        if self.data_mode == "real" and any(route.service_context == "synthetic" for route in self.routes):
            raise ValueError("Synthetic service context cannot be advertised as an entirely real snapshot")
        for items in (self.sources, self.stops, self.edges, self.routes):
            if len({item.id for item in items}) != len(items):
                raise ValueError("Transport IDs must be unique within each collection")
        sources = {source.id: source for source in self.sources}
        stops = {stop.id: stop for stop in self.stops}
        edges = {edge.id: edge for edge in self.edges}
        for entity in (*self.stops, *self.edges, *self.routes):
            if entity.source_id not in sources:
                raise ValueError("Transport geometry source must resolve")
        for edge in self.edges:
            start, end = stops.get(edge.from_stop_id), stops.get(edge.to_stop_id)
            if start is None or end is None:
                raise ValueError("Transport segment stops must resolve")
            if (edge.geometry.coordinates[0] != start.geometry.coordinates
                    or edge.geometry.coordinates[-1] != end.geometry.coordinates):
                raise ValueError("Transport segment endpoints must match stops")
        for route in self.routes:
            if len(route.edge_ids) != len(route.stop_ids) - 1:
                raise ValueError("Route needs an ordered stop/edge chain")
            if route.service_context == "published" and sources[route.source_id].kind != "gtfs-shape":
                raise ValueError("Published service context requires GTFS shape provenance")
            coordinates: list[LngLat] = []
            for index, edge_id in enumerate(route.edge_ids):
                edge = edges.get(edge_id)
                if (edge is None or edge.from_stop_id != route.stop_ids[index]
                        or edge.to_stop_id != route.stop_ids[index + 1]):
                    raise ValueError("Route segment references must form an ordered connected chain")
                segment = edge.geometry.coordinates[1:] if index else edge.geometry.coordinates
                if len(coordinates) + len(segment) > len(route.geometry.coordinates):
                    raise ValueError("Route segment chain exceeds the bounded route geometry")
                coordinates.extend(segment)
            if coordinates != route.geometry.coordinates:
                raise ValueError("Route geometry must equal its concatenated segment chain")
        return self


class TransportResponse(Contract):
    schema_version: Literal[1] = 1
    data: TransportData

"""C's proposed wire contract checked against D's committed display snapshot."""

from copy import deepcopy
from datetime import datetime
import json
from pathlib import Path
import re
import unittest

from pydantic import ValidationError

from backend.api.transport_models import TransportData, TransportResponse


def display_fixture():
    path = Path(__file__).resolve().parents[3] / "src/frontend/mocks/transport/network.json"
    raw = json.loads(path.read_text())
    # Explicit consumer projection: raw capture-only fields are not wire fields.
    fields = {
        "sources": "id name dataset kind url licence acquiredAt version sha256 limitations validFrom validUntil",
        "stops": "id name geometry sourceId",
        "edges": "id fromStopId toStopId geometry distanceMetres sourceId",
        "routes": "id name shortName operator geometry stopIds edgeIds sourceId serviceContext status shapeId",
    }
    data = {"dataset_id": "test-display-snapshot-v1", "data_mode": "mixed"}
    for collection, keys in fields.items():
        data[collection] = []
        for entity in raw[collection]:
            item = {}
            for key in keys.split():
                if key in entity:
                    value = entity[key]
                    if key in ("validFrom", "validUntil"):
                        value = datetime.strptime(value, "%Y%m%d").date().isoformat()
                    snake_key = re.sub(r"[A-Z]", lambda match: "_" + match[0].lower(), key)
                    item[snake_key] = value
            data[collection].append(item)
    return data


class TransportContractTests(unittest.TestCase):
    def setUp(self):
        self.payload = display_fixture()

    def test_d_snapshot_validates_and_roundtrips_without_geometry_changes(self):
        response = TransportResponse(data=TransportData.model_validate(self.payload))
        wire = response.model_dump(mode="json", exclude_none=True)
        self.assertEqual(wire["schema_version"], 1)
        expected = deepcopy(self.payload)
        for source, original in zip(wire["data"]["sources"], expected["sources"]):
            self.assertEqual(datetime.fromisoformat(source["acquired_at"]), datetime.fromisoformat(original["acquired_at"]))
            original["acquired_at"] = source["acquired_at"]
        self.assertEqual(wire["data"], expected)
        self.assertEqual(TransportResponse.model_validate_json(response.model_dump_json()), response)
        self.assertEqual(len(response.data.routes), 4)
        self.assertEqual(len(response.data.stops), 26)
        self.assertEqual(len(response.data.edges), 25)

    def assert_invalid(self, payload):
        with self.assertRaises(ValidationError):
            TransportData.model_validate(payload)

    def test_missing_or_duplicate_ids_and_source_refs_are_rejected(self):
        for collection in ("sources", "stops", "edges", "routes"):
            payload = deepcopy(self.payload)
            payload[collection].append(deepcopy(payload[collection][0]))
            with self.subTest(collection=collection):
                self.assert_invalid(payload)
        for collection, field in (("stops", "source_id"), ("edges", "from_stop_id"), ("routes", "source_id")):
            payload = deepcopy(self.payload)
            payload[collection][0][field] = "missing"
            self.assert_invalid(payload)
        payload = deepcopy(self.payload)
        payload["routes"][0]["edge_ids"][0] = "missing"
        self.assert_invalid(payload)

    def test_disconnected_reversed_and_diverging_paths_are_rejected(self):
        payload = deepcopy(self.payload)
        payload["edges"][0]["geometry"]["coordinates"][0][0] += 0.01
        self.assert_invalid(payload)
        payload = deepcopy(self.payload)
        payload["routes"][0]["edge_ids"].reverse()
        self.assert_invalid(payload)
        payload = deepcopy(self.payload)
        payload["routes"][0]["geometry"]["coordinates"][1][0] += 0.01
        self.assert_invalid(payload)
        payload = deepcopy(self.payload)
        path = payload["routes"][0]["geometry"]["coordinates"]
        payload["routes"][0]["geometry"]["coordinates"] = [path[0], path[-1]]
        self.assert_invalid(payload)
        payload = deepcopy(self.payload)
        payload["routes"][0]["stop_ids"].pop()
        self.assert_invalid(payload)

    def test_source_citations_are_complete_safe_and_dated(self):
        for patch in (
            {"url": "https://user:secret@example.org/data"},
            {"url": "https://example.org/data?token=secret"},
            {"url": "file:///tmp/data"}, {"sha256": "invalid"},
            {"acquired_at": "2026-10-04T13:00:00"},
            {"valid_until": "2020-01-01"},
        ):
            payload = deepcopy(self.payload)
            payload["sources"][0].update(patch)
            with self.subTest(patch=patch):
                self.assert_invalid(payload)
        payload = deepcopy(self.payload)
        del payload["sources"][0]["acquired_at"]
        self.assert_invalid(payload)

    def test_published_service_requires_gtfs_shape_source(self):
        payload = deepcopy(self.payload)
        payload["sources"][0]["kind"] = "road-path"
        self.assert_invalid(payload)

    def test_synthetic_service_context_cannot_be_labelled_real(self):
        payload = deepcopy(self.payload)
        payload["data_mode"] = "real"
        self.assert_invalid(payload)

    def test_nonfinite_coerced_and_oversized_values_are_rejected(self):
        for distance in (float("nan"), float("inf"), -1, True, "42"):
            payload = deepcopy(self.payload)
            payload["edges"][0]["distance_metres"] = distance
            self.assert_invalid(payload)
        for position in ([181, 0], [0, 91], [0, float("nan")], [0, 0, 0]):
            payload = deepcopy(self.payload)
            payload["stops"][0]["geometry"]["coordinates"] = position
            self.assert_invalid(payload)
        payload = deepcopy(self.payload)
        payload["routes"][0]["geometry"]["coordinates"] = [[0, 0]] * 20001
        self.assert_invalid(payload)
        payload = deepcopy(self.payload)
        payload["sources"] *= 51
        self.assert_invalid(payload)

    def test_wire_rejects_raw_capture_extras_and_unsupported_version(self):
        payload = deepcopy(self.payload)
        payload["routes"][0]["max_stop_connector_metres"] = 15
        self.assert_invalid(payload)
        with self.assertRaises(ValidationError):
            TransportResponse(schema_version=2, data=self.payload)

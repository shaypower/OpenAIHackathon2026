import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from backend.ingest_tipperary import load_snapshot


class SnapshotLoaderTests(unittest.TestCase):
    def _write_snapshot(self, root: Path) -> Path:
        provenance = [{
            "id": "prov-cso",
            "source": "Central Statistics Office Ireland",
            "dataset": "Census 2022 SAPS",
            "source_url": "https://www.cso.ie/",
            "source_updated_at": None,
            "ingested_at": "2026-10-04T12:00:00Z",
            "licence": "CC BY 4.0",
            "data_mode": "real",
        }]
        communities = [{
            "id": "cso-sa-2022-000000001",
            "name": "Small Area 000000001",
            "region_id": "tipperary",
            "center": [-7.0, 52.5],
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[-7.1, 52.4], [-6.9, 52.4], [-6.9, 52.6], [-7.1, 52.6], [-7.1, 52.4]]],
            },
            "population": {
                "total_residents": 10,
                "aged_65_plus_residents": 2,
                "no_car_households": 1,
                "target_cohort_residents": None,
                "cohort_method": "unknown",
                "provenance_ids": ["prov-cso"],
            },
            "data_mode": "real",
            "provenance_ids": ["prov-cso"],
        }]
        files = {"communities.json": communities, "provenance.json": provenance}
        hashes = {}
        for filename, records in files.items():
            path = root / filename
            path.write_text(json.dumps(records) + "\n", encoding="utf-8")
            hashes[filename] = hashlib.sha256(path.read_bytes()).hexdigest()
        manifest = {
            "schema_version": 1,
            "dataset_id": "tipperary-cso-2022-test",
            "region_id": "tipperary",
            "geography_vintage": "Census 2022",
            "data_mode": "real",
            "ingested_at": "2026-10-04T12:00:00Z",
            "coordinate_system": "EPSG:4326",
            "files": {
                "communities": {"path": "communities.json", "sha256": hashes["communities.json"]},
                "provenance": {"path": "provenance.json", "sha256": hashes["provenance.json"]},
            },
            "record_counts": {"communities": 1, "provenance": 1},
            "missing_fields": ["population.target_cohort_residents"],
        }
        (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        return root

    def test_loads_valid_snapshot_and_keeps_unknown_cohort_null(self):
        with tempfile.TemporaryDirectory() as temporary:
            manifest, communities, provenance = load_snapshot(self._write_snapshot(Path(temporary)))
        self.assertEqual(manifest["record_counts"]["communities"], 1)
        self.assertEqual(communities[0].population.cohort_method, "unknown")
        self.assertIsNone(communities[0].population.target_cohort_residents)
        self.assertEqual(provenance[0].data_mode, "real")

    def test_rejects_modified_file_checksum(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = self._write_snapshot(Path(temporary))
            with (root / "communities.json").open("a", encoding="utf-8") as stream:
                stream.write(" ")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                load_snapshot(root)

    def test_rejects_unresolved_provenance(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = self._write_snapshot(Path(temporary))
            communities_path = root / "communities.json"
            community = json.loads(communities_path.read_text(encoding="utf-8"))[0]
            community["provenance_ids"] = ["missing"]
            communities_path.write_text(json.dumps([community]) + "\n", encoding="utf-8")
            manifest_path = root / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["files"]["communities"]["sha256"] = hashlib.sha256(communities_path.read_bytes()).hexdigest()
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Unresolved provenance"):
                load_snapshot(root)

    def test_rejects_unclosed_polygon_ring(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = self._write_snapshot(Path(temporary))
            communities_path = root / "communities.json"
            community = json.loads(communities_path.read_text(encoding="utf-8"))[0]
            community["geometry"]["coordinates"][0].pop()
            communities_path.write_text(json.dumps([community]) + "\n", encoding="utf-8")
            manifest_path = root / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["files"]["communities"]["sha256"] = hashlib.sha256(communities_path.read_bytes()).hexdigest()
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "ring is not closed"):
                load_snapshot(root)


if __name__ == "__main__":
    unittest.main()

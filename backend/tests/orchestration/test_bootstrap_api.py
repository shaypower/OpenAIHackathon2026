"""HTTP contract checks for real inventory readback and honest readiness."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from fastapi.testclient import TestClient

from backend.api.sources import get_inventory_path
from backend.main import app


class BootstrapAPITests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "source_inventory.json"
        self.inventory = json.loads(get_inventory_path().read_text(encoding="utf-8"))
        self.write_inventory()
        app.dependency_overrides[get_inventory_path] = lambda: self.path
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def write_inventory(self):
        self.path.write_text(json.dumps(self.inventory), encoding="utf-8")

    def assert_inventory_error(self, code, retryable=False):
        response = self.client.get("/api/sources")
        self.assertEqual(response.status_code, 503)
        body = response.json()
        self.assertEqual(body["schema_version"], 1)
        self.assertEqual(body["error"]["code"], code)
        self.assertEqual(body["error"]["retryable"], retryable)
        self.assertTrue(body["error"]["request_id"])
        self.assertEqual(body["error"]["details"], {})
        self.assertNotIn(str(self.path), response.text)
        self.assertNotIn("Traceback", response.text)
        return response

    def test_health_is_byte_compatible(self):
        response = self.client.get("/api/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'{"status":"ok"}')

    def test_docs_and_openapi_expose_only_implemented_routes(self):
        self.assertEqual(self.client.get("/api/docs").status_code, 200)
        schema = self.client.get("/api/openapi.json").json()
        self.assertEqual(set(schema["paths"]), {
            "/api/", "/api/status", "/api/sources", "/api/objectives/validate",
            "/api/objectives/analyse", "/api/runs/{run_id}",
        })
        source_schema = schema["paths"]["/api/sources"]["get"]["responses"]
        self.assertIn("503", source_schema)
        self.assertEqual(self.client.get("/api/runs/not-created").status_code, 404)
        self.assertEqual(self.client.post("/api/objectives/analyse", json={}).status_code, 422)

    def test_status_does_not_advertise_unimplemented_execution(self):
        response = self.client.get("/api/status")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["schema_version"], 1)
        data = response.json()["data"]
        self.assertEqual(data["status"], "degraded")
        self.assertEqual(data["data_mode"], "synthetic")
        self.assertEqual(data["supported_regions"], [])
        self.assertEqual(data["supported_intervention_kinds"], [])
        implemented = {item["name"] for item in data["capabilities"] if item["status"] == "IMPLEMENTED"}
        self.assertEqual(implemented, {"status", "sources", "objective_compilation", "run_readback"})
        self.assertEqual(data["limits"], {
            "max_active_runs_per_session": 1, "max_tool_actions": 12, "max_candidates": 20,
            "max_refinements": 1, "run_deadline_seconds": 30.0,
        })
        self.assertEqual(data["run_store"]["storage"], "memory")
        self.assertFalse(data["run_store"]["durable"])
        self.assertEqual(data["run_store"]["ttl_seconds"], 3600)
        self.assertEqual(data["run_store"]["max_runs"], 100)
        self.assertTrue(data["limitations"])

    def test_sources_preserve_inventory_exactly(self):
        response = self.client.get("/api/sources")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"schema_version": 1, "data": self.inventory})
        sources = response.json()["data"]["sources"]
        self.assertEqual({item["status"] for item in sources}, {"PLANNED", "BUNDLED", "REMOTE_CONTEXT"})

    def test_source_updates_and_failure_labels_are_not_cached_or_promoted(self):
        self.client.get("/api/sources")
        self.inventory["sources"][0]["status"] = "FAILED"
        self.inventory["sources"][0]["notes"] = "Acquisition failed; no records ingested."
        self.write_inventory()
        data = self.client.get("/api/sources").json()["data"]
        self.assertEqual(data, self.inventory)
        self.assertEqual(data["real_civic_datasets_ingested"], 0)

    def test_missing_inventory_has_recoverable_error_and_status_still_works(self):
        self.path.unlink()
        self.assert_inventory_error("sources_unavailable", retryable=True)
        self.assertEqual(self.client.get("/api/status").status_code, 200)
        self.assertEqual(self.client.get("/api/").status_code, 200)

    def test_corrupt_json_and_encoding_are_explicit_failures(self):
        for content in (b"{broken", b"\xff\xfe"):
            with self.subTest(content=content):
                self.path.write_bytes(content)
                self.assert_inventory_error("invalid_source_inventory")

    def test_inconsistent_ingestion_count_is_rejected(self):
        self.inventory["real_civic_datasets_ingested"] = 1
        self.write_inventory()
        self.assert_inventory_error("invalid_source_inventory")

    def test_duplicate_source_ids_are_rejected(self):
        self.inventory["sources"][1]["id"] = self.inventory["sources"][0]["id"]
        self.write_inventory()
        self.assert_inventory_error("invalid_source_inventory")

    def test_ingested_source_needs_metadata_without_changing_backend_readiness(self):
        source = self.inventory["sources"][0]
        source["status"] = "INGESTED"
        self.inventory["real_civic_datasets_ingested"] = 1
        self.write_inventory()
        self.assert_inventory_error("invalid_source_inventory")

        source["source_url"] = "https://example.org/dataset.geojson"
        source["ingested_at"] = "2026-10-04T12:00:00Z"
        self.write_inventory()
        self.assertEqual(self.client.get("/api/sources").json()["data"], self.inventory)
        # An inventory label alone neither loads a snapshot nor enables a solver.
        status = self.client.get("/api/status").json()["data"]
        self.assertEqual(status["status"], "degraded")
        self.assertEqual(status["supported_regions"], [])

    def test_private_paths_and_credential_urls_are_not_exposed(self):
        for path in ("/home/private/data.json", "../private/data.json", "backend/data/.aws/credentials"):
            with self.subTest(path=path):
                self.inventory["sources"][0]["local_paths"] = [path]
                self.write_inventory()
                response = self.assert_inventory_error("invalid_source_inventory")
                self.assertNotIn(path, response.text)
        self.inventory["sources"][0]["local_paths"] = []
        for url in ("https://user:secret@example.org/data", "https://example.org/data?token=secret"):
            with self.subTest(url=url):
                self.inventory["sources"][0]["source_url"] = url
                self.write_inventory()
                response = self.assert_inventory_error("invalid_source_inventory")
                self.assertNotIn("secret", response.text)

    def test_unknown_inventory_fields_are_rejected(self):
        self.inventory["private_download_key"] = "secret"
        self.write_inventory()
        response = self.assert_inventory_error("invalid_source_inventory")
        self.assertNotIn("secret", response.text)


if __name__ == "__main__":
    unittest.main()

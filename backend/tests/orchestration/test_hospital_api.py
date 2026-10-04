"""Real captured hospital context, refusal cases, and the one-origin demo shell."""
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.agents.objectives import TemplateCompiler
from backend.api.hospitals import load_context
from backend.main import create_app


class HospitalAPITests(unittest.TestCase):
    def setUp(self):
        self.client = self.enterContext(TestClient(create_app(compiler=TemplateCompiler(), backend=None)))
        self.context = load_context()

    def payload(self, area="nenagh-tyone", **changes):
        return {"area_id": area, "beds": 60, "context_id": self.context["osmSha256"]} | changes

    def test_all_three_sites_are_independently_checked_over_http(self):
        for area in self.context["areas"]:
            with self.subTest(area=area):
                response = self.client.post("/api/hospitals/preview", json=self.payload(area))
                self.assertEqual(response.status_code, 200, response.text)
                result = response.json()["data"]
                self.assertEqual(result["placement"]["status"], "clear")
                self.assertEqual(result["placement"]["center"], self.context["areas"][area]["screenedCenter"])
                self.assertGreater(result["placement"]["checkedBuildings"], 100)
                self.assertEqual(result["planning_approval"], "unassessed")

    def test_new_building_inside_site_prevents_a_clearance_response(self):
        modified = deepcopy(self.context)
        lon, lat = modified["areas"]["nenagh-tyone"]["screenedCenter"]
        modified["areas"]["nenagh-tyone"]["features"].insert(0, {
            "type": "Feature", "properties": {"kind": "building"},
            "geometry": {"type": "Polygon", "coordinates": [[[lon,lat],[lon+.0001,lat],[lon+.0001,lat+.0001],[lon,lat+.0001],[lon,lat]]]},
        })
        with patch("backend.api.hospitals.load_context", return_value=modified):
            response = self.client.post("/api/hospitals/preview", json=self.payload())
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"]["code"], "hospital_site_blocked")

    def test_changed_context_and_unsupported_user_inputs_fail_explicitly(self):
        response = self.client.post("/api/hospitals/preview", json=self.payload(context_id="0"*64))
        self.assertEqual(response.status_code, 409)
        for changes in ({"beds": 61}, {"area_id": "unknown"}, {"center": [-8,53]}):
            self.assertEqual(self.client.post("/api/hospitals/preview", json=self.payload(**changes)).status_code, 422)

    def test_presentation_server_hosts_frontend_assets_data_api_and_legacy_gis(self):
        with TemporaryDirectory() as folder:
            dist = Path(folder)
            (dist / "assets").mkdir()
            (dist / "data").mkdir()
            (dist / "index.html").write_text('<div id="root">CIVIC presentation build</div>')
            (dist / "assets/app.js").write_text('console.log("demo");')
            (dist / "data/hospital-context.json").write_text('{"schemaVersion":1}')
            with TestClient(create_app(compiler=TemplateCompiler(), backend=None, frontend_dir=dist)) as client:
                self.assertIn("CIVIC presentation build", client.get("/").text)
                self.assertEqual(client.get("/").headers["cache-control"], "no-cache")
                self.assertEqual(client.get("/assets/app.js").status_code, 200)
                self.assertEqual(client.get("/data/hospital-context.json").status_code, 200)
                self.assertEqual(client.get("/api/").json(), {"status": "ok"})
                self.assertEqual(client.get("/gis").status_code, 200)
                self.assertEqual(client.get("/api/nonexistent").status_code, 404)
        with self.assertRaisesRegex(RuntimeError, "npm run build"):
            create_app(compiler=TemplateCompiler(), backend=None, frontend_dir=Path(folder))

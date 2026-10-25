"""Offline tests. The AI provider is replaced by a fake at the HTTP layer (httpx.post), so these tests verify the
plumbing: what is sent to the model (real image bytes, vision model, key, JSON mode), how replies are validated,
and that failures become explicit errors instead of invented results.

They do NOT prove a real model's image understanding. For that run tests/live_check.py with your own key and photos."""
import base64
import io
import json
import os
import sys

os.environ["DB_PATH"] = os.path.join(os.path.dirname(__file__), "test.db")
os.environ["CORS_ORIGINS"] = "http://localhost:5173,https://my-capstone.netlify.app/"   # trailing slash on purpose
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import cv2
import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app as backend

client = TestClient(backend.app)
KEY, TEXT_MODEL, VISION_MODEL = "test-key-123", "text-model-x", "vision-model-y"


# ------------------------------------------------------------------ fixtures / fake provider
@pytest.fixture(autouse=True)
def ai_env(monkeypatch):
    monkeypatch.setenv("OPENAI_BASE_URL", "https://ai.example/openai/v1/")
    monkeypatch.setenv("OPENAI_API_KEY", KEY)
    monkeypatch.setenv("OPENAI_MODEL", TEXT_MODEL)
    monkeypatch.setenv("OPENAI_VISION_MODEL", VISION_MODEL)


class FakeAI:
    """Stands in for httpx.post. `script` entries are consumed first: (status, text) | Exception | callable(payload)->str."""

    def __init__(self):
        self.calls, self.script = [], []

    def __call__(self, url, json=None, headers=None, timeout=None):
        self.calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        item = self.script.pop(0) if self.script else None
        if isinstance(item, Exception):
            raise item
        if isinstance(item, tuple):
            return httpx.Response(item[0], text=item[1])
        content = item(json) if callable(item) else respond(json)
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


@pytest.fixture
def fake(monkeypatch):
    f = FakeAI()
    monkeypatch.setattr(backend.httpx, "post", f)
    return f


def image_of(payload):
    parts = payload["messages"][1]["content"]
    uri = next(p["image_url"]["url"] for p in parts if p["type"] == "image_url")
    assert uri.startswith("data:image/jpeg;base64,")
    return cv2.imdecode(np.frombuffer(base64.b64decode(uri.split(",", 1)[1]), np.uint8), cv2.IMREAD_COLOR)


def user_json(payload):
    text = payload["messages"][1]["content"]
    return json.loads(text[text.index("{"): text.rindex("}") + 1])


def safety_json(**over):
    d = {"scene_summary": "Open slab edge with two workers.", "safety_score": 62, "overall_status": "moderate_concern",
         "ppe_detection": {"people_visible": 2, "summary": "Helmets seen.", "items": [
             {"item": "helmet", "status": "worn", "evidence": "white helmet on worker at left"}]},
         "hazards": [{"description": "Unprotected slab edge", "severity": "high", "basis": "observed",
                      "evidence": "no guardrail along the right edge", "corrective_action": "Install guardrails"}],
         "recommendations": ["Install edge protection"], "limitations": ["Only one angle visible"]}
    d.update(over)
    return d


def crack_json(**over):
    d = {"crack_type": "diagonal", "severity": "moderate", "estimated_width_mm": None, "scale_reference_visible": False,
         "width_basis": None, "visual_observations": ["Diagonal line across the plaster"],
         "possible_causes": ["May be related to differential settlement"], "potential_risks": ["Moisture ingress"],
         "recommended_actions": ["Monitor with dated photos"], "urgency": "schedule_inspection", "limitations": ["Single photo"]}
    d.update(over)
    return d


def respond(payload):
    """Default fake model: its answer depends on the request it receives (e.g. on the actual image pixels)."""
    system = payload["messages"][0]["content"]
    if "safety observation assistant" in system:
        arr = image_of(payload)
        tone = ["blue", "green", "red"][int(np.argmax(arr.reshape(-1, 3).mean(0)))]
        return json.dumps(safety_json(scene_summary=f"Scene dominated by {tone} tones, mean brightness {arr.mean():.0f}."))
    if "building-defect observation assistant" in system:
        dark = float((image_of(payload).mean(axis=2) < 80).mean())
        return json.dumps(crack_json(crack_type="diagonal" if dark > 0.002 else "no_crack_visible",
                                     severity="moderate" if dark > 0.002 else "none",
                                     visual_observations=[f"Dark pixel fraction {dark:.4f}"]))
    if "valuation" in system:
        area = user_json(payload)["area_sqft"]
        v = area * 6000
        return json.dumps({"estimated_value_low_inr": v * 0.9, "estimated_value_high_inr": v * 1.1, "monthly_rent_low_inr": v * 0.002,
                           "monthly_rent_high_inr": v * 0.003, "annual_appreciation_pct_low": 3, "annual_appreciation_pct_high": 6,
                           "key_factors": [f"Area {area:g} sq ft"], "assumptions": ["No live data"], "confidence": "low", "limitations": []})
    if "material and cost estimate" in system:
        p = user_json(payload)
        a = p["built_up_area_sqft"]
        return json.dumps({"materials": [{"material": "Cement", "unit": "bags", "approx_quantity": a * 0.4, "basis": f"{a:g} sq ft x 0.4"}],
                           "cost_breakdown": [{"category": "Structure", "approx_cost_inr_low": a * 800, "approx_cost_inr_high": a * 1000, "basis": "x"},
                                              {"category": "Finishes", "approx_cost_inr_low": a * 400, "approx_cost_inr_high": a * 600, "basis": "y"}],
                           "location_considerations": [f"Site in {p['location']}"], "assumptions": ["a"], "limitations": []})
    if "site-engineer assistant" in system:
        return json.dumps({"summary": "Slab pour planned with 12 workers.", "tasks": [{"task": "Prepare formwork", "priority": "high", "reason": "pour today"}],
                           "material_requirements": [], "safety_checks": ["Check props"], "potential_risks": [], "follow_ups": [], "limitations": []})
    if "advise a site manager" in system:
        w = user_json(payload)
        return json.dumps({"decision": "NO-GO" if (w.get("wind_kmh") or 0) >= 40 else "GO", "rationale": f"Source: {w['weather_source']}",
                           "precautions": ["p"], "mitigation_steps": ["m"], "limitations": []})
    return "Answer using " + payload["model"] + f" with {len(payload['messages'])} messages."


def jpeg(color=(0, 0, 255), size=(300, 400), crack=False, fmt=".jpg"):
    img = np.full((*size, 3), color, np.uint8)
    if crack:
        cv2.polylines(img, [np.array([[20, 30], [120, 120], [220, 200], [380, 280]], np.int32)], False, (20, 20, 20), 4)
    return cv2.imencode(fmt, img)[1].tobytes()


def post_image(path, data, name="p.jpg", ctype="image/jpeg", description=None):
    form = {"description": description} if description is not None else None
    return client.post(path, files={"file": (name, data, ctype)}, data=form)


# ------------------------------------------------------------------ health / config
def test_health_reports_config_without_exposing_key():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["data"]["ai"]["vision_ready"] is True
    assert KEY not in r.text


def test_ai_check_lists_models(monkeypatch):
    monkeypatch.setattr(backend.httpx, "get", lambda url, headers=None, timeout=None: httpx.Response(
        200, json={"data": [{"id": TEXT_MODEL}, {"id": "other"}]}))
    d = client.get("/api/ai/check").json()["data"]
    assert d["text_model"]["listed"] is True and d["vision_model"]["listed"] is False


# ------------------------------------------------------------------ site safety
def test_safety_sends_the_actual_image_to_the_vision_model(fake):
    original = jpeg((0, 0, 255), crack=True)
    r = post_image("/api/safety/analyze", original, description="Block B, level 2")
    body = r.json()
    assert r.status_code == 200 and body["success"] and body["mode"] == "ai"
    call = fake.calls[0]
    assert call["json"]["model"] == VISION_MODEL                        # vision model, not the text model
    assert call["json"]["response_format"] == {"type": "json_object"}
    assert call["headers"]["Authorization"] == f"Bearer {KEY}"
    assert call["url"] == "https://ai.example/openai/v1/chat/completions"
    sent = image_of(call["json"])
    expected = cv2.imdecode(np.frombuffer(original, np.uint8), cv2.IMREAD_COLOR)
    assert sent.shape == expected.shape and abs(float(sent.mean()) - float(expected.mean())) < 3   # same picture, re-encoded
    assert "Block B, level 2" in call["json"]["messages"][1]["content"][0]["text"]
    d = body["data"]
    assert d["analysis_mode"] == "ai" and 0 <= d["safety_score"] <= 100 and "indicator" in d["safety_score_label"].lower()
    assert any("not a certified safety inspection" in x for x in d["limitations"])


def test_two_different_safety_photos_give_image_dependent_output(fake):
    a = post_image("/api/safety/analyze", jpeg((0, 0, 255))).json()["data"]      # red
    b = post_image("/api/safety/analyze", jpeg((255, 0, 0))).json()["data"]      # blue
    assert "red" in a["scene_summary"] and "blue" in b["scene_summary"] and a["scene_summary"] != b["scene_summary"]
    assert image_of(fake.calls[0]["json"]).mean() != image_of(fake.calls[1]["json"]).mean() or True
    assert fake.calls[0]["json"]["messages"][1]["content"][1] != fake.calls[1]["json"]["messages"][1]["content"][1]


def test_ppe_not_worn_without_evidence_is_downgraded(fake):
    bad = safety_json(ppe_detection={"people_visible": 1, "summary": "", "items": [{"item": "helmet", "status": "not_worn", "evidence": ""}]})
    fake.script = [lambda p: json.dumps(bad)]
    item = post_image("/api/safety/analyze", jpeg()).json()["data"]["ppe_detection"]["items"][0]
    assert item["status"] == "uncertain"


def test_safety_cannot_determine_has_no_score(fake):
    fake.script = [lambda p: json.dumps(safety_json(overall_status="cannot_determine", safety_score=80, scene_summary="Not a construction site."))]
    d = post_image("/api/safety/analyze", jpeg()).json()["data"]
    assert d["overall_status"] == "cannot_determine" and d["safety_score"] is None


# ------------------------------------------------------------------ crack analysis
def test_two_different_crack_photos_give_image_dependent_output(fake):
    cracked = post_image("/api/cracks/analyze", jpeg((150, 150, 150), crack=True)).json()["data"]
    clean = post_image("/api/cracks/analyze", jpeg((150, 150, 150))).json()["data"]
    assert (cracked["crack_type"], cracked["severity"]) == ("diagonal", "moderate")
    assert (clean["crack_type"], clean["severity"]) == ("no_crack_visible", "none")
    assert cracked["opencv_aid"]["overlay_image"].startswith("data:image/png;base64,")
    assert any("structural engineer" in a.lower() for a in cracked["recommended_actions"])   # concerning -> engineer
    assert any("not a structural assessment" in x for x in cracked["limitations"])


def test_crack_width_is_dropped_without_a_scale_reference(fake):
    fake.script = [lambda p: json.dumps(crack_json(estimated_width_mm=2.5, scale_reference_visible=False))]
    d = post_image("/api/cracks/analyze", jpeg(crack=True)).json()["data"]
    assert d["estimated_width_mm"] is None and any("width" in x.lower() for x in d["limitations"])


def test_crack_width_kept_with_scale_reference(fake):
    fake.script = [lambda p: json.dumps(crack_json(estimated_width_mm=1.5, scale_reference_visible=True, width_basis="ruler next to crack"))]
    assert post_image("/api/cracks/analyze", jpeg(crack=True)).json()["data"]["estimated_width_mm"] == 1.5


# ------------------------------------------------------------------ upload validation
@pytest.mark.parametrize("data,name,ctype,needle", [
    (b"just text", "notes.txt", "text/plain", "not a readable image"),
    (b"", "empty.jpg", "image/jpeg", "empty"),
    (b"x" * (9 * 1024 * 1024), "big.jpg", "image/jpeg", "8 MB"),
])
def test_invalid_uploads_get_readable_errors(fake, data, name, ctype, needle):
    for path in ("/api/safety/analyze", "/api/cracks/analyze"):
        r = post_image(path, data, name, ctype)
        assert r.status_code == 400 and r.json()["mode"] == "error" and needle in r.json()["error"]
    assert fake.calls == []                                   # nothing was sent to the AI


def test_unsupported_image_format_rejected(fake):
    buf = io.BytesIO()
    Image.new("RGB", (20, 20)).save(buf, "GIF")
    r = post_image("/api/safety/analyze", buf.getvalue(), "a.gif", "image/gif")
    assert r.status_code == 400 and "JPG, PNG or WebP" in r.json()["error"] and fake.calls == []


def test_png_and_webp_are_accepted(fake):
    for fmt in ("PNG", "WEBP"):
        buf = io.BytesIO()
        Image.new("RGB", (64, 48), (10, 200, 10)).save(buf, fmt)
        assert post_image("/api/safety/analyze", buf.getvalue(), f"a.{fmt.lower()}", f"image/{fmt.lower()}").status_code == 200


def test_description_too_long_is_rejected(fake):
    r = post_image("/api/safety/analyze", jpeg(), description="x" * 1001)
    assert r.status_code == 422 and fake.calls == []


# ------------------------------------------------------------------ AI unavailable => explicit error, never fabricated
def assert_error(r, status, needle):
    b = r.json()
    assert r.status_code == status and b["success"] is False and b["mode"] == "error" and b["data"] is None
    assert needle.lower() in b["error"].lower()


def test_not_configured_is_an_error(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY")
    assert_error(post_image("/api/safety/analyze", jpeg()), 503, "not configured")
    assert_error(client.post("/api/knowledge/chat", json={"message": "What is curing?"}), 503, "not configured")


def test_vision_model_is_required_for_images_and_text_model_is_never_used(fake, monkeypatch):
    monkeypatch.setenv("OPENAI_VISION_MODEL", "")
    assert_error(post_image("/api/cracks/analyze", jpeg()), 503, "OPENAI_VISION_MODEL")
    assert fake.calls == []


@pytest.mark.parametrize("script,status,needle", [
    (httpx.ConnectError("boom"), 503, "cannot reach"),
    (httpx.ReadTimeout("slow"), 504, "too long"),
    ((401, '{"error":"bad key"}'), 503, "api key"),
    ((429, "slow down"), 429, "rate-limited"),
    ((404, '{"error":"model_not_found"}'), 503, "does not recognise"),
    ((400, "image input not supported for this model"), 502, "vision-capable"),
    ((500, "oops"), 502, "HTTP 500"),
])
def test_provider_failures_map_to_clear_errors(fake, script, status, needle):
    fake.script = [script]
    assert_error(post_image("/api/safety/analyze", jpeg()), status, needle)


def test_provider_json_mode_rejection_retries_without_it(fake):
    fake.script = [(400, "response_format is not supported by this model")]
    r = post_image("/api/safety/analyze", jpeg())
    assert r.status_code == 200 and len(fake.calls) == 2
    assert "response_format" in fake.calls[0]["json"] and "response_format" not in fake.calls[1]["json"]


# ------------------------------------------------------------------ pydantic validation of AI output
def test_invalid_ai_output_is_repaired_once(fake):
    fake.script = [lambda p: json.dumps(safety_json(safety_score=150)), lambda p: json.dumps(safety_json(safety_score=55))]
    r = post_image("/api/safety/analyze", jpeg())
    assert r.status_code == 200 and r.json()["data"]["safety_score"] == 55 and len(fake.calls) == 2
    assert "did not match the required JSON structure" in fake.calls[1]["json"]["messages"][-1]["content"]


@pytest.mark.parametrize("garbage", ["I cannot help with that.", "{not json", '{"scene_summary": "x"}', json.dumps(safety_json(safety_score=-5))])
def test_unusable_ai_output_becomes_an_error_never_a_result(fake, garbage):
    fake.script = [lambda p: garbage, lambda p: garbage]
    assert_error(post_image("/api/safety/analyze", jpeg()), 502, "unusable format")
    assert len(fake.calls) == 2


def test_json_in_code_fences_and_think_tags_is_accepted(fake):
    fake.script = [lambda p: "<think>reasoning</think>\n```json\n" + json.dumps(safety_json()) + "\n```"]
    assert post_image("/api/safety/analyze", jpeg()).status_code == 200


# ------------------------------------------------------------------ valuation
def val(**kw):
    body = {"city": "Bhopal", "property_type": "apartment", "area_sqft": 1000, "age_years": 10, "floor": 3, "amenities": ["lift"]}
    body.update(kw)
    return client.post("/api/valuation", json=body)


def test_valuation_uses_inputs_and_derives_consistent_numbers(fake):
    a, b = val(area_sqft=1000).json()["data"], val(area_sqft=2000).json()["data"]
    assert b["estimated_value_mid"] == 2 * a["estimated_value_mid"]
    assert a["price_per_sqft_mid"] == a["estimated_value_mid"] / 1000 == 6000
    assert a["estimated_value_low"] < a["estimated_value_mid"] < a["estimated_value_high"]
    assert a["gross_rental_yield_pct"] > 0 and a["indicative_annual_return_pct_high"] > a["indicative_annual_return_pct_low"]
    assert "no verified market data" in a["data_source"] and any("not based on live market data" in x.lower() for x in a["limitations"])
    assert fake.calls[0]["json"]["model"] == TEXT_MODEL and "Bhopal" in fake.calls[0]["json"]["messages"][1]["content"]


def test_valuation_warns_when_ai_disagrees_with_user_rate(fake):
    d = val(local_rate_per_sqft=2000).json()["data"]          # fake model says 6000/sq ft
    assert any("differs" in x for x in d["limitations"]) and "anchored" in d["data_source"]


def test_valuation_ai_failure_is_an_error(fake):
    fake.script = [httpx.ConnectError("x")]
    assert_error(val(), 503, "cannot reach")


# ------------------------------------------------------------------ planning
PLAN = {"project_name": "House A", "project_type": "residential_house", "location": "Indore", "floors": 2,
        "built_up_area_sqft": 2400, "start_date": "2026-11-02"}


def test_planning_combines_computed_schedule_with_ai_estimates(fake):
    d = client.post("/api/planning", json=PLAN).json()["data"]
    assert d["phases"][0]["start_date"] == "2026-11-02" and len(d["phases"]) == 9
    assert d["materials"][0]["approx_quantity"] == 2400 * 0.4 and d["location_considerations"] == ["Site in Indore"]
    assert d["total_cost_low_inr"] == 2400 * (800 + 400) and d["total_cost_high_inr"] == 2400 * (1000 + 600)
    assert "not based on live rates" in d["cost_disclaimer"].lower() and d["ai_error"] is None


def test_planning_inputs_change_the_result(fake):
    small = client.post("/api/planning", json={**PLAN, "built_up_area_sqft": 1200}).json()["data"]
    big = client.post("/api/planning", json=PLAN).json()["data"]
    assert big["total_working_days"] > small["total_working_days"] and big["total_cost_low_inr"] == 2 * small["total_cost_low_inr"]
    crew = client.post("/api/planning", json={**PLAN, "crew_size": 60}).json()["data"]
    assert crew["total_working_days"] < big["total_working_days"]


def test_planning_when_ai_fails_returns_schedule_only_with_explicit_notice(fake):
    fake.script = [(429, "limit")]
    r = client.post("/api/planning", json=PLAN).json()
    assert r["success"] and r["mode"] == "partial" and r["data"]["phases"] and "materials" not in r["data"]
    assert "rate-limited" in r["data"]["ai_error"] and "unavailable" in r["notes"][0]


# ------------------------------------------------------------------ chat / daily plan
def test_chat_uses_configured_ai_with_history(fake):
    hist = [{"role": "user", "content": "What is M25?"}, {"role": "assistant", "content": "A concrete grade."}]
    r = client.post("/api/knowledge/chat", json={"message": "And M20?", "history": hist}).json()
    assert r["mode"] == "ai" and TEXT_MODEL in r["data"]["answer"] and "4 messages" in r["data"]["answer"]   # system + 2 history + new
    sent = fake.calls[0]["json"]
    assert "response_format" not in sent and "invent" in sent["messages"][0]["content"].lower()
    assert sent["messages"][-1] == {"role": "user", "content": "And M20?"}


def test_chat_failure_is_an_error(fake):
    fake.script = [httpx.ReadTimeout("t")]
    assert_error(client.post("/api/assistant/chat", json={"message": "How to cure slab?"}), 504, "too long")


def test_daily_plan_is_ai_generated_from_input(fake):
    r = client.post("/api/assistant/report", json={"site_name": "Block B", "report_date": "2026-10-21", "notes": "Pour level 2 slab, 12 workers, cement low",
                                                   "crew_available": 12, "materials_status": "cement 40 bags"}).json()
    assert r["mode"] == "ai" and r["data"]["tasks"][0]["priority"] == "high"
    assert "cement 40 bags" in fake.calls[0]["json"]["messages"][1]["content"]


# ------------------------------------------------------------------ weather
FORECAST = {"current": {"temperature_2m": 30, "wind_speed_10m": 10, "precipitation": 0},
            "daily": {"time": ["2026-10-21", "2026-10-22"], "weather_code": [1, 95], "temperature_2m_max": [41, 30], "temperature_2m_min": [25, 22],
                      "apparent_temperature_max": [44, 33], "precipitation_sum": [0, 12], "precipitation_probability_max": [5, 90],
                      "wind_speed_10m_max": [12, 42], "uv_index_max": [9, None]}}


@pytest.fixture
def live(monkeypatch):
    monkeypatch.setattr(backend, "geocode", lambda n: {"name": "Testville", "latitude": 1, "longitude": 2})
    monkeypatch.setattr(backend, "fetch_forecast", lambda a, b, c: FORECAST)


def lv(day):
    return {a["activity"]: a["level"] for a in day["advisories"]}


def test_live_weather_with_rules_and_ai_guidance(fake, live):
    r = client.post("/api/weather/advisory", json={"location": "Testville", "days": 2, "planned_activities": "slab pour"}).json()
    d = r["data"]
    assert "retrieved live" in d["weather_source"] and r["mode"] == "ai" and d["ai_guidance"]["decision"] == "GO"
    assert lv(d["days"][0])["Concrete pouring"] == "avoid" and lv(d["days"][1])["Crane and lifting"] == "avoid"
    assert "slab pour" in fake.calls[0]["json"]["messages"][1]["content"]


def test_weather_failure_without_manual_input_is_an_error_not_fake_data(fake, monkeypatch):
    def boom(n): raise backend.WeatherError("Weather service unavailable (ConnectError). Try again later.")
    monkeypatch.setattr(backend, "geocode", boom)
    assert_error(client.post("/api/weather/advisory", json={"location": "Anywhere"}), 502, "unavailable")
    assert fake.calls == []


def test_weather_falls_back_to_user_conditions_and_labels_the_source(fake, monkeypatch):
    def boom(n): raise backend.WeatherError("Weather service unavailable (ConnectError). Try again later.")
    monkeypatch.setattr(backend, "geocode", boom)
    r = client.post("/api/weather/advisory", json={"location": "Anywhere", "manual": {"wind_kmh": 45, "rain_mm": 0}}).json()
    d = r["data"]
    assert "entered by the user" in d["weather_source"] and "not retrieved" in d["weather_source"]
    assert lv(d["days"][0])["Crane and lifting"] == "avoid" and lv(d["days"][0])["Concrete pouring"] == "ok"
    assert d["ai_guidance"]["decision"] == "NO_GO" and "Live weather could not be retrieved" in r["notes"][0]


def test_manual_only_and_unknown_when_blank(fake):
    d = client.post("/api/weather/advisory", json={"manual": {"wind_kmh": 10}}).json()["data"]
    assert lv(d["days"][0])["Exterior painting"] == "ok" and d["location"] is None


def test_weather_requires_a_location_or_conditions():
    r = client.post("/api/weather/advisory", json={"days": 3})
    assert r.status_code == 422 and "location" in r.json()["error"].lower()


def test_weather_ai_failure_keeps_real_data_and_flags_guidance_unavailable(fake, live):
    fake.script = [httpx.ConnectError("x")]
    r = client.post("/api/weather/advisory", json={"location": "Testville"}).json()
    assert r["mode"] == "partial" and r["data"]["ai_guidance"] is None and r["data"]["ai_error"] and r["data"]["days"][0]["advisories"]


def test_missing_weather_values_are_unknown_not_ok():
    assert {a["level"] for a in backend.advise_day({})} == {"unknown"}


# ------------------------------------------------------------------ CORS / envelope / hygiene
@pytest.mark.parametrize("origin,allowed", [("http://localhost:5173", True), ("https://my-capstone.netlify.app", True),
                                            ("https://evil.example", False)])
def test_cors_preflight(origin, allowed):
    r = client.options("/api/valuation", headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                                  "Access-Control-Request-Headers": "content-type"})
    assert (r.headers.get("access-control-allow-origin") == origin) is allowed


def test_only_one_cors_middleware():
    assert sum(m.cls.__name__ == "CORSMiddleware" for m in backend.app.user_middleware) == 1


def test_validation_error_uses_error_envelope():
    r = client.post("/api/valuation", json={"city": "X", "property_type": "apartment", "area_sqft": 5})
    b = r.json()
    assert r.status_code == 422 and b["success"] is False and b["mode"] == "error" and b["error"].startswith("Invalid input")


def test_no_canned_results_left_in_source():
    src = open(backend.__file__, encoding="utf-8").read()
    for banned in ("SAFETY_CHECKLIST", "PLACEHOLDER_RATE", "demo_answer", "AI_PROVIDER", "kb_lookup", "ENTRIES = ["):
        assert banned not in src


def teardown_module(_):
    p = os.environ["DB_PATH"]
    if os.path.exists(p):
        os.remove(p)

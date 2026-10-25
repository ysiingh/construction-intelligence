"""LIVE check against your real AI provider (not part of the offline test suite).

It uploads two different photos to a running backend and shows whether the answers differ and are grounded in each image.
Usage (backend running with your real .env):
    python tests/live_check.py safety  site1.jpg site2.jpg
    python tests/live_check.py cracks  crack1.jpg crack2.jpg
Optional: BACKEND_URL=https://your-service.onrender.com python tests/live_check.py ...
Read the printed results yourself: do they describe what is actually in each photo?
"""
import mimetypes
import os
import sys

import httpx

BASE = os.getenv("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")


def run(kind: str, path: str) -> dict:
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    with open(path, "rb") as fh:
        r = httpx.post(f"{BASE}/api/{kind}/analyze", files={"file": (os.path.basename(path), fh, mime)},
                       data={"description": "live check"}, timeout=180)
    body = r.json()
    if not body.get("success"):
        sys.exit(f"{path}: FAILED ({r.status_code}): {body.get('error')}")
    return body["data"]


def main():
    if len(sys.argv) != 4 or sys.argv[1] not in ("safety", "cracks"):
        sys.exit(__doc__)
    kind, a, b = sys.argv[1:]
    da, db = run(kind, a), run(kind, b)
    keys = ["scene_summary", "overall_status", "safety_score"] if kind == "safety" else ["crack_type", "severity", "urgency", "estimated_width_mm"]
    for name, d in ((a, da), (b, db)):
        print(f"\n== {name} (model: {d.get('model')})")
        for k in keys:
            print(f"  {k}: {d.get(k)}")
        items = d.get("hazards") if kind == "safety" else d.get("visual_observations")
        for it in (items or [])[:3]:
            print("  -", it.get("description") if isinstance(it, dict) else it)
    same = all(da.get(k) == db.get(k) for k in keys)
    print("\nRESULT:", "IDENTICAL answers for two different photos. Check the photos, model and prompt." if same
          else "Answers differ between the two photos (now check that each matches its photo).")


if __name__ == "__main__":
    main()

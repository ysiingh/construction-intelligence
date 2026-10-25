# Construction Intelligence

AI-powered construction assistant: site safety (PPE and hazards from a photo), crack analysis, property valuation, project planning,
daily site assistant, weather advisory and a construction knowledge chatbot.

**Stack:** React + Vite + Tailwind + Recharts (frontend, deployed on Netlify) · FastAPI + Pydantic + Pillow/OpenCV (backend, deployed on Render).

```
app.py              whole backend (single file)
requirements.txt    Python dependencies
.env.example        configuration template (copy to .env, never commit .env)
tests/              backend tests (offline) + live_check.py (real provider)
frontend/           React app; .env.example has VITE_API_URL
```

## 1. How it works (no canned results)

| Module | What produces the answer |
|---|---|
| Site safety | A **vision-capable AI model** looks at your uploaded photo (plus your optional description) and returns validated JSON: score, status, PPE, hazards with evidence, recommendations, limitations. |
| Crack analysis | Same, with crack type, severity, width (only if a scale reference is visible, else `null`), possible causes, risks, actions, urgency. OpenCV adds an optional highlight overlay as an aid only. |
| Valuation | AI estimate from your inputs. Price/sq ft, yield and return are **calculated from the AI's range** so numbers stay consistent. |
| Planning | **Computed** schedule (phases, durations, dates from your inputs) + AI material quantities and INR cost ranges. |
| Daily assistant, Knowledge assistant | AI chat with conversation history; AI-generated daily plan from your notes. |
| Weather | Live Open-Meteo forecast, or conditions you type in (clearly labelled). Rule thresholds + AI GO / CAUTION / NO-GO guidance. |

If the AI is unavailable the API returns an error (`{"success": false, "mode": "error", "error": "..."}`). It never substitutes invented results.
Planning and weather return their **real computed part** with `mode: "partial"` and an explicit `ai_error`; the AI part is simply absent.

Built-in safeguards (in code, not only in prompts): a PPE item can only be `worn`/`not_worn` if the model gave visual evidence (otherwise it becomes `uncertain`);
a crack width without a visible scale reference is dropped; concerning cracks always get a "qualified structural engineer" action; every result carries
"not a certified inspection / not a structural assessment / not verified market data" limitations; malformed AI output is repaired once, then rejected.

## 2. Configuration

Copy `.env.example` to `.env` and fill it in.

| Variable | Purpose |
|---|---|
| `OPENAI_BASE_URL`, `OPENAI_API_KEY` | Any OpenAI-compatible provider (Groq, OpenRouter, ...). The key is only read on the server. |
| `OPENAI_MODEL` | Text model (planning, valuation, chat, weather guidance). |
| `OPENAI_VISION_MODEL` | **Required for Site Safety and Crack Analysis.** Must accept images. A text-only model (for example `openai/gpt-oss-20b`) cannot. |
| `AI_TIMEOUT_SECONDS` | Per-request timeout (default 60). |
| `CORS_ORIGINS` | Allowed browser origins, comma separated: your local frontend and your Netlify URL. |

**Choosing the vision model.** Provider model lists change (Groq's own docs have listed different vision models over time), so nothing is hardcoded.
Check your provider's vision documentation, set `OPENAI_VISION_MODEL`, then open `GET /api/ai/check` on your backend. It asks the provider for its
model list and tells you whether your configured IDs are listed. "Listed" does not prove a model accepts images; the live check below does.

Images are re-encoded to JPEG (long side 1280 px) and sent as a base64 `image_url` data URI in the standard OpenAI-compatible message format.

**Rotate leaked keys.** If an API key was ever shared (pasted in chat, uploaded in a zip, committed to Git), revoke it in the provider's console and create a new one.

## 3. Run locally

```bash
# backend (Python 3.10+)
python -m venv .venv && source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                       # then edit .env
uvicorn app:app --reload --port 8000                       # or: python app.py

# frontend (second terminal, Node 18+)
cd frontend
npm install
npm run dev                                                # http://localhost:5173 (proxies /api to port 8000)
```
Check `http://localhost:8000/api/health` (configuration) and `http://localhost:8000/api/ai/check` (provider and model IDs).

## 4. Tests

```bash
python -m pytest -q                       # 53 backend tests, offline
cd frontend && npm test                   # 11 frontend tests (vitest + Testing Library)
cd frontend && npm run build              # production build check
```
The backend tests replace the AI provider with a fake at the HTTP layer. They verify what is sent (the real image bytes, the vision model, the key, JSON mode),
validation and repair of AI output, error mapping (no key, timeout, 401, 429, wrong model, image rejected), upload validation, planning/valuation/weather
using supplied inputs, and CORS for localhost and a Netlify origin. **They cannot prove a real model understands your photos.** Do that with:

```bash
python tests/live_check.py safety site1.jpg site2.jpg      # backend running with your real .env
python tests/live_check.py cracks crack1.jpg crack2.jpg
```
It prints both answers and warns if they are identical. Read them against the photos yourself.

## 5. Deploy the backend on Render

1. Push the project to GitHub (check that `.env` is not included).
2. Render: **New, Web Service**, connect the repository, runtime **Python**.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
5. Health check path: `/api/health`
6. Environment variables: `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_VISION_MODEL`, and
   `CORS_ORIGINS=https://<your-netlify-site>.netlify.app,http://localhost:5173`. Set `PYTHON_VERSION` (for example `3.12.3`) if the default Python is too old.
7. After deploy open `https://<service>.onrender.com/api/ai/check` and confirm both models are listed.

Free Render services sleep when idle and take about a minute to wake, and the filesystem is not persistent (the SQLite history resets). Check Render's current free-plan terms.

## 6. Deploy the frontend on Netlify (Netlify Drop)

`VITE_API_URL` is baked in at **build time**, so build locally with your Render URL, then drop the `dist` folder:

```bash
cd frontend
npm install
# macOS/Linux
VITE_API_URL=https://<service>.onrender.com npm run build
# Windows PowerShell
$env:VITE_API_URL="https://<service>.onrender.com"; npm run build
```
Drag `frontend/dist` onto https://app.netlify.com/drop. Then put the resulting Netlify URL into Render's `CORS_ORIGINS` and redeploy the backend.
If you deploy from Git instead of Drop, set `VITE_API_URL` under Netlify's site environment variables, build command `npm run build`, publish directory `dist`.
Rebuild whenever the backend URL changes.

## 7. Limitations (please read)

- AI image analysis reflects one photo; results can be wrong or miss things. It is **not** a safety inspection, compliance check, or structural diagnosis.
- Valuation, rent, ROI, material quantities and costs are AI estimates, **not verified market data or live rates**. Provide a verified local rate when you have one.
- Quality depends on the model you configure; small or free-tier models may need a retry, and free tiers have rate limits that can change.
- Image content and your text go to your AI provider. There is no login: do not expose the backend publicly with a key that has billing or a tight quota.
- Weather forecasts come from Open-Meteo (check its terms for commercial use). Thresholds are general rules, not site-specific limits.
- Only the offline tests and one local end-to-end run (real uvicorn against a fake provider server) were executed during development. A live call to a real provider was **not** run; use `tests/live_check.py`.

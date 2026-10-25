// Backend base URL, fixed at build time. Empty = same origin (local dev uses the Vite proxy).
const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const TIMEOUT_MS = 150000; // free hosting can be slow to wake and AI calls can take a while

/** Calls the backend and returns the response envelope. Throws Error with a readable message. */
export async function api(path, { json, form } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try {
    // For multipart uploads we deliberately set NO Content-Type: the browser adds it together with the boundary.
    const init = json
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json), signal: ctl.signal }
      : form ? { method: "POST", body: form, signal: ctl.signal } : { signal: ctl.signal };
    res = await fetch(BASE + path, init);
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("The request took too long. Please try again.");
    throw new Error(BASE
      ? "Cannot reach the server. If it is on free hosting it may be waking up (this can take about a minute). Try again shortly."
      : "Cannot reach the backend. Start it with: uvicorn app:app --port 8000");
  } finally {
    clearTimeout(timer);
  }
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok || !body?.success) throw new Error(body?.error || `Request failed (${res.status}).`);
  return body;
}

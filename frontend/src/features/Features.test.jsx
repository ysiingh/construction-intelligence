import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Safety from "./Safety";
import Cracks from "./Cracks";
import Weather from "./Weather";
import Planning from "./Planning";

const envelope = (data, extra = {}) => ({ success: true, mode: "ai", data, notes: [], error: null, ...extra });
const reply = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const photo = (name = "site.jpg", type = "image/jpeg", size = 2048) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};
const SAFETY = envelope({
  scene_summary: "Two workers beside an open slab edge.", safety_score: 58, overall_status: "moderate_concern",
  safety_score_label: "AI-estimated indicator based only on what is visible.",
  ppe_detection: { people_visible: 2, summary: "Helmets seen.", items: [{ item: "helmet", status: "worn", evidence: "white helmet, left worker" },
    { item: "gloves", status: "not_visible", evidence: "hands hidden" }] },
  hazards: [{ description: "Unprotected slab edge", severity: "high", basis: "observed", evidence: "no guardrail on right", corrective_action: "Install guardrails" }],
  recommendations: ["Install edge protection"], limitations: ["Not a certified safety inspection."], model: "vision-x",
});

let fetchMock;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function upload(file, user = userEvent.setup({ applyAccept: false })) {
  await user.upload(screen.getByLabelText("Choose an image"), file);
  return user;
}

describe("Site safety", () => {
  it("sends the chosen image as multipart/form-data without a manual Content-Type, and renders the AI result", async () => {
    fetchMock.mockReturnValue(reply(SAFETY));
    render(<Safety />);
    const user = await upload(photo());
    expect(screen.getByAltText("Selected upload")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Description/), "Level 2 east side");
    await user.click(screen.getByRole("button", { name: "Analyse photo" }));
    expect(await screen.findByText(/Two workers beside an open slab edge/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/safety/analyze");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined();                           // the browser must add the multipart boundary itself
    expect(init.body.get("file").name).toBe("site.jpg");
    expect(init.body.get("description")).toBe("Level 2 east side");
    expect(screen.getByText("58 / 100")).toBeInTheDocument();
    expect(screen.getByText("Unprotected slab edge")).toBeInTheDocument();
    expect(screen.getByText(/Not visible/)).toBeInTheDocument();
  });

  it("shows the server's readable error and no result", async () => {
    fetchMock.mockReturnValue(reply({ success: false, mode: "error", error: "AI image analysis is temporarily unavailable." }, 503));
    render(<Safety />);
    const user = await upload(photo());
    await user.click(screen.getByRole("button", { name: "Analyse photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI image analysis is temporarily unavailable.");
    expect(screen.queryByText(/AI-estimated safety indicator/)).not.toBeInTheDocument();
  });

  it("shows a friendly message when the backend can't be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Safety />);
    const user = await upload(photo());
    await user.click(screen.getByRole("button", { name: "Analyse photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Cannot reach the backend/);
  });

  it("rejects a wrong file type and an oversize file before any request", async () => {
    render(<Safety />);
    const user = await upload(photo("notes.txt", "text/plain"));
    expect(screen.getByRole("alert")).toHaveTextContent("JPG, PNG or WebP");
    await upload(photo("huge.jpg", "image/jpeg", 9 * 1024 * 1024), user);
    expect(screen.getByRole("alert")).toHaveTextContent(/limit is 8 MB/);
    expect(screen.getByRole("button", { name: "Analyse photo" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders without crashing when the AI result is missing optional parts", async () => {
    fetchMock.mockReturnValue(reply(envelope({ overall_status: "cannot_determine", safety_score: null, ppe_detection: null, hazards: null })));
    render(<Safety />);
    const user = await upload(photo());
    await user.click(screen.getByRole("button", { name: "Analyse photo" }));
    expect(await screen.findByText(/Cannot be determined from this photo/)).toBeInTheDocument();
    expect(screen.getByText(/not available/)).toBeInTheDocument();
    expect(screen.getByText(/No PPE items could be assessed/)).toBeInTheDocument();
  });

  it("lets the user analyse a different image without reloading", async () => {
    fetchMock.mockReturnValue(reply(SAFETY));
    render(<Safety />);
    const user = await upload(photo("one.jpg"));
    await user.click(screen.getByRole("button", { name: "Analyse photo" }));
    await screen.findByText(/Two workers/);
    await user.click(screen.getByRole("button", { name: "Analyse a different image" }));
    expect(screen.queryByText(/Two workers/)).not.toBeInTheDocument();
    expect(screen.queryByAltText("Selected upload")).not.toBeInTheDocument();
    await upload(photo("two.jpg"), user);
    expect(screen.getByText(/two\.jpg/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyse photo" })).toBeEnabled();
  });
});

describe("Crack analysis", () => {
  it("renders the AI assessment and never shows an invented width", async () => {
    fetchMock.mockReturnValue(reply(envelope({
      crack_type: "diagonal", severity: "moderate", estimated_width_mm: null, urgency: "prompt_engineer_review",
      visual_observations: ["Diagonal line from the window corner"], possible_causes: ["May be related to settlement"],
      potential_risks: [], recommended_actions: ["Have a qualified structural engineer assess this in person."],
      limitations: ["Single photo"], opencv_aid: { label: "Image-filter aid", overlay_image: "data:image/png;base64,AAAA", lines_found: 1, longest_percent_of_diagonal: 30 }, model: "vision-x" })));
    render(<Cracks />);
    const user = await upload(photo());
    await user.click(screen.getByRole("button", { name: "Analyse crack" }));
    expect(await screen.findByText(/diagonal · moderate/)).toBeInTheDocument();
    expect(screen.getByText(/Not estimated/)).toBeInTheDocument();
    expect(screen.getByText(/These are possibilities only/)).toBeInTheDocument();
    expect(screen.getByText(/Have a qualified structural engineer assess this in person/)).toBeInTheDocument();
    expect(screen.getByText("Prompt engineer review")).toBeInTheDocument();
  });

  it("shows an error for a provider failure", async () => {
    fetchMock.mockReturnValue(reply({ success: false, mode: "error", error: "The AI service is rate-limited right now." }, 429));
    render(<Cracks />);
    const user = await upload(photo());
    await user.click(screen.getByRole("button", { name: "Analyse crack" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("rate-limited");
  });
});

describe("Weather", () => {
  it("labels user-entered conditions and renders GO/NO-GO guidance", async () => {
    fetchMock.mockReturnValue(reply(envelope({
      weather_source: "Conditions entered by the user (not retrieved from a weather service)", location: null, current: null,
      ai_guidance: { decision: "NO_GO", rationale: "Wind of 45 km/h exceeds the crane threshold.", precautions: ["Stop lifting"], mitigation_steps: [], limitations: [] },
      days: [{ date: "2026-10-23", tmax: null, tmin: null, rain: 0, wind: 45, prob: null, advisories: [{ activity: "Crane and lifting", level: "avoid", reason: "wind 45 km/h" }, { activity: "Exterior painting", level: "unknown", reason: "No weather data was provided for this check." }] }],
      rules: ["Crane/lifting: avoid at wind >= 40 km/h"] })));
    render(<Weather />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Wind (km/h)"), "45");
    await user.click(screen.getByRole("button", { name: "Get advisory" }));
    expect(await screen.findByText(/entered by the user/)).toBeInTheDocument();
    expect(screen.getByText("NO-GO")).toBeInTheDocument();
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ location: null, manual: { wind_kmh: 45, rain_mm: null } });
  });

  it("shows a notice (not fake guidance) when the AI part failed", async () => {
    fetchMock.mockReturnValue(reply(envelope({ weather_source: "Open-Meteo forecast (retrieved live just now)", location: { name: "Indore" }, ai_guidance: null,
      ai_error: "The AI service took too long to respond.", days: [{ date: "2026-10-23", tmax: 30, tmin: 22, rain: 0, wind: 10, advisories: [] }], rules: [] }, { mode: "partial" })));
    render(<Weather />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("City or town"), "Indore");
    await user.click(screen.getByRole("button", { name: "Get advisory" }));
    expect(await screen.findByText(/AI guidance is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("AI guidance")).not.toBeInTheDocument();
  });
});

describe("Planning", () => {
  it("shows the computed schedule and an explicit notice when AI estimates are missing", async () => {
    fetchMock.mockReturnValue(reply(envelope({ project_name: "A", total_working_days: 90, start_date: "2026-11-02", finish_date: "2027-03-01",
      ai_error: "The AI service is rate-limited right now.", assumptions: ["x"],
      phases: [{ name: "Foundation", tasks: ["Excavation"], duration_days: 10, start_index: 0, start_date: "2026-11-02", end_date: "2026-11-13" }] }, { mode: "partial" })));
    render(<Planning />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Project name"), "House A");
    await user.type(screen.getByLabelText("Location (city)"), "Indore");
    await user.type(screen.getByLabelText("Built-up area (sq ft)"), "2400");
    await user.click(screen.getByRole("button", { name: "Generate plan" }));
    expect(await screen.findByText("90 working days")).toBeInTheDocument();
    expect(screen.getByText(/could not be generated: The AI service is rate-limited/)).toBeInTheDocument();
    expect(screen.queryByText(/Approximate cost breakdown/)).not.toBeInTheDocument();
  });
});

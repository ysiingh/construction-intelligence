import { useState } from "react";
import { Block, Button, Empty, ErrorBox, Field, Input, List, Notice, Panel, ResultMeta, Select, Spinner, Textarea, arr, label, text, useRequest } from "../ui";

const LEVEL = {
  ok: ["Go", "text-good"], caution: ["Caution", "text-warn"], avoid: ["Avoid", "text-bad"], unknown: ["No data", "text-mute"],
};
const DECISION = { GO: ["GO", "text-good"], CAUTION: ["CAUTION", "text-warn"], NO_GO: ["NO-GO", "text-bad"] };
const num = (v) => (v === "" ? null : +v);

export default function Weather() {
  const [f, setF] = useState({ location: "", days: 5, planned: "", tmax: "", tmin: "", rain: "", wind: "", note: "" });
  const { run, loading, error, result } = useRequest();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const manual = { temperature_max_c: num(f.tmax), temperature_min_c: num(f.tmin), rain_mm: num(f.rain), wind_kmh: num(f.wind), description: f.note || null };
    run("/api/weather/advisory", { json: { location: f.location.trim() || null, days: +f.days, planned_activities: f.planned || null, manual } });
  };
  const d = result?.data;
  const g = d?.ai_guidance;
  const [decText, decCls] = DECISION[g?.decision] || ["", ""];

  return (
    <div className="space-y-5">
      <Panel title="Site and planned work">
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64"><Field label="City or town"><Input value={f.location} onChange={set("location")} /></Field></div>
            <div className="w-32"><Field label="Days"><Select options={[1, 2, 3, 5, 7]} value={f.days} onChange={set("days")} /></Field></div>
          </div>
          <Field label="Planned activities (optional)"><Textarea rows={2} value={f.planned} onChange={set("planned")} placeholder="e.g. slab pour on level 2, crane lifting in the afternoon" /></Field>
          <details className="rounded border border-line bg-white p-3">
            <summary className="cursor-pointer font-semibold text-steel">Enter weather conditions myself</summary>
            <p className="my-2 text-sm text-mute">Used only when live weather can't be retrieved, or when you leave the location empty. Results will be labelled as your own input.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Max temp (°C)"><Input type="number" value={f.tmax} onChange={set("tmax")} /></Field>
              <Field label="Min temp (°C)"><Input type="number" value={f.tmin} onChange={set("tmin")} /></Field>
              <Field label="Rain (mm)"><Input type="number" min="0" value={f.rain} onChange={set("rain")} /></Field>
              <Field label="Wind (km/h)"><Input type="number" min="0" value={f.wind} onChange={set("wind")} /></Field>
            </div>
            <div className="mt-3"><Field label="Notes"><Input value={f.note} onChange={set("note")} placeholder="e.g. heavy cloud, storm expected" /></Field></div>
          </details>
          <Button type="submit" loading={loading}>Get advisory</Button>
        </form>
      </Panel>
      <ErrorBox message={error} />
      {loading && <Panel><span className="flex items-center gap-3"><Spinner /> Fetching weather and preparing guidance…</span></Panel>}
      {!d && !loading && !error && <Empty>Enter a location (forecast from Open-Meteo) or your own conditions to get GO / CAUTION / NO-GO guidance.</Empty>}
      {d && (<>
        <Panel>
          <ResultMeta result={result} />
          <p className="font-semibold text-steel">Weather source: {d.weather_source}</p>
          {d.location && <h3 className="text-2xl font-bold text-steel">{[d.location.name, d.location.region, d.location.country].filter(Boolean).join(", ")}</h3>}
          {d.current && <p className="text-mute">Now: {d.current.temperature_2m}°C, wind {d.current.wind_speed_10m} km/h, precipitation {d.current.precipitation} mm</p>}
        </Panel>
        {g ? (
          <Panel title="AI guidance">
            <p className={`font-display text-4xl font-bold ${decCls}`}>{decText}</p>
            <p className="mt-2">{g.rationale}</p>
            <div className="mt-3 space-y-3">
              <Block title="Precautions" items={g.precautions} />
              <Block title="Mitigation steps" items={g.mitigation_steps} />
              <Block title="Limitations" items={g.limitations} />
            </div>
          </Panel>
        ) : <Notice>{d.ai_error ? `AI guidance is unavailable: ${d.ai_error} The rule-based results below are still based on the weather data above.` : null}</Notice>}
        <div className="grid gap-4 md:grid-cols-2">
          {arr(d.days).map((day) => (
            <Panel key={day.date}>
              <h3 className="text-xl font-bold text-steel">{new Date(day.date + "T00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}</h3>
              <p className="mb-3 text-sm text-mute">
                {day.tmin ?? "–"} to {day.tmax ?? "–"}°C · rain {day.rain ?? "–"} mm{day.prob != null ? ` (${day.prob}%)` : ""} · wind {day.wind ?? "–"} km/h
              </p>
              <ul className="space-y-2">
                {arr(day.advisories).map((a) => {
                  const [name, cls] = LEVEL[a.level] || [label(a.level), ""];
                  return (
                    <li key={a.activity}>
                      <span className={`mr-2 inline-block w-16 font-bold ${cls}`}>{name}</span>
                      <span className="font-medium">{a.activity}</span>
                      {a.level !== "ok" && <span className="block pl-[4.5rem] text-sm text-mute">{text(a.reason)}</span>}
                    </li>);
                })}
              </ul>
            </Panel>))}
        </div>
        <Panel title="Rule thresholds used"><List items={d.rules} /></Panel>
      </>)}
    </div>
  );
}

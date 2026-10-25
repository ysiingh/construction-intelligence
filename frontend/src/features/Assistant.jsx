import { useState } from "react";
import Chat from "./Chat";
import { Block, Button, ErrorBox, Field, Input, Panel, ResultMeta, Spinner, Textarea, arr, label, text, useRequest } from "../ui";

const PRIORITY = { high: "text-bad", medium: "text-warn", low: "text-good" };

function DailyPlan() {
  const [f, setF] = useState({ site_name: "", report_date: new Date().toISOString().slice(0, 10), notes: "", crew_available: "", materials_status: "", site_conditions: "" });
  const { run, loading, error, result } = useRequest();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run("/api/assistant/report", { json: { site_name: f.site_name, report_date: f.report_date, notes: f.notes,
      crew_available: f.crew_available === "" ? null : +f.crew_available,
      materials_status: f.materials_status || null, site_conditions: f.site_conditions || null } });
  };
  const d = result?.data;
  return (
    <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
      <Panel title="Today's site information">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Site name"><Input required value={f.site_name} onChange={set("site_name")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input required type="date" value={f.report_date} onChange={set("report_date")} /></Field>
            <Field label="Crew available"><Input type="number" min="0" value={f.crew_available} onChange={set("crew_available")} /></Field>
          </div>
          <Field label="Work activities" hint="What is planned or being done today.">
            <Textarea required rows={5} minLength={10} value={f.notes} onChange={set("notes")} />
          </Field>
          <Field label="Materials on hand / expected (optional)"><Textarea rows={2} value={f.materials_status} onChange={set("materials_status")} /></Field>
          <Field label="Site conditions (optional)"><Input value={f.site_conditions} onChange={set("site_conditions")} placeholder="e.g. wet ground, limited access" /></Field>
          <Button type="submit" loading={loading}>Generate daily plan</Button>
        </form>
      </Panel>
      <div className="space-y-4">
        <ErrorBox message={error} />
        {loading && <Panel><span className="flex items-center gap-3"><Spinner /> Preparing the plan…</span></Panel>}
        {d ? (
          <Panel>
            <ResultMeta result={result} />
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-steel">{d.site_name} · {d.report_date}</h3>
              <p>{d.summary}</p>
              <div>
                <h3 className="text-lg font-bold text-steel">Tasks</h3>
                <ul className="space-y-2">{arr(d.tasks).map((t, i) => (
                  <li key={i}><span className={`font-bold ${PRIORITY[t.priority] || ""}`}>{label(t.priority)}</span> · {text(t.task)}
                    {t.reason && <span className="block text-sm text-mute">{t.reason}</span>}</li>))}</ul>
              </div>
              {arr(d.material_requirements).length > 0 && (
                <div><h3 className="text-lg font-bold text-steel">Material requirements</h3>
                  <ul className="list-disc space-y-1 pl-5">{arr(d.material_requirements).map((m, i) => (
                    <li key={i}><strong>{text(m.material)}</strong> {text(m.quantity_note)} <span className="text-sm text-mute">{text(m.reason)}</span></li>))}</ul></div>)}
              <Block title="Safety checks" items={d.safety_checks} />
              {arr(d.potential_risks).length > 0 && (
                <div><h3 className="text-lg font-bold text-steel">Potential risks</h3>
                  <ul className="list-disc space-y-1 pl-5">{arr(d.potential_risks).map((r, i) => (
                    <li key={i}>{text(r.risk)} {r.mitigation && <span className="text-sm text-mute">Mitigation: {r.mitigation}</span>}</li>))}</ul></div>)}
              <Block title="Follow-up questions" items={d.follow_ups} />
              <Block title="Limitations" items={d.limitations} />
            </div>
          </Panel>
        ) : !loading && !error && <div className="rounded-md border border-dashed border-line p-6 text-mute">Your AI-generated daily plan will appear here.</div>}
      </div>
    </div>
  );
}

export default function Assistant() {
  const [tab, setTab] = useState("ask");
  const tabs = [["ask", "Ask the assistant"], ["plan", "Daily plan"]];
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-2">
        {tabs.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`rounded px-4 py-2 font-semibold ${tab === id ? "bg-steel text-white" : "border border-line bg-paper text-steel"}`}>{name}</button>))}
      </div>
      {tab === "ask"
        ? <Chat endpoint="/api/assistant/chat" placeholder="Ask a site question"
            suggestions={["How do I run a toolbox talk?", "How should I recover from a delay?", "Scaffold safety basics?"]} />
        : <DailyPlan />}
    </div>
  );
}

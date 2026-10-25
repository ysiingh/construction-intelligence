import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Block, Button, Empty, ErrorBox, Field, Input, List, Notice, Panel, ResultMeta, Select, Spinner, arr, inr, useRequest } from "../ui";

const TYPES = [
  { value: "residential_house", label: "Residential house" }, { value: "apartment_building", label: "Apartment building" },
  { value: "commercial_building", label: "Commercial building" }, { value: "warehouse", label: "Warehouse" },
];

export default function Planning() {
  const [f, setF] = useState({ project_name: "", project_type: "residential_house", location: "", floors: 2,
    built_up_area_sqft: "", start_date: new Date().toISOString().slice(0, 10), crew_size: 15,
    work_days_per_week: 6, include_basement: false });
  const { run, loading, error, result } = useRequest();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run("/api/planning", { json: { ...f, floors: +f.floors, built_up_area_sqft: +f.built_up_area_sqft,
      crew_size: +f.crew_size, work_days_per_week: +f.work_days_per_week } });
  };
  const d = result?.data;
  const phases = arr(d?.phases);
  const chart = phases.map((p) => ({ name: p.name, offset: p.start_index, days: p.duration_days }));

  return (
    <div className="space-y-5">
      <Panel title="Project details">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Project name"><Input required value={f.project_name} onChange={set("project_name")} /></Field>
          <Field label="Type"><Select options={TYPES} value={f.project_type} onChange={set("project_type")} /></Field>
          <Field label="Location (city)"><Input required value={f.location} onChange={set("location")} /></Field>
          <Field label="Floors"><Input type="number" min="1" max="60" value={f.floors} onChange={set("floors")} /></Field>
          <Field label="Built-up area (sq ft)"><Input required type="number" min="201" value={f.built_up_area_sqft} onChange={set("built_up_area_sqft")} /></Field>
          <Field label="Start date"><Input required type="date" value={f.start_date} onChange={set("start_date")} /></Field>
          <Field label="Crew size"><Input type="number" min="2" max="500" value={f.crew_size} onChange={set("crew_size")} /></Field>
          <Field label="Working days per week"><Select options={[5, 6, 7]} value={f.work_days_per_week} onChange={set("work_days_per_week")} /></Field>
          <label className="flex items-center gap-2 pb-2 sm:col-span-2 lg:col-span-4"><input type="checkbox" checked={f.include_basement} onChange={set("include_basement")} /> Includes a basement</label>
          <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" loading={loading}>Generate plan</Button></div>
        </form>
      </Panel>
      <ErrorBox message={error} />
      {loading && <Panel><span className="flex items-center gap-3"><Spinner /> Building plan…</span></Panel>}
      {!d && !loading && !error && <Empty>Enter project details to get a timeline (calculated from your inputs) plus approximate AI-generated materials and costs.</Empty>}
      {d && (<>
        <Panel>
          <ResultMeta result={result} />
          <Notice>{d.ai_error ? `Material and cost estimates could not be generated: ${d.ai_error}` : null}</Notice>
          <p className="mt-2 font-display text-3xl font-bold text-steel">{d.total_working_days} working days</p>
          <p className="text-mute">{d.start_date} to {d.finish_date}</p>
          {d.total_cost_low_inr !== undefined && (
            <p className="mt-2"><strong>Approximate total cost:</strong> {inr(d.total_cost_low_inr)} to {inr(d.total_cost_high_inr)}
              {" "}({inr(d.cost_per_sqft_low_inr)} to {inr(d.cost_per_sqft_high_inr)} per sq ft)</p>)}
        </Panel>
        {chart.length > 0 && (
          <Panel title="Timeline (working days from start)">
            <div style={{ height: 60 + chart.length * 36 }} role="img" aria-label="Gantt-style timeline of construction phases">
              <ResponsiveContainer>
                <BarChart data={chart} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid horizontal={false} stroke="#d3d6d3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 13 }} />
                  <Tooltip formatter={(v, n) => (n === "days" ? [`${v} days`, "Duration"] : null)} />
                  <Bar dataKey="offset" stackId="a" fill="transparent" isAnimationActive={false} />
                  <Bar dataKey="days" stackId="a" fill="#e4580b" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>)}
        {arr(d.cost_breakdown).length > 0 && (
          <Panel title="Approximate cost breakdown (INR)">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-mute"><th className="py-1 font-medium">Category</th><th className="font-medium">Low</th><th className="font-medium">High</th><th className="font-medium">Basis</th></tr></thead>
              <tbody>{arr(d.cost_breakdown).map((c, i) => (
                <tr key={i} className="border-b border-line align-top last:border-0"><td className="py-2 pr-3 font-medium">{c.category}</td><td className="pr-3">{inr(c.approx_cost_inr_low)}</td><td className="pr-3">{inr(c.approx_cost_inr_high)}</td><td>{c.basis}</td></tr>))}</tbody>
            </table>
            <p className="mt-2 text-sm text-mute">{d.cost_disclaimer}</p>
          </Panel>)}
        {arr(d.materials).length > 0 && (
          <Panel title="Approximate material quantities">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-mute"><th className="py-1 font-medium">Material</th><th className="font-medium">Quantity</th><th className="font-medium">Basis</th></tr></thead>
              <tbody>{arr(d.materials).map((m, i) => (
                <tr key={i} className="border-b border-line align-top last:border-0"><td className="py-2 pr-3 font-medium">{m.material}</td><td className="pr-3">{Number(m.approx_quantity).toLocaleString("en-IN")} {m.unit}</td><td>{m.basis}</td></tr>))}</tbody>
            </table>
          </Panel>)}
        <Panel title="Phases and tasks">
          <div className="space-y-4">
            {phases.map((p) => (
              <div key={p.name} className="border-b border-line pb-3 last:border-0">
                <h3 className="text-lg font-bold">{p.name}</h3>
                <p className="text-sm text-mute">{p.duration_days} working days, {p.start_date} to {p.end_date}</p>
                <List items={p.tasks} />
              </div>))}
          </div>
        </Panel>
        <Panel><div className="space-y-4">
          <Block title="Location considerations" items={d.location_considerations} />
          <Block title="Schedule assumptions" items={d.assumptions} />
          <Block title="Estimate assumptions" items={d.ai_assumptions} />
          <Block title="Limitations" items={d.ai_limitations} />
        </div></Panel>
      </>)}
    </div>
  );
}

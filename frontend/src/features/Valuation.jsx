import { useState } from "react";
import { Block, Button, Empty, ErrorBox, Field, Input, Panel, ResultMeta, Select, Spinner, inr, label, useRequest } from "../ui";

const TYPES = [
  { value: "apartment", label: "Apartment" }, { value: "independent_house", label: "Independent house" },
  { value: "villa", label: "Villa" }, { value: "plot", label: "Plot" }, { value: "commercial", label: "Commercial" },
];

export default function Valuation() {
  const [f, setF] = useState({ city: "", locality: "", property_type: "apartment", area_sqft: "", bedrooms: 2, bathrooms: 2,
    age_years: 5, condition: "good", floor: 0, amenities: "", local_rate_per_sqft: "" });
  const { run, loading, error, result } = useRequest();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    run("/api/valuation", { json: {
      city: f.city, locality: f.locality || null, property_type: f.property_type, condition: f.condition,
      area_sqft: +f.area_sqft, bedrooms: +f.bedrooms, bathrooms: +f.bathrooms, age_years: +f.age_years, floor: +f.floor,
      local_rate_per_sqft: f.local_rate_per_sqft ? +f.local_rate_per_sqft : null,
      amenities: f.amenities.split(",").map((s) => s.trim()).filter(Boolean),
    } });
  };
  const d = result?.data;

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <Panel title="Property details">
        <form onSubmit={submit} className="space-y-3">
          <Field label="City"><Input required value={f.city} onChange={set("city")} /></Field>
          <Field label="Locality (optional)"><Input value={f.locality} onChange={set("locality")} /></Field>
          <Field label="Property type"><Select options={TYPES} value={f.property_type} onChange={set("property_type")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Area (sq ft)"><Input required type="number" min="101" value={f.area_sqft} onChange={set("area_sqft")} /></Field>
            <Field label="Age (years)"><Input type="number" min="0" value={f.age_years} onChange={set("age_years")} /></Field>
            <Field label="Bedrooms"><Input type="number" min="0" value={f.bedrooms} onChange={set("bedrooms")} /></Field>
            <Field label="Bathrooms"><Input type="number" min="0" value={f.bathrooms} onChange={set("bathrooms")} /></Field>
            <Field label="Floor"><Input type="number" min="0" value={f.floor} onChange={set("floor")} /></Field>
            <Field label="Condition"><Select options={["poor", "fair", "good", "excellent"]} value={f.condition} onChange={set("condition")} /></Field>
          </div>
          <Field label="Amenities" hint="Comma separated, e.g. lift, parking, security"><Input value={f.amenities} onChange={set("amenities")} /></Field>
          <Field label="Local rate per sq ft in ₹ (optional)" hint="If you know a verified local rate, enter it. The AI will anchor to it."><Input type="number" min="1" value={f.local_rate_per_sqft} onChange={set("local_rate_per_sqft")} /></Field>
          <Button type="submit" loading={loading}>Estimate</Button>
        </form>
      </Panel>
      <div className="space-y-4">
        <ErrorBox message={error} />
        {loading && <Panel><span className="flex items-center gap-3"><Spinner /> Estimating…</span></Panel>}
        {!d && !loading && !error && <Empty>Enter the property details to get an indicative, AI-generated estimate. It is not verified market data.</Empty>}
        {d && (<>
          <Panel>
            <ResultMeta result={result} />
            <p className="text-mute">Indicative value range</p>
            <p className="font-display text-4xl font-bold text-steel">{inr(d.estimated_value_low)} to {inr(d.estimated_value_high)}</p>
            <p className="text-mute">Midpoint {inr(d.estimated_value_mid)} · about {inr(d.price_per_sqft_low)} to {inr(d.price_per_sqft_high)} per sq ft · confidence: {label(d.confidence)}</p>
            <p className="mt-2 text-sm text-mute">{d.data_source}</p>
          </Panel>
          <Panel title="Rental income and return (indicative)">
            <dl className="grid max-w-lg grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-mute">Monthly rent</dt><dd>{inr(d.monthly_rent_low)} to {inr(d.monthly_rent_high)}</dd>
              <dt className="text-mute">Gross rental yield</dt><dd>{d.gross_rental_yield_pct}% per year</dd>
              <dt className="text-mute">Appreciation (assumed)</dt><dd>{d.appreciation_pct_per_year_low}% to {d.appreciation_pct_per_year_high}% per year</dd>
              <dt className="text-mute">Indicative total return</dt><dd>{d.indicative_annual_return_pct_low}% to {d.indicative_annual_return_pct_high}% per year</dd>
            </dl>
            <p className="mt-2 text-sm text-mute">{d.return_note}</p>
          </Panel>
          <Panel><div className="space-y-4">
            <Block title="Key factors" items={d.key_factors} />
            <Block title="Assumptions" items={d.assumptions} />
            <Block title="Limitations" items={d.limitations} />
          </div></Panel>
        </>)}
      </div>
    </div>
  );
}

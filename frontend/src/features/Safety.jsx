import ImageTool from "./ImageTool";
import { Block, arr, label, text } from "../ui";

const STATUS = {
  low_concern: ["Low concern", "text-good"], moderate_concern: ["Moderate concern", "text-warn"],
  high_concern: ["High concern", "text-bad"], cannot_determine: ["Cannot be determined from this photo", "text-mute"],
};
const SEVERITY = { low: "text-good", medium: "text-warn", high: "text-bad", critical: "text-bad" };
const PPE = { worn: "Worn", not_worn: "Not worn", not_visible: "Not visible", uncertain: "Uncertain" };

function Result({ d }) {
  const [statusText, statusCls] = STATUS[d.overall_status] || [label(d.overall_status) || "Unknown", "text-mute"];
  const ppe = d.ppe_detection || {};
  const hazards = arr(d.hazards);
  return (
    <div className="space-y-5">
      <div>
        <p className={`font-display text-3xl font-bold ${statusCls}`}>{statusText}</p>
        <p className="mt-1">
          <strong>AI-estimated safety indicator:</strong>{" "}
          {d.safety_score === null || d.safety_score === undefined ? "not available" : `${d.safety_score} / 100`}
        </p>
        <p className="text-sm text-mute">{text(d.safety_score_label)}</p>
        {d.scene_summary && <p className="mt-2">{d.scene_summary}</p>}
      </div>

      <div>
        <h3 className="text-lg font-bold text-steel">PPE observed</h3>
        <p className="text-sm text-mute">
          {ppe.people_visible === null || ppe.people_visible === undefined ? "Number of people visible: unclear." : `People visible: ${ppe.people_visible}.`} {text(ppe.summary)}
        </p>
        {arr(ppe.items).length ? (
          <table className="mt-2 w-full text-left text-sm">
            <thead><tr className="border-b border-line text-mute"><th className="py-1 font-medium">Item</th><th className="font-medium">Status</th><th className="font-medium">Evidence</th></tr></thead>
            <tbody>{arr(ppe.items).map((it, i) => (
              <tr key={i} className="border-b border-line align-top last:border-0">
                <td className="py-2 pr-3 font-medium">{text(it.item)}</td><td className="pr-3">{PPE[it.status] || label(it.status)}</td><td>{text(it.evidence)}</td>
              </tr>))}</tbody>
          </table>
        ) : <p className="text-sm text-mute">No PPE items could be assessed in this photo.</p>}
      </div>

      <div>
        <h3 className="text-lg font-bold text-steel">Hazards</h3>
        {hazards.length ? (
          <ul className="mt-2 space-y-3">{hazards.map((h, i) => (
            <li key={i} className="rounded border border-line bg-white p-3">
              <p><span className={`font-bold ${SEVERITY[h.severity] || ""}`}>{label(h.severity)} severity</span>{" · "}
                <span className="text-sm text-mute">{h.basis === "observed" ? "Observed in the photo" : "Inferred (interpretation)"}</span></p>
              <p className="font-medium">{text(h.description)}</p>
              <p className="text-sm"><strong>Evidence:</strong> {text(h.evidence)}</p>
              <p className="text-sm"><strong>Corrective action:</strong> {text(h.corrective_action)}</p>
            </li>))}</ul>
        ) : <p className="text-sm text-mute">The AI did not report any hazards visible in this photo. That is not a guarantee that none exist.</p>}
      </div>

      <Block title="Recommendations" items={d.recommendations} />
      <Block title="Limitations" items={d.limitations} />
      {d.model && <p className="text-sm text-mute">Analysed by {d.model}.</p>}
    </div>
  );
}

export default function Safety() {
  return (
    <ImageTool endpoint="/api/safety/analyze" buttonLabel="Analyse photo"
      descriptionLabel="Description (optional)" descriptionHint="For example: which area or floor, what work is happening."
      disclaimer="AI reads only what is visible in this one photo. It is not a certified safety inspection and does not check compliance with any standard."
      render={(d) => <Result d={d} />} />
  );
}

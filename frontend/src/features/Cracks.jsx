import ImageTool from "./ImageTool";
import { Block, arr, label, text } from "../ui";

const SEV = { none: "text-good", minor: "text-good", moderate: "text-warn", severe: "text-bad", cannot_determine: "text-mute" };
const URG = {
  routine_monitoring: "Routine monitoring", schedule_inspection: "Schedule an inspection", prompt_engineer_review: "Prompt engineer review",
  immediate_attention: "Immediate attention", cannot_determine: "Cannot be determined",
};

function Result({ d }) {
  const aid = d.opencv_aid;
  return (
    <div className="space-y-5">
      <div>
        <p className={`font-display text-3xl font-bold ${SEV[d.severity] || "text-mute"}`}>
          {label(d.crack_type) || "Unknown"} · {label(d.severity) || "unknown"}
        </p>
        <p className="mt-1"><strong>Urgency:</strong> {URG[d.urgency] || label(d.urgency) || "unknown"}</p>
        <p><strong>Estimated crack width:</strong>{" "}
          {d.estimated_width_mm === null || d.estimated_width_mm === undefined
            ? "Not estimated (a width cannot be read reliably from an unscaled photo)"
            : `${d.estimated_width_mm} mm${d.width_basis ? ` (${d.width_basis})` : ""}`}</p>
      </div>
      <Block title="Visual observations" items={d.visual_observations} />
      <Block title="Possible causes" note="These are possibilities only. A photo cannot confirm the cause." items={d.possible_causes} />
      <Block title="Potential risks" items={d.potential_risks} />
      <Block title="Recommended actions" items={d.recommended_actions} />
      <Block title="Limitations" items={d.limitations} />
      {aid?.overlay_image && (
        <details className="rounded border border-line bg-white p-3">
          <summary className="cursor-pointer font-semibold text-steel">Optional image-filter aid (OpenCV)</summary>
          <p className="my-2 text-sm text-mute">{text(aid.label)}</p>
          <img src={aid.overlay_image} alt="Photo with dark thin lines highlighted in red" className="max-h-96 rounded border border-line" />
          <p className="mt-1 text-sm text-mute">Lines highlighted: {aid.lines_found ?? 0}. Longest: {aid.longest_percent_of_diagonal ?? 0}% of the image diagonal.</p>
        </details>)}
      {d.model && <p className="text-sm text-mute">Analysed by {d.model}.</p>}
    </div>
  );
}

export default function Cracks() {
  return (
    <ImageTool endpoint="/api/cracks/analyze" buttonLabel="Analyse crack"
      descriptionLabel="Location, age and symptoms (optional)" descriptionHint="For example: external wall, 8 years old, widening after monsoon."
      disclaimer="AI interprets this one photo. It cannot measure or diagnose. Cracks that are wide, growing, diagonal or near supports need a qualified structural engineer."
      render={(d) => <Result d={d} />} />
  );
}

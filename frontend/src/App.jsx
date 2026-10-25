import { useEffect, useState } from "react";
import { api } from "./api";
import { ErrorBoundary } from "./ui";
import Safety from "./features/Safety";
import Cracks from "./features/Cracks";
import Valuation from "./features/Valuation";
import Planning from "./features/Planning";
import Assistant from "./features/Assistant";
import Weather from "./features/Weather";
import Knowledge from "./features/Knowledge";

const FEATURES = [
  { id: "safety", name: "Site safety", about: "AI reviews a site photo for PPE and visible hazards. Not a certified inspection.", C: Safety },
  { id: "cracks", name: "Crack analysis", about: "AI describes a crack photo, possible causes and next steps. Not a structural diagnosis.", C: Cracks },
  { id: "valuation", name: "Property valuation", about: "An indicative, AI-generated value range, rent and return. Not verified market data.", C: Valuation },
  { id: "planning", name: "Project planning", about: "A computed timeline plus approximate AI-estimated materials and costs.", C: Planning },
  { id: "assistant", name: "Daily site assistant", about: "Ask site questions or turn today's activities into a daily plan.", C: Assistant },
  { id: "weather", name: "Weather advisory", about: "Live forecast or your own conditions, with GO / CAUTION / NO-GO guidance.", C: Weather },
  { id: "knowledge", name: "Knowledge assistant", about: "Materials, methods and terminology explained.", C: Knowledge },
];

export default function App() {
  const [active, setActive] = useState("safety");
  const [health, setHealth] = useState(null);
  useEffect(() => {
    api("/api/health").then((r) => setHealth(r.data.ai)).catch((e) => setHealth({ error: e.message }));
  }, []);
  const f = FEATURES.find((x) => x.id === active);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-ink text-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0">
        <div className="tape" />
        <div className="px-5 py-4"><h1 className="text-2xl font-bold">Construction Intelligence</h1></div>
        <nav aria-label="Features" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {FEATURES.map((x) => (
            <button key={x.id} onClick={() => setActive(x.id)} aria-current={x.id === active ? "page" : undefined}
              className={`whitespace-nowrap rounded px-3 py-2 text-left font-medium ${
                x.id === active ? "bg-safety-d text-white" : "text-gray-300 hover:bg-steel"}`}>
              {x.name}
            </button>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-8">
        <div className="mx-auto max-w-5xl space-y-5">
          <header>
            <h2 className="text-3xl font-bold text-steel">{f.name}</h2>
            <p className="max-w-prose text-mute">{f.about}</p>
          </header>
          <div className="rounded border border-line bg-paper px-4 py-2 text-sm text-mute" role="status">
            {!health ? "Checking backend…" : health.error ? health.error : health.detail}
          </div>
          <ErrorBoundary key={f.id}><f.C /></ErrorBoundary>
        </div>
      </main>
    </div>
  );
}

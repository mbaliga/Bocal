"use client";
import {
  ArrowRight,
  Download,
  FileText,
  Settings2,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sun,
  X,
} from "lucide-react";

export type RailSide = "left" | "right";
export type Theme = "dark" | "light";

// Settings and model-library overlay, split out of page.tsx (tuner.md:
// "page.tsx is a 1619-line god component") along with TunerView. Kept
// free of any tuner/audio state -- it only ever needs the navigation side,
// the theme and a handful of close/open callbacks passed in by the page.
export function DownloadCenter({
  railSide,
  onRailSideChange,
  theme,
  onThemeChange,
  onClose,
  onOpenOnboarding,
  onOpenKeyboardHelp,
}: {
  railSide: RailSide;
  onRailSideChange: (side: RailSide) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onClose: () => void;
  onOpenOnboarding: () => void;
  onOpenKeyboardHelp: () => void;
}) {
  const downloads = [
    {
      href: "/downloads/BOCAL_HANDOFF.md",
      title: "Bocal handoff",
      copy: "Research, user journeys, feature scope, saxophone notes, architecture, Android status and release checks in one file.",
      icon: FileText,
    },
  ];
  const modelSources: Array<{ instrument: string; status: string; tone: "ready" | "review" | "blocked"; href?: string }> = [
    { instrument: "Alto saxophone", status: "In Bocal · CC BY 4.0 · ANDRIANIAINAToky", tone: "ready", href: "https://sketchfab.com/3d-models/saxophone-alto-08448f4bfbca474b80ba35a571648a27" },
    { instrument: "Oboe", status: "In Bocal · CC BY 4.0 · WarderiiK", tone: "ready", href: "https://sketchfab.com/3d-models/oboe-howarth-conservatoire-s20c-instrument-bfa1bb7fd7ef4f7c9d3c843f481a38c8" },
    { instrument: "Flute", status: "CC BY candidate · needs player review", tone: "review", href: "https://sketchfab.com/3d-models/flute-08cb4375f9924366b725c439fd6163a8" },
    { instrument: "Tenor saxophone", status: "Licensed candidate · purchase required", tone: "review", href: "https://www.cgtrader.com/3d-models/sports/music/brass-tenor-saxophone" },
    { instrument: "Bassoon", status: "Licensed candidate · purchase required", tone: "review", href: "https://www.cgtrader.com/3d-models/furniture/other/fagott-bassoon" },
    { instrument: "Clarinet", status: "Blocked by non-commercial licence", tone: "blocked", href: "https://sketchfab.com/3d-models/clarinet-model-with-annotations-c47ddcb26eeb4fbd804a45c82f77ba31" },
    { instrument: "Soprano saxophone", status: "No acceptable source yet · commission", tone: "blocked" },
  ];
  return (
    <div className="download-overlay" role="presentation">
      <section className="download-dialog" role="dialog" aria-modal="true" aria-labelledby="download-title">
        <header>
          <div><p className="eyebrow">Settings & model library</p><h2 id="download-title">Make Bocal fit your setup.</h2><p>Choose which edge holds the landscape arc, review model readiness, or download the current handoff.</p></div>
          <button onClick={onClose} aria-label="Close settings"><X size={19} /></button>
        </header>
        <section className="settings-panel" aria-labelledby="navigation-side-title">
          <div><Settings2 size={18} /><span><strong id="navigation-side-title">Landscape navigation</strong><p>The floating mobile arc can sit against either edge.</p></span></div>
          <div className="side-choice" role="radiogroup" aria-label="Landscape navigation side">
            <button role="radio" aria-checked={railSide === "left"} className={railSide === "left" ? "is-active" : ""} onClick={() => onRailSideChange("left")}>Left</button>
            <button role="radio" aria-checked={railSide === "right"} className={railSide === "right" ? "is-active" : ""} onClick={() => onRailSideChange("right")}>Right</button>
          </div>
        </section>
        <section className="settings-panel" aria-labelledby="appearance-title">
          <div><Sun size={18} /><span><strong id="appearance-title">Appearance</strong><p>Choose an illuminated light surface or Bocal’s deep studio finish.</p></span></div>
          <div className="side-choice theme-choice" role="radiogroup" aria-label="Appearance">
            <button role="radio" aria-checked={theme === "light"} className={theme === "light" ? "is-active" : ""} onClick={() => onThemeChange("light")}>Light</button>
            <button role="radio" aria-checked={theme === "dark"} className={theme === "dark" ? "is-active" : ""} onClick={() => onThemeChange("dark")}>Dark</button>
          </div>
        </section>
        <section className="settings-panel" aria-labelledby="keyboard-title">
          {/* Keyboard shortcuts (digits jump to a workspace, arrows walk the
              nav, "?" opens this row's dialog) existed but were entirely
              undiscoverable -- nothing in the UI ever mentioned them
              (a11y-ux.md finding "Keyboard shortcuts exist but are
              undiscoverable"). */}
          <div><SlidersHorizontal size={18} /><span><strong id="keyboard-title">Keyboard shortcuts</strong><p>Digits jump to a workspace, arrows switch between them. Press &quot;?&quot; any time to see the full list.</p></span></div>
          <button className="button secondary" onClick={onOpenKeyboardHelp}>View shortcuts</button>
        </section>
        <section className="model-source-panel" aria-labelledby="model-source-title">
          <header><div><strong id="model-source-title">Educational model sourcing</strong><p>Only models with usable rights and player-checked keywork will enter the learning lab.</p></div><span>{modelSources.filter((item) => item.tone === "ready").length} integrated</span></header>
          <div className="model-source-list">
            {modelSources.map((source) => {
              const content = <><span>{source.instrument}</span><em className={`is-${source.tone}`}>{source.status}</em>{source.href && <ArrowRight size={13} />}</>;
              return source.href ? <a key={source.instrument} href={source.href} target="_blank" rel="noreferrer">{content}</a> : <div key={source.instrument}>{content}</div>;
            })}
          </div>
          <p className="model-credit-note">
            Shipped 3D model credits: <strong>&quot;saxophone alto&quot;</strong> by ANDRIANIAINAToky and <strong>&quot;Oboe - Howarth Conservatoire S20C (Instrument)&quot;</strong> by WarderiiK. Both are <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Source links are listed above. Bocal optimized the files for mobile and changes runtime materials; no endorsement is implied.
          </p>
        </section>
        <div className="download-grid">
          {downloads.map((item) => {
            const Icon = item.icon;
            return (
              <a key={item.href} href={item.href} download>
                <i><Icon size={19} /></i>
                <div><strong>{item.title}</strong><p>{item.copy}</p><span>Download <Download size={13} /></span></div>
              </a>
            );
          })}
        </div>
        <div className="apk-blocker">
          <Smartphone size={18} />
          <div><strong>Android release promotion is pending.</strong><p>A current artifact will appear here only after release signing, installation, cold launch, and physical-device audio checks pass.</p></div>
        </div>
        <button className="replay-onboarding" onClick={onOpenOnboarding}><Sparkles size={15} /> Replay the onboarding guide</button>
      </section>
    </div>
  );
}

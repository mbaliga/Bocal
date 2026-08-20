"use client";

import {
  ArrowLeft,
  Box,
  ExternalLink,
  Eye,
  Info,
  Maximize2,
  Minimize2,
  MousePointer2,
  RefreshCw,
  Rotate3D,
  ScanSearch,
  ShieldCheck,
  Wind,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ImportedInstrumentCanvas, type InstrumentViewId } from "./ImportedInstrumentCanvas";

const OBOE_VIEWS: Array<{ id: InstrumentViewId; label: string }> = [
  { id: "front", label: "Front" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "back", label: "Back" },
];

export function OboeLab({ onBack }: { onBack: () => void }) {
  const [viewPreset, setViewPreset] = useState<InstrumentViewId>("front");
  const [resetView, setResetView] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const [selectedPart, setSelectedPart] = useState<{ name: string; category: string } | null>(null);
  const selectPart = useCallback((part: { name: string; category: string } | null) => setSelectedPart(part), []);

  useEffect(() => {
    if (!immersive) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setImmersive(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [immersive]);

  return (
    <div className="sax-lab-view oboe-lab-view">
      <header className="lab-header">
        <div>
          <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Tuner</button>
          <p className="eyebrow">Instrument lab · Oboe anatomy preview</p>
          <h1>Explore the oboe up close.</h1>
          <p>Turn the oboe, zoom in, and tap the keywork to see how the model is put together. Fingering lessons will arrive after an oboe teacher checks them.</p>
        </div>
        <span className="preview-status"><Eye size={15} /> Anatomy preview</span>
      </header>

      <div className="oboe-workspace">
        <div className={`model-experience-column ${immersive ? "is-immersive" : ""}`}>
          <div className="model-experience-dock">
            <div className="experience-dock-summary"><MousePointer2 size={15} /><span><strong>Explore the mechanism</strong><small>Drag to orbit. Tap without dragging to inspect a component.</small></span></div>
            <div className="experience-dock-actions">
              <button aria-label="Reset oboe view" onClick={() => setResetView((value) => value + 1)}><RefreshCw size={14} /><span>Reset</span></button>
              <button aria-label={immersive ? "Exit immersive view" : "Open immersive view"} className={immersive ? "is-active" : ""} onClick={() => setImmersive((value) => !value)}>{immersive ? <Minimize2 size={14} /> : <Maximize2 size={14} />}<span>{immersive ? "Exit" : "Focus"}</span></button>
            </div>
            <div className="experience-view-presets" aria-label="Oboe view presets">
              {OBOE_VIEWS.map((preset) => (
                <button key={preset.id} className={viewPreset === preset.id ? "is-active" : ""} aria-pressed={viewPreset === preset.id} onClick={() => setViewPreset(preset.id)}>{preset.label}</button>
              ))}
            </div>
          </div>
          <section className="model-stage oboe-model-stage">
            <ImportedInstrumentCanvas
              src="/models/oboe-howarth-s20c.glb"
              label="Interactive three-dimensional Howarth Conservatoire S20C oboe reference"
              viewPreset={viewPreset}
              resetView={resetView}
              isolateRootName="Oboe"
              inspectParts
              onPartSelect={selectPart}
            />
            <div className="oboe-model-badge">
              <small>Reference instrument</small>
              <strong>Howarth S20C</strong>
              <span>Uniform bronze study · source geometry preserved</span>
            </div>
            <div className="drag-hint"><Rotate3D size={15} /> Drag to orbit</div>
          </section>
        </div>

        <aside className="oboe-inspector">
          <span className="panel-kicker"><ScanSearch size={14} /> Part inspector</span>
          {selectedPart ? (
            <div className="selected-oboe-part">
              <i><Box size={18} /></i>
              <small>{selectedPart.category}</small>
              <h2>{selectedPart.name}</h2>
              <p>This is the part name supplied with the model. It identifies the shape you tapped, not a confirmed fingering function.</p>
            </div>
          ) : (
            <div className="selected-oboe-part is-empty">
              <i><MousePointer2 size={18} /></i>
              <small>Nothing selected</small>
              <h2>Tap the keywork.</h2>
              <p>Bocal will outline it and show the part name supplied with the model.</p>
            </div>
          )}

          <div className="oboe-truth-card">
            <Info size={17} />
            <div><strong>Useful for</strong><p>Getting oriented and seeing how the rods, springs, caps, body and keywork sit together.</p></div>
          </div>
          <div className="oboe-truth-card">
            <ShieldCheck size={17} />
            <div><strong>Not checked yet</strong><p>Note-to-key maps, alternate fingerings and pad motion still need review by an oboe specialist.</p></div>
          </div>

          <a className="model-credit" href="https://sketchfab.com/3d-models/oboe-howarth-conservatoire-s20c-instrument-bfa1bb7fd7ef4f7c9d3c843f481a38c8" target="_blank" rel="noreferrer">
            <Wind size={15} /> “Oboe – Howarth Conservatoire S20C” by WarderiiK · CC BY 4.0 <ExternalLink size={13} />
          </a>
        </aside>
      </div>
    </div>
  );
}

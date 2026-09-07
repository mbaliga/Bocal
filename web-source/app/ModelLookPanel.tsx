"use client";

import { Info } from "lucide-react";
import {
  BACKGROUNDS,
  CAMERA_PRESETS,
  ENVIRONMENTS,
  OBOE_KEY_FINISHES,
  OBOE_WOOD_TYPES,
  SAX_BODY_FINISHES,
  SAX_KEYWORK_FINISHES,
  SAX_LIGATURE_OPTIONS,
  SAX_MOUTHPIECE_OPTIONS,
  type ModelLook,
} from "./model-looks";

function hex(value: number) {
  return `#${value.toString(16).padStart(6, "0")}`;
}

function Chip({ active, swatch, label, onClick }: { active: boolean; swatch?: string; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`model-look-chip ${active ? "is-active" : ""}`} aria-pressed={active} onClick={onClick}>
      {swatch && <i style={{ background: swatch }} />}
      <span>{label}</span>
    </button>
  );
}

/**
 * Compact "Look" panel shared by the sax lab and the oboe lab. Every chip
 * here changes material colour, lighting or camera framing on the already
 * loaded model -- never geometry, and never a remount.
 */
export function ModelLookPanel({
  look,
  onChange,
  instrumentKind,
}: {
  look: ModelLook;
  onChange: (next: Partial<ModelLook>) => void;
  instrumentKind: "saxophone" | "oboe";
}) {
  const isSax = instrumentKind === "saxophone";

  return (
    <section className="model-look-panel" aria-label="Instrument look">
      <header>
        <span className="model-look-kicker">Look</span>
        <p>Finish and materials are rendered approximations; the geometry is the licensed model, unchanged.</p>
      </header>

      <div className="model-look-group">
        <small>{isSax ? "Body finish" : "Wood"}</small>
        <div className="model-look-row">
          {(isSax ? SAX_BODY_FINISHES : OBOE_WOOD_TYPES).map((option) => (
            <Chip
              key={option.id}
              active={look.bodyFinish === option.id}
              swatch={hex("tint" in option ? option.tint : option.body)}
              label={option.name}
              onClick={() => onChange({ bodyFinish: option.id })}
            />
          ))}
        </div>
      </div>

      <div className="model-look-group">
        <small>Keywork</small>
        <div className="model-look-row">
          {(isSax ? SAX_KEYWORK_FINISHES : OBOE_KEY_FINISHES).map((option) => (
            <Chip
              key={option.id}
              active={look.keyworkFinish === option.id}
              swatch={hex("keywork" in option ? option.keywork : option.tint)}
              label={option.name}
              onClick={() => onChange({ keyworkFinish: option.id })}
            />
          ))}
        </div>
      </div>

      {isSax && (
        <>
          <div className="model-look-group">
            <small>Mouthpiece</small>
            <div className="model-look-row">
              {SAX_MOUTHPIECE_OPTIONS.map((option) => (
                <Chip key={option.id} active={look.mouthpiece === option.id} swatch={hex(option.color)} label={option.name} onClick={() => onChange({ mouthpiece: option.id })} />
              ))}
            </div>
          </div>
          <div className="model-look-group">
            <small>Ligature</small>
            <div className="model-look-row">
              {SAX_LIGATURE_OPTIONS.map((option) => (
                <Chip key={option.id} active={look.ligature === option.id} swatch={hex(option.color)} label={option.name} onClick={() => onChange({ ligature: option.id })} />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="model-look-group">
        <small>Environment</small>
        <div className="model-look-row">
          {ENVIRONMENTS.map((option) => (
            <Chip key={option.id} active={look.environment === option.id} label={option.name} onClick={() => onChange({ environment: option.id })} />
          ))}
        </div>
      </div>

      <div className="model-look-group">
        <small>Background</small>
        <div className="model-look-row">
          {BACKGROUNDS.map((option) => (
            <Chip key={option.id} active={look.background === option.id} label={option.name} onClick={() => onChange({ background: option.id })} />
          ))}
        </div>
      </div>

      <div className="model-look-group">
        <small>Camera</small>
        <div className="model-look-row">
          {CAMERA_PRESETS.filter((preset) => preset.id === "player-pov" || preset.id === "mirrored").map((option) => (
            <Chip key={option.id} active={look.cameraPreset === option.id} label={option.name} onClick={() => onChange({ cameraPreset: look.cameraPreset === option.id ? "front" : option.id })} />
          ))}
          <Chip active={look.exploded} label="Exploded view" onClick={() => onChange({ exploded: !look.exploded })} />
        </div>
      </div>

      <p className="model-look-note"><Info size={13} /> Colour is a study aid, not a manufacturer&apos;s finish -- it never changes tone.</p>
    </section>
  );
}

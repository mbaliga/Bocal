"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDot,
  Crosshair,
  LockKeyhole,
  Music2,
  Sparkles,
  Wind,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { InstrumentId } from "./instruments";

export const BOCAL_ONBOARDING_KEY = "bocal-onboarding-v2";

type GalleryInstrument = {
  id: string;
  name: string;
  family: string;
  pitch: string;
  status: string;
  image?: string;
  imagePosition?: string;
  gradient: string;
  availableId?: InstrumentId;
};

type OtherInstrument = {
  id: string;
  name: string;
  family: string;
  status: string;
  gradient: string;
  art: "bowed" | "fretted" | "brass" | "keys" | "percussion" | "voice" | "electronic";
};

// These are the only profiles that can change Bocal's tuning and notation
// behavior today. The wider discovery gallery below is deliberately kept out
// of InstrumentId until each profile has a validated musical contract.
const WOODWIND_GALLERY_INSTRUMENTS: GalleryInstrument[] = [
  {
    id: "alto-sax",
    name: "Alto saxophone",
    family: "Saxophone family",
    pitch: "E♭",
    status: "Full fingering lab",
    image: "/images/bocal-alto-sax-cinematic.webp",
    imagePosition: "58% center",
    gradient: "linear-gradient(160deg, #4e210d, #121018 72%)",
    availableId: "alto-sax",
  },
  {
    id: "oboe",
    name: "Oboe",
    family: "Double reed",
    pitch: "C",
    status: "Anatomy preview",
    image: "/images/bocal-oboe-cinematic.webp",
    imagePosition: "66% center",
    gradient: "linear-gradient(160deg, #241645, #081716 72%)",
    availableId: "oboe",
  },
  { id: "tenor-sax", name: "Tenor saxophone", family: "Saxophone family", pitch: "B♭", status: "Fingering trainer · shown on an alto", image: "/images/bocal-tenor-sax-cinematic.webp", imagePosition: "57% center", gradient: "linear-gradient(160deg, #672d19, #231116)", availableId: "tenor-sax" },
  { id: "soprano-sax", name: "Soprano saxophone", family: "Saxophone family", pitch: "B♭", status: "Fingering trainer · shown on an alto", image: "/images/bocal-soprano-sax-cinematic.webp", imagePosition: "55% center", gradient: "linear-gradient(160deg, #153a48, #0d1821)", availableId: "soprano-sax" },
  { id: "bari-sax", name: "Baritone saxophone", family: "Saxophone family", pitch: "E♭", status: "Fingering trainer · shown on an alto, no low A", gradient: "linear-gradient(160deg, #4a2a12, #1b1410)", availableId: "bari-sax" },
  { id: "flute", name: "Flute", family: "Air reed", pitch: "C", status: "Tuner + practice · lab pending", image: "/images/bocal-flute-cinematic.webp", imagePosition: "54% center", gradient: "linear-gradient(160deg, #5b6573, #181c24)", availableId: "flute" },
  { id: "bassoon", name: "Bassoon", family: "Double reed", pitch: "C", status: "Tuner + practice · lab pending", image: "/images/bocal-bassoon-cinematic.webp", imagePosition: "61% center", gradient: "linear-gradient(160deg, #5b281e, #1d1112)", availableId: "bassoon" },
  { id: "clarinet", name: "Clarinet", family: "Single reed", pitch: "B♭", status: "Not shipping · commercial licence required", image: "/images/bocal-clarinet-cinematic.webp", imagePosition: "55% center", gradient: "linear-gradient(160deg, #293652, #12121c)" },
];

// Discovery only: these cards deliberately have no InstrumentId or action.
// A beautiful gallery must not silently pretend that a string, keyboard, or
// brass profile has a validated transposition, notation, range, or fingering
// model behind it.
const OTHER_INSTRUMENTS: OtherInstrument[] = [
  { id: "bowed-strings", name: "Bowed strings", family: "Violin · viola · cello · bass", status: "Tuner foundations planned", gradient: "linear-gradient(145deg, #7a301f, #24130f 70%)", art: "bowed" },
  { id: "fretted-strings", name: "Fretted & plucked", family: "Guitar · bass · harp · ukulele", status: "Tuner foundations planned", gradient: "linear-gradient(145deg, #835b1e, #21170e 70%)", art: "fretted" },
  { id: "brass", name: "Brass", family: "Trumpet · horn · trombone · tuba", status: "Instrument profiles in development", gradient: "linear-gradient(145deg, #76500e, #24190b 70%)", art: "brass" },
  { id: "keyboards", name: "Keyboards", family: "Piano · organ · synthesizer", status: "Instrument profiles in development", gradient: "linear-gradient(145deg, #304767, #101a28 70%)", art: "keys" },
  { id: "percussion", name: "Percussion", family: "Mallets · drums · hand percussion", status: "Practice tools planned", gradient: "linear-gradient(145deg, #6c253e, #221018 70%)", art: "percussion" },
  { id: "voice", name: "Voice", family: "Classical · contemporary · choir", status: "Pitch tools planned", gradient: "linear-gradient(145deg, #553d71, #1c132b 70%)", art: "voice" },
  { id: "electronic", name: "Electronic & MIDI", family: "Controllers · wind synths · modular", status: "Profile research in progress", gradient: "linear-gradient(145deg, #0b5555, #0b2025 70%)", art: "electronic" },
];

function useEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);
}

function InstrumentPanelDeck({
  focusedId,
  selectedId,
  onFocus,
  items = WOODWIND_GALLERY_INSTRUMENTS,
  ariaLabel = "Woodwind instruments",
}: {
  focusedId: string;
  selectedId: InstrumentId;
  onFocus: (id: string) => void;
  items?: GalleryInstrument[];
  ariaLabel?: string;
}) {
  return (
    <div className="instrument-panel-deck" role="listbox" aria-label={ariaLabel}>
      {items.map((item, index) => {
        const focused = item.id === focusedId;
        const selected = item.availableId === selectedId;
        return (
          <button
            key={item.id}
            role="option"
            aria-selected={focused}
            className={`instrument-panel ${focused ? "is-focused" : ""} ${selected ? "is-selected" : ""} ${item.availableId ? "is-available" : "is-upcoming"}`}
            onClick={() => onFocus(item.id)}
            style={{
              backgroundImage: `${item.image ? `linear-gradient(180deg, rgba(4,4,6,.02), rgba(4,4,6,.88)), url("${item.image}")` : item.gradient}`,
              backgroundPosition: item.image ? `center, ${item.imagePosition ?? "center"}` : "center",
              backgroundSize: item.image ? (focused ? "cover, cover" : "cover, auto 94%") : "cover",
              backgroundRepeat: "no-repeat",
            }}
          >
            <span className="instrument-panel-number">{String(index + 1).padStart(2, "0")}</span>
            {!item.image && <span className="instrument-ghost" aria-hidden="true"><i /><b /></span>}
            <span className="instrument-panel-copy">
              <small>{item.family} · {item.pitch}</small>
              <strong>{item.name}</strong>
              <em>{item.status}</em>
            </span>
            {selected && <span className="instrument-selected-mark"><Check size={13} /> Current</span>}
          </button>
        );
      })}
    </div>
  );
}

function OtherInstrumentCollection() {
  return (
    <section className="other-instruments" aria-labelledby="other-instruments-title">
      <header className="other-instruments-heading">
        <div>
          <p className="eyebrow">Beyond woodwinds</p>
          <h3 id="other-instruments-title">Other Instruments</h3>
        </div>
        <p>Rich instrument profiles are coming only after their tuning, notation, and learning claims are validated.</p>
      </header>
      <div className="other-instrument-grid" role="list" aria-label="Planned instrument families">
        {OTHER_INSTRUMENTS.map((item) => (
          <article
            className={`other-instrument-card is-${item.art}`}
            key={item.id}
            role="listitem"
            style={{ backgroundImage: item.gradient }}
          >
            <span className={`other-instrument-art is-${item.art}`} aria-hidden="true"><i /><b /><em /></span>
            <span className="other-instrument-copy">
              <small>{item.family}</small>
              <strong>{item.name}</strong>
              <em>{item.status}</em>
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

export function InstrumentPickerExperience({
  open,
  selectedId,
  onSelect,
  onClose,
}: {
  open: boolean;
  selectedId: InstrumentId;
  onSelect: (id: InstrumentId) => void;
  onClose: () => void;
}) {
  const [focusedId, setFocusedId] = useState<string>(selectedId);
  useEscape(open, onClose);
  if (!open) return null;
  const focused = WOODWIND_GALLERY_INSTRUMENTS.find((item) => item.id === focusedId) ?? WOODWIND_GALLERY_INSTRUMENTS[0];

  return (
    <div className="experience-overlay" role="presentation">
      <section className="instrument-experience" role="dialog" aria-modal="true" aria-labelledby="instrument-experience-title">
        <header className="experience-header">
          <div><p className="eyebrow">Choose an instrument</p><h2 id="instrument-experience-title">What are you playing today?</h2><p>Woodwind profiles adjust Bocal’s tuner, lessons and written-pitch display. Explore the wider instrument landscape below without making unsupported claims.</p></div>
          <button onClick={onClose} aria-label="Close instrument selection"><X size={20} /></button>
        </header>
        <section className="instrument-gallery-section" aria-labelledby="woodwind-instruments-title">
          <div className="instrument-gallery-heading"><span id="woodwind-instruments-title">Woodwinds</span><small>{WOODWIND_GALLERY_INSTRUMENTS.filter((item) => item.availableId).length} profiles ready</small></div>
          <InstrumentPanelDeck focusedId={focusedId} selectedId={selectedId} onFocus={setFocusedId} />
        </section>
        <OtherInstrumentCollection />
        <footer className="experience-footer">
          <div><small>{focused.family}</small><strong>{focused.name} · {focused.pitch}</strong><span>{focused.status}</span></div>
          {focused.availableId ? (
            <button className="experience-primary" onClick={() => onSelect(focused.availableId!)}>Enter {focused.name} <ArrowRight size={16} /></button>
          ) : (
            <button className="experience-primary" disabled>Coming next</button>
          )}
        </footer>
      </section>
    </div>
  );
}

const ONBOARDING_STEPS = [
  { kicker: "First things first", title: "Pick the instrument you’re playing." },
  { kicker: "Tune", title: "Play one steady note." },
  { kicker: "Learn", title: "Watch the right keys light up." },
  { kicker: "Practice", title: "Your work stays on your device." },
];

export function OnboardingGuide({
  open,
  selectedId,
  onSelect,
  onComplete,
}: {
  open: boolean;
  selectedId: InstrumentId;
  onSelect: (id: InstrumentId) => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  const [focusedId, setFocusedId] = useState<string>(selectedId);
  const finish = () => { setStep(0); onComplete(); };
  useEscape(open, finish);
  if (!open) return null;
  const focusedInstrument = WOODWIND_GALLERY_INSTRUMENTS.find((item) => item.id === focusedId) ?? WOODWIND_GALLERY_INSTRUMENTS[0];

  const chooseFocused = () => {
    const selected = focusedInstrument.availableId;
    if (!selected) return;
    onSelect(selected);
    setStep(1);
  };

  return (
    <div className="experience-overlay onboarding-overlay" role="presentation">
      <section className="onboarding-guide" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <header className="onboarding-topline">
          <span className="onboarding-brand"><Wind size={18} /> bocal</span>
          <div className="onboarding-progress" aria-label={`Step ${step + 1} of ${ONBOARDING_STEPS.length}`}>{ONBOARDING_STEPS.map((_, index) => <i key={index} className={index <= step ? "is-active" : ""} />)}</div>
          <button onClick={finish}>Skip guide</button>
        </header>

        <div className="onboarding-heading">
          <p className="eyebrow">{ONBOARDING_STEPS[step].kicker}</p>
          <h2 id="onboarding-title">{ONBOARDING_STEPS[step].title}</h2>
        </div>

        {step === 0 && <InstrumentPanelDeck focusedId={focusedId} selectedId={selectedId} onFocus={setFocusedId} />}
        {step === 1 && (
          <div className="onboarding-scene tuner-onboarding-scene">
            <div className="onboarding-copy"><span><Crosshair size={17} /> How tuning works</span><h3>No note until you play.</h3><p>Bocal listens for a steady pitch before it shows a note. A short dropout won’t make the display jump.</p></div>
            <div className="onboarding-tuner-visual"><small>ACQUIRING</small><strong>A<sup>4</sup></strong><div><i /><b /></div><span>−50</span><span>0</span><span>+50</span></div>
          </div>
        )}
        {step === 2 && (
          <div className="onboarding-scene contact-onboarding-scene">
            <div className="onboarding-copy"><span><CircleDot size={17} /> Key glow</span><h3>Follow the light.</h3><p>Each note lights only the touch-pieces you need. Rotate the instrument to find the side and thumb keys; nothing sits between you and the keywork.</p></div>
            <div className="onboarding-contact-visual" aria-hidden="true"><span className="onboarding-key-rail" /><b /><b /><b /><em>KEY GLOW</em></div>
          </div>
        )}
        {step === 3 && (
          <div className="onboarding-scene privacy-onboarding-scene">
            <div className="onboarding-copy"><span><LockKeyhole size={17} /> Your data</span><h3>Nothing leaves your device.</h3><p>Pitch readings, practice time and scores stay in this browser. You don’t need an account.</p></div>
            <div className="onboarding-proof-grid">
              <span className="proof-tune"><Crosshair size={18} /><i>LIVE PITCH</i><strong>Tune</strong><small>Settle on the note instead of chasing the needle.</small><b>±5¢ target</b></span>
              <span className="proof-practice"><Music2 size={18} /><i>YOUR SESSION</i><strong>Practice</strong><small>Build a focused set and keep a simple local history.</small><b>15 min plan</b></span>
              <span className="proof-learn"><Sparkles size={18} /><i>3D KEY MAP</i><strong>Learn</strong><small>Choose a note and see the exact touch-pieces light up.</small><b>Live key glow</b></span>
            </div>
          </div>
        )}

        <footer className="onboarding-actions">
          <button className="onboarding-back" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft size={16} /> Back</button>
          {step === 0 ? (
            <button className="experience-primary" disabled={!focusedInstrument.availableId} onClick={chooseFocused}>{focusedInstrument.availableId ? "Use this instrument" : "Coming next"} {focusedInstrument.availableId && <ArrowRight size={16} />}</button>
          ) : step < ONBOARDING_STEPS.length - 1 ? (
            <button className="experience-primary" onClick={() => setStep((value) => value + 1)}>Continue <ArrowRight size={16} /></button>
          ) : (
            <button className="experience-primary" onClick={finish}>Enter Bocal <ArrowRight size={16} /></button>
          )}
        </footer>
      </section>
    </div>
  );
}

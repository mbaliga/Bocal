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
import {
  INSTRUMENT_GROUPS,
  INSTRUMENTS,
  instrumentsInGroup,
  type InstrumentGroupId,
  type InstrumentId,
} from "./instruments";

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

type OtherInstrumentGroupId = Exclude<InstrumentGroupId, "woodwinds">;

type OtherInstrument = {
  id: string;
  group: OtherInstrumentGroupId;
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
  {
    id: "bari-sax",
    name: "Baritone saxophone",
    family: "Saxophone family",
    pitch: "E♭",
    status: "Fingering trainer · shown on an alto, no low A",
    // Decorative, original card art only. The lab remains explicitly scoped
    // to the validated alto-model fingering map below.
    image: "/images/bocal-baritone-sax-cinematic-v2.png",
    imagePosition: "62% center",
    gradient: "linear-gradient(160deg, #4a2a12, #1b1410)",
    availableId: "bari-sax",
  },
  { id: "flute", name: "Flute", family: "Air reed", pitch: "C", status: "Tuner + practice · lab pending", image: "/images/bocal-flute-cinematic.webp", imagePosition: "54% center", gradient: "linear-gradient(160deg, #5b6573, #181c24)", availableId: "flute" },
  { id: "bassoon", name: "Bassoon", family: "Double reed", pitch: "C", status: "Tuner + practice · lab pending", image: "/images/bocal-bassoon-cinematic.webp", imagePosition: "61% center", gradient: "linear-gradient(160deg, #5b281e, #1d1112)", availableId: "bassoon" },
  { id: "clarinet", name: "Clarinet", family: "Single reed", pitch: "B♭", status: "Not shipping · commercial licence required", image: "/images/bocal-clarinet-cinematic.webp", imagePosition: "55% center", gradient: "linear-gradient(160deg, #293652, #12121c)" },
];

// These categories are entry points to the deliberately small profiles in
// instruments.ts. Each profile has a specific written/concert relationship
// and primary staff clef; category membership alone never supplies a guessed
// transposition, range, tuning, or fingering map.
const OTHER_INSTRUMENTS: OtherInstrument[] = [
  { id: "bowed-strings", group: "bowed-strings", name: "Bowed strings", family: "Violin · viola · cello · bass", status: "Choose a tuner profile", gradient: "linear-gradient(145deg, #7a301f, #24130f 70%)", art: "bowed" },
  { id: "fretted-strings", group: "fretted-strings", name: "Fretted & plucked", family: "Guitar · bass guitar · harp", status: "Choose a tuner profile", gradient: "linear-gradient(145deg, #835b1e, #21170e 70%)", art: "fretted" },
  { id: "brass", group: "brass", name: "Brass", family: "Trumpet · horn · trombone · tuba", status: "Choose a tuner profile", gradient: "linear-gradient(145deg, #76500e, #24190b 70%)", art: "brass" },
  { id: "keyboards", group: "keyboards", name: "Keyboards", family: "Piano · organ · synthesizer", status: "Choose a tuner profile", gradient: "linear-gradient(145deg, #304767, #101a28 70%)", art: "keys" },
  { id: "percussion", group: "percussion", name: "Percussion", family: "Pitched mallet instruments", status: "Choose a tuner profile", gradient: "linear-gradient(145deg, #6c253e, #221018 70%)", art: "percussion" },
  { id: "voice", group: "voice", name: "Voice", family: "Concert-pitch vocal tuning", status: "Choose a tuner profile", gradient: "linear-gradient(145deg, #553d71, #1c132b 70%)", art: "voice" },
  { id: "electronic", group: "electronic", name: "Electronic audio", family: "Speaker or amp through the microphone", status: "Choose a tuner profile", gradient: "linear-gradient(145deg, #0b5555, #0b2025 70%)", art: "electronic" },
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

function OtherInstrumentCollection({
  selectedId,
  activeGroup,
  focusedProfileId,
  onGroupChange,
  onProfileFocus,
  onSelect,
}: {
  selectedId: InstrumentId;
  activeGroup: OtherInstrumentGroupId | null;
  focusedProfileId: InstrumentId | null;
  onGroupChange: (group: OtherInstrumentGroupId) => void;
  onProfileFocus: (id: InstrumentId) => void;
  onSelect: (id: InstrumentId) => void;
}) {
  const profiles = activeGroup ? instrumentsInGroup(activeGroup) : [];
  const focusedProfile = profiles.find((profile) => profile.id === focusedProfileId) ?? profiles[0];

  return (
    <section className="other-instruments" aria-labelledby="other-instruments-title">
      <header className="other-instruments-heading">
        <div>
          <p className="eyebrow">Beyond woodwinds</p>
          <h3 id="other-instruments-title">Other Instruments</h3>
        </div>
        <p>Choose a family, then a profile with a defined tuning and notation baseline. 3D fingering guidance remains unavailable unless it has been validated separately.</p>
      </header>
      <div className="other-instrument-grid" role="group" aria-label="Instrument families">
        {OTHER_INSTRUMENTS.map((item) => (
          <button
            type="button"
            className={`other-instrument-card is-${item.art} ${activeGroup === item.group ? "is-selected" : ""}`}
            key={item.id}
            aria-pressed={activeGroup === item.group}
            aria-expanded={activeGroup === item.group}
            aria-controls="other-instrument-profile-panel"
            onClick={() => onGroupChange(item.group)}
            style={{ backgroundImage: item.gradient }}
          >
            <span className={`other-instrument-art is-${item.art}`} aria-hidden="true"><i /><b /><em /></span>
            <span className="other-instrument-copy">
              <small>{item.family}</small>
              <strong>{item.name}</strong>
              <em>{item.status}</em>
            </span>
          </button>
        ))}
      </div>
      {activeGroup && focusedProfile && (
        <section className="other-instrument-profile-panel" id="other-instrument-profile-panel" aria-labelledby="other-instrument-profile-title">
          <header>
            <div>
              <p className="eyebrow">{INSTRUMENT_GROUPS[activeGroup].name}</p>
              <h4 id="other-instrument-profile-title">Choose the instrument in your hands.</h4>
            </div>
            <p>{INSTRUMENT_GROUPS[activeGroup].summary}. These profiles make the tuner, pulse, and local analysis usable; none adds a fingering map.</p>
          </header>
          <div className="other-instrument-profile-grid" role="listbox" aria-label={`${INSTRUMENT_GROUPS[activeGroup].name} profiles`}>
            {profiles.map((profile) => (
              <button
                type="button"
                key={profile.id}
                role="option"
                aria-selected={profile.id === focusedProfile.id}
                className={`other-instrument-profile ${profile.id === focusedProfile.id ? "is-focused" : ""} ${profile.id === selectedId ? "is-current" : ""}`}
                onClick={() => onProfileFocus(profile.id)}
              >
                <small>{profile.family} · {profile.pitchLabel}</small>
                <strong>{profile.name}</strong>
                <span>{profile.labStatus}</span>
                {profile.id === selectedId && <em>Current</em>}
              </button>
            ))}
          </div>
          <footer className="other-instrument-profile-action">
            <div>
              <small>{focusedProfile.family} · {focusedProfile.pitchLabel}</small>
              <strong>{focusedProfile.name}</strong>
              <span>{focusedProfile.tunerDescription}</span>
            </div>
            <button type="button" className="experience-primary" onClick={() => onSelect(focusedProfile.id)}>Use {focusedProfile.shortName} <ArrowRight size={16} /></button>
          </footer>
        </section>
      )}
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
  const [activeOtherGroup, setActiveOtherGroup] = useState<OtherInstrumentGroupId | null>(null);
  const [focusedOtherProfileId, setFocusedOtherProfileId] = useState<InstrumentId | null>(null);
  useEscape(open, onClose);
  if (!open) return null;
  const focused = WOODWIND_GALLERY_INSTRUMENTS.find((item) => item.id === focusedId) ?? WOODWIND_GALLERY_INSTRUMENTS[0];

  const chooseOtherGroup = (group: OtherInstrumentGroupId) => {
    const profiles = instrumentsInGroup(group);
    const current = INSTRUMENTS[selectedId];
    setActiveOtherGroup(group);
    setFocusedOtherProfileId(current.group === group ? current.id : profiles[0]?.id ?? null);
  };

  return (
    <div className="experience-overlay" role="presentation">
      <section className="instrument-experience" role="dialog" aria-modal="true" aria-labelledby="instrument-experience-title">
        <header className="experience-header">
          <div><p className="eyebrow">Choose an instrument</p><h2 id="instrument-experience-title">What are you playing today?</h2><p>Every selection below changes Bocal’s live tuner, written-pitch display, pulse and local analysis. 3D guidance stays unavailable until its model and map have been validated.</p></div>
          <button onClick={onClose} aria-label="Close instrument selection"><X size={20} /></button>
        </header>
        <section className="instrument-gallery-section" aria-labelledby="woodwind-instruments-title">
          <div className="instrument-gallery-heading"><span id="woodwind-instruments-title">Woodwinds</span><small>{WOODWIND_GALLERY_INSTRUMENTS.filter((item) => item.availableId).length} profiles ready</small></div>
          <InstrumentPanelDeck focusedId={focusedId} selectedId={selectedId} onFocus={setFocusedId} />
        </section>
        <OtherInstrumentCollection
          selectedId={selectedId}
          activeGroup={activeOtherGroup}
          focusedProfileId={focusedOtherProfileId}
          onGroupChange={chooseOtherGroup}
          onProfileFocus={setFocusedOtherProfileId}
          onSelect={onSelect}
        />
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
            <div className="onboarding-contact-visual" aria-hidden="true"><b /><b /><b /><em>KEY GLOW</em></div>
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

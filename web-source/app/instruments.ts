export type InstrumentId = "alto-sax" | "oboe";

export type InstrumentProfile = {
  id: InstrumentId;
  name: string;
  shortName: string;
  pitchLabel: string;
  writtenOffset: number;
  tunerDescription: string;
  labStatus: string;
};

export const INSTRUMENTS: Record<InstrumentId, InstrumentProfile> = {
  "alto-sax": {
    id: "alto-sax",
    name: "Alto saxophone",
    shortName: "Alto sax",
    pitchLabel: "E♭",
    writtenOffset: 9,
    tunerDescription: "Your written note is shown first. Bocal handles the E♭ transposition.",
    labStatus: "Fingering trainer + 3D reference",
  },
  oboe: {
    id: "oboe",
    name: "Oboe",
    shortName: "Oboe",
    pitchLabel: "C",
    writtenOffset: 0,
    tunerDescription: "The oboe is a concert-pitch instrument, so written and sounding notes match.",
    labStatus: "3D anatomy preview",
  },
};

export const INSTRUMENT_ORDER: InstrumentId[] = ["alto-sax", "oboe"];

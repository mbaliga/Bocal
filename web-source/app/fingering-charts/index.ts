import type { InstrumentId } from "../instruments";
import { BASSOON_CHART } from "./bassoon";
import { CLARINET_CHART } from "./clarinet";
import { FLUTE_CHART } from "./flute";
import { OBOE_CHART } from "./oboe";
import type { FingeringChart } from "./types";

export type { ChartAlternate, ChartKey, ChartKeyHand, ChartKeyShape, Fingering, FingeringChart } from "./types";

/**
 * Every 2D fingering chart Bocal ships, keyed by the instrument that plays
 * from it. The cor anglais has no chart of its own -- it shares the oboe's
 * conservatoire key system, so it points at `OBOE_CHART` -- the same honest
 * borrowing the oboe's 3D anatomy preview already does (see OboeLab.tsx).
 * Every caller that renders this for cor-anglais must disclose that the
 * chart is the oboe's, the way `FingeringChartLab` and `OboeLab` do.
 */
/**
 * The cor anglais shares the oboe's conservatoire key system and chart, but
 * its written range starts at B3 -- it has no low B♭ key (WFG ob_bas_1
 * flags the low B♭ fingering itself as "For oboes without the low Bb key",
 * i.e. model-dependent even on the oboe). Trim the borrowed chart so the
 * note picker never offers a note the instrument cannot play.
 */
const CENTER_ANGLAIS_CHART: FingeringChart = {
  ...OBOE_CHART,
  instrumentId: "cor-anglais",
  fingerings: OBOE_CHART.fingerings.filter((f) => f.writtenMidi >= 59),
};

export const FINGERING_CHARTS: Partial<Record<InstrumentId, FingeringChart>> = {
  flute: FLUTE_CHART,
  clarinet: CLARINET_CHART,
  bassoon: BASSOON_CHART,
  oboe: OBOE_CHART,
  "cor-anglais": CENTER_ANGLAIS_CHART,
};

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
export const FINGERING_CHARTS: Partial<Record<InstrumentId, FingeringChart>> = {
  flute: FLUTE_CHART,
  clarinet: CLARINET_CHART,
  bassoon: BASSOON_CHART,
  oboe: OBOE_CHART,
  "cor-anglais": OBOE_CHART,
};

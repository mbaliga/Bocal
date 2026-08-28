export const PRACTICE_ACTIVITY_STORAGE_KEY = "bocal-practice-activity-v1";
export const SONG_WISHLIST_STORAGE_KEY = "bocal-song-wishlist-v1";
export const COMPLETED_PRACTICE_STORAGE_KEY = "bocal-completed-practice-v1";

export type PracticeActivityType = "tuning" | "fingering" | "rhythm" | "chords" | "analysis" | "repertoire" | "session";

export type PracticeActivity = {
  id: string;
  capturedAt: string;
  seconds: number;
  type: PracticeActivityType;
  instrumentId?: string;
  notes?: string[];
  label?: string;
};

export type SongWish = {
  id: string;
  title: string;
  addedAt: string;
  status: "wishlist" | "studying";
  instrumentId?: string;
  progress?: number;
  updatedAt?: string;
};

const ACTIVITY_TYPES = new Set<PracticeActivityType>(["tuning", "fingering", "rhythm", "chords", "analysis", "repertoire", "session"]);

function isActivity(value: unknown): value is PracticeActivity {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PracticeActivity>;
  return typeof candidate.id === "string"
    && typeof candidate.capturedAt === "string"
    && typeof candidate.seconds === "number"
    && typeof candidate.type === "string"
    && ACTIVITY_TYPES.has(candidate.type as PracticeActivityType);
}

export function parsePracticeActivities(raw: string | null | undefined): PracticeActivity[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isActivity) : [];
  } catch {
    return [];
  }
}

export function recordPracticeActivity(activity: Omit<PracticeActivity, "id" | "capturedAt"> & Partial<Pick<PracticeActivity, "id" | "capturedAt">>) {
  if (typeof window === "undefined") return;
  const capturedAt = activity.capturedAt ?? new Date().toISOString();
  const entry: PracticeActivity = {
    id: activity.id ?? `activity-${capturedAt}-${Math.random().toString(36).slice(2, 8)}`,
    capturedAt,
    seconds: Math.max(0, Math.round(activity.seconds)),
    type: activity.type,
    instrumentId: activity.instrumentId,
    notes: activity.notes?.filter((note) => note.trim()).slice(0, 24),
    label: activity.label?.trim() || undefined,
  };
  try {
    const current = parsePracticeActivities(localStorage.getItem(PRACTICE_ACTIVITY_STORAGE_KEY));
    localStorage.setItem(PRACTICE_ACTIVITY_STORAGE_KEY, JSON.stringify([entry, ...current].slice(0, 360)));
    window.dispatchEvent(new Event("bocal-practice-activity"));
  } catch {
    // Local history is optional; the current practice interaction still completes.
  }
}

function isSongWish(value: unknown): value is SongWish {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SongWish>;
  return typeof candidate.id === "string"
    && typeof candidate.title === "string"
    && typeof candidate.addedAt === "string"
    && (candidate.status === "wishlist" || candidate.status === "studying");
}

export function parseSongWishlist(raw: string | null | undefined): SongWish[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSongWish).slice(0, 60) : [];
  } catch {
    return [];
  }
}

export function addSongWish(title: string) {
  if (typeof window === "undefined") return;
  const cleanTitle = title.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!cleanTitle) return;
  const addedAt = new Date().toISOString();
  const entry: SongWish = {
    id: `wish-${addedAt}-${Math.random().toString(36).slice(2, 8)}`,
    title: cleanTitle,
    addedAt,
    status: "wishlist",
    progress: 0,
  };
  try {
    const current = parseSongWishlist(localStorage.getItem(SONG_WISHLIST_STORAGE_KEY));
    localStorage.setItem(SONG_WISHLIST_STORAGE_KEY, JSON.stringify([entry, ...current].slice(0, 60)));
    window.dispatchEvent(new Event("bocal-song-wishlist"));
  } catch {
    // A song title is a local convenience, not a condition of practice.
  }
}

export function updateSongWish(id: string, patch: Partial<Pick<SongWish, "status" | "instrumentId" | "progress">>) {
  if (typeof window === "undefined") return;
  try {
    const current = parseSongWishlist(localStorage.getItem(SONG_WISHLIST_STORAGE_KEY));
    const next = current.map((wish) => wish.id === id ? {
      ...wish,
      ...patch,
      progress: patch.progress === undefined ? wish.progress : Math.max(0, Math.min(100, Math.round(patch.progress))),
      updatedAt: new Date().toISOString(),
    } : wish);
    localStorage.setItem(SONG_WISHLIST_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("bocal-song-wishlist"));
  } catch {
    // A progress update is optional; the rest of practice remains available.
  }
}

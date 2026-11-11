// The fixed input behind android/app/src/test/resources/widget-snapshot-v1.json, the
// snapshot both sides of the widget bridge are tested against: widget-snapshot.test.mjs
// rebuilds it (in UTC) and must match the file byte for byte in meaning, and the
// Android JVM tests parse the same file. If the snapshot format changes on purpose,
// regenerate the file as JSON.stringify(buildWidgetSnapshot(contractInput()), null, 2)
// with TZ=UTC, and update WidgetSnapshotParser.kt and its tests in the same change.
export function contractInput() {
  return {
    now: new Date("2026-11-04T12:00:00.000Z"),
    activities: [
      { id: "a1", capturedAt: "2026-11-04T09:40:00.000Z", seconds: 720, type: "tuning", label: "Typed by the player", notes: ["A4"] },
      { id: "a2", capturedAt: "2026-11-03T18:05:00.000Z", seconds: 480, type: "rhythm", label: "Metronome" },
      { id: "a3", capturedAt: "2026-11-02T07:30:00.000Z", seconds: 180, type: "analysis" },
      { id: "a4", capturedAt: "2026-10-31T20:00:00.000Z", seconds: 1500, type: "vocal" },
      { id: "a5", capturedAt: "2026-10-29T10:00:00.000Z", seconds: 600, type: "chords" },
      { id: "a6", capturedAt: "2026-10-28T10:00:00.000Z", seconds: 900, type: "tuning" },
    ],
    sessions: [{ date: "2026-11-04T08:00:00.000Z", seconds: 1500 }],
    songs: [
      { id: "s1", title: "Autumn Leaves", addedAt: "2026-10-20T10:00:00.000Z", updatedAt: "2026-11-03T10:00:00.000Z", status: "studying", progress: 40 },
      { id: "s2", title: "Blue Bossa", addedAt: "2026-10-21T10:00:00.000Z", status: "studying", progress: 15 },
      { id: "s3", title: "A wish", addedAt: "2026-10-22T10:00:00.000Z", status: "wishlist", progress: 0 },
    ],
    weeklyGoalMinutes: 60,
    instrumentId: "alto-sax",
    labLabel: "Lab",
    referenceHz: 442,
    temperament: "Equal",
  };
}

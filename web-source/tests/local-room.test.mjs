import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("local practice rooms have an explicit bounded, host-authoritative contract", async () => {
  const reducer = await readFile(new URL("../app/local-room.ts", import.meta.url), "utf8");
  assert.match(reducer, /LOCAL_ROOM_ACTIVITY_LIMIT = 30/);
  assert.match(reducer, /LOCAL_ROOM_ACTION_LIMIT = 256/);
  assert.match(reducer, /room\.members\.length >= 8/);
  assert.match(reducer, /action\.actorId !== room\.hostId/);
  assert.match(reducer, /room\.phase === "closed"/);
  assert.match(reducer, /actionAlreadyApplied/);
  assert.match(reducer, /lobby" && action\.phase === "active/);
});

test("local practice rooms use same-browser coordination and keep audio private", async () => {
  const room = await readFile(new URL("../app/CoachRoom.tsx", import.meta.url), "utf8");
  assert.match(room, /new BroadcastChannel/);
  assert.match(room, /sessionStorage/);
  assert.doesNotMatch(room, /localStorage\.(?:getItem|setItem|removeItem)/);
  assert.match(room, /not microphone audio or recordings/i);
  assert.doesNotMatch(room, /getUserMedia|MediaRecorder|RTCPeerConnection/);
  assert.match(room, /same device and browser profile/i);
});

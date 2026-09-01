/**
 * Browser counterpart to shared-libraries-asoc :local-session-core.
 *
 * It intentionally owns no audio, identity, backend or discovery policy. This
 * reducer is the deterministic local-room state Bocal can use in a same-device
 * studio now; a nearby-device transport may carry the same explicit actions
 * later without changing the practice UI or sending microphone audio.
 */

export const LOCAL_ROOM_SCHEMA_VERSION = 1;
export const LOCAL_ROOM_ACTIVITY_LIMIT = 30;
export const LOCAL_ROOM_ACTION_LIMIT = 256;

export type LocalRoomRole = "host" | "coach" | "player" | "observer";
export type LocalRoomPhase = "lobby" | "active" | "paused" | "closed";

export type LocalRoomMember = {
  id: string;
  name: string;
  role: LocalRoomRole;
  ready: boolean;
  joinedAt: string;
};

export type LocalRoomActivity = {
  id: string;
  kind: "room" | "cue" | "ready";
  authorId: string;
  text: string;
  createdAt: string;
};

export type LocalRoomState = {
  schemaVersion: number;
  code: string;
  hostId: string;
  phase: LocalRoomPhase;
  revision: number;
  members: LocalRoomMember[];
  activity: LocalRoomActivity[];
  appliedActionIds: string[];
};

export type LocalRoomAction =
  | { id: string; type: "join"; actorId: string; member: LocalRoomMember }
  | { id: string; type: "ready"; actorId: string; ready: boolean; createdAt: string }
  | { id: string; type: "phase"; actorId: string; phase: LocalRoomPhase; createdAt: string }
  | { id: string; type: "cue"; actorId: string; text: string; createdAt: string };

function keepNewest<T>(items: T[], limit: number) {
  return items.slice(Math.max(0, items.length - limit));
}

function actionAlreadyApplied(room: LocalRoomState, actionId: string) {
  return room.appliedActionIds.includes(actionId);
}

function next(room: LocalRoomState, actionId: string, changes: Partial<LocalRoomState>): LocalRoomState {
  return {
    ...room,
    ...changes,
    revision: room.revision + 1,
    appliedActionIds: keepNewest([...room.appliedActionIds, actionId], LOCAL_ROOM_ACTION_LIMIT),
  };
}

function activity(id: string, kind: LocalRoomActivity["kind"], authorId: string, text: string, createdAt: string): LocalRoomActivity {
  return { id, kind, authorId, text, createdAt };
}

export function createLocalRoom(code: string, host: LocalRoomMember): LocalRoomState {
  if (host.role !== "host") throw new Error("The first room member must be the host.");
  return {
    schemaVersion: LOCAL_ROOM_SCHEMA_VERSION,
    code,
    hostId: host.id,
    phase: "lobby",
    revision: 0,
    members: [host],
    activity: [activity(`created-${host.id}`, "room", host.id, "Room created. Invite a player with this room code.", host.joinedAt)],
    appliedActionIds: [],
  };
}

export function applyLocalRoomAction(room: LocalRoomState, action: LocalRoomAction): LocalRoomState {
  if (actionAlreadyApplied(room, action.id) || room.phase === "closed") return room;

  if (action.type === "join") {
    if (room.members.some((member) => member.id === action.member.id)) return room;
    if (action.member.role === "host" || room.members.length >= 8) return room;
    return next(room, action.id, {
      members: [...room.members, action.member],
      activity: keepNewest([...room.activity, activity(action.id, "room", action.member.id, `${action.member.name} joined the room.`, action.member.joinedAt)], LOCAL_ROOM_ACTIVITY_LIMIT),
    });
  }

  const actor = room.members.find((member) => member.id === action.actorId);
  if (!actor) return room;

  if (action.type === "ready") {
    const members = room.members.map((member) => member.id === action.actorId ? { ...member, ready: action.ready } : member);
    return next(room, action.id, {
      members,
      activity: keepNewest([...room.activity, activity(action.id, "ready", actor.id, `${actor.name} is ${action.ready ? "ready" : "not ready"}.`, action.createdAt)], LOCAL_ROOM_ACTIVITY_LIMIT),
    });
  }

  if (action.actorId !== room.hostId) return room;

  if (action.type === "phase") {
    const legal = (room.phase === "lobby" && action.phase === "active")
      || (room.phase === "active" && (action.phase === "paused" || action.phase === "closed"))
      || (room.phase === "paused" && (action.phase === "active" || action.phase === "closed"));
    if (!legal) return room;
    const label = action.phase === "active" ? "Practice room started." : action.phase === "paused" ? "Practice room paused." : "Practice room closed.";
    return next(room, action.id, {
      phase: action.phase,
      activity: keepNewest([...room.activity, activity(action.id, "room", actor.id, label, action.createdAt)], LOCAL_ROOM_ACTIVITY_LIMIT),
    });
  }

  const text = action.text.trim().slice(0, 240);
  if (!text) return room;
  return next(room, action.id, {
    activity: keepNewest([...room.activity, activity(action.id, "cue", actor.id, text, action.createdAt)], LOCAL_ROOM_ACTIVITY_LIMIT),
  });
}

export function parseLocalRoom(value: string | null): LocalRoomState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<LocalRoomState>;
    if (parsed.schemaVersion !== LOCAL_ROOM_SCHEMA_VERSION || typeof parsed.code !== "string" || typeof parsed.hostId !== "string") return null;
    if (!Array.isArray(parsed.members) || !Array.isArray(parsed.activity) || !Array.isArray(parsed.appliedActionIds)) return null;
    if (!["lobby", "active", "paused", "closed"].includes(String(parsed.phase))) return null;
    return {
      schemaVersion: LOCAL_ROOM_SCHEMA_VERSION,
      code: parsed.code,
      hostId: parsed.hostId,
      phase: parsed.phase as LocalRoomPhase,
      revision: Number.isInteger(parsed.revision) ? Number(parsed.revision) : 0,
      members: parsed.members.filter((member): member is LocalRoomMember => Boolean(member && typeof member.id === "string" && typeof member.name === "string" && typeof member.role === "string")),
      activity: parsed.activity.filter((item): item is LocalRoomActivity => Boolean(item && typeof item.id === "string" && typeof item.text === "string")),
      appliedActionIds: parsed.appliedActionIds.filter((id): id is string => typeof id === "string").slice(-LOCAL_ROOM_ACTION_LIMIT),
    };
  } catch {
    return null;
  }
}

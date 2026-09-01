"use client";

import { Check, Copy, Crown, Link2, Pause, Play, Radio, Send, ShieldCheck, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyLocalRoomAction,
  createLocalRoom,
  parseLocalRoom,
  type LocalRoomAction,
  type LocalRoomMember,
  type LocalRoomRole,
  type LocalRoomState,
} from "./local-room";

const ROOM_STORAGE_KEY = "bocal-local-coach-room-v1";
const CHANNEL_PREFIX = "bocal-local-coach-room:";

type RoomMessage =
  | { kind: "request-snapshot"; senderId: string }
  | { kind: "snapshot"; senderId: string; room: LocalRoomState }
  | { kind: "action"; senderId: string; action: LocalRoomAction };

function makeId(prefix: string) {
  const entropy = globalThis.crypto?.randomUUID?.().replaceAll("-", "") ?? Math.random().toString(36).slice(2);
  return `${prefix}-${entropy.slice(0, 12)}`;
}

function makeCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function now() {
  return new Date().toISOString();
}

function roleLabel(role: LocalRoomRole) {
  return role === "host" ? "Host" : role === "coach" ? "Coach" : role === "observer" ? "Observer" : "Player";
}

export function CoachRoom({ onClose }: { onClose: () => void }) {
  const [clientId] = useState(() => makeId("device"));
  const channelRef = useRef<BroadcastChannel | null>(null);
  const roomRef = useRef<LocalRoomState | null>(null);
  const [room, setRoom] = useState<LocalRoomState | null>(null);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [role, setRole] = useState<LocalRoomRole>("player");
  const [cue, setCue] = useState("");
  const [status, setStatus] = useState("Create a room for the people in this studio.");

  const persist = useCallback((next: LocalRoomState | null) => {
    roomRef.current = next;
    setRoom(next);
    try {
      // sessionStorage is deliberately per tab/window. localStorage would make
      // a freshly opened joining tab inherit the host's identity before it had
      // actually joined the room.
      if (next) sessionStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(ROOM_STORAGE_KEY);
    } catch {
      // The room can still run in this visit if storage is unavailable.
    }
  }, []);

  const broadcast = useCallback((message: RoomMessage) => channelRef.current?.postMessage(message), []);

  const attachChannel = useCallback((code: string) => {
    channelRef.current?.close();
    if (typeof BroadcastChannel === "undefined") {
      setStatus("This browser cannot open a same-device room. Use a current Chromium, Safari or Firefox build.");
      return;
    }
    const channel = new BroadcastChannel(`${CHANNEL_PREFIX}${code}`);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<RoomMessage>) => {
      const message = event.data;
      if (!message || message.senderId === clientId) return;
      const current = roomRef.current;
      if (message.kind === "request-snapshot") {
        if (current?.hostId === clientId) broadcast({ kind: "snapshot", senderId: clientId, room: current });
        return;
      }
      if (message.kind === "snapshot") {
        if (!current || message.room.revision >= current.revision) {
          persist(message.room);
          setStatus("Room state received from the host.");
        }
        return;
      }
      if (message.kind === "action" && current?.hostId === clientId) {
        const next = applyLocalRoomAction(current, message.action);
        if (next !== current) {
          persist(next);
          broadcast({ kind: "snapshot", senderId: clientId, room: next });
        }
      }
    };
  }, [broadcast, clientId, persist]);

  useEffect(() => {
    const saved = parseLocalRoom(sessionStorage.getItem(ROOM_STORAGE_KEY));
    if (saved) {
      const restoreTimer = window.setTimeout(() => {
        persist(saved);
        attachChannel(saved.code);
        broadcast({ kind: "request-snapshot", senderId: clientId });
        setStatus("Restored this device’s most recent local room.");
      }, 0);
      return () => {
        window.clearTimeout(restoreTimer);
        channelRef.current?.close();
      };
    }
    return () => channelRef.current?.close();
  }, [attachChannel, broadcast, clientId, persist]);

  const sendHostAction = (action: LocalRoomAction) => {
    const current = roomRef.current;
    if (!current) return;
    if (current.hostId === clientId) {
      const next = applyLocalRoomAction(current, action);
      if (next !== current) {
        persist(next);
        broadcast({ kind: "snapshot", senderId: clientId, room: next });
      }
    } else {
      broadcast({ kind: "action", senderId: clientId, action });
      setStatus("Sent to the host. This device will update when the host confirms it.");
    }
  };

  const createRoom = () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setStatus("Add your name before creating a room.");
      return;
    }
    const code = makeCode();
    const host: LocalRoomMember = { id: clientId, name: cleanName, role: "host", ready: true, joinedAt: now() };
    attachChannel(code);
    const next = createLocalRoom(code, host);
    persist(next);
    setStatus("Room ready. Share its six-character code with another Bocal tab or window on this device.");
  };

  const joinRoom = () => {
    const cleanName = name.trim();
    const code = joinCode.trim().toUpperCase();
    if (!cleanName || code.length !== 6) {
      setStatus("Enter your name and a six-character room code.");
      return;
    }
    attachChannel(code);
    const member: LocalRoomMember = { id: clientId, name: cleanName, role, ready: false, joinedAt: now() };
    const action: LocalRoomAction = { id: makeId("join"), type: "join", actorId: member.id, member };
    broadcast({ kind: "request-snapshot", senderId: clientId });
    broadcast({ kind: "action", senderId: clientId, action });
    setStatus("Join request sent. Keep this room open while the host accepts the shared state.");
  };

  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setStatus("Room code copied.");
    } catch {
      setStatus(`Room code: ${room.code}`);
    }
  };

  const self = room?.members.find((member) => member.id === clientId);
  const isHost = room?.hostId === clientId;
  const readyCount = room?.members.filter((member) => member.ready).length ?? 0;
  const canStart = Boolean(isHost && room && room.members.length > 1 && room.members.every((member) => member.ready));

  return (
    <div className="coach-room-overlay" role="presentation">
      <section className="coach-room" role="dialog" aria-modal="true" aria-labelledby="coach-room-title">
        <header className="coach-room-header">
          <div>
            <p className="eyebrow">Studio circle · Local practice room</p>
            <h2 id="coach-room-title">Practice together. Keep the audio private.</h2>
            <p>Each person tunes on their own device or tab. Bocal shares only explicit roster, readiness and coaching cues—not microphone audio or recordings.</p>
          </div>
          <button onClick={onClose} aria-label="Close local practice room"><X size={19} /></button>
        </header>

        {!room ? (
          <div className="coach-room-entry">
            <section>
              <span className="coach-room-mark"><UsersRound size={24} /></span>
              <h3>Start the circle</h3>
              <p>Use this first release with Bocal tabs or windows on the same device and browser profile. Nearby-device pairing remains a separate, unconnected transport.</p>
              <label>Your name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Coach, player or observer" /></label>
              <button className="coach-primary" onClick={createRoom}><Crown size={16} /> Create local room</button>
            </section>
            <section>
              <span className="coach-room-mark is-join"><Link2 size={24} /></span>
              <h3>Join a circle</h3>
              <p>Open Bocal in another tab/window, then enter the room code the host copied.</p>
              <label>Your name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Your name" /></label>
              <label>Room code<input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} maxLength={6} placeholder="ABC123" /></label>
              <div className="coach-role-choice" role="radiogroup" aria-label="Room role">
                {(["player", "coach", "observer"] as LocalRoomRole[]).map((choice) => <button key={choice} role="radio" aria-checked={role === choice} className={role === choice ? "is-active" : ""} onClick={() => setRole(choice)}>{roleLabel(choice)}</button>)}
              </div>
              <button className="coach-secondary" onClick={joinRoom}><Radio size={16} /> Join local room</button>
            </section>
          </div>
        ) : (
          <div className="coach-room-live">
            <section className="room-status-card">
              <div><span className={`room-phase is-${room.phase}`}>{room.phase === "active" ? "In practice" : room.phase === "paused" ? "Paused" : room.phase === "closed" ? "Closed" : "Lobby"}</span><strong>{room.code}</strong><small>Room code · same-device session</small></div>
              <button onClick={copyCode}><Copy size={15} /> Copy code</button>
            </section>
            <div className="coach-room-grid">
              <section className="room-roster">
                <header><div><span className="card-kicker"><UsersRound size={14} /> In the circle</span><h3>{room.members.length} people · {readyCount} ready</h3></div><span className="local-chip"><ShieldCheck size={12} /> Local</span></header>
                <div className="member-list">
                  {room.members.map((member) => <article key={member.id} className={member.ready ? "is-ready" : ""}><span>{member.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.name}</strong><small>{roleLabel(member.role)}{member.id === room.hostId ? " · room host" : ""}</small></div><i>{member.ready ? <Check size={14} /> : ""}</i></article>)}
                </div>
                {self && room.phase !== "closed" && <button className={`ready-button ${self.ready ? "is-ready" : ""}`} onClick={() => sendHostAction({ id: makeId("ready"), type: "ready", actorId: clientId, ready: !self.ready, createdAt: now() })}>{self.ready ? <Check size={16} /> : null}{self.ready ? "I’m ready" : "Mark me ready"}</button>}
              </section>
              <section className="room-coach-panel">
                <header><div><span className="card-kicker"><Crown size={14} /> Coach controls</span><h3>One clear next cue.</h3></div></header>
                <div className="room-phase-actions">
                  <button disabled={!canStart} onClick={() => sendHostAction({ id: makeId("start"), type: "phase", actorId: clientId, phase: "active", createdAt: now() })}><Play size={15} fill="currentColor" /> Start together</button>
                  <button disabled={!isHost || room.phase !== "active"} onClick={() => sendHostAction({ id: makeId("pause"), type: "phase", actorId: clientId, phase: "paused", createdAt: now() })}><Pause size={15} fill="currentColor" /> Pause</button>
                </div>
                <div className="cue-presets">{["Long tone · breathe together", "Listen for the center", "Reset. One calm entrance."].map((preset) => <button key={preset} disabled={!isHost || room.phase === "closed"} onClick={() => sendHostAction({ id: makeId("cue"), type: "cue", actorId: clientId, text: preset, createdAt: now() })}>{preset}</button>)}</div>
                <label className="coach-cue-input"><span>Custom cue</span><textarea value={cue} onChange={(event) => setCue(event.target.value)} maxLength={240} placeholder="Write one precise thing to try next…" /><button disabled={!isHost || !cue.trim() || room.phase === "closed"} onClick={() => { sendHostAction({ id: makeId("cue"), type: "cue", actorId: clientId, text: cue, createdAt: now() }); setCue(""); }}><Send size={14} /> Send cue</button></label>
              </section>
            </div>
            <section className="room-timeline" aria-label="Room activity"><header><span className="card-kicker"><Radio size={14} /> Shared activity</span><small>Explicit room events only</small></header><div>{[...room.activity].reverse().map((item) => <article key={item.id} className={`is-${item.kind}`}><i /><p>{item.text}</p><time>{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></article>)}</div></section>
          </div>
        )}
        <p className="coach-room-status" role="status">{status}</p>
      </section>
    </div>
  );
}

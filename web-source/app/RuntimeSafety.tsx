"use client";
import { Component, useEffect, useState, type ReactNode } from "react";
import { clearRuntimeStatus, getRuntimeStatus, RUNTIME_STATUS_EVENT, type RuntimeStatus } from "./runtime-status";

function RuntimeNotice() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  useEffect(() => {
    const update = () => setStatus(getRuntimeStatus());
    window.addEventListener(RUNTIME_STATUS_EVENT, update);
    update();
    return () => window.removeEventListener(RUNTIME_STATUS_EVENT, update);
  }, []);
  if (!status) return null;
  return <aside role="alert" style={{ position: "fixed", zIndex: 10000, top: "max(12px, env(safe-area-inset-top))", left: 12, right: 12, margin: "0 auto", maxWidth: 640, padding: 16, borderRadius: 12, background: "#fff3d6", color: "#30220b", border: "2px solid #7c5600", boxShadow: "0 4px 20px #0004", fontSize: 16, lineHeight: 1.5 }}>
    <strong>Bocal needs your attention</strong>
    <p style={{ margin: "8px 0", overflowWrap: "anywhere" }}>{status.message}</p>
    <button type="button" onClick={clearRuntimeStatus} style={{ minHeight: 44, padding: "8px 16px", background: "#30220b", color: "#ffffff", borderRadius: 8, border: 0 }}>Dismiss</button>
  </aside>;
}

class AppRecovery extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" style={{ padding: 24, minHeight: "100dvh", background: "#f7f5ee", color: "#202020", fontSize: 18, lineHeight: 1.6 }}>
      <h1>Bocal could not display this screen.</h1>
      <p>Reload to reopen the app. Saved practice data is not cleared. A recording that had not finished saving may be lost.</p>
      <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 48, padding: "10px 20px", background: "#202020", color: "#ffffff", border: 0, borderRadius: 8 }}>Reload Bocal</button>
    </main>;
  }
}

export function RuntimeSafety({ children }: { children: ReactNode }) {
  return <><AppRecovery>{children}</AppRecovery><RuntimeNotice /></>;
}

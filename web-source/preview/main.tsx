// Standalone/Android entry. Keep runtime recovery identical to the hosted app.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import { RuntimeSafety } from "../app/RuntimeSafety";
import "../app/globals.css";
import "./preview-fonts.css";
import "../app/styles/contrast.css";
import "../app/styles/compact-layout.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><RuntimeSafety><Home /></RuntimeSafety></StrictMode>,
);

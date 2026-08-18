// Entry point for the standalone preview build only. The real app is
// mounted by vinext's RSC pipeline (app/layout.tsx + the Sites worker);
// this file exists solely so app/page.tsx can be opened as a plain static
// file, with no server, for on-device testing.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";
import "./preview-fonts.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);

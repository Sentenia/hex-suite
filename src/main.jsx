import React from "react";
import { createRoot } from "react-dom/client";
import StakeTracker from "./StakeTracker.jsx";
import "./styles.css";

// Standalone portfolio tracker build. The pDAI vault UI (App.jsx / ConvictionPreview.jsx)
// is deliberately not imported — the vault ships separately once its security and legal
// review gates are cleared, so no vault code reaches this bundle.
function resolveView() {
  const page = new URLSearchParams(window.location.search).get("page");

  if (page === "stakes") {
    return "stakes";
  }

  if (page === "hex-stake") {
    return "create";
  }

  return "portfolio";
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <StakeTracker view={resolveView()} />
  </React.StrictMode>
);

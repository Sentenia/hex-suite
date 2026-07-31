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

// Without a boundary, one unexpected render error is a silent white page. Cached wallet
// data lives in localStorage, so a reload almost always recovers.
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="appCrashScreen">
        <h1>Something broke.</h1>
        <p>
          The tracker hit an unexpected error. Your wallets and history are safe in this
          browser's storage — reloading almost always fixes it.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
        <details>
          <summary>Technical details</summary>
          <pre>{String(this.state.error?.stack || this.state.error)}</pre>
        </details>
      </main>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <StakeTracker view={resolveView()} />
    </AppErrorBoundary>
  </React.StrictMode>
);

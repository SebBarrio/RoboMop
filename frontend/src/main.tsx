import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/app.css";
import App from "./App";
import { relay } from "./lib/connection";
import { getState } from "./lib/store";

// Auto-connect if the relay was configured in a previous session.
const { settings } = getState();
if (settings.relayUrl) relay.start(settings);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/app.css";
import App from "./App";
import { listRobots, me } from "./lib/api";
import { relay } from "./lib/connection";
import { getState } from "./lib/store";

// Restore account data in the background while preserving instant reconnect.
const { auth, selectedRobotId } = getState();
if (auth.token) {
  void me(auth.token).catch(() => undefined);
  void listRobots(auth.token).catch(() => undefined);
  if (selectedRobotId) relay.start(selectedRobotId, auth.token);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

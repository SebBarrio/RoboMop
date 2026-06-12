import { useEffect, useState } from "react";
import { Bot, Home, Settings as SettingsIcon } from "lucide-react";
import { AuthView } from "./components/AuthView";
import { EStopTab } from "./components/EStop";
import { HomeView } from "./components/HomeView";
import { RobotsView } from "./components/RobotsView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { relay } from "./lib/connection";
import { getState, useAppStore } from "./lib/store";

export type View = "home" | "robots" | "settings";

export default function App() {
  const authToken = useAppStore((state) => state.auth.token);
  const [view, setView] = useState<View>(() => (getState().selectedRobotId ? "home" : "robots"));

  useEffect(() => {
    if (!authToken) relay.stop();
  }, [authToken]);

  if (!authToken) {
    return <AuthView onAuthenticated={(registered) => setView(registered ? "robots" : getState().selectedRobotId ? "home" : "robots")} />;
  }

  return (
    <div className="shell">
      <Sidebar view={view} onNavigate={setView} />
      <main className="main">
        <div className="view" key={view}>
          {view === "home" ? (
            <HomeView onOpenRobots={() => setView("robots")} />
          ) : view === "robots" ? (
            <RobotsView onViewRobot={() => setView("home")} />
          ) : (
            <SettingsView onViewMap={() => setView("home")} />
          )}
        </div>
      </main>

      <nav className="tabbar" aria-label="Primary">
        <button aria-current={view === "home" ? "page" : undefined} onClick={() => setView("home")}>
          <Home size={20} aria-hidden />
          Home
        </button>
        <button aria-current={view === "robots" ? "page" : undefined} onClick={() => setView("robots")}>
          <Bot size={20} aria-hidden />
          Robots
        </button>
        <EStopTab />
        <button aria-current={view === "settings" ? "page" : undefined} onClick={() => setView("settings")}>
          <SettingsIcon size={20} aria-hidden />
          Settings
        </button>
      </nav>
    </div>
  );
}

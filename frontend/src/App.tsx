import { useState } from "react";
import { Home, Settings as SettingsIcon } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { HomeView } from "./components/HomeView";
import { SettingsView } from "./components/SettingsView";
import { EStopFab } from "./components/EStop";

export type View = "home" | "settings";

export default function App() {
  const [view, setView] = useState<View>("home");

  return (
    <div className="shell">
      <Sidebar view={view} onNavigate={setView} />
      <main className="main">
        <div className="view" key={view}>
          {view === "home" ? (
            <HomeView onOpenSettings={() => setView("settings")} />
          ) : (
            <SettingsView onViewMap={() => setView("home")} />
          )}
        </div>
      </main>

      {/* Mobile chrome */}
      <nav className="tabbar" aria-label="Primary">
        <button aria-current={view === "home" ? "page" : undefined} onClick={() => setView("home")}>
          <Home size={20} aria-hidden />
          Home
        </button>
        <button
          aria-current={view === "settings" ? "page" : undefined}
          onClick={() => setView("settings")}
        >
          <SettingsIcon size={20} aria-hidden />
          Settings
        </button>
      </nav>
      <EStopFab />
    </div>
  );
}

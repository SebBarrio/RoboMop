import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ApiError, listRobots, login, register } from "../lib/api";
import { setAuth, setState } from "../lib/store";

export function AuthView({ onAuthenticated }: { onAuthenticated: (registered: boolean) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result =
        mode === "login" ? await login(email.trim(), password) : await register(email.trim(), password);
      if (mode === "register") setState({ robots: [] });
      else await listRobots(result.token);
      setAuth(result.token, result.user.email);
      onAuthenticated(mode === "register");
    } catch (caught) {
      if (mode === "login") setError("Invalid email or password.");
      else setError(caught instanceof ApiError ? caught.message : "Unable to create account.");
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode((current) => (current === "login" ? "register" : "login"));
    setError("");
  }

  return (
    <main className="auth-screen">
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <img src="./icons/icon.svg" alt="" />
          <div>
            <div className="sidebar__brand-name">RoboMop</div>
            <div className="sidebar__brand-sub">Operator console</div>
          </div>
        </div>
        <div className="auth-card__head">
          <h1>{mode === "login" ? "Sign in" : "Create account"}</h1>
          <p>{mode === "login" ? "Access your paired robots." : "Set up your operator account."}</p>
        </div>
        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div className="field">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={loading}
          />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn--primary auth-card__submit" type="submit" disabled={loading}>
          {loading && <Loader2 size={16} className="spin" aria-hidden />}
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button className="text-button" type="button" onClick={toggleMode} disabled={loading}>
          {mode === "login" ? "Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}

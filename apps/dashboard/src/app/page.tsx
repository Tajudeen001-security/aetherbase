"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://kotahbase-api.onrender.com";
const TOKEN_KEY = "kb_access_token";

export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [boot, setBoot] = useState(true);
  const [view, setView] = useState<"auth" | "onboard" | "app">("auth");
  const [tab, setTab] = useState("overview");

  // auth form
  const [mode, setMode] = useState<"login" | "signup" | "verify">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [devCode, setDevCode] = useState("");

  // projects
  const [projects, setProjects] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [pName, setPName] = useState("");
  const [pPass, setPPass] = useState("");
  const [pMsg, setPMsg] = useState("");
  const [pBusy, setPBusy] = useState(false);
  const [copied, setCopied] = useState("");

  // sql
  const [sql, setSql] = useState("SELECT table_name FROM information_schema.tables WHERE table_schema='public';");
  const [sqlOut, setSqlOut] = useState<any>(null);
  const [sqlBusy, setSqlBusy] = useState(false);
  const [tables, setTables] = useState<string[]>([]);
  const [health, setHealth] = useState<any>(null);

  const saveSession = (t: string, u: any) => {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  };

  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setProjects([]);
    setProject(null);
    setView("auth");
  };

  const api = useCallback(async (path: string, opts: any = {}) => {
    const headers: any = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }, [token]);

  // Boot: restore session — only logout on 401, not network errors
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const tFromUrl = params.get("token");
      if (tFromUrl) {
        window.history.replaceState({}, "", window.location.pathname);
        localStorage.setItem(TOKEN_KEY, tFromUrl);
      }
      const t = tFromUrl || localStorage.getItem(TOKEN_KEY);
      if (!t) {
        setBoot(false);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/auth/v1/user`, {
          headers: { Authorization: `Bearer ${t}` }
        });
        if (res.status === 401) {
          clearSession();
        } else if (res.ok) {
          const u = await res.json();
          setToken(t);
          setUser(u);
          localStorage.setItem(TOKEN_KEY, t);
        } else {
          // server error / offline — keep token, still try to show app
          setToken(t);
        }
      } catch {
        // network down — keep token so refresh doesn't force re-login
        setToken(t);
      }
      setBoot(false);
    })();
    fetch(`${API_URL}/health`).then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  // Load projects when logged in
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/projects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 401) {
          clearSession();
          return;
        }
        if (res.ok) {
          const list = await res.json();
          setProjects(list);
          if (list.length === 0) setView("onboard");
          else {
            setView("app");
            if (!project) setProject(list[0]);
          }
        }
      } catch {
        setView("app");
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!token || view !== "app") return;
    if (tab === "tables" || tab === "sql") {
      api("/tables").then(({ res, data }) => { if (res.ok) setTables(data); });
    }
  }, [tab, token, view]);

  async function doSignup() {
    setAuthBusy(true); setAuthErr(""); setDevCode("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");
      if (data.dev_code) setDevCode(data.dev_code);
      setMode("verify");
    } catch (e: any) { setAuthErr(e.message); }
    finally { setAuthBusy(false); }
  }

  async function doVerify() {
    setAuthBusy(true); setAuthErr("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");
      saveSession(data.access_token, data.user);
    } catch (e: any) { setAuthErr(e.message); }
    finally { setAuthBusy(false); }
  }

  async function doLogin() {
    setAuthBusy(true); setAuthErr("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      saveSession(data.access_token, data.user);
    } catch (e: any) { setAuthErr(e.message); }
    finally { setAuthBusy(false); }
  }

  async function createProject() {
    if (!pName.trim() || !pPass.trim()) {
      setPMsg("Name and password required");
      return;
    }
    setPBusy(true); setPMsg("");
    const { res, data } = await api("/projects", {
      method: "POST",
      body: JSON.stringify({ name: pName.trim(), password: pPass })
    });
    setPBusy(false);
    if (!res.ok) {
      setPMsg(data.error || "Failed");
      return;
    }
    const list = [...projects, data];
    setProjects(list);
    setProject(data);
    setPName(""); setPPass("");
    setView("app");
    setTab("api");
  }

  async function runSql() {
    setSqlBusy(true);
    const { data } = await api("/sql", { method: "POST", body: JSON.stringify({ query: sql }) });
    setSqlOut(data);
    setSqlBusy(false);
  }

  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 1500);
  }

  if (boot) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── AUTH ──────────────────────────────────────────────
  if (!token || view === "auth") {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center p-4">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-md bg-emerald-500 flex items-center justify-center text-black font-bold text-sm">K</div>
              <span className="text-white font-semibold text-lg tracking-tight">KotahBase</span>
            </div>
            <p className="text-zinc-500 text-sm">Open-source backend for your apps</p>
          </div>

          <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-6">
            <div className="flex border-b border-zinc-800 mb-5 -mx-6 px-6">
              <button onClick={() => { setMode("login"); setAuthErr(""); }} className={`pb-3 mr-4 text-sm ${mode === "login" ? "text-white border-b-2 border-emerald-500" : "text-zinc-500"}`}>Sign in</button>
              <button onClick={() => { setMode("signup"); setAuthErr(""); }} className={`pb-3 text-sm ${mode === "signup" || mode === "verify" ? "text-white border-b-2 border-emerald-500" : "text-zinc-500"}`}>Sign up</button>
            </div>

            {mode !== "verify" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" placeholder="you@company.com" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" placeholder="••••••••" />
                </div>
              </div>
            )}

            {mode === "verify" && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">Enter the 6-digit code sent to <span className="text-white">{email}</span></p>
                {devCode && <p className="text-xs text-amber-400 font-mono">Dev code: {devCode}</p>}
                <input value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white text-center tracking-[0.4em] outline-none focus:border-emerald-500" placeholder="000000" />
              </div>
            )}

            <button
              disabled={authBusy}
              onClick={mode === "login" ? doLogin : mode === "signup" ? doSignup : doVerify}
              className="w-full mt-5 py-2.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-medium disabled:opacity-50"
            >
              {authBusy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Verify email"}
            </button>

            {authErr && <p className="mt-3 text-sm text-red-400 text-center">{authErr}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── ONBOARD: must create first project ─────────────────
  if (view === "onboard") {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-md bg-emerald-500 flex items-center justify-center text-black font-bold text-xs">K</div>
              <span className="text-white font-medium">KotahBase</span>
            </div>
            <h1 className="text-xl text-white font-semibold">Create your first project</h1>
            <p className="text-zinc-500 text-sm mt-1">A project gives you a unique API URL, anon key, and service role key — same idea as Supabase.</p>
          </div>
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/40 p-5 space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Project name</label>
              <input value={pName} onChange={e => setPName(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" placeholder="my-app" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Project password</label>
              <input type="password" value={pPass} onChange={e => setPPass(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" placeholder="Secure password for this project" />
              <p className="text-[11px] text-zinc-600 mt-1">Used to protect project settings. Keep it safe.</p>
            </div>
            <button disabled={pBusy} onClick={createProject} className="w-full py-2.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-medium disabled:opacity-50">
              {pBusy ? "Creating…" : "Create project"}
            </button>
            {pMsg && <p className="text-sm text-red-400">{pMsg}</p>}
          </div>
          <button onClick={clearSession} className="mt-4 text-xs text-zinc-600 hover:text-zinc-400">Sign out ({user?.email})</button>
        </div>
      </div>
    );
  }

  // ── APP ────────────────────────────────────────────────
  const nav = [
    { id: "overview", label: "Overview" },
    { id: "api", label: "API Keys" },
    { id: "tables", label: "Table Editor" },
    { id: "sql", label: "SQL Editor" },
    { id: "settings", label: "Settings" }
  ];

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-zinc-100 flex flex-col">
      {/* top bar */}
      <header className="h-12 border-b border-zinc-800 flex items-center px-4 gap-3 shrink-0">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-6 h-6 rounded bg-emerald-500 flex items-center justify-center text-black font-bold text-[10px]">K</div>
          <span className="text-sm font-medium hidden sm:inline">KotahBase</span>
        </div>

        <select
          value={project?.id || ""}
          onChange={e => {
            const p = projects.find((x: any) => x.id === e.target.value);
            if (p) setProject(p);
          }}
          className="bg-zinc-900 border border-zinc-700 rounded-md text-xs px-2 py-1.5 max-w-[180px] outline-none"
        >
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <button
          onClick={() => { setView("onboard"); setPName(""); setPPass(""); setPMsg(""); }}
          className="text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-md px-2 py-1"
        >+ New</button>

        <div className="ml-auto flex items-center gap-3">
          <span className={`text-[10px] ${health?.status === "healthy" ? "text-emerald-400" : "text-zinc-600"}`}>
            {health?.status === "healthy" ? "● API online" : "○ API"}
          </span>
          <span className="text-xs text-zinc-500 hidden sm:inline truncate max-w-[140px]">{user?.email}</span>
          <button onClick={clearSession} className="text-xs text-zinc-500 hover:text-white">Sign out</button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* side nav */}
        <aside className="w-48 border-r border-zinc-800 hidden md:flex flex-col py-3 shrink-0">
          {nav.map(n => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className={`text-left px-4 py-2 text-sm ${tab === n.id ? "text-white bg-zinc-900 border-r-2 border-emerald-500" : "text-zinc-500 hover:text-zinc-300"}`}
            >{n.label}</button>
          ))}
        </aside>

        {/* mobile tabs */}
        <div className="md:hidden absolute bottom-0 left-0 right-0 border-t border-zinc-800 bg-[#0c0c0c] flex z-20">
          {nav.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} className={`flex-1 py-2.5 text-[10px] ${tab === n.id ? "text-emerald-400" : "text-zinc-500"}`}>{n.label}</button>
          ))}
        </div>

        <main className="flex-1 overflow-auto p-4 md:p-6 pb-16 md:pb-6">
          {tab === "overview" && (
            <div className="max-w-3xl">
              <h1 className="text-lg font-medium mb-1">{project?.name || "Project"}</h1>
              <p className="text-zinc-500 text-sm mb-6">Project overview and connection details</p>
              <div className="grid sm:grid-cols-2 gap-3 mb-6">
                <div className="border border-zinc-800 rounded-lg p-4">
                  <div className="text-xs text-zinc-500 mb-1">Status</div>
                  <div className="text-sm text-emerald-400">{health?.status === "healthy" ? "Healthy" : "Checking…"}</div>
                </div>
                <div className="border border-zinc-800 rounded-lg p-4">
                  <div className="text-xs text-zinc-500 mb-1">Database</div>
                  <div className="text-sm">{health?.database || "—"}</div>
                </div>
                <div className="border border-zinc-800 rounded-lg p-4">
                  <div className="text-xs text-zinc-500 mb-1">Storage</div>
                  <div className="text-sm">{health?.storage || "—"}</div>
                </div>
                <div className="border border-zinc-800 rounded-lg p-4">
                  <div className="text-xs text-zinc-500 mb-1">API version</div>
                  <div className="text-sm font-mono">{health?.version || "—"}</div>
                </div>
              </div>
              <button onClick={() => setTab("api")} className="text-sm text-emerald-400 hover:underline">View API keys →</button>
            </div>
          )}

          {tab === "api" && project && (
            <div className="max-w-2xl">
              <h1 className="text-lg font-medium mb-1">API Keys</h1>
              <p className="text-zinc-500 text-sm mb-6">Use these in your app client — same pattern as Supabase.</p>

              <KeyRow
                label="Project URL"
                value={project.url || (project.ref ? `${API_URL}/p/${project.ref}` : "—")}
                hint="Base URL for this project"
                copied={copied === "url"}
                onCopy={() => copy(project.url || `${API_URL}/p/${project.ref}`, "url")}
              />
              <KeyRow
                label="anon / public key"
                value={project.anon_key || "— create a new project to get anon key"}
                hint="Safe for browsers and mobile apps"
                copied={copied === "anon"}
                onCopy={() => project.anon_key && copy(project.anon_key, "anon")}
              />
              <KeyRow
                label="service_role key"
                value={project.service_role_key || project.api_key || "—"}
                hint="Secret — only use on your server"
                secret
                copied={copied === "service"}
                onCopy={() => copy(project.service_role_key || project.api_key, "service")}
              />

              <div className="mt-8 border border-zinc-800 rounded-lg p-4">
                <div className="text-sm font-medium mb-2">Quick start</div>
                <pre className="text-[11px] text-zinc-400 font-mono overflow-x-auto leading-relaxed">{`const URL = "${project.url || API_URL + "/p/REF"}";
const KEY = "${project.anon_key || "kb_anon_..."}";

// Sign up an app user
await fetch(URL + "/auth/v1/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: KEY },
  body: JSON.stringify({ email, password })
});

// Query a table
const rows = await fetch(URL + "/rest/v1/your_table", {
  headers: { apikey: KEY }
}).then(r => r.json());`}</pre>
              </div>

              {(!project.anon_key) && (
                <p className="mt-4 text-xs text-amber-400/90 border border-amber-500/20 bg-amber-500/5 rounded-md p-3">
                  This project was created before URL + anon keys. Create a <button className="underline" onClick={() => setView("onboard")}>new project</button> to get the full Supabase-style credentials.
                </p>
              )}
            </div>
          )}

          {tab === "tables" && (
            <div>
              <h1 className="text-lg font-medium mb-4">Table Editor</h1>
              <div className="flex flex-wrap gap-2">
                {tables.length === 0 && <p className="text-sm text-zinc-500">No tables yet. Create them in SQL Editor.</p>}
                {tables.map(t => (
                  <span key={t} className="px-3 py-1.5 border border-zinc-800 rounded-md text-xs font-mono text-zinc-300">{t}</span>
                ))}
              </div>
            </div>
          )}

          {tab === "sql" && (
            <div className="max-w-3xl">
              <h1 className="text-lg font-medium mb-4">SQL Editor</h1>
              <textarea
                value={sql}
                onChange={e => setSql(e.target.value)}
                rows={8}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-200 outline-none focus:border-zinc-600 mb-3"
              />
              <button onClick={runSql} disabled={sqlBusy} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-medium rounded-md disabled:opacity-50">
                {sqlBusy ? "Running…" : "Run"}
              </button>
              {sqlOut && (
                <div className="mt-4 border border-zinc-800 rounded-lg overflow-hidden">
                  {sqlOut.error ? (
                    <p className="p-3 text-sm text-red-400">{sqlOut.error}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <div className="px-3 py-2 text-xs text-zinc-500 border-b border-zinc-800">{sqlOut.rowCount ?? sqlOut.rows?.length ?? 0} rows</div>
                      {sqlOut.rows?.length > 0 && (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              {(sqlOut.fields || Object.keys(sqlOut.rows[0])).map((f: string) => (
                                <th key={f} className="text-left px-3 py-2 text-zinc-500 font-medium">{f}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sqlOut.rows.map((r: any, i: number) => (
                              <tr key={i} className="border-b border-zinc-900">
                                {(sqlOut.fields || Object.keys(r)).map((f: string) => (
                                  <td key={f} className="px-3 py-1.5 font-mono text-zinc-300 max-w-[160px] truncate">{String(r[f] ?? "")}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "settings" && (
            <div className="max-w-md">
              <h1 className="text-lg font-medium mb-4">Settings</h1>
              <div className="space-y-3 text-sm">
                <div className="border border-zinc-800 rounded-lg p-3">
                  <div className="text-xs text-zinc-500">Account</div>
                  <div>{user?.email}</div>
                </div>
                <div className="border border-zinc-800 rounded-lg p-3">
                  <div className="text-xs text-zinc-500">API endpoint</div>
                  <div className="font-mono text-xs break-all">{API_URL}</div>
                </div>
                <button onClick={clearSession} className="text-sm text-red-400 hover:underline">Sign out</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function KeyRow({ label, value, hint, secret, copied, onCopy }: {
  label: string; value: string; hint: string; secret?: boolean; copied: boolean; onCopy: () => void;
}) {
  const [show, setShow] = useState(!secret);
  return (
    <div className="border border-zinc-800 rounded-lg p-4 mb-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-[11px] text-zinc-500">{hint}</div>
        </div>
        <div className="flex gap-2 shrink-0">
          {secret && (
            <button onClick={() => setShow(!show)} className="text-[11px] text-zinc-500 hover:text-white">{show ? "Hide" : "Reveal"}</button>
          )}
          <button onClick={onCopy} className="text-[11px] text-emerald-400 hover:text-emerald-300">{copied ? "Copied" : "Copy"}</button>
        </div>
      </div>
      <div className="font-mono text-xs text-zinc-300 break-all mt-2 bg-zinc-950 rounded px-2 py-1.5 border border-zinc-900">
        {show ? value : "•".repeat(Math.min(40, value.length))}
      </div>
    </div>
  );
}

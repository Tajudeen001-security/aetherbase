"use client";

import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://kotahbase-api.onrender.com";

const nav = [
  { name: "Dashboard", id: "dashboard", icon: "◉" },
  { name: "Projects", id: "projects", icon: "🔑" },
  { name: "Tables", id: "tables", icon: "▤" },
  { name: "SQL Editor", id: "sql", icon: "⌘" },
  { name: "Storage", id: "storage", icon: "📦" },
  { name: "Realtime", id: "realtime", icon: "📡" },
  { name: "Settings", id: "settings", icon: "⚙" }
];

export default function DashboardPage() {
  const [active, setActive] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<any>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup" | "verify">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [projectName, setProjectName] = useState("");
  const [projectPassword, setProjectPassword] = useState("");
  const [projectMsg, setProjectMsg] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM game_scores LIMIT 10;");
  const [sqlResult, setSqlResult] = useState<any>(null);
  const [sqlLoading, setSqlLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("token");
      if (t) {
        localStorage.setItem("kotah_token", t);
        setToken(t);
        fetchUser(t).finally(() => setLoading(false));
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
    }
    const saved = localStorage.getItem("kotah_token");
    if (saved) {
      setToken(saved);
      fetchUser(saved).finally(() => setLoading(false));
    } else setLoading(false);
    fetch(`${API_URL}/health`).then(r => r.json()).then(setHealth).catch(() => setHealth({ status: "offline" }));
  }, []);

  async function fetchUser(t: string) {
    try {
      const res = await fetch(`${API_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) { setUser(await res.json()); setToken(t); }
      else { localStorage.removeItem("kotah_token"); setToken(null); setUser(null); }
    } catch { localStorage.removeItem("kotah_token"); setToken(null); setUser(null); }
  }

  async function api(path: string, opts: any = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) }
    });
    return { res, data: await res.json().catch(() => ({})) };
  }

  async function handleSignup() {
    setAuthLoading(true); setAuthMsg(""); setDevCode("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAuthMsg(data.message); if (data.dev_code) setDevCode(data.dev_code); setAuthMode("verify");
    } catch (e: any) { setAuthMsg(e.message); } finally { setAuthLoading(false); }
  }

  async function handleVerify() {
    setAuthLoading(true); setAuthMsg("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setToken(data.access_token); localStorage.setItem("kotah_token", data.access_token); setUser(data.user);
    } catch (e: any) { setAuthMsg(e.message); } finally { setAuthLoading(false); }
  }

  async function handleLogin() {
    setAuthLoading(true); setAuthMsg("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setToken(data.access_token); localStorage.setItem("kotah_token", data.access_token); setUser(data.user);
    } catch (e: any) { setAuthMsg(e.message); } finally { setAuthLoading(false); }
  }

  async function fetchProjects() {
    const { res, data } = await api("/projects");
    if (res.ok) setProjects(data);
  }

  async function createProject() {
    const { res, data } = await api("/projects", { method: "POST", body: JSON.stringify({ name: projectName, password: projectPassword }) });
    if (res.ok) {
      setProjectMsg(`Created!\nURL: ${data.url}\nanon: ${data.anon_key}\nservice: ${data.service_role_key}`);
      setProjectName(""); setProjectPassword(""); fetchProjects();
    } else setProjectMsg(data.error);
  }

  async function fetchTables() {
    const { res, data } = await api("/tables");
    if (res.ok) setTables(data);
  }

  async function runSQL() {
    setSqlLoading(true); setSqlResult(null);
    const { data } = await api("/sql", { method: "POST", body: JSON.stringify({ query: sqlQuery }) });
    setSqlResult(data); setSqlLoading(false);
  }

  useEffect(() => {
    if (!token) return;
    if (active === "projects") fetchProjects();
    if (active === "tables" || active === "sql") fetchTables();
  }, [active, token]);

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">Loading...</div>;

  if (!token || !user) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h1 className="text-2xl font-bold text-center text-white mb-2">KotahBase</h1>
          <p className="text-gray-400 text-center text-sm mb-6">Sign in to your dashboard</p>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setAuthMode("login")} className={`flex-1 py-2 rounded-lg text-sm text-white ${authMode === "login" ? "bg-violet-600" : "bg-gray-800"}`}>Login</button>
            <button onClick={() => setAuthMode("signup")} className={`flex-1 py-2 rounded-lg text-sm text-white ${authMode === "signup" ? "bg-violet-600" : "bg-gray-800"}`}>Sign Up</button>
          </div>
          {authMode !== "verify" && (
            <>
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm text-white" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
              <input type="password" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm text-white" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
            </>
          )}
          {authMode === "verify" && (
            <>
              <p className="text-sm text-gray-400 mb-2">Code sent to {email}</p>
              {devCode && <p className="text-xs text-yellow-400 mb-2">Dev code: {devCode}</p>}
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm text-center tracking-widest text-white" placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} maxLength={6} />
            </>
          )}
          <button disabled={authLoading} onClick={authMode === "login" ? handleLogin : authMode === "signup" ? handleSignup : handleVerify} className="w-full py-2.5 bg-violet-600 rounded-lg text-sm font-medium text-white">
            {authLoading ? "..." : authMode === "login" ? "Login" : authMode === "signup" ? "Sign Up" : "Verify"}
          </button>
          {authMsg && <p className="mt-3 text-sm text-center text-red-400">{authMsg}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 relative">
      {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 flex flex-col transition-transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="p-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center font-bold text-white">K</div>
          <span className="text-xl font-semibold">KotahBase</span>
        </div>
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {nav.map(item => (
            <button key={item.id} onClick={() => { setActive(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${active === item.id ? "bg-violet-600/20 text-violet-400" : "text-gray-400 hover:bg-gray-800"}`}>
              <span className="w-5 text-center">{item.icon}</span>{item.name}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800 text-xs">
          <div className="truncate text-gray-300">{user.email}</div>
          <div className="mt-1">{health?.status === "healthy" ? <span className="text-green-400">● Online</span> : <span className="text-red-400">● Offline</span>}</div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <header className="h-14 border-b border-gray-800 flex items-center px-4 gap-3 sticky top-0 bg-gray-950 z-30">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden text-gray-300 text-xl">☰</button>
          <span className="text-sm text-gray-400">KotahBase</span>
          <button onClick={() => { localStorage.removeItem("kotah_token"); setToken(null); setUser(null); }} className="ml-auto text-sm text-gray-400 hover:text-white">Logout</button>
        </header>

        <div className="p-4 md:p-6">
          {active === "dashboard" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">Overview</h1>
              <pre className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-400 overflow-auto">{JSON.stringify(health, null, 2)}</pre>
            </div>
          )}

          {active === "projects" && (
            <div>
              <h1 className="text-xl font-semibold mb-2">Projects</h1>
              <p className="text-gray-400 text-sm mb-4">Each project gets its own URL + anon key + service_role key (like Supabase)</p>
              {!selectedProject ? (
                <>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 max-w-md">
                    <input placeholder="Project name" value={projectName} onChange={e => setProjectName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm" />
                    <input type="password" placeholder="Project password" value={projectPassword} onChange={e => setProjectPassword(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm" />
                    <button onClick={createProject} className="px-4 py-2 bg-violet-600 rounded-lg text-sm">Create Project</button>
                    {projectMsg && <pre className="mt-2 text-xs text-yellow-400 whitespace-pre-wrap break-all">{projectMsg}</pre>}
                  </div>
                  <div className="space-y-2">
                    {projects.map(p => (
                      <button key={p.id} onClick={() => setSelectedProject(p)} className="w-full text-left bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-violet-500">
                        <div className="font-medium">{p.name}</div>
                        {p.url && <div className="text-xs text-gray-400 mt-1 break-all">URL: {p.url}</div>}
                        {p.anon_key && <div className="text-xs font-mono text-green-400 mt-1 break-all">anon: {p.anon_key}</div>}
                        <div className="text-xs font-mono text-violet-400 mt-1 break-all">service: {p.service_role_key || p.api_key}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div>
                  <button onClick={() => setSelectedProject(null)} className="text-sm text-gray-400 mb-4">← Back</button>
                  <h2 className="font-semibold mb-3">{selectedProject.name}</h2>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 text-xs max-w-2xl">
                    <div>
                      <div className="text-gray-500 mb-1">Project URL</div>
                      <div className="font-mono text-violet-400 break-all">{selectedProject.url || `https://kotahbase-api.onrender.com/p/${selectedProject.ref}`}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">anon key (public — use in browser / mobile)</div>
                      <div className="font-mono text-green-400 break-all">{selectedProject.anon_key || "— (create a new project to get keys)"}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">service_role key (secret — server only)</div>
                      <div className="font-mono text-violet-400 break-all">{selectedProject.service_role_key || selectedProject.api_key}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">How to use in your app</div>
                      <pre className="bg-gray-800 rounded-lg p-3 text-gray-300 overflow-x-auto">{`const kb = createClient(
  "${selectedProject.url || "https://kotahbase-api.onrender.com/p/YOUR_REF"}",
  "${selectedProject.anon_key || "kb_anon_..."}"
);

// Auth
await fetch(url + "/auth/v1/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: anon_key },
  body: JSON.stringify({ email, password })
});

// Data
await fetch(url + "/rest/v1/posts", {
  headers: { apikey: anon_key }
});`}</pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {active === "tables" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">Tables</h1>
              <div className="flex flex-wrap gap-2">
                {tables.map(t => <span key={t} className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-sm font-mono text-violet-400">{t}</span>)}
                {tables.length === 0 && <p className="text-gray-500 text-sm">No tables yet — use SQL Editor or schema packs</p>}
              </div>
            </div>
          )}

          {active === "sql" && (
            <div>
              <h1 className="text-xl font-semibold mb-2">SQL Editor</h1>
              <textarea value={sqlQuery} onChange={e => setSqlQuery(e.target.value)} rows={6} className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 font-mono text-sm mb-3" />
              <button onClick={runSQL} disabled={sqlLoading} className="px-4 py-2 bg-violet-600 rounded-lg text-sm">{sqlLoading ? "Running..." : "Run"}</button>
              {sqlResult && (
                <pre className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs overflow-auto">{JSON.stringify(sqlResult, null, 2)}</pre>
              )}
            </div>
          )}

          {active === "storage" && <div><h1 className="text-xl font-semibold mb-4">Storage</h1><p className="text-gray-400 text-sm">Naijacloud (Port Harcourt)</p></div>}
          {active === "realtime" && <div><h1 className="text-xl font-semibold mb-4">Realtime</h1><p className="text-gray-400 text-sm">ws: /realtime/v1</p></div>}
          {active === "settings" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">Settings</h1>
              <div className="text-sm space-y-2">
                <div>API: <span className="font-mono text-xs">{API_URL}</span></div>
                <div>User: {user.email}</div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

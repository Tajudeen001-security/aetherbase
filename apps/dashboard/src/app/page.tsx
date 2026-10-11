"use client";

import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://kotahbase-api.onrender.com";

const nav = [
  { name: "Dashboard", id: "dashboard" },
  { name: "Projects", id: "projects" },
  { name: "Tables", id: "tables" },
  { name: "SQL Editor", id: "sql" },
  { name: "Storage", id: "storage" },
  { name: "Realtime", id: "realtime" },
  { name: "Domains", id: "domains" },
  { name: "Settings", id: "settings" }
];

export default function DashboardPage() {
  const [active, setActive] = useState("dashboard");
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
  const [projectName, setProjectName] = useState("");
  const [projectPassword, setProjectPassword] = useState("");
  const [projectMsg, setProjectMsg] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [tableMsg, setTableMsg] = useState("");
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
    return { res, data: await res.json() };
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
    setProjectMsg(res.ok ? `Created! Key: ${data.api_key}` : data.error);
    if (res.ok) { setProjectName(""); setProjectPassword(""); fetchProjects(); }
  }

  async function fetchTables() {
    const { res, data } = await api("/tables");
    if (res.ok) setTables(data);
  }

  async function installPack(packId: string) {
    setTableMsg("Installing " + packId + "...");
    const { res, data } = await api(`/schemas/packs/${packId}`, { method: "POST", body: JSON.stringify({}) });
    setTableMsg(res.ok ? (data.message || "Installed") : (data.error || "Failed"));
    if (res.ok) fetchTables();
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
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h1 className="text-2xl font-bold text-center mb-2">KotahBase</h1>
          <p className="text-gray-400 text-center text-sm mb-6">Sign in to continue</p>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setAuthMode("login")} className={`flex-1 py-2 rounded-lg text-sm ${authMode === "login" ? "bg-violet-600" : "bg-gray-800"}`}>Login</button>
            <button onClick={() => setAuthMode("signup")} className={`flex-1 py-2 rounded-lg text-sm ${authMode === "signup" ? "bg-violet-600" : "bg-gray-800"}`}>Sign Up</button>
          </div>
          {authMode !== "verify" && (
            <>
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
              <input type="password" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
            </>
          )}
          {authMode === "verify" && (
            <>
              <p className="text-sm text-gray-400 mb-2">Code sent to {email}</p>
              {devCode && <p className="text-xs text-yellow-400 mb-2">Dev code: {devCode}</p>}
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm text-center tracking-widest" placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} maxLength={6} />
            </>
          )}
          <button disabled={authLoading} onClick={authMode === "login" ? handleLogin : authMode === "signup" ? handleSignup : handleVerify} className="w-full py-2.5 bg-violet-600 rounded-lg text-sm font-medium">
            {authLoading ? "..." : authMode === "login" ? "Login" : authMode === "signup" ? "Sign Up" : "Verify"}
          </button>
          {authMsg && <p className="mt-3 text-sm text-center text-red-400">{authMsg}</p>}
          <div className="mt-4 flex gap-2">
            <a href={`${API_URL}/auth/v1/google`} className="flex-1 text-center py-2 bg-white text-black rounded-lg text-sm">Google</a>
            <a href={`${API_URL}/auth/v1/github`} className="flex-1 text-center py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm">GitHub</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <aside className="w-56 border-r border-gray-800 p-4 hidden md:block">
        <div className="font-bold text-lg mb-6">KotahBase</div>
        {nav.map(n => (
          <button key={n.id} onClick={() => setActive(n.id)} className={`block w-full text-left px-3 py-2 rounded-lg text-sm mb-1 ${active === n.id ? "bg-violet-600/20 text-violet-400" : "text-gray-400 hover:bg-gray-900"}`}>{n.name}</button>
        ))}
        <div className="mt-8 text-xs text-gray-500">{user.email}</div>
        <button onClick={() => { localStorage.removeItem("kotah_token"); setToken(null); setUser(null); }} className="text-xs text-gray-400 mt-2">Logout</button>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <div className="md:hidden flex gap-2 mb-4 overflow-x-auto">
          {nav.map(n => <button key={n.id} onClick={() => setActive(n.id)} className={`px-3 py-1.5 rounded text-xs whitespace-nowrap ${active === n.id ? "bg-violet-600" : "bg-gray-800"}`}>{n.name}</button>)}
        </div>

        {active === "dashboard" && (
          <div>
            <h1 className="text-xl font-semibold mb-4">Overview</h1>
            <pre className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-400 overflow-auto">{JSON.stringify(health, null, 2)}</pre>
          </div>
        )}

        {active === "projects" && (
          <div>
            <h1 className="text-xl font-semibold mb-2">Projects</h1>
            <p className="text-sm text-gray-400 mb-4">Create a project, get API key, configure your own Google/GitHub for app users</p>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 max-w-md">
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm" placeholder="Project name" value={projectName} onChange={e => setProjectName(e.target.value)} />
              <input type="password" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm" placeholder="Project password" value={projectPassword} onChange={e => setProjectPassword(e.target.value)} />
              <button onClick={createProject} className="px-4 py-2 bg-violet-600 rounded-lg text-sm">Create</button>
              {projectMsg && <p className="mt-2 text-sm text-yellow-400 break-all">{projectMsg}</p>}
            </div>
            {projects.map(p => (
              <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-2">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs font-mono text-violet-400 break-all">{p.api_key}</div>
                <div className="text-xs text-gray-500 mt-2">Google login: {API_URL}/auth/project/{p.id}/google</div>
              </div>
            ))}
          </div>
        )}

        {active === "tables" && (
          <div>
            <h1 className="text-xl font-semibold mb-2">Tables</h1>
            <p className="text-sm text-gray-400 mb-4">Install ready packs or create via SQL</p>
            <div className="grid sm:grid-cols-2 gap-3 mb-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="font-medium mb-1">Social Media Pack</div>
                <div className="text-xs text-gray-500 mb-3">profiles, posts, likes, comments, follows, messages, notifications</div>
                <button onClick={() => installPack("social")} className="px-3 py-1.5 bg-violet-600 rounded-lg text-sm">Install Social Pack</button>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="font-medium mb-1">Games Pack</div>
                <div className="text-xs text-gray-500 mb-3">players, scores, rooms, inventory</div>
                <button onClick={() => installPack("game")} className="px-3 py-1.5 bg-violet-600 rounded-lg text-sm">Install Games Pack</button>
              </div>
            </div>
            {tableMsg && <p className="text-sm text-yellow-400 mb-4">{tableMsg}</p>}
            <div className="flex flex-wrap gap-2">
              {tables.map(t => <span key={t} className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-sm font-mono text-violet-400">{t}</span>)}
            </div>
          </div>
        )}

        {active === "sql" && (
          <div>
            <h1 className="text-xl font-semibold mb-2">SQL Editor</h1>
            <p className="text-sm text-gray-400 mb-3">Create tables and insert rows with SQL</p>
            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={() => setSqlQuery(`CREATE TABLE IF NOT EXISTS my_items (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  title TEXT NOT NULL,\n  body TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);`)} className="px-2 py-1 bg-gray-800 rounded text-xs">CREATE TABLE</button>
              <button onClick={() => setSqlQuery(`INSERT INTO my_items (title, body) VALUES ('Hello', 'First row');`)} className="px-2 py-1 bg-gray-800 rounded text-xs">INSERT ROW</button>
              <button onClick={() => setSqlQuery(`SELECT * FROM my_items ORDER BY created_at DESC LIMIT 20;`)} className="px-2 py-1 bg-gray-800 rounded text-xs">SELECT</button>
              <button onClick={() => setSqlQuery(`UPDATE my_items SET title = 'Updated' WHERE title = 'Hello';`)} className="px-2 py-1 bg-gray-800 rounded text-xs">UPDATE</button>
              <button onClick={() => setSqlQuery(`DELETE FROM my_items WHERE title = 'Hello';`)} className="px-2 py-1 bg-gray-800 rounded text-xs">DELETE</button>
            </div>
            <textarea value={sqlQuery} onChange={e => setSqlQuery(e.target.value)} rows={6} className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 font-mono text-sm mb-3" />
            <button onClick={runSQL} disabled={sqlLoading} className="px-4 py-2 bg-violet-600 rounded-lg text-sm">{sqlLoading ? "Running..." : "Run Query"}</button>
            {sqlResult && (
              <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {sqlResult.error || sqlResult.success === false ? (
                  <div className="p-3 text-red-400 text-sm">{sqlResult.error}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="px-3 py-2 text-xs text-gray-500">{sqlResult.rowCount} row(s)</div>
                    {sqlResult.rows?.length > 0 && (
                      <table className="w-full text-sm">
                        <thead><tr>{sqlResult.fields?.map((f: string) => <th key={f} className="text-left px-3 py-1 text-xs text-gray-400">{f}</th>)}</tr></thead>
                        <tbody>{sqlResult.rows.map((r: any, i: number) => <tr key={i} className="border-t border-gray-800">{sqlResult.fields?.map((f: string) => <td key={f} className="px-3 py-1 font-mono text-xs">{String(r[f] ?? "")}</td>)}</tr>)}</tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {active === "storage" && <div><h1 className="text-xl font-semibold mb-4">Storage</h1><p className="text-gray-400 text-sm">Naijacloud (Port Harcourt). Use API upload endpoints.</p></div>}
        {active === "realtime" && <div><h1 className="text-xl font-semibold mb-4">Realtime</h1><p className="text-gray-400 text-sm">ws endpoint: /realtime/v1</p></div>}
        {active === "domains" && <div><h1 className="text-xl font-semibold mb-4">Domains</h1><p className="text-gray-400 text-sm">Add domains via API POST /domains</p></div>}
        {active === "settings" && (
          <div>
            <h1 className="text-xl font-semibold mb-4">Settings</h1>
            <div className="text-sm space-y-2">
              <div>API: <span className="font-mono text-xs">{API_URL}</span></div>
              <div>User: {user.email}</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

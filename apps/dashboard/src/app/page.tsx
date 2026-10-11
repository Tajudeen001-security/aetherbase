"use client";

import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, Shield, Database, HardDrive, Radio,
  Globe, Settings, Menu, X, Server, Upload, Key,
  CheckCircle, Loader2, Code, Plus, Activity, Users,
  ScrollText, Table, Zap, Lock
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://kotahbase-api.onrender.com";

const nav = [
  { name: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
  { name: "Projects", icon: Key, id: "projects" },
  { name: "Users", icon: Users, id: "users" },
  { name: "Tables", icon: Table, id: "tables" },
  { name: "SQL Editor", icon: Code, id: "sql" },
  { name: "Storage", icon: HardDrive, id: "storage" },
  { name: "Functions", icon: Zap, id: "functions" },
  { name: "RLS", icon: Lock, id: "rls" },
  { name: "Realtime", icon: Radio, id: "realtime" },
  { name: "Domains", icon: Globe, id: "domains" },
  { name: "Logs", icon: ScrollText, id: "logs" },
  { name: "Settings", icon: Settings, id: "settings" }
];

export default function DashboardPage() {
  const [active, setActive] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Auth form
  const [authMode, setAuthMode] = useState<"login" | "signup" | "verify" | "forgot" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [devCode, setDevCode] = useState("");

  // Data
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [projectName, setProjectName] = useState("");
  const [projectPassword, setProjectPassword] = useState("");
  const [projectMsg, setProjectMsg] = useState("");
  const [authConfig, setAuthConfig] = useState({ google_client_id: "", google_client_secret: "", github_client_id: "", github_client_secret: "", redirect_url: "" });
  const [authConfigMsg, setAuthConfigMsg] = useState("");
  const [appUsers, setAppUsers] = useState<any[]>([]);

  const [tables, setTables] = useState<string[]>([]);
  const [newTableName, setNewTableName] = useState("");
  const [newColumns, setNewColumns] = useState([{ name: "title", type: "text", nullable: true }]);
  const [tableMsg, setTableMsg] = useState("");

  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM game_scores LIMIT 10;");
  const [sqlResult, setSqlResult] = useState<any>(null);
  const [sqlLoading, setSqlLoading] = useState(false);

  const [buckets, setBuckets] = useState<any[]>([]);
  const [newBucket, setNewBucket] = useState("");
  const [bucketPublic, setBucketPublic] = useState(true);
  const [uploadStatus, setUploadStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [functions, setFunctions] = useState<any[]>([]);
  const [fnName, setFnName] = useState("");
  const [fnCode, setFnCode] = useState("async function handler(req) {\n  return { message: \"Hello from KotahBase\", body: req.body };\n}");
  const [fnMsg, setFnMsg] = useState("");
  const [fnResult, setFnResult] = useState<any>(null);

  const [policies, setPolicies] = useState<any[]>([]);
  const [polTable, setPolTable] = useState("");
  const [polName, setPolName] = useState("");
  const [polCommand, setPolCommand] = useState("SELECT");
  const [polUsing, setPolUsing] = useState("true");
  const [polMsg, setPolMsg] = useState("");

  const [domains, setDomains] = useState<any[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [domainMsg, setDomainMsg] = useState("");

  const [authLogs, setAuthLogs] = useState<any[]>([]);
  const [apiLogs, setApiLogs] = useState<any[]>([]);

  const [rtStatus, setRtStatus] = useState("disconnected");
  const [rtMessages, setRtMessages] = useState<string[]>([]);
  const [rtRoom, setRtRoom] = useState("global");
  const [rtInput, setRtInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

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
    fetchHealth();
    const iv = setInterval(fetchHealth, 12000);
    return () => clearInterval(iv);
  }, []);

  async function fetchHealth() {
    try { setHealth(await (await fetch(`${API_URL}/health`)).json()); }
    catch { setHealth({ status: "offline" }); }
  }

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

  async function fetchProjects() {
    const { res, data } = await api("/projects");
    if (res.ok) setProjects(data);
  }

  async function fetchTables() {
    const { res, data } = await api("/tables");
    if (res.ok) setTables(data);
  }

  async function fetchBuckets() {
    const { res, data } = await api("/storage/buckets");
    if (res.ok) setBuckets(data);
  }

  async function fetchFunctions() {
    const { res, data } = await api("/functions");
    if (res.ok) setFunctions(data);
  }

  async function fetchPolicies() {
    const { res, data } = await api("/rls/policies");
    if (res.ok) setPolicies(data);
  }

  async function fetchDomains() {
    const { res, data } = await api("/domains");
    if (res.ok) setDomains(data);
  }

  async function fetchLogs() {
    const [a, b] = await Promise.all([api("/logs/auth"), api("/logs/api")]);
    if (a.res.ok) setAuthLogs(a.data);
    if (b.res.ok) setApiLogs(b.data);
  }

  useEffect(() => {
    if (!token) return;
    if (active === "projects") fetchProjects();
    if (active === "tables" || active === "sql") fetchTables();
    if (active === "storage") fetchBuckets();
    if (active === "functions") fetchFunctions();
    if (active === "rls") { fetchPolicies(); fetchTables(); }
    if (active === "domains") fetchDomains();
    if (active === "logs") fetchLogs();
  }, [active, token]);

  function navigate(id: string) { setActive(id); setSidebarOpen(false); }

  // Auth handlers
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

  async function handleForgot() {
    setAuthLoading(true); setAuthMsg(""); setDevCode("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/forgot-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAuthMsg(data.message); if (data.dev_code) setDevCode(data.dev_code); setAuthMode("reset");
    } catch (e: any) { setAuthMsg(e.message); } finally { setAuthLoading(false); }
  }

  async function handleReset() {
    setAuthLoading(true); setAuthMsg("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/reset-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code, new_password: newPassword }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAuthMsg(data.message); setAuthMode("login");
    } catch (e: any) { setAuthMsg(e.message); } finally { setAuthLoading(false); }
  }

  function handleLogout() {
    setToken(null); setUser(null); localStorage.removeItem("kotah_token");
    if (wsRef.current) wsRef.current.close();
  }

  // Projects
  async function createProject() {
    setProjectMsg("");
    const { res, data } = await api("/projects", { method: "POST", body: JSON.stringify({ name: projectName, password: projectPassword }) });
    if (!res.ok) { setProjectMsg(data.error); return; }
    setProjectMsg(`Created! API Key: ${data.api_key}`);
    setProjectName(""); setProjectPassword("");
    fetchProjects();
  }

  async function openProject(p: any) {
    setSelectedProject(p);
    setAuthConfig({ google_client_id: "", google_client_secret: "", github_client_id: "", github_client_secret: "", redirect_url: "" });
    setAuthConfigMsg("");
    const { res, data } = await api(`/projects/${p.id}/users`);
    if (res.ok) setAppUsers(data);
    else setAppUsers([]);
  }

  async function saveAuthConfig() {
    if (!selectedProject) return;
    setAuthConfigMsg("");
    const body: any = {};
    if (authConfig.google_client_id) body.google_client_id = authConfig.google_client_id;
    if (authConfig.google_client_secret) body.google_client_secret = authConfig.google_client_secret;
    if (authConfig.github_client_id) body.github_client_id = authConfig.github_client_id;
    if (authConfig.github_client_secret) body.github_client_secret = authConfig.github_client_secret;
    if (authConfig.redirect_url) body.redirect_url = authConfig.redirect_url;
    const { res, data } = await api(`/projects/${selectedProject.id}/auth`, { method: "PUT", body: JSON.stringify(body) });
    setAuthConfigMsg(res.ok ? "Saved! Your app users can now use these providers." : data.error);
  }

  // Tables
  async function createTable() {
    setTableMsg("");
    const { res, data } = await api("/tables", { method: "POST", body: JSON.stringify({ name: newTableName, columns: newColumns }) });
    setTableMsg(res.ok ? `Table ${newTableName} created` : data.error);
    if (res.ok) { setNewTableName(""); fetchTables(); }
  }

  // SQL
  async function runSQL() {
    setSqlLoading(true); setSqlResult(null);
    const { data } = await api("/sql", { method: "POST", body: JSON.stringify({ query: sqlQuery }) });
    setSqlResult(data); setSqlLoading(false);
  }

  // Buckets
  async function createBucket() {
    const { res, data } = await api("/storage/buckets", { method: "POST", body: JSON.stringify({ name: newBucket, public: bucketPublic }) });
    if (res.ok) { setNewBucket(""); fetchBuckets(); }
    else alert(data.error);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus("Uploading...");
    try {
      const res = await fetch(`${API_URL}/storage/v1/object/uploads/${file.name}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream" }, body: file
      });
      const data = await res.json();
      setUploadStatus(res.ok ? "Uploaded!" : data.error);
    } catch (err: any) { setUploadStatus(err.message); }
  }

  // Functions
  async function saveFunction() {
    setFnMsg("");
    const { res, data } = await api("/functions", { method: "POST", body: JSON.stringify({ name: fnName, code: fnCode }) });
    setFnMsg(res.ok ? "Saved" : data.error);
    if (res.ok) fetchFunctions();
  }

  async function invokeFunction(name: string) {
    const { data } = await api(`/functions/${name}/invoke`, { method: "POST", body: JSON.stringify({ test: true }) });
    setFnResult(data);
  }

  // RLS
  async function createPolicy() {
    setPolMsg("");
    const { res, data } = await api("/rls/policies", { method: "POST", body: JSON.stringify({ table: polTable, name: polName, command: polCommand, using_expr: polUsing }) });
    setPolMsg(res.ok ? "Policy created" : data.error);
    if (res.ok) fetchPolicies();
  }

  // Domains
  async function addDomain() {
    setDomainMsg("");
    const { res, data } = await api("/domains", { method: "POST", body: JSON.stringify({ domain: newDomain }) });
    if (res.ok) {
      setDomainMsg(`Add TXT: ${data.instructions?.value}`);
      setNewDomain(""); fetchDomains();
    } else setDomainMsg(data.error);
  }

  // Realtime
  function connectRealtime() {
    if (wsRef.current) wsRef.current.close();
    const wsUrl = API_URL.replace("https://", "wss://").replace("http://", "ws://") + "/realtime/v1";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setRtStatus("connecting");
    ws.onopen = () => setRtStatus("connected");
    ws.onclose = () => setRtStatus("disconnected");
    ws.onerror = () => setRtStatus("error");
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        setRtMessages(prev => [`${msg.type}: ${JSON.stringify(msg).slice(0, 120)}`, ...prev].slice(0, 30));
      } catch {}
    };
  }

  function joinRoom() {
    wsRef.current?.send(JSON.stringify({ type: "join", room: rtRoom }));
  }

  function sendBroadcast() {
    wsRef.current?.send(JSON.stringify({ type: "broadcast", payload: rtInput }));
    setRtInput("");
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><Loader2 className="animate-spin text-violet-500" size={32} /></div>;

  // AUTH GATE
  if (!token || !user) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-violet-600 flex items-center justify-center font-bold text-2xl mx-auto mb-4">K</div>
            <h1 className="text-2xl font-semibold text-white">KotahBase</h1>
            <p className="text-gray-400 text-sm mt-1">Sign in to your dashboard</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="space-y-2 mb-5">
              <a href={`${API_URL}/auth/v1/google`} className="w-full flex items-center justify-center gap-2 py-2.5 bg-white text-gray-900 rounded-lg text-sm font-medium">Continue with Google</a>
              <a href={`${API_URL}/auth/v1/github`} className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-800 text-white rounded-lg text-sm font-medium border border-gray-700">Continue with GitHub</a>
            </div>
            <div className="relative mb-5"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700"></div></div><div className="relative flex justify-center text-xs"><span className="px-2 bg-gray-900 text-gray-500">or email</span></div></div>
            {(authMode === "login" || authMode === "signup") && (
              <div className="flex gap-2 mb-4">
                <button onClick={() => setAuthMode("login")} className={`flex-1 py-2 rounded-lg text-sm ${authMode === "login" ? "bg-violet-600" : "bg-gray-800"}`}>Login</button>
                <button onClick={() => setAuthMode("signup")} className={`flex-1 py-2 rounded-lg text-sm ${authMode === "signup" ? "bg-violet-600" : "bg-gray-800"}`}>Sign Up</button>
              </div>
            )}
            {(authMode === "login" || authMode === "signup" || authMode === "forgot") && (
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-3 text-sm focus:outline-none focus:border-violet-500" />
            )}
            {(authMode === "login" || authMode === "signup") && (
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-3 text-sm focus:outline-none focus:border-violet-500" />
            )}
            {authMode === "verify" && (<>
              <p className="text-sm text-gray-400 mb-2">Code sent to {email}</p>
              {devCode && <p className="text-xs text-yellow-400 mb-2">Code: {devCode}</p>}
              <input type="text" placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} maxLength={6} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-3 text-sm text-center tracking-widest" />
            </>)}
            {authMode === "reset" && (<>
              {devCode && <p className="text-xs text-yellow-400 mb-2">Code: {devCode}</p>}
              <input type="text" placeholder="Code" value={code} onChange={e => setCode(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-3 text-sm" />
              <input type="password" placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-3 text-sm" />
            </>)}
            <button onClick={authMode === "login" ? handleLogin : authMode === "signup" ? handleSignup : authMode === "verify" ? handleVerify : authMode === "forgot" ? handleForgot : handleReset}
              disabled={authLoading} className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
              {authLoading && <Loader2 size={16} className="animate-spin" />}
              {authMode === "login" ? "Login" : authMode === "signup" ? "Sign Up" : authMode === "verify" ? "Verify" : authMode === "forgot" ? "Send Code" : "Reset"}
            </button>
            {authMode === "login" && <button onClick={() => setAuthMode("forgot")} className="w-full mt-3 text-sm text-gray-400">Forgot password?</button>}
            {(authMode === "forgot" || authMode === "reset" || authMode === "verify") && <button onClick={() => setAuthMode("login")} className="w-full mt-3 text-sm text-gray-400">Back</button>}
            {authMsg && <p className={`mt-3 text-sm text-center ${authMsg.includes("success") || authMsg.includes("sent") || authMsg.includes("created") || authMsg.includes("updated") ? "text-green-400" : "text-red-400"}`}>{authMsg}</p>}
          </div>
        </div>
      </div>
    );
  }

  // DASHBOARD
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 relative">
      {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 flex flex-col transition-transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center font-bold">K</div><span className="text-xl font-semibold">KotahBase</span></div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden"><X size={20} /></button>
        </div>
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {nav.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => navigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${active === item.id ? "bg-violet-600/20 text-violet-400" : "text-gray-400 hover:bg-gray-800"}`}>
                <Icon size={17} />{item.name}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-800 text-xs">
          <div className="truncate text-gray-300">{user.email}</div>
          <div className="mt-1">{health?.status === "healthy" ? <span className="text-green-400">● Online</span> : <span className="text-red-400">● Offline</span>}</div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <header className="h-14 border-b border-gray-800 flex items-center px-4 gap-3 sticky top-0 bg-gray-950 z-30">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden"><Menu size={22} /></button>
          <span className="text-sm text-gray-400">KotahBase</span>
          <button onClick={handleLogout} className="ml-auto text-sm text-gray-400">Logout</button>
        </header>

        <div className="p-4 md:p-6">
          {active === "dashboard" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">Overview</h1>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <Card title="API" value={health?.status === "healthy" ? "Online" : "Offline"} />
                <Card title="Database" value={health?.database || "—"} />
                <Card title="Storage" value={health?.storage || "—"} />
                <Card title="Version" value={health?.version || "—"} />
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <pre className="text-xs text-gray-400">{JSON.stringify(health, null, 2)}</pre>
              </div>
            </div>
          )}

          {active === "projects" && (
            <div>
              <h1 className="text-xl font-semibold mb-2">Projects</h1>
              <p className="text-gray-400 text-sm mb-4">Create a project → get API key → configure your own Google/GitHub for your app users</p>

              {!selectedProject ? (
                <>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 max-w-md">
                    <input placeholder="Project name" value={projectName} onChange={e => setProjectName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm" />
                    <input type="password" placeholder="Project password" value={projectPassword} onChange={e => setProjectPassword(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm" />
                    <button onClick={createProject} className="px-4 py-2 bg-violet-600 rounded-lg text-sm">Create Project</button>
                    {projectMsg && <p className="mt-2 text-sm text-yellow-400 break-all">{projectMsg}</p>}
                  </div>
                  <div className="space-y-2">
                    {projects.map(p => (
                      <button key={p.id} onClick={() => openProject(p)} className="w-full text-left bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-violet-500">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs font-mono text-violet-400 mt-1 break-all">{p.api_key}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div>
                  <button onClick={() => setSelectedProject(null)} className="text-sm text-gray-400 mb-4">← Back</button>
                  <h2 className="font-semibold mb-1">{selectedProject.name}</h2>
                  <p className="text-xs font-mono text-violet-400 mb-4 break-all">{selectedProject.api_key}</p>

                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
                    <h3 className="font-medium mb-3 text-sm">Auth Providers (your own keys)</h3>
                    <p className="text-xs text-gray-500 mb-3">Paste your Google/GitHub OAuth credentials so YOUR app users can login.</p>
                    <input placeholder="Google Client ID" value={authConfig.google_client_id} onChange={e => setAuthConfig({ ...authConfig, google_client_id: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm" />
                    <input placeholder="Google Client Secret" value={authConfig.google_client_secret} onChange={e => setAuthConfig({ ...authConfig, google_client_secret: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm" />
                    <input placeholder="GitHub Client ID" value={authConfig.github_client_id} onChange={e => setAuthConfig({ ...authConfig, github_client_id: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm" />
                    <input placeholder="GitHub Client Secret" value={authConfig.github_client_secret} onChange={e => setAuthConfig({ ...authConfig, github_client_secret: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm" />
                    <input placeholder="Redirect URL (e.g. https://yourapp.com/auth/callback)" value={authConfig.redirect_url} onChange={e => setAuthConfig({ ...authConfig, redirect_url: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm" />
                    <button onClick={saveAuthConfig} className="px-4 py-2 bg-violet-600 rounded-lg text-sm">Save Providers</button>
                    {authConfigMsg && <p className="mt-2 text-sm text-green-400">{authConfigMsg}</p>}

                    <div className="mt-4 p-3 bg-gray-800 rounded-lg text-xs">
                      <div className="text-gray-400 mb-1">Your app login URLs:</div>
                      <div className="font-mono text-violet-400 break-all">Google: {API_URL}/auth/project/{selectedProject.id}/google</div>
                      <div className="font-mono text-violet-400 break-all mt-1">GitHub: {API_URL}/auth/project/{selectedProject.id}/github</div>
                    </div>
                  </div>

                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800 text-sm text-gray-400">App Users ({appUsers.length})</div>
                    {appUsers.length === 0 ? <div className="px-4 py-6 text-center text-gray-500 text-sm">No users yet</div> :
                      appUsers.map(u => (
                        <div key={u.id} className="px-4 py-2 border-t border-gray-800 text-sm flex justify-between">
                          <span>{u.email}</span>
                          <span className="text-xs text-gray-500">{u.provider}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {active === "tables" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">Tables</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 max-w-lg">
                <input placeholder="table_name" value={newTableName} onChange={e => setNewTableName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm font-mono" />
                {newColumns.map((col, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input placeholder="column" value={col.name} onChange={e => { const c = [...newColumns]; c[i].name = e.target.value; setNewColumns(c); }} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
                    <select value={col.type} onChange={e => { const c = [...newColumns]; c[i].type = e.target.value; setNewColumns(c); }} className="bg-gray-800 border border-gray-700 rounded-lg px-2 text-sm">
                      {["text", "integer", "boolean", "jsonb", "timestamptz", "uuid", "numeric"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                ))}
                <button onClick={() => setNewColumns([...newColumns, { name: "", type: "text", nullable: true }])} className="text-xs text-violet-400 mb-3">+ Column</button>
                <br />
                <button onClick={createTable} className="px-4 py-2 bg-violet-600 rounded-lg text-sm">Create Table</button>
                {tableMsg && <p className="mt-2 text-sm text-yellow-400">{tableMsg}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {tables.map(t => <span key={t} className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-sm font-mono text-violet-400">{t}</span>)}
              </div>
            </div>
          )}

          {active === "sql" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">SQL Editor</h1>
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="lg:w-40">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    {tables.map(t => <button key={t} onClick={() => setSqlQuery(`SELECT * FROM ${t} LIMIT 20;`)} className="block w-full text-left text-xs font-mono text-violet-400 py-1">{t}</button>)}
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  <textarea value={sqlQuery} onChange={e => setSqlQuery(e.target.value)} rows={5} className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 font-mono text-sm" />
                  <button onClick={runSQL} disabled={sqlLoading} className="px-4 py-2 bg-violet-600 rounded-lg text-sm flex items-center gap-2">{sqlLoading && <Loader2 size={14} className="animate-spin" />} Run</button>
                  {sqlResult && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      {sqlResult.error ? <div className="p-3 text-red-400 text-sm">{sqlResult.error}</div> : (
                        <div className="overflow-x-auto">
                          <div className="px-3 py-2 text-xs text-gray-500">{sqlResult.rowCount} rows</div>
                          {sqlResult.rows?.length > 0 && (
                            <table className="w-full text-sm">
                              <thead><tr>{sqlResult.fields?.map((f: string) => <th key={f} className="text-left px-3 py-1 text-xs text-gray-400">{f}</th>)}</tr></thead>
                              <tbody>{sqlResult.rows.map((r: any, i: number) => <tr key={i} className="border-t border-gray-800">{sqlResult.fields?.map((f: string) => <td key={f} className="px-3 py-1 font-mono text-xs truncate max-w-[120px]">{String(r[f] ?? "")}</td>)}</tr>)}</tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {active === "storage" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">Storage Buckets</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 max-w-md">
                <input placeholder="bucket-name" value={newBucket} onChange={e => setNewBucket(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm" />
                <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" checked={bucketPublic} onChange={e => setBucketPublic(e.target.checked)} /> Public</label>
                <button onClick={createBucket} className="px-4 py-2 bg-violet-600 rounded-lg text-sm">Create Bucket</button>
              </div>
              <div className="space-y-2 mb-6">
                {buckets.map(b => (
                  <div key={b.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex justify-between text-sm">
                    <span className="font-mono">{b.name}</span>
                    <span className={`text-xs ${b.public ? "text-green-400" : "text-yellow-400"}`}>{b.public ? "public" : "private"}</span>
                  </div>
                ))}
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <input ref={fileRef} type="file" onChange={handleUpload} className="hidden" />
                <button onClick={() => fileRef.current?.click()} className="px-4 py-2 bg-violet-600 rounded-lg text-sm">Upload File</button>
                {uploadStatus && <p className="mt-2 text-sm text-yellow-400">{uploadStatus}</p>}
              </div>
            </div>
          )}

          {active === "functions" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">Edge Functions</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
                <input placeholder="function-name" value={fnName} onChange={e => setFnName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm font-mono" />
                <textarea value={fnCode} onChange={e => setFnCode(e.target.value)} rows={8} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 font-mono text-xs mb-2" />
                <button onClick={saveFunction} className="px-4 py-2 bg-violet-600 rounded-lg text-sm">Save Function</button>
                {fnMsg && <p className="mt-2 text-sm text-green-400">{fnMsg}</p>}
              </div>
              <div className="space-y-2">
                {functions.map(f => (
                  <div key={f.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex justify-between items-center">
                    <span className="font-mono text-sm">{f.name}</span>
                    <button onClick={() => invokeFunction(f.name)} className="px-3 py-1 bg-violet-600/20 text-violet-400 rounded text-xs">Invoke</button>
                  </div>
                ))}
              </div>
              {fnResult && <pre className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs overflow-auto">{JSON.stringify(fnResult, null, 2)}</pre>}
            </div>
          )}

          {active === "rls" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">Row Level Security</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 max-w-lg">
                <select value={polTable} onChange={e => setPolTable(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm">
                  <option value="">Select table</option>
                  {tables.map(t => <option key={t}>{t}</option>)}
                </select>
                <input placeholder="policy name" value={polName} onChange={e => setPolName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm" />
                <select value={polCommand} onChange={e => setPolCommand(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm">
                  {["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"].map(c => <option key={c}>{c}</option>)}
                </select>
                <input placeholder="USING expression (e.g. true)" value={polUsing} onChange={e => setPolUsing(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2 text-sm font-mono" />
                <button onClick={createPolicy} className="px-4 py-2 bg-violet-600 rounded-lg text-sm">Create Policy</button>
                {polMsg && <p className="mt-2 text-sm text-yellow-400">{polMsg}</p>}
              </div>
              <div className="space-y-2">
                {policies.map(p => (
                  <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm">
                    <span className="font-mono text-violet-400">{p.policy_name}</span> on <span className="font-mono">{p.table_name}</span> — {p.command}
                  </div>
                ))}
              </div>
            </div>
          )}

          {active === "realtime" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">Realtime</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-sm ${rtStatus === "connected" ? "text-green-400" : "text-gray-400"}`}>● {rtStatus}</span>
                  <button onClick={connectRealtime} className="px-3 py-1.5 bg-violet-600 rounded text-sm">Connect</button>
                </div>
                <div className="flex gap-2 mb-3">
                  <input value={rtRoom} onChange={e => setRtRoom(e.target.value)} placeholder="room" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm flex-1" />
                  <button onClick={joinRoom} className="px-3 py-2 bg-gray-800 rounded-lg text-sm">Join</button>
                </div>
                <div className="flex gap-2">
                  <input value={rtInput} onChange={e => setRtInput(e.target.value)} placeholder="message" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm flex-1" />
                  <button onClick={sendBroadcast} className="px-3 py-2 bg-violet-600 rounded-lg text-sm">Send</button>
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 max-h-64 overflow-y-auto">
                {rtMessages.length === 0 ? <p className="text-gray-500 text-sm">No messages</p> :
                  rtMessages.map((m, i) => <div key={i} className="text-xs font-mono text-gray-400 py-0.5">{m}</div>)}
              </div>
            </div>
          )}

          {active === "domains" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">Custom Domains</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input placeholder="example.com" value={newDomain} onChange={e => setNewDomain(e.target.value)} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
                  <button onClick={addDomain} className="px-4 py-2 bg-violet-600 rounded-lg text-sm">Add Domain</button>
                </div>
                {domainMsg && <p className="mt-2 text-sm text-yellow-400 break-all">{domainMsg}</p>}
              </div>
              {domains.map(d => (
                <div key={d.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 mb-2 flex justify-between">
                  <div>
                    <div className="font-medium">{d.domain}</div>
                    <div className="text-xs text-gray-500">{d.status} {d.verification_token && d.status === "pending" ? `· TXT: ${d.verification_token}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {active === "logs" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">Logs</h1>
              <button onClick={fetchLogs} className="mb-4 px-3 py-1.5 bg-violet-600 rounded text-sm">Refresh</button>
              <h3 className="text-sm text-gray-400 mb-2">Auth</h3>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-4">
                {authLogs.slice(0, 15).map((l, i) => (
                  <div key={i} className="px-3 py-2 border-t border-gray-800 text-xs flex gap-3">
                    <span className="font-mono">{l.event}</span><span className="truncate">{l.email}</span><span>{l.success ? "✅" : "❌"}</span>
                  </div>
                ))}
              </div>
              <h3 className="text-sm text-gray-400 mb-2">API</h3>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {apiLogs.slice(0, 15).map((l, i) => (
                  <div key={i} className="px-3 py-2 border-t border-gray-800 text-xs flex gap-3">
                    <span className="font-mono">{l.method}</span><span className="truncate">{l.path}</span><span className={l.status >= 400 ? "text-red-400" : "text-green-400"}>{l.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {active === "users" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">Platform Users</h1>
              <p className="text-gray-400 text-sm">Dashboard owners. App users are under each Project.</p>
            </div>
          )}

          {active === "settings" && (
            <div>
              <h1 className="text-xl font-semibold mb-4">Settings</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 max-w-lg space-y-3 text-sm">
                <div><div className="text-gray-400">API</div><div className="font-mono text-xs break-all">{API_URL}</div></div>
                <div><div className="text-gray-400">Email</div><div>{user.email}</div></div>
                <div><div className="text-gray-400">Version</div><div>{health?.version || "0.7.0"}</div></div>
                <div><div className="text-gray-400">Storage</div><div>Naijacloud (Port Harcourt)</div></div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Card({ title, value }: { title: string; value: any }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="text-xs text-gray-400 mb-1">{title}</div>
      <div className="text-lg font-semibold truncate">{value}</div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, Shield, Database, HardDrive, Radio,
  Globe, Settings, Menu, X, Server, Upload,
  CheckCircle, Loader2, Code, Plus, Activity, Users, ScrollText
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://kotahbase-api.onrender.com";

const nav = [
  { name: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
  { name: "Authentication", icon: Shield, id: "auth" },
  { name: "Users", icon: Users, id: "users" },
  { name: "Database", icon: Database, id: "database" },
  { name: "SQL Editor", icon: Code, id: "sql" },
  { name: "Storage", icon: HardDrive, id: "storage" },
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

  // Auth
  const [authMode, setAuthMode] = useState<"login" | "signup" | "verify" | "forgot" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [devCode, setDevCode] = useState("");

  // Database
  const [scores, setScores] = useState<any[]>([]);

  // SQL
  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM game_scores LIMIT 10;");
  const [sqlResult, setSqlResult] = useState<any>(null);
  const [sqlLoading, setSqlLoading] = useState(false);
  const [tables, setTables] = useState<string[]>([]);

  // Storage
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Domains
  const [domains, setDomains] = useState<any[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [domainMsg, setDomainMsg] = useState("");

  // Logs
  const [authLogs, setAuthLogs] = useState<any[]>([]);
  const [apiLogs, setApiLogs] = useState<any[]>([]);

  // Users (from SQL)
  const [usersList, setUsersList] = useState<any[]>([]);

  useEffect(() => {
    // Handle OAuth redirect token
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("token");
      const err = params.get("error");
      if (t) {
        localStorage.setItem("kotah_token", t);
        setToken(t);
        fetchUser(t);
        window.history.replaceState({}, "", window.location.pathname);
      }
      if (err) {
        setAuthMsg(`OAuth error: ${err}`);
        setActive("auth");
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    const saved = localStorage.getItem("kotah_token");
    if (saved && !token) {
      setToken(saved);
      fetchUser(saved);
    }
    fetchHealth();
    const interval = setInterval(fetchHealth, 8000);
    return () => clearInterval(interval);
  }, []);

  async function fetchHealth() {
    try {
      const res = await fetch(`${API_URL}/health`);
      setHealth(await res.json());
    } catch {
      setHealth({ status: "offline" });
    }
  }

  async function fetchUser(t: string) {
    try {
      const res = await fetch(`${API_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${t}` }
      });
      if (res.ok) setUser(await res.json());
    } catch {}
  }

  async function fetchScores() {
    try {
      const res = await fetch(`${API_URL}/rest/v1/game_scores`);
      const data = await res.json();
      setScores(Array.isArray(data) ? data : []);
    } catch { setScores([]); }
  }

  async function fetchTables() {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/sql/tables`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setTables(await res.json());
    } catch {}
  }

  async function fetchDomains() {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/domains`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setDomains(await res.json());
    } catch {}
  }

  async function fetchLogs() {
    if (!token) return;
    try {
      const [a, b] = await Promise.all([
        fetch(`${API_URL}/logs/auth`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/logs/api`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (a.ok) setAuthLogs(await a.json());
      if (b.ok) setApiLogs(await b.json());
    } catch {}
  }

  async function fetchUsers() {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ query: "SELECT id, email, provider, email_confirmed, created_at FROM users ORDER BY created_at DESC LIMIT 100" })
      });
      const data = await res.json();
      if (data.rows) setUsersList(data.rows);
    } catch {}
  }

  useEffect(() => {
    if (active === "database") fetchScores();
    if (active === "sql") fetchTables();
    if (active === "domains") fetchDomains();
    if (active === "logs") fetchLogs();
    if (active === "users") fetchUsers();
  }, [active, token]);

  function navigate(id: string) {
    setActive(id);
    setSidebarOpen(false);
  }

  // Auth handlers
  async function handleSignup() {
    setAuthLoading(true); setAuthMsg(""); setDevCode("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");
      setAuthMsg(data.message);
      if (data.dev_code) setDevCode(data.dev_code);
      setAuthMode("verify");
    } catch (err: any) {
      setAuthMsg(err.message);
    } finally { setAuthLoading(false); }
  }

  async function handleVerify() {
    setAuthLoading(true); setAuthMsg("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      setToken(data.access_token);
      localStorage.setItem("kotah_token", data.access_token);
      setUser(data.user);
      setAuthMsg("Verified & logged in!");
      setAuthMode("login");
    } catch (err: any) {
      setAuthMsg(err.message);
    } finally { setAuthLoading(false); }
  }

  async function handleLogin() {
    setAuthLoading(true); setAuthMsg("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      setToken(data.access_token);
      localStorage.setItem("kotah_token", data.access_token);
      setUser(data.user);
      setAuthMsg("Logged in successfully!");
    } catch (err: any) {
      setAuthMsg(err.message);
    } finally { setAuthLoading(false); }
  }

  async function handleForgot() {
    setAuthLoading(true); setAuthMsg(""); setDevCode("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setAuthMsg(data.message);
      if (data.dev_code) setDevCode(data.dev_code);
      setAuthMode("reset");
    } catch (err: any) {
      setAuthMsg(err.message);
    } finally { setAuthLoading(false); }
  }

  async function handleReset() {
    setAuthLoading(true); setAuthMsg("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, new_password: newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setAuthMsg(data.message);
      setAuthMode("login");
      setPassword(""); setNewPassword(""); setCode("");
    } catch (err: any) {
      setAuthMsg(err.message);
    } finally { setAuthLoading(false); }
  }

  function handleLogout() {
    setToken(null); setUser(null);
    localStorage.removeItem("kotah_token");
    setAuthMsg("Logged out");
  }

  async function runSQL() {
    if (!token) { setSqlResult({ error: "Please login first" }); return; }
    setSqlLoading(true); setSqlResult(null);
    try {
      const res = await fetch(`${API_URL}/sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: sqlQuery })
      });
      setSqlResult(await res.json());
    } catch (err: any) {
      setSqlResult({ error: err.message });
    } finally { setSqlLoading(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!token) { setUploadStatus("Please login first"); return; }
    setUploadStatus("Uploading...");
    try {
      const res = await fetch(`${API_URL}/storage/v1/object/uploads/${file.name}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream" },
        body: file
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setUploadedFiles(prev => [...prev, { name: file.name, url: data.url, size: file.size }]);
      setUploadStatus("Uploaded successfully!");
    } catch (err: any) {
      setUploadStatus(err.message);
    }
  }

  async function addDomain() {
    if (!token) { setDomainMsg("Please login first"); return; }
    if (!newDomain.trim()) return;
    try {
      const res = await fetch(`${API_URL}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ domain: newDomain.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setDomainMsg(`Domain added! TXT: ${data.instructions?.value}`);
      setNewDomain("");
      fetchDomains();
    } catch (err: any) {
      setDomainMsg(err.message);
    }
  }

  async function verifyDomain(id: string) {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/domains/${id}/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDomainMsg("Domain verified!");
      fetchDomains();
    } catch (err: any) {
      setDomainMsg(err.message);
    }
  }

  async function deleteDomain(id: string) {
    if (!token) return;
    await fetch(`${API_URL}/domains/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchDomains();
  }

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 relative">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed md:static inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center font-bold">K</div>
            <span className="text-xl font-semibold">KotahBase</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-2 overflow-y-auto">
          {nav.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button key={item.id} onClick={() => navigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive ? "bg-violet-600/20 text-violet-400" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}>
                <Icon size={18} />
                {item.name}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800 text-sm">
          {user ? (
            <div className="text-gray-300 truncate text-xs">{user.email}</div>
          ) : (
            <div className="text-gray-500 text-xs">Not logged in</div>
          )}
          <div className="mt-1">
            {health?.status === "healthy" ? (
              <span className="text-green-400 text-xs">● API Online</span>
            ) : (
              <span className="text-red-400 text-xs">● API Offline</span>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto w-full">
        <header className="h-14 border-b border-gray-800 flex items-center px-4 md:px-6 gap-3 sticky top-0 bg-gray-950 z-30">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden text-gray-400 hover:text-white">
            <Menu size={22} />
          </button>
          <span className="text-sm text-gray-400 truncate">KotahBase</span>
          {user && (
            <button onClick={handleLogout} className="ml-auto text-sm text-gray-400 hover:text-white">Logout</button>
          )}
        </header>

        <div className="p-4 md:p-8">
          {/* DASHBOARD */}
          {active === "dashboard" && (
            <div>
              <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">Overview</h1>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5 mb-6">
                <Card title="API Status" value={health?.status === "healthy" ? "Online" : "Offline"} icon={<Server size={16} />} />
                <Card title="Database" value={health?.database === "connected" ? "Connected" : "—"} icon={<Database size={16} />} />
                <Card title="Storage" value={health?.storage === "connected" ? "Naijacloud" : "—"} icon={<HardDrive size={16} />} />
                <Card title="Version" value={health?.version || "—"} icon={<Activity size={16} />} />
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6">
                <h2 className="font-medium mb-3 text-sm">System Status</h2>
                <pre className="text-xs text-gray-400 overflow-auto">{JSON.stringify(health, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* AUTH */}
          {active === "auth" && (
            <div>
              <h1 className="text-xl md:text-2xl font-semibold mb-2">Authentication</h1>
              <p className="text-gray-400 mb-4 text-sm">Email, Google, GitHub + Forgot Password</p>

              {user ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 max-w-md">
                  <div className="flex items-center gap-2 text-green-400 mb-4">
                    <CheckCircle size={20} />
                    <span className="font-medium">Logged in</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div><span className="text-gray-400">Email:</span> {user.email}</div>
                    <div><span className="text-gray-400">Provider:</span> {user.provider || "email"}</div>
                    <div className="break-all"><span className="text-gray-400">ID:</span> <span className="font-mono text-xs">{user.id}</span></div>
                  </div>
                  <button onClick={handleLogout} className="mt-6 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">Logout</button>
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 max-w-md">
                  {/* Social buttons */}
                  <div className="space-y-2 mb-5">
                    <a href={`${API_URL}/auth/v1/google`}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-100">
                      <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                      Continue with Google
                    </a>
                    <a href={`${API_URL}/auth/v1/github`}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-700 border border-gray-700">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                      Continue with GitHub
                    </a>
                  </div>

                  <div className="relative mb-5">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700"></div></div>
                    <div className="relative flex justify-center text-xs"><span className="px-2 bg-gray-900 text-gray-500">or continue with email</span></div>
                  </div>

                  {(authMode === "login" || authMode === "signup") && (
                    <div className="flex gap-2 mb-4">
                      <button onClick={() => { setAuthMode("login"); setAuthMsg(""); }} className={`flex-1 px-3 py-2 rounded-lg text-sm ${authMode === "login" ? "bg-violet-600" : "bg-gray-800"}`}>Login</button>
                      <button onClick={() => { setAuthMode("signup"); setAuthMsg(""); }} className={`flex-1 px-3 py-2 rounded-lg text-sm ${authMode === "signup" ? "bg-violet-600" : "bg-gray-800"}`}>Sign Up</button>
                    </div>
                  )}

                  {(authMode === "login" || authMode === "signup" || authMode === "forgot") && (
                    <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-3 text-sm focus:outline-none focus:border-violet-500" />
                  )}

                  {(authMode === "login" || authMode === "signup") && (
                    <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-3 text-sm focus:outline-none focus:border-violet-500" />
                  )}

                  {authMode === "verify" && (
                    <>
                      <p className="text-sm text-gray-400 mb-3">Enter the 6-digit code sent to <strong>{email}</strong></p>
                      {devCode && <p className="text-xs text-yellow-400 mb-3">Email failed — code: <strong>{devCode}</strong></p>}
                      <input type="text" placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} maxLength={6}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-3 text-sm focus:outline-none focus:border-violet-500 tracking-widest text-center text-lg" />
                    </>
                  )}

                  {authMode === "reset" && (
                    <>
                      <p className="text-sm text-gray-400 mb-3">Enter the code sent to <strong>{email}</strong> and your new password</p>
                      {devCode && <p className="text-xs text-yellow-400 mb-3">Email failed — code: <strong>{devCode}</strong></p>}
                      <input type="text" placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} maxLength={6}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-3 text-sm focus:outline-none focus:border-violet-500 tracking-widest text-center text-lg" />
                      <input type="password" placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-3 text-sm focus:outline-none focus:border-violet-500" />
                    </>
                  )}

                  <button
                    onClick={
                      authMode === "login" ? handleLogin :
                      authMode === "signup" ? handleSignup :
                      authMode === "verify" ? handleVerify :
                      authMode === "forgot" ? handleForgot :
                      handleReset
                    }
                    disabled={authLoading}
                    className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {authLoading && <Loader2 size={16} className="animate-spin" />}
                    {authMode === "login" ? "Login" :
                     authMode === "signup" ? "Create Account" :
                     authMode === "verify" ? "Verify Code" :
                     authMode === "forgot" ? "Send Reset Code" :
                     "Reset Password"}
                  </button>

                  {authMode === "login" && (
                    <button onClick={() => { setAuthMode("forgot"); setAuthMsg(""); }} className="w-full mt-3 text-sm text-gray-400 hover:text-violet-400">
                      Forgot password?
                    </button>
                  )}

                  {(authMode === "forgot" || authMode === "reset" || authMode === "verify") && (
                    <button onClick={() => { setAuthMode("login"); setAuthMsg(""); }} className="w-full mt-3 text-sm text-gray-400 hover:text-violet-400">
                      Back to Login
                    </button>
                  )}

                  {authMsg && (
                    <p className={`mt-4 text-sm ${
                      authMsg.includes("success") || authMsg.includes("Verified") || authMsg.includes("created") || authMsg.includes("sent") || authMsg.includes("updated")
                        ? "text-green-400" : "text-red-400"
                    }`}>{authMsg}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* USERS */}
          {active === "users" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl md:text-2xl font-semibold">Users</h1>
                <button onClick={fetchUsers} className="px-3 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm">Refresh</button>
              </div>
              {!token && <p className="text-yellow-400 text-sm mb-4">Please login first</p>}
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800/50 text-gray-400">
                      <tr>
                        <th className="text-left px-4 py-3">Email</th>
                        <th className="text-left px-4 py-3">Provider</th>
                        <th className="text-left px-4 py-3 hidden sm:table-cell">Confirmed</th>
                        <th className="text-left px-4 py-3 hidden md:table-cell">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No users or not logged in</td></tr>
                      ) : usersList.map((u) => (
                        <tr key={u.id} className="border-t border-gray-800">
                          <td className="px-4 py-3 truncate max-w-[180px]">{u.email}</td>
                          <td className="px-4 py-3"><span className="text-xs bg-gray-800 px-2 py-0.5 rounded">{u.provider || "email"}</span></td>
                          <td className="px-4 py-3 hidden sm:table-cell">{u.email_confirmed ? "✅" : "❌"}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* DATABASE */}
          {active === "database" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl md:text-2xl font-semibold">Database</h1>
                <button onClick={fetchScores} className="px-3 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm">Refresh</button>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 text-sm text-gray-400">Table: <span className="text-violet-400">game_scores</span></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800/50 text-gray-400">
                      <tr>
                        <th className="text-left px-4 py-3">Player</th>
                        <th className="text-left px-4 py-3">Score</th>
                        <th className="text-left px-4 py-3 hidden sm:table-cell">ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scores.length === 0 ? (
                        <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No data yet</td></tr>
                      ) : scores.map((row) => (
                        <tr key={row.id} className="border-t border-gray-800">
                          <td className="px-4 py-3">{row.player_name}</td>
                          <td className="px-4 py-3">{row.score}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs hidden sm:table-cell">{row.id?.slice(0, 8)}…</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SQL EDITOR */}
          {active === "sql" && (
            <div>
              <h1 className="text-xl md:text-2xl font-semibold mb-2">SQL Editor</h1>
              <p className="text-gray-400 mb-4 text-sm">Run SQL queries</p>
              {!token && <p className="text-yellow-400 text-sm mb-4">Please login first</p>}
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="lg:w-48 flex-shrink-0">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <h3 className="text-xs font-medium mb-2 text-gray-400">Tables</h3>
                    {tables.length === 0 ? <p className="text-xs text-gray-500">No tables</p> : (
                      <div className="space-y-1">
                        {tables.map(t => (
                          <button key={t} onClick={() => setSqlQuery(`SELECT * FROM ${t} LIMIT 20;`)} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-800 text-violet-400 font-mono">{t}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  <textarea value={sqlQuery} onChange={e => setSqlQuery(e.target.value)} rows={5}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 font-mono text-sm focus:outline-none focus:border-violet-500 resize-y"
                    placeholder="SELECT * FROM game_scores;" />
                  <button onClick={runSQL} disabled={sqlLoading || !token}
                    className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-40">
                    {sqlLoading && <Loader2 size={16} className="animate-spin" />} Run Query
                  </button>
                  {sqlResult && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      {sqlResult.error || sqlResult.success === false ? (
                        <div className="p-4 text-red-400 text-sm">{sqlResult.error}</div>
                      ) : (
                        <>
                          <div className="px-4 py-2 border-b border-gray-800 text-xs text-gray-400">{sqlResult.rowCount} row(s)</div>
                          {sqlResult.rows?.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-800/50 text-gray-400">
                                  <tr>{sqlResult.fields?.map((f: string) => <th key={f} className="text-left px-3 py-2 font-mono text-xs whitespace-nowrap">{f}</th>)}</tr>
                                </thead>
                                <tbody>
                                  {sqlResult.rows.map((row: any, i: number) => (
                                    <tr key={i} className="border-t border-gray-800">
                                      {sqlResult.fields?.map((f: string) => <td key={f} className="px-3 py-2 font-mono text-xs max-w-[150px] truncate">{String(row[f] ?? "")}</td>)}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="p-4 text-green-400 text-sm">{sqlResult.message || "Query executed successfully"}</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STORAGE */}
          {active === "storage" && (
            <div>
              <h1 className="text-xl md:text-2xl font-semibold mb-4">Storage</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
                <h3 className="font-medium mb-3 flex items-center gap-2 text-sm"><Upload size={16} /> Upload File</h3>
                {!token && <p className="text-yellow-400 text-sm mb-3">Login first</p>}
                <input ref={fileRef} type="file" onChange={handleUpload} className="hidden" />
                <button onClick={() => fileRef.current?.click()} disabled={!token} className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium disabled:opacity-40">Choose File & Upload</button>
                {uploadStatus && <p className={`mt-3 text-sm ${uploadStatus.includes("success") ? "text-green-400" : "text-red-400"}`}>{uploadStatus}</p>}
              </div>
              {uploadedFiles.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-800 text-sm text-gray-400">Uploaded Files</div>
                  <div className="divide-y divide-gray-800">
                    {uploadedFiles.map((f, i) => (
                      <div key={i} className="px-4 py-3 flex items-center justify-between text-sm gap-2">
                        <span className="truncate">{f.name}</span>
                        <span className="text-gray-500 flex-shrink-0">{(f.size / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* REALTIME */}
          {active === "realtime" && (
            <div>
              <h1 className="text-xl md:text-2xl font-semibold mb-4">Realtime</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-400 text-sm">Realtime WebSocket coming in next stable version.</p>
              </div>
            </div>
          )}

          {/* DOMAINS */}
          {active === "domains" && (
            <div>
              <h1 className="text-xl md:text-2xl font-semibold mb-2">Custom Domains</h1>
              <p className="text-gray-400 mb-4 text-sm">Connect your own domain</p>
              {!token && <p className="text-yellow-400 text-sm mb-4">Please login first</p>}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input type="text" placeholder="example.com" value={newDomain} onChange={e => setNewDomain(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500" />
                  <button onClick={addDomain} disabled={!token} className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium disabled:opacity-40">Add Domain</button>
                </div>
                {domainMsg && <p className="mt-3 text-sm text-yellow-400 break-all">{domainMsg}</p>}
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 text-sm text-gray-400">Your Domains</div>
                {domains.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500 text-sm">No domains yet</div>
                ) : domains.map((d) => (
                  <div key={d.id} className="px-4 py-3 border-t border-gray-800 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{d.domain}</div>
                      <div className="text-xs text-gray-500 mt-1">Status: <span className={d.status === "verified" ? "text-green-400" : "text-yellow-400"}>{d.status}</span></div>
                      {d.verification_token && d.status === "pending" && (
                        <div className="text-xs font-mono text-gray-500 mt-1 break-all">TXT: {d.verification_token}</div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {d.status === "pending" && <button onClick={() => verifyDomain(d.id)} className="px-2.5 py-1 bg-green-600/20 text-green-400 rounded text-xs">Verify</button>}
                      <button onClick={() => deleteDomain(d.id)} className="px-2.5 py-1 bg-red-600/20 text-red-400 rounded text-xs">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LOGS */}
          {active === "logs" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl md:text-2xl font-semibold">Logs</h1>
                <button onClick={fetchLogs} className="px-3 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm">Refresh</button>
              </div>
              {!token && <p className="text-yellow-400 text-sm mb-4">Please login first</p>}

              <h2 className="text-sm font-medium text-gray-400 mb-2">Auth Logs</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800/50 text-gray-400">
                      <tr>
                        <th className="text-left px-4 py-2">Event</th>
                        <th className="text-left px-4 py-2">Email</th>
                        <th className="text-left px-4 py-2">Success</th>
                        <th className="text-left px-4 py-2 hidden sm:table-cell">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {authLogs.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No logs yet</td></tr>
                      ) : authLogs.map((l, i) => (
                        <tr key={i} className="border-t border-gray-800">
                          <td className="px-4 py-2 font-mono text-xs">{l.event}</td>
                          <td className="px-4 py-2 truncate max-w-[140px]">{l.email}</td>
                          <td className="px-4 py-2">{l.success ? "✅" : "❌"}</td>
                          <td className="px-4 py-2 text-gray-500 text-xs hidden sm:table-cell">{l.created_at ? new Date(l.created_at).toLocaleString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <h2 className="text-sm font-medium text-gray-400 mb-2">API Logs</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800/50 text-gray-400">
                      <tr>
                        <th className="text-left px-4 py-2">Method</th>
                        <th className="text-left px-4 py-2">Path</th>
                        <th className="text-left px-4 py-2">Status</th>
                        <th className="text-left px-4 py-2 hidden sm:table-cell">ms</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiLogs.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No logs yet</td></tr>
                      ) : apiLogs.map((l, i) => (
                        <tr key={i} className="border-t border-gray-800">
                          <td className="px-4 py-2 font-mono text-xs">{l.method}</td>
                          <td className="px-4 py-2 font-mono text-xs truncate max-w-[160px]">{l.path}</td>
                          <td className={`px-4 py-2 ${l.status >= 400 ? "text-red-400" : "text-green-400"}`}>{l.status}</td>
                          <td className="px-4 py-2 text-gray-500 text-xs hidden sm:table-cell">{l.duration_ms}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {active === "settings" && (
            <div>
              <h1 className="text-xl md:text-2xl font-semibold mb-4">Settings</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 max-w-xl space-y-4 text-sm">
                <div>
                  <div className="text-gray-400 mb-1">API URL</div>
                  <div className="font-mono bg-gray-800 px-3 py-2 rounded text-xs break-all">{API_URL}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Logged in as</div>
                  <div>{user ? user.email : "Not logged in"}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Version</div>
                  <div>0.5.0</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Storage</div>
                  <div>Naijacloud (Port Harcourt, Nigeria)</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">OAuth</div>
                  <div>Google: {health?.oauth?.google ? "✅" : "❌"} · GitHub: {health?.oauth?.github ? "✅" : "❌"}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Card({ title, value, icon }: { title: string; value: any; icon?: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-5">
      <div className="flex items-center justify-between text-xs md:text-sm text-gray-400 mb-1 md:mb-2">
        <span className="truncate">{title}</span>
        {icon}
      </div>
      <div className="text-lg md:text-2xl font-semibold truncate">{value}</div>
    </div>
  );
}

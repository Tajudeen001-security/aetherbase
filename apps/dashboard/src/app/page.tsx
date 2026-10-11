"use client";

import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, Shield, Database, HardDrive, Radio,
  Globe, Settings, Menu, X, Server, Upload,
  CheckCircle, Loader2, Code, Plus, Activity
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://kotahbase-api.onrender.com";

const nav = [
  { name: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
  { name: "Authentication", icon: Shield, id: "auth" },
  { name: "Database", icon: Database, id: "database" },
  { name: "SQL Editor", icon: Code, id: "sql" },
  { name: "Storage", icon: HardDrive, id: "storage" },
  { name: "Realtime", icon: Radio, id: "realtime" },
  { name: "Domains", icon: Globe, id: "domains" },
  { name: "Settings", icon: Settings, id: "settings" }
];

export default function DashboardPage() {
  const [active, setActive] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  // Auth
  const [authMode, setAuthMode] = useState<"login" | "signup" | "verify">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [devCode, setDevCode] = useState("");

  // Database
  const [scores, setScores] = useState<any[]>([]);

  // SQL Editor
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

  useEffect(() => {
    const saved = localStorage.getItem("kotah_token");
    if (saved) {
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
    } catch {
      setScores([]);
    }
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

  useEffect(() => {
    if (active === "database") fetchScores();
    if (active === "sql") fetchTables();
    if (active === "domains") fetchDomains();
  }, [active, token]);

  function navigate(id: string) {
    setActive(id);
    setSidebarOpen(false); // close sidebar on mobile after click
  }

  // Auth handlers
  async function handleSignup() {
    setAuthLoading(true); setAuthMsg("");
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
    } finally {
      setAuthLoading(false);
    }
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
    } finally {
      setAuthLoading(false);
    }
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
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    setToken(null); setUser(null);
    localStorage.removeItem("kotah_token");
    setAuthMsg("Logged out");
  }

  // SQL
  async function runSQL() {
    if (!token) { setSqlResult({ error: "Please login first" }); return; }
    setSqlLoading(true); setSqlResult(null);
    try {
      const res = await fetch(`${API_URL}/sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ query: sqlQuery })
      });
      const data = await res.json();
      setSqlResult(data);
    } catch (err: any) {
      setSqlResult({ error: err.message });
    } finally {
      setSqlLoading(false);
    }
  }

  // Storage
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!token) { setUploadStatus("Please login first"); return; }

    setUploadStatus("Uploading...");
    try {
      const res = await fetch(`${API_URL}/storage/v1/object/uploads/${file.name}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type || "application/octet-stream"
        },
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

  // Domains
  async function addDomain() {
    if (!token) { setDomainMsg("Please login first"); return; }
    if (!newDomain.trim()) return;

    try {
      const res = await fetch(`${API_URL}/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ domain: newDomain.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setDomainMsg(`Domain added! Add TXT record: ${data.instructions?.value}`);
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
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-50
        w-64 bg-gray-900 border-r border-gray-800 flex flex-col
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
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive ? "bg-violet-600/20 text-violet-400" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
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

      {/* Main */}
      <main className="flex-1 overflow-auto w-full">
        <header className="h-14 border-b border-gray-800 flex items-center px-4 md:px-6 gap-3 sticky top-0 bg-gray-950 z-30">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden text-gray-400 hover:text-white">
            <Menu size={22} />
          </button>
          <span className="text-sm text-gray-400 truncate">KotahBase</span>
          {user && (
            <button onClick={handleLogout} className="ml-auto text-sm text-gray-400 hover:text-white">
              Logout
            </button>
          )}
        </header>

        <div className="p-4 md:p-8">
          {/* DASHBOARD */}
          {active === "dashboard" && (
            <div>
              <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">Overview</h1>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5 mb-6 md:mb-8">
                <Card title="API Status" value={health?.status === "healthy" ? "Online" : "Offline"} icon={<Server size={16} />} />
                <Card title="Database" value={health?.database === "connected" ? "Connected" : "—"} icon={<Database size={16} />} />
                <Card title="Storage" value={health?.storage === "connected" ? "Naijacloud" : "—"} icon={<HardDrive size={16} />} />
                <Card title="Version" value={health?.version || "—"} icon={<Activity size={16} />} />
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6">
                <h2 className="font-medium mb-3 text-sm md:text-base">System Status</h2>
                <pre className="text-xs text-gray-400 overflow-auto">{JSON.stringify(health, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* AUTH */}
          {active === "auth" && (
            <div>
              <h1 className="text-xl md:text-2xl font-semibold mb-2">Authentication</h1>
              <p className="text-gray-400 mb-4 md:mb-6 text-sm">Email + Password + 6-digit code</p>

              {user ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 md:p-6 max-w-md">
                  <div className="flex items-center gap-2 text-green-400 mb-4">
                    <CheckCircle size={20} />
                    <span className="font-medium">Logged in</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div><span className="text-gray-400">Email:</span> {user.email}</div>
                    <div className="break-all"><span className="text-gray-400">User ID:</span> <span className="font-mono text-xs">{user.id}</span></div>
                  </div>
                  <button onClick={handleLogout} className="mt-6 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">Logout</button>
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 md:p-6 max-w-md">
                  <div className="flex gap-2 mb-5">
                    <button onClick={() => { setAuthMode("login"); setAuthMsg(""); }} className={`flex-1 px-3 py-2 rounded-lg text-sm ${authMode === "login" ? "bg-violet-600" : "bg-gray-800"}`}>Login</button>
                    <button onClick={() => { setAuthMode("signup"); setAuthMsg(""); }} className={`flex-1 px-3 py-2 rounded-lg text-sm ${authMode === "signup" ? "bg-violet-600" : "bg-gray-800"}`}>Sign Up</button>
                  </div>

                  {authMode !== "verify" && (
                    <>
                      <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-3 text-sm focus:outline-none focus:border-violet-500" />
                      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-4 text-sm focus:outline-none focus:border-violet-500" />
                    </>
                  )}

                  {authMode === "verify" && (
                    <>
                      <p className="text-sm text-gray-400 mb-3">Enter the 6-digit code sent to <strong>{email}</strong></p>
                      {devCode && <p className="text-xs text-yellow-400 mb-3">Dev code: <strong>{devCode}</strong></p>}
                      <input type="text" placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} maxLength={6} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-4 text-sm focus:outline-none focus:border-violet-500 tracking-widest text-center text-lg" />
                    </>
                  )}

                  <button
                    onClick={authMode === "login" ? handleLogin : authMode === "signup" ? handleSignup : handleVerify}
                    disabled={authLoading}
                    className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {authLoading && <Loader2 size={16} className="animate-spin" />}
                    {authMode === "login" ? "Login" : authMode === "signup" ? "Create Account" : "Verify Code"}
                  </button>

                  {authMsg && <p className={`mt-4 text-sm ${authMsg.includes("success") || authMsg.includes("Verified") || authMsg.includes("created") ? "text-green-400" : "text-red-400"}`}>{authMsg}</p>}
                </div>
              )}
            </div>
          )}

          {/* DATABASE */}
          {active === "database" && (
            <div>
              <div className="flex items-center justify-between mb-4 md:mb-6">
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
              <p className="text-gray-400 mb-4 text-sm">Run SQL queries against your database</p>

              {!token && <p className="text-yellow-400 text-sm mb-4">Please login first</p>}

              <div className="flex flex-col lg:flex-row gap-4">
                <div className="lg:w-48 flex-shrink-0">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <h3 className="text-xs font-medium mb-2 text-gray-400">Tables</h3>
                    {tables.length === 0 ? (
                      <p className="text-xs text-gray-500">No tables</p>
                    ) : (
                      <div className="space-y-1">
                        {tables.map(t => (
                          <button
                            key={t}
                            onClick={() => setSqlQuery(`SELECT * FROM ${t} LIMIT 20;`)}
                            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-800 text-violet-400 font-mono"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-3">
                  <textarea
                    value={sqlQuery}
                    onChange={e => setSqlQuery(e.target.value)}
                    rows={5}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 font-mono text-sm focus:outline-none focus:border-violet-500 resize-y"
                    placeholder="SELECT * FROM game_scores;"
                  />

                  <button
                    onClick={runSQL}
                    disabled={sqlLoading || !token}
                    className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-40"
                  >
                    {sqlLoading && <Loader2 size={16} className="animate-spin" />}
                    Run Query
                  </button>

                  {sqlResult && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      {sqlResult.error || sqlResult.success === false ? (
                        <div className="p-4 text-red-400 text-sm">{sqlResult.error}</div>
                      ) : (
                        <>
                          <div className="px-4 py-2 border-b border-gray-800 text-xs text-gray-400">{sqlResult.rowCount} row(s)</div>
                          {sqlResult.rows && sqlResult.rows.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-800/50 text-gray-400">
                                  <tr>
                                    {sqlResult.fields?.map((f: string) => (
                                      <th key={f} className="text-left px-3 py-2 font-mono text-xs whitespace-nowrap">{f}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {sqlResult.rows.map((row: any, i: number) => (
                                    <tr key={i} className="border-t border-gray-800">
                                      {sqlResult.fields?.map((f: string) => (
                                        <td key={f} className="px-3 py-2 font-mono text-xs max-w-[150px] truncate">{String(row[f] ?? "")}</td>
                                      ))}
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
              <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">Storage</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
                <h3 className="font-medium mb-3 flex items-center gap-2 text-sm"><Upload size={16} /> Upload File</h3>
                {!token && <p className="text-yellow-400 text-sm mb-3">You need to login first</p>}
                <input ref={fileRef} type="file" onChange={handleUpload} className="hidden" />
                <button onClick={() => fileRef.current?.click()} disabled={!token} className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium disabled:opacity-40">
                  Choose File & Upload
                </button>
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
                <p className="text-gray-400 text-sm">Realtime WebSocket will be re-enabled in a more stable version soon.</p>
                <p className="text-xs text-gray-500 mt-2">Endpoint: /realtime/v1</p>
              </div>
            </div>
          )}

          {/* DOMAINS */}
          {active === "domains" && (
            <div>
              <h1 className="text-xl md:text-2xl font-semibold mb-2">Custom Domains</h1>
              <p className="text-gray-400 mb-4 text-sm">Connect your own domain</p>

              {!token && <p className="text-yellow-400 text-sm mb-4">Please login first</p>}

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-5 mb-4">
                <h3 className="font-medium mb-3 flex items-center gap-2 text-sm"><Plus size={16} /> Add Domain</h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="example.com"
                    value={newDomain}
                    onChange={e => setNewDomain(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500"
                  />
                  <button onClick={addDomain} disabled={!token} className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium disabled:opacity-40">
                    Add Domain
                  </button>
                </div>
                {domainMsg && <p className="mt-3 text-sm text-yellow-400 break-all">{domainMsg}</p>}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 text-sm text-gray-400">Your Domains</div>
                {domains.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500 text-sm">No domains yet</div>
                ) : (
                  <div className="divide-y divide-gray-800">
                    {domains.map((d) => (
                      <div key={d.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{d.domain}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              Status: <span className={d.status === "verified" ? "text-green-400" : "text-yellow-400"}>{d.status}</span>
                            </div>
                            {d.verification_token && d.status === "pending" && (
                              <div className="text-xs font-mono text-gray-500 mt-1 break-all">TXT: {d.verification_token}</div>
                            )}
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            {d.status === "pending" && (
                              <button onClick={() => verifyDomain(d.id)} className="px-2.5 py-1 bg-green-600/20 text-green-400 rounded text-xs">Verify</button>
                            )}
                            <button onClick={() => deleteDomain(d.id)} className="px-2.5 py-1 bg-red-600/20 text-red-400 rounded text-xs">Delete</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {active === "settings" && (
            <div>
              <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">Settings</h1>
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
                  <div>0.4.0</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Storage</div>
                  <div>Naijacloud (Port Harcourt, Nigeria)</div>
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

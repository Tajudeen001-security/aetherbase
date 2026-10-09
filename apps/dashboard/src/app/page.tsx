"use client";

import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, Shield, Database, HardDrive, Radio,
  Globe, Settings, Menu, Users, Activity, Server, Upload,
  CheckCircle, XCircle, Loader2
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const nav = [
  { name: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
  { name: "Authentication", icon: Shield, id: "auth" },
  { name: "Database", icon: Database, id: "database" },
  { name: "Storage", icon: HardDrive, id: "storage" },
  { name: "Realtime", icon: Radio, id: "realtime" },
  { name: "Hosting", icon: Globe, id: "hosting" },
  { name: "Settings", icon: Settings, id: "settings" }
];

export default function DashboardPage() {
  const [active, setActive] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [health, setHealth] = useState<any>(null);
  const [realtimeStats, setRealtimeStats] = useState<any>(null);
  const [scores, setScores] = useState<any[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  // Auth form state
  const [authMode, setAuthMode] = useState<"login" | "signup" | "verify">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [devCode, setDevCode] = useState("");

  // Storage state
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Hosting state
  const [sites, setSites] = useState<any[]>([
    { id: 1, name: "my-game-landing", url: "https://my-game.kotahbase.app", status: "Live", updated: "Just now" }
  ]);
  const [newSiteName, setNewSiteName] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("kotah_token");
    if (saved) {
      setToken(saved);
      fetchUser(saved);
    }
    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchHealth() {
    try {
      const res = await fetch(`${API_URL}/health`);
      const data = await res.json();
      setHealth(data);
      setRealtimeStats(data.realtime || null);
    } catch {
      setHealth({ status: "offline" });
    }
  }

  async function fetchUser(t: string) {
    try {
      const res = await fetch(`${API_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
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

  useEffect(() => {
    if (active === "database") fetchScores();
  }, [active]);

  // ========== AUTH ACTIONS ==========
  async function handleSignup() {
    setAuthLoading(true);
    setAuthMsg("");
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
    setAuthLoading(true);
    setAuthMsg("");
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
    setAuthLoading(true);
    setAuthMsg("");
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
    setToken(null);
    setUser(null);
    localStorage.removeItem("kotah_token");
    setAuthMsg("Logged out");
  }

  // ========== STORAGE UPLOAD ==========
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!token) {
      setUploadStatus("Please login first");
      return;
    }

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

  // ========== HOSTING ==========
  function createSite() {
    if (!newSiteName.trim()) return;
    const site = {
      id: Date.now(),
      name: newSiteName,
      url: `https://${newSiteName.toLowerCase().replace(/\s+/g, "-")}.kotahbase.app`,
      status: "Building",
      updated: "Just now"
    };
    setSites(prev => [site, ...prev]);
    setNewSiteName("");
    // Simulate build finish
    setTimeout(() => {
      setSites(prev => prev.map(s => s.id === site.id ? { ...s, status: "Live" } : s));
    }, 2500);
  }

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-20"} bg-gray-900 border-r border-gray-800 flex flex-col transition-all`}>
        <div className="p-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center font-bold">K</div>
          {sidebarOpen && <span className="text-xl font-semibold">KotahBase</span>}
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-2">
          {nav.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive ? "bg-violet-600/20 text-violet-400" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {sidebarOpen && item.name}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800 text-sm">
          {user ? (
            <div className="text-gray-300 truncate">{user.email}</div>
          ) : (
            <div className="text-gray-500">Not logged in</div>
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
      <main className="flex-1 overflow-auto">
        <header className="h-14 border-b border-gray-800 flex items-center px-6 gap-4">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white">
            <Menu size={20} />
          </button>
          <span className="text-sm text-gray-400">KotahBase Dashboard</span>
          {user && (
            <button onClick={handleLogout} className="ml-auto text-sm text-gray-400 hover:text-white">
              Logout
            </button>
          )}
        </header>

        <div className="p-8">
          {/* ==================== DASHBOARD ==================== */}
          {active === "dashboard" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Overview</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                <Card title="API Status" value={health?.status === "healthy" ? "Online" : "Offline"} icon={<Server size={18} />} />
                <Card title="Realtime Clients" value={realtimeStats?.totalClients ?? "—"} icon={<Users size={18} />} />
                <Card title="Active Rooms" value={realtimeStats?.rooms?.length ?? "—"} icon={<Radio size={18} />} />
                <Card title="Database" value={health?.database === "connected" ? "Connected" : "—"} icon={<Database size={18} />} />
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="font-medium mb-4 flex items-center gap-2"><Activity size={16} /> System Status</h2>
                <pre className="text-xs text-gray-400 overflow-auto">{JSON.stringify(health, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* ==================== AUTH (Interactive) ==================== */}
          {active === "auth" && (
            <div>
              <h1 className="text-2xl font-semibold mb-2">Authentication</h1>
              <p className="text-gray-400 mb-6">Email + Password + 6-digit code</p>

              {user ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md">
                  <div className="flex items-center gap-2 text-green-400 mb-4">
                    <CheckCircle size={20} />
                    <span className="font-medium">Logged in</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div><span className="text-gray-400">Email:</span> {user.email}</div>
                    <div><span className="text-gray-400">User ID:</span> <span className="font-mono text-xs">{user.id}</span></div>
                  </div>
                  <button onClick={handleLogout} className="mt-6 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">
                    Logout
                  </button>
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md">
                  {/* Tabs */}
                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => { setAuthMode("login"); setAuthMsg(""); }}
                      className={`px-4 py-2 rounded-lg text-sm ${
authMode === "login" ? "bg-violet-600" : "bg-gray-800"}`}
                    >Login</button>
                    <button
                      onClick={() => { setAuthMode("signup"); setAuthMsg(""); }}
                      className={`px-4 py-2 rounded-lg text-sm ${
authMode === "signup" ? "bg-violet-600" : "bg-gray-800"}`}
                    >Sign Up</button>
                    {authMode === "verify" && (
                      <button className="px-4 py-2 rounded-lg text-sm bg-violet-600">Verify</button>
                    )}
                  </div>

                  {authMode !== "verify" && (
                    <>
                      <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-3 text-sm focus:outline-none focus:border-violet-500"
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-4 text-sm focus:outline-none focus:border-violet-500"
                      />
                    </>
                  )}

                  {authMode === "verify" && (
                    <>
                      <p className="text-sm text-gray-400 mb-3">Enter the 6-digit code sent to <strong>{email}</strong></p>
                      {devCode && (
                        <p className="text-xs text-yellow-400 mb-3">Dev code: <strong>{devCode}</strong></p>
                      )}
                      <input
                        type="text"
                        placeholder="6-digit code"
                        value={code}
                        onChange={e => setCode(e.target.value)}
                        maxLength={6}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-4 text-sm focus:outline-none focus:border-violet-500 tracking-widest text-center text-lg"
                      />
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

                  {authMsg && (
                    <p className={`mt-4 text-sm ${authMsg.includes("success") || authMsg.includes("Verified") || authMsg.includes("created") ? "text-green-400" : "text-red-400"}`}>
                      {authMsg}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ==================== DATABASE ==================== */}
          {active === "database" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-semibold">Database</h1>
                <button onClick={fetchScores} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm">Refresh</button>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-800 text-sm text-gray-400">
                  Table: <span className="text-violet-400">game_scores</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50 text-gray-400">
                    <tr>
                      <th className="text-left px-5 py-3">Player</th>
                      <th className="text-left px-5 py-3">Score</th>
                      <th className="text-left px-5 py-3">ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.length === 0 ? (
                      <tr><td colSpan={3} className="px-5 py-8 text-center text-gray-500">No data yet</td></tr>
                    ) : scores.map((row) => (
                      <tr key={row.id} className="border-t border-gray-800">
                        <td className="px-5 py-3">{row.player_name}</td>
                        <td className="px-5 py-3">{row.score}</td>
                        <td className="px-5 py-3 text-gray-500 font-mono text-xs">{row.id?.slice(0, 8)}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==================== STORAGE (with Upload) ==================== */}
          {active === "storage" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Storage</h1>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
                <h3 className="font-medium mb-4 flex items-center gap-2"><Upload size={18} /> Upload File</h3>
                
                {!token && (
                  <p className="text-yellow-400 text-sm mb-4">You need to login first (go to Authentication)</p>
                )}

                <input
                  ref={fileRef}
                  type="file"
                  onChange={handleUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={!token}
                  className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium disabled:opacity-40"
                >
                  Choose File & Upload
                </button>

                {uploadStatus && (
                  <p className={`mt-3 text-sm ${uploadStatus.includes("success") ? "text-green-400" : uploadStatus.includes("Uploading") ? "text-blue-400" : "text-red-400"}`}>
                    {uploadStatus}
                  </p>
                )}
              </div>

              {uploadedFiles.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-800 text-sm text-gray-400">Uploaded Files</div>
                  <div className="divide-y divide-gray-800">
                    {uploadedFiles.map((f, i) => (
                      <div key={i} className="px-5 py-3 flex items-center justify-between text-sm">
                        <span>{f.name}</span>
                        <span className="text-gray-500">{(f.size / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== REALTIME ==================== */}
          {active === "realtime" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Realtime</h1>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                <Card title="Connected Clients" value={realtimeStats?.totalClients ?? 0} />
                <Card title="Active Rooms" value={realtimeStats?.rooms?.length ?? 0} />
                <Card title="Endpoint" value="/realtime/v1" />
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="font-medium mb-4">Active Rooms</h3>
                {realtimeStats?.rooms?.length ? (
                  <div className="space-y-3">
                    {realtimeStats.rooms.map((r: any) => (
                      <div key={r.name} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-3">
                        <span className="font-mono text-violet-400">{r.name}</span>
                        <span className="text-sm text-gray-400">{r.clients} clients</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No active rooms right now</p>
                )}
              </div>
            </div>
          )}

          {/* ==================== HOSTING ==================== */}
          {active === "hosting" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Hosting</h1>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
                <h3 className="font-medium mb-4">Deploy New Site</h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Site name (e.g. my-game)"
                    value={newSiteName}
                    onChange={e => setNewSiteName(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500"
                  />
                  <button
                    onClick={createSite}
                    className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium"
                  >
                    Deploy
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">This is a preview. Real static hosting will be connected next.</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-800 text-sm text-gray-400">Your Sites</div>
                <div className="divide-y divide-gray-800">
                  {sites.map(site => (
                    <div key={site.id} className="px-5 py-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{site.name}</div>
                        <div className="text-sm text-gray-500">{site.url}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-xs px-2.5 py-1 rounded-full ${
                          site.status === "Live" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                        }`}>
                          {site.status}
                        </span>
                        <span className="text-xs text-gray-500">{site.updated}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ==================== SETTINGS ==================== */}
          {active === "settings" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Settings</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-xl space-y-4 text-sm">
                <div>
                  <div className="text-gray-400 mb-1">API URL</div>
                  <div className="font-mono bg-gray-800 px-3 py-2 rounded">{API_URL}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Logged in as</div>
                  <div>{user ? user.email : "Not logged in"}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Version</div>
                  <div>0.1.6</div>
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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
        <span>{title}</span>
        {icon}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

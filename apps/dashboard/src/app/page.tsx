"use client";

import { useState, useEffect } from "react";
import {
  LayoutDashboard, Shield, Database, HardDrive, Radio,
  Globe, Settings, LogOut, Menu, Users, Activity, Server
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

  useEffect(() => {
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

        <div className="p-4 border-t border-gray-800 text-sm text-gray-500">
          {health?.status === "healthy" ? (
            <span className="text-green-400">● API Online</span>
          ) : (
            <span className="text-red-400">● API Offline</span>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <header className="h-14 border-b border-gray-800 flex items-center px-6 gap-4">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white">
            <Menu size={20} />
          </button>
          <span className="text-sm text-gray-400">KotahBase Dashboard</span>
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

          {/* ==================== AUTH ==================== */}
          {active === "auth" && (
            <div>
              <h1 className="text-2xl font-semibold mb-2">Authentication</h1>
              <p className="text-gray-400 mb-6">Email + Password + 6-digit verification code</p>

              <div className="grid gap-6 max-w-2xl">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h3 className="font-medium mb-4">How Auth works</h3>
                  <ol className="list-decimal list-inside space-y-2 text-gray-300 text-sm">
                    <li>User signs up with <strong>Email + Password</strong></li>
                    <li>System sends a <strong>6-digit code</strong> to the email</li>
                    <li>User enters the code → account verified</li>
                    <li>Later logins use Email + Password only</li>
                  </ol>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h3 className="font-medium mb-3">API Endpoints</h3>
                  <div className="space-y-2 text-sm font-mono text-gray-400">
                    <div>POST /auth/v1/signup</div>
                    <div>POST /auth/v1/verify</div>
                    <div>POST /auth/v1/login</div>
                    <div>GET  /auth/v1/user</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== DATABASE ==================== */}
          {active === "database" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-semibold">Database</h1>
                <button onClick={fetchScores} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm">
                  Refresh
                </button>
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

          {/* ==================== STORAGE ==================== */}
          {active === "storage" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Storage</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-300 mb-4">Upload game assets, images, files via the API.</p>
                <div className="text-sm font-mono text-gray-400 space-y-1">
                  <div>POST /storage/v1/object/:bucket/:key</div>
                  <div>GET  /storage/v1/object/:bucket/:key</div>
                </div>
              </div>
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

              <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="font-medium mb-3">How to use (SDK)</h3>
                <pre className="text-xs text-gray-400 overflow-auto bg-gray-950 p-4 rounded-lg">{
`const client = new KotahClient({ url: "http://localhost:4000" });

const channel = client.channel("lobby")
  .on("message", (msg) => console.log(msg))
  .subscribe();

channel.send({ hello: "world" });`
                }</pre>
              </div>
            </div>
          )}

          {/* ==================== HOSTING ==================== */}
          {active === "hosting" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Hosting</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-400">Static website + serverless functions hosting will be added next.</p>
              </div>
            </div>
          )}

          {/* ==================== SETTINGS ==================== */}
          {active === "settings" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Settings</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-xl">
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="text-gray-400 mb-1">API URL</div>
                    <div className="font-mono bg-gray-800 px-3 py-2 rounded">{API_URL}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-1">Version</div>
                    <div>0.1.5</div>
                  </div>
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

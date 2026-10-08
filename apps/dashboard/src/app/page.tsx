"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  Shield,
  Database,
  HardDrive,
  Radio,
  Globe,
  Settings,
  LogOut,
  Menu
} from "lucide-react";

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

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-20"} bg-gray-900 border-r border-gray-800 transition-all duration-300 flex flex-col`}>
        <div className="p-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center font-bold text-white">K</div>
          {sidebarOpen && <span className="text-xl font-semibold tracking-tight">KotahBase</span>}
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4">
          {nav.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-600/20 text-brand-400"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`}
              >
                <Icon size={18} />
                {sidebarOpen && <span>{item.name}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button className="flex items-center gap-3 text-gray-400 hover:text-gray-200 text-sm w-full">
            <LogOut size={18} />
            {sidebarOpen && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <header className="h-16 border-b border-gray-800 flex items-center justify-between px-6">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white">
            <Menu size={20} />
          </button>
          <div className="text-sm text-gray-400">KotahBase Dashboard</div>
        </header>

        <div className="p-8">
          {active === "dashboard" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Project Overview</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {["Active Users", "Database Size", "Storage Used", "Realtime Connections"].map((title) => (
                  <div key={title} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="text-sm text-gray-400 mb-1">{title}</div>
                    <div className="text-2xl font-semibold">—</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {active === "auth" && (
            <div>
              <h1 className="text-2xl font-semibold mb-2">Authentication</h1>
              <p className="text-gray-400 mb-6">Email + Password + 6-digit code</p>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-300">Users management coming soon...</p>
              </div>
            </div>
          )}

          {active === "database" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Database</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-300">Tables & SQL editor coming soon...</p>
              </div>
            </div>
          )}

          {active === "storage" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Storage</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-300">File browser coming soon...</p>
              </div>
            </div>
          )}

          {active === "realtime" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Realtime</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-300">Live connections & rooms monitor coming soon...</p>
                <p className="text-sm text-gray-500 mt-2">WebSocket endpoint: /realtime/v1</p>
              </div>
            </div>
          )}

          {active === "hosting" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Hosting</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-300">Static site hosting coming soon...</p>
              </div>
            </div>
          )}

          {active === "settings" && (
            <div>
              <h1 className="text-2xl font-semibold mb-6">Settings</h1>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-300">Project settings & API keys coming soon...</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

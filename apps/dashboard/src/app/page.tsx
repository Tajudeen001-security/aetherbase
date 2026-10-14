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
  const [mode, setMode] = useState<"login" | "signup" | "verify">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [pName, setPName] = useState("");
  const [pPass, setPPass] = useState("");
  const [pMsg, setPMsg] = useState("");
  const [pBusy, setPBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [sql, setSql] = useState("SELECT table_name FROM information_schema.tables WHERE table_schema='public';");
  const [sqlOut, setSqlOut] = useState<any>(null);
  const [sqlBusy, setSqlBusy] = useState(false);
  const [tables, setTables] = useState<string[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [authCfg, setAuthCfg] = useState<any>(null);
  const [authUsers, setAuthUsers] = useState<any[]>([]);
  const [authSaveMsg, setAuthSaveMsg] = useState("");
  const [authSaving, setAuthSaving] = useState(false);
  const [form, setForm] = useState({
    site_url: "", redirect_url: "", additional_redirect_urls: "",
    enable_email: true, enable_google: true, enable_github: true,
    google_client_id: "", google_client_secret: "",
    github_client_id: "", github_client_secret: ""
  });

  const saveSession = (t: string, u: any) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); setUser(u); };
  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null);
    setProjects([]); setProject(null); setView("auth");
  };

  const api = useCallback(async (path: string, opts: any = {}) => {
    const headers: any = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }, [token]);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const tFromUrl = params.get("token");
      if (tFromUrl) { window.history.replaceState({}, "", window.location.pathname); localStorage.setItem(TOKEN_KEY, tFromUrl); }
      const t = tFromUrl || localStorage.getItem(TOKEN_KEY);
      if (!t) { setBoot(false); return; }
      try {
        const res = await fetch(`${API_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${t}` } });
        if (res.status === 401) clearSession();
        else if (res.ok) { const u = await res.json(); setToken(t); setUser(u); localStorage.setItem(TOKEN_KEY, t); }
        else setToken(t);
      } catch { setToken(t); }
      setBoot(false);
    })();
    fetch(`${API_URL}/health`).then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/projects`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 401) { clearSession(); return; }
        if (res.ok) {
          const list = await res.json();
          setProjects(list);
          if (list.length === 0) setView("onboard");
          else { setView("app"); if (!project) setProject(list[0]); }
        }
      } catch { setView("app"); }
    })();
  }, [token]);

  useEffect(() => {
    if (!token || view !== "app") return;
    if (tab === "tables" || tab === "sql") api("/tables").then(({ res, data }) => { if (res.ok) setTables(data); });
    if (tab === "authentication" && project?.id) loadAuth(project.id);
  }, [tab, token, view, project?.id]);

  async function loadAuth(projectId: string) {
    const { res, data } = await api(`/projects/${projectId}/auth`);
    if (res.ok) {
      setAuthCfg(data);
      setForm({
        site_url: data.site_url || "", redirect_url: data.redirect_url || "",
        additional_redirect_urls: (data.additional_redirect_urls || []).join("\n"),
        enable_email: data.enable_email !== false, enable_google: data.enable_google !== false, enable_github: data.enable_github !== false,
        google_client_id: data.google_client_id || "", google_client_secret: "",
        github_client_id: data.github_client_id || "", github_client_secret: ""
      });
    }
    const u = await api(`/projects/${projectId}/users`);
    if (u.res.ok) setAuthUsers(u.data);
  }

  async function saveAuth() {
    if (!project?.id) return;
    setAuthSaving(true); setAuthSaveMsg("");
    const body: any = {
      site_url: form.site_url.trim() || null, redirect_url: form.redirect_url.trim() || null,
      additional_redirect_urls: form.additional_redirect_urls.split("\n").map(s => s.trim()).filter(Boolean),
      enable_email: form.enable_email, enable_google: form.enable_google, enable_github: form.enable_github,
      google_client_id: form.google_client_id.trim(), github_client_id: form.github_client_id.trim()
    };
    if (form.google_client_secret.trim()) body.google_client_secret = form.google_client_secret.trim();
    if (form.github_client_secret.trim()) body.github_client_secret = form.github_client_secret.trim();
    const { res, data } = await api(`/projects/${project.id}/auth`, { method: "PUT", body: JSON.stringify(body) });
    setAuthSaving(false);
    setAuthSaveMsg(res.ok ? "Saved" : (data.error || "Failed"));
    if (res.ok) loadAuth(project.id);
  }

  async function doSignup() {
    setAuthBusy(true); setAuthErr(""); setDevCode("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");
      if (data.dev_code) setDevCode(data.dev_code);
      setMode("verify");
    } catch (e: any) { setAuthErr(e.message); } finally { setAuthBusy(false); }
  }
  async function doVerify() {
    setAuthBusy(true); setAuthErr("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: otp }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");
      saveSession(data.access_token, data.user);
    } catch (e: any) { setAuthErr(e.message); } finally { setAuthBusy(false); }
  }
  async function doLogin() {
    setAuthBusy(true); setAuthErr("");
    try {
      const res = await fetch(`${API_URL}/auth/v1/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      saveSession(data.access_token, data.user);
    } catch (e: any) { setAuthErr(e.message); } finally { setAuthBusy(false); }
  }
  async function createProject() {
    if (!pName.trim() || !pPass.trim()) { setPMsg("Name and password required"); return; }
    setPBusy(true); setPMsg("");
    const { res, data } = await api("/projects", { method: "POST", body: JSON.stringify({ name: pName.trim(), password: pPass }) });
    setPBusy(false);
    if (!res.ok) { setPMsg(data.error || "Failed"); return; }
    setProjects([...projects, data]); setProject(data); setPName(""); setPPass(""); setView("app"); setTab("api");
  }
  async function runSql() {
    setSqlBusy(true);
    const { data } = await api("/sql", { method: "POST", body: JSON.stringify({ query: sql }) });
    setSqlOut(data); setSqlBusy(false);
  }
  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 1500);
  }

  if (boot) return <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (!token || view === "auth") {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center p-4">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-md bg-emerald-500 flex items-center justify-center text-black font-bold text-sm">K</div>
              <span className="text-white font-semibold text-lg">KotahBase</span>
            </div>
            <p className="text-zinc-500 text-sm">Backend for your apps</p>
          </div>
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-6">
            <div className="flex border-b border-zinc-800 mb-5 -mx-6 px-6">
              <button onClick={() => { setMode("login"); setAuthErr(""); }} className={`pb-3 mr-4 text-sm ${mode === "login" ? "text-white border-b-2 border-emerald-500" : "text-zinc-500"}`}>Sign in</button>
              <button onClick={() => { setMode("signup"); setAuthErr(""); }} className={`pb-3 text-sm ${mode === "signup" || mode === "verify" ? "text-white border-b-2 border-emerald-500" : "text-zinc-500"}`}>Sign up</button>
            </div>
            {mode !== "verify" && (
              <div className="space-y-3">
                <div><label className="block text-xs text-zinc-400 mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" /></div>
                <div><label className="block text-xs text-zinc-400 mb-1.5">Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" /></div>
              </div>
            )}
            {mode === "verify" && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">Code sent to <span className="text-white">{email}</span></p>
                {devCode && <p className="text-xs text-amber-400 font-mono">Dev code: {devCode}</p>}
                <input value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white text-center tracking-[0.4em] outline-none focus:border-emerald-500" />
              </div>
            )}
            <button disabled={authBusy} onClick={mode === "login" ? doLogin : mode === "signup" ? doSignup : doVerify} className="w-full mt-5 py-2.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-medium disabled:opacity-50">
              {authBusy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Verify email"}
            </button>
            {authErr && <p className="mt-3 text-sm text-red-400 text-center">{authErr}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (view === "onboard") {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <h1 className="text-xl text-white font-semibold mb-1">Create your first project</h1>
          <p className="text-zinc-500 text-sm mb-6">URL + anon key + service role key like Supabase.</p>
          <div className="border border-zinc-800 rounded-lg p-5 space-y-4">
            <input value={pName} onChange={e => setPName(e.target.value)} placeholder="Project name" className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none" />
            <input type="password" value={pPass} onChange={e => setPPass(e.target.value)} placeholder="Project password" className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none" />
            <button disabled={pBusy} onClick={createProject} className="w-full py-2.5 rounded-md bg-emerald-500 text-black text-sm font-medium disabled:opacity-50">{pBusy ? "Creating…" : "Create project"}</button>
            {pMsg && <p className="text-sm text-red-400">{pMsg}</p>}
          </div>
          <button onClick={clearSession} className="mt-4 text-xs text-zinc-600">Sign out</button>
        </div>
      </div>
    );
  }

  const nav = [
    { id: "overview", label: "Overview" },
    { id: "api", label: "API" },
    { id: "authentication", label: "Authentication" },
    { id: "tables", label: "Tables" },
    { id: "sql", label: "SQL" },
    { id: "settings", label: "Settings" }
  ];

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-zinc-100 flex flex-col">
      <header className="h-12 border-b border-zinc-800 flex items-center px-4 gap-3 shrink-0">
        <div className="w-6 h-6 rounded bg-emerald-500 flex items-center justify-center text-black font-bold text-[10px]">K</div>
        <select value={project?.id || ""} onChange={e => { const p = projects.find((x: any) => x.id === e.target.value); if (p) setProject(p); }} className="bg-zinc-900 border border-zinc-700 rounded-md text-xs px-2 py-1.5 max-w-[180px] outline-none">
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => setView("onboard")} className="text-xs text-zinc-400 border border-zinc-700 rounded-md px-2 py-1">+ New</button>
        <div className="ml-auto flex items-center gap-3">
          <span className={`text-[10px] ${health?.status === "healthy" ? "text-emerald-400" : "text-zinc-600"}`}>{health?.status === "healthy" ? "● API" : "○ API"}</span>
          <button onClick={clearSession} className="text-xs text-zinc-500">Sign out</button>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="w-44 border-r border-zinc-800 hidden md:flex flex-col py-3 shrink-0">
          {nav.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} className={`text-left px-4 py-2 text-sm ${tab === n.id ? "text-white bg-zinc-900 border-r-2 border-emerald-500" : "text-zinc-500"}`}>{n.label}</button>
          ))}
        </aside>
        <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-[#0c0c0c] flex z-20 overflow-x-auto">
          {nav.map(n => <button key={n.id} onClick={() => setTab(n.id)} className={`flex-1 py-2.5 text-[10px] px-1 ${tab === n.id ? "text-emerald-400" : "text-zinc-500"}`}>{n.label}</button>)}
        </div>
        <main className="flex-1 overflow-auto p-4 md:p-6 pb-16 md:pb-6">
          {tab === "overview" && (
            <div><h1 className="text-lg font-medium mb-4">{project?.name}</h1>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="border border-zinc-800 rounded-lg p-4 text-sm"><div className="text-xs text-zinc-500">Status</div>{health?.status || "—"}</div>
                <div className="border border-zinc-800 rounded-lg p-4 text-sm"><div className="text-xs text-zinc-500">Database</div>{health?.database || "—"}</div>
              </div></div>
          )}
          {tab === "api" && project && (
            <div className="max-w-2xl">
              <h1 className="text-lg font-medium mb-4">API Keys</h1>
              <KeyRow label="Project URL" value={project.url || `${API_URL}/p/${project.ref}`} hint="Base URL" copied={copied==="url"} onCopy={() => copy(project.url || `${API_URL}/p/${project.ref}`, "url")} />
              <KeyRow label="anon key" value={project.anon_key || "—"} hint="Public" copied={copied==="anon"} onCopy={() => project.anon_key && copy(project.anon_key, "anon")} />
              <KeyRow label="service_role key" value={project.service_role_key || project.api_key || "—"} hint="Secret" secret copied={copied==="svc"} onCopy={() => copy(project.service_role_key || project.api_key, "svc")} />
            </div>
          )}
          {tab === "authentication" && project && (
            <div className="max-w-2xl space-y-5">
              <div>
                <h1 className="text-lg font-medium">Authentication</h1>
                <p className="text-zinc-500 text-sm">Providers & redirect URLs for your app users (Supabase-style).</p>
              </div>
              <section className="border border-zinc-800 rounded-lg p-4 space-y-3">
                <h2 className="text-sm font-medium">URL configuration</h2>
                <p className="text-xs text-zinc-500">After Google/GitHub login, users return to Site URL (or allowed redirect_to).</p>
                <input value={form.site_url} onChange={e => setForm({ ...form, site_url: e.target.value })} placeholder="Site URL — https://yourapp.com" className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none" />
                <input value={form.redirect_url} onChange={e => setForm({ ...form, redirect_url: e.target.value })} placeholder="Primary redirect — https://yourapp.com/auth/callback" className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none" />
                <textarea value={form.additional_redirect_urls} onChange={e => setForm({ ...form, additional_redirect_urls: e.target.value })} rows={3} placeholder={"Additional redirect URLs (one per line)\nhttps://localhost:3000"} className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white font-mono outline-none" />
              </section>
              <section className="border border-zinc-800 rounded-lg p-4 space-y-3">
                <h2 className="text-sm font-medium">Providers</h2>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enable_email} onChange={e => setForm({ ...form, enable_email: e.target.checked })} /> Email + Password</label>
                <div className="border-t border-zinc-800 pt-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enable_google} onChange={e => setForm({ ...form, enable_google: e.target.checked })} /> Google</label>
                  <input value={form.google_client_id} onChange={e => setForm({ ...form, google_client_id: e.target.value })} placeholder="Google Client ID" className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none" />
                  <input type="password" value={form.google_client_secret} onChange={e => setForm({ ...form, google_client_secret: e.target.value })} placeholder={authCfg?.google_secret_set ? "Secret set — leave blank to keep" : "Google Client Secret"} className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none" />
                  {authCfg?.callback_urls?.google && (
                    <div className="text-[11px] text-zinc-500">Callback (paste in Google Cloud Console):
                      <div className="font-mono text-zinc-300 break-all mt-1">{authCfg.callback_urls.google}
                        <button type="button" className="ml-2 text-emerald-400" onClick={() => copy(authCfg.callback_urls.google, "gcb")}>{copied==="gcb"?"Copied":"Copy"}</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-t border-zinc-800 pt-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enable_github} onChange={e => setForm({ ...form, enable_github: e.target.checked })} /> GitHub</label>
                  <input value={form.github_client_id} onChange={e => setForm({ ...form, github_client_id: e.target.value })} placeholder="GitHub Client ID" className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none" />
                  <input type="password" value={form.github_client_secret} onChange={e => setForm({ ...form, github_client_secret: e.target.value })} placeholder={authCfg?.github_secret_set ? "Secret set — leave blank to keep" : "GitHub Client Secret"} className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white outline-none" />
                  {authCfg?.callback_urls?.github && (
                    <div className="text-[11px] text-zinc-500">Callback (paste in GitHub OAuth App):
                      <div className="font-mono text-zinc-300 break-all mt-1">{authCfg.callback_urls.github}
                        <button type="button" className="ml-2 text-emerald-400" onClick={() => copy(authCfg.callback_urls.github, "ghcb")}>{copied==="ghcb"?"Copied":"Copy"}</button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
              <button disabled={authSaving} onClick={saveAuth} className="px-4 py-2 bg-emerald-500 text-black text-sm font-medium rounded-md disabled:opacity-50">{authSaving ? "Saving…" : "Save auth settings"}</button>
              {authSaveMsg && <span className="ml-3 text-sm text-zinc-400">{authSaveMsg}</span>}
              {authCfg?.authorize_urls && (
                <section className="border border-zinc-800 rounded-lg p-4">
                  <h2 className="text-sm font-medium mb-2">Start OAuth from your app</h2>
                  <pre className="text-[11px] text-zinc-400 font-mono overflow-x-auto">{`window.location = "${authCfg.authorize_urls.google}?redirect_to=" + encodeURIComponent("https://yourapp.com/callback");
// Token lands in URL hash: #access_token=...`}</pre>
                </section>
              )}
              <section className="border border-zinc-800 rounded-lg p-4">
                <h2 className="text-sm font-medium mb-2">App users</h2>
                {authUsers.length === 0 && <p className="text-xs text-zinc-500">No users yet.</p>}
                {authUsers.map((u: any) => (
                  <div key={u.id} className="flex justify-between text-xs border-b border-zinc-900 py-2"><span>{u.email}</span><span className="text-zinc-500">{u.provider}</span></div>
                ))}
              </section>
            </div>
          )}
          {tab === "tables" && (
            <div><h1 className="text-lg font-medium mb-4">Tables</h1>
              <div className="flex flex-wrap gap-2">{tables.map(t => <span key={t} className="px-3 py-1.5 border border-zinc-800 rounded-md text-xs font-mono">{t}</span>)}</div>
            </div>
          )}
          {tab === "sql" && (
            <div className="max-w-3xl">
              <h1 className="text-lg font-medium mb-4">SQL</h1>
              <textarea value={sql} onChange={e => setSql(e.target.value)} rows={8} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-200 outline-none mb-3" />
              <button onClick={runSql} disabled={sqlBusy} className="px-4 py-2 bg-emerald-500 text-black text-sm font-medium rounded-md">{sqlBusy ? "…" : "Run"}</button>
              {sqlOut?.error && <p className="mt-3 text-red-400 text-sm">{sqlOut.error}</p>}
              {sqlOut?.rows && <p className="mt-3 text-xs text-zinc-500">{sqlOut.rowCount ?? sqlOut.rows.length} rows</p>}
            </div>
          )}
          {tab === "settings" && (
            <div><h1 className="text-lg font-medium mb-4">Settings</h1>
              <p className="text-sm text-zinc-400 mb-3">{user?.email}</p>
              <button onClick={clearSession} className="text-sm text-red-400">Sign out</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function KeyRow({ label, value, hint, secret, copied, onCopy }: any) {
  const [show, setShow] = useState(!secret);
  return (
    <div className="border border-zinc-800 rounded-lg p-4 mb-3">
      <div className="flex justify-between gap-2 mb-1">
        <div><div className="text-sm font-medium">{label}</div><div className="text-[11px] text-zinc-500">{hint}</div></div>
        <div className="flex gap-2">
          {secret && <button onClick={() => setShow(!show)} className="text-[11px] text-zinc-500">{show ? "Hide" : "Reveal"}</button>}
          <button onClick={onCopy} className="text-[11px] text-emerald-400">{copied ? "Copied" : "Copy"}</button>
        </div>
      </div>
      <div className="font-mono text-xs text-zinc-300 break-all mt-2 bg-zinc-950 rounded px-2 py-1.5">{show ? value : "••••••••"}</div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://kotahbase-api.onrender.com";
const TOKEN_KEY = "kb_access_token";

export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [boot, setBoot] = useState(true);
  const [view, setView] = useState<"auth" | "onboard" | "projects" | "app">("auth");
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
  const [usage, setUsage] = useState<any>(null);
  const [requestLogs, setRequestLogs] = useState<any[]>([]);
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
      const oauthError = params.get("error");
      if (oauthError) {
        const messages: Record<string, string> = {
          google_no_code: "Google sign-in was cancelled or returned no authorization code.",
          google_token: "Google could not complete sign-in. Check the OAuth client ID, secret and callback URL.",
          google_no_email: "Google did not return an email address for this account.",
          google_failed: "Google sign-in failed. Please try again.",
          github_no_code: "GitHub sign-in was cancelled or returned no authorization code.",
          github_token: "GitHub could not complete sign-in. Check the OAuth app configuration.",
          github_no_email: "GitHub did not return an email address for this account.",
          github_failed: "GitHub sign-in failed. Please try again."
        };
        setAuthErr(messages[oauthError] || "Sign-in could not be completed. Please try again.");
        window.history.replaceState({}, "", window.location.pathname);
      }
      if (tFromUrl) { window.history.replaceState({}, "", window.location.pathname); localStorage.setItem(TOKEN_KEY, tFromUrl); }
      const t = tFromUrl || localStorage.getItem(TOKEN_KEY);
      try {
        const healthRes = await fetch(`${API_URL}/health`);
        const healthData = await healthRes.json().catch(() => ({}));
        setHealth(healthData);
      } catch { setHealth({ status: "offline" }); }
      if (!t) { setBoot(false); return; }
      try {
        const res = await fetch(`${API_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${t}` } });
        if (res.status === 401) clearSession();
        else if (res.ok) { const u = await res.json(); setToken(t); setUser(u); localStorage.setItem(TOKEN_KEY, t); }
        else { localStorage.removeItem(TOKEN_KEY); setAuthErr("We couldn't validate your session. Please sign in again."); }
      } catch { setAuthErr("The KotahBase API is unreachable. Check the API deployment and try again."); }
      setBoot(false);
    })();
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
          else { setView("projects"); if (!project) setProject(list[0]); }
        }
      } catch { setAuthErr("Could not load your projects. Check the API connection, then retry."); setView("projects"); }
    })();
  }, [token]);

  useEffect(() => {
    if (!token || view !== "app" || !project?.id) return;
    if (tab === "tables" || tab === "sql") api(`/tables?project_id=${encodeURIComponent(project.id)}`).then(({ res, data }) => { if (res.ok) setTables(data); });
    if (tab === "authentication" && project?.id) loadAuth(project.id);
    if (tab === "logs" && project?.id) api(`/projects/${project.id}/logs?limit=100`).then(({ res, data }) => { if (res.ok) setRequestLogs(data); });
  }, [tab, token, view, project?.id]);

  useEffect(() => {
    if (!token || view !== "app" || !project?.id) return;
    let active = true;
    const loadUsage = async () => {
      try {
        const res = await fetch(`${API_URL}/projects/${project.id}/metrics`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => null);
        if (active && res.ok) setUsage(data);
      } catch { if (active) setUsage(null); }
    };
    loadUsage();
    const timer = setInterval(loadUsage, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [project?.id, token, view]);

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
    setProjects([...projects, data]); setProject(data); setPName(""); setPPass(""); setView("app"); setTab("overview");
  }
  async function runSql() {
    if (!project?.id) return;
    setSqlBusy(true);
    const { data } = await api("/sql", { method: "POST", body: JSON.stringify({ query: sql, project_id: project.id }) });
    setSqlOut(data); setSqlBusy(false);
  }
  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 1500);
  }

  if (boot) return <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (!token || view === "auth") {
    return (
      <div className="min-h-screen bg-[#090b0a] text-white flex">
        <section className="hidden lg:flex lg:w-[52%] relative overflow-hidden border-r border-white/[0.08] flex-col justify-between p-12 xl:p-16">
          <div className="absolute inset-0 pointer-events-none" style={{backgroundImage:"linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px, transparent 1px)",backgroundSize:"48px 48px"}} />
          <div className="absolute -top-32 -left-20 w-[520px] h-[520px] rounded-full bg-emerald-500/[0.09] blur-[120px]" />
          <div className="relative flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-400 text-[#07100b] grid place-items-center font-black text-lg">a</div>
            <span className="text-[17px] font-semibold tracking-tight">KotahBase</span>
            <span className="ml-2 text-[10px] uppercase tracking-[.18em] text-zinc-500 border border-white/10 rounded px-2 py-1">Developer platform</span>
          </div>
          <div className="relative max-w-xl py-16">
            <p className="text-xs uppercase tracking-[.22em] text-emerald-300 mb-5">Your backend. Your rules.</p>
            <h1 className="text-5xl xl:text-6xl leading-[1.08] font-semibold tracking-[-.055em]">Build the product.<br/><span className="text-zinc-500">We’ll handle the backend.</span></h1>
            <p className="mt-6 max-w-md text-[15px] leading-7 text-zinc-400">A practical home for your app’s data, authentication, APIs and files — built with Nigerian infrastructure in mind.</p>
            <div className="mt-10 grid grid-cols-3 gap-3">
              {["Postgres database","User authentication","Object storage"].map((label,i)=><div key={label} className="border border-white/[0.09] bg-white/[0.025] rounded-xl p-3"><div className="text-emerald-300 text-sm mb-3">{["01","02","03"][i]}</div><div className="text-xs text-zinc-300">{label}</div></div>)}
            </div>
          </div>
          <div className="relative flex justify-between text-[11px] text-zinc-600"><span>Built for developers, wherever they are.</span><span>Nigeria · Africa · Everywhere</span></div>
        </section>
        <main className="flex-1 flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-[390px]">
            <div className="lg:hidden flex items-center gap-3 mb-10"><div className="w-9 h-9 rounded-xl bg-emerald-400 text-[#07100b] grid place-items-center font-black text-lg">a</div><span className="font-semibold text-lg">KotahBase</span></div>
            <p className="text-xs uppercase tracking-[.18em] text-emerald-300 mb-3">{mode === "verify" ? "One last step" : "Developer access"}</p>
            <h2 className="text-[30px] font-semibold tracking-[-.04em]">{mode === "verify" ? "Verify your email" : mode === "signup" ? "Create your account" : "Welcome back"}</h2>
            <p className="text-sm text-zinc-500 mt-2 mb-8">{mode === "verify" ? "Enter the six-digit code associated with your account." : mode === "signup" ? "Get your project workspace ready in a few steps." : "Sign in to continue to your workspace."}</p>
            {mode !== "verify" && <div className="grid grid-cols-2 p-1 rounded-lg bg-white/[0.04] border border-white/[0.07] mb-6">
              <button onClick={() => {setMode("login");setAuthErr("");}} className={`rounded-md py-2.5 text-sm transition ${mode==="login"?"bg-[#202622] text-white shadow-sm":"text-zinc-500 hover:text-zinc-300"}`}>Sign in</button>
              <button onClick={() => {setMode("signup");setAuthErr("");}} className={`rounded-md py-2.5 text-sm transition ${mode==="signup"?"bg-[#202622] text-white shadow-sm":"text-zinc-500 hover:text-zinc-300"}`}>Create account</button>
            </div>}
            <form onSubmit={e=>{e.preventDefault(); if(mode==="login") doLogin(); else if(mode==="signup") doSignup(); else doVerify();}} className="space-y-4">
              {mode !== "verify" ? <>
                <div><label className="block text-[12px] text-zinc-300 mb-2">Email address</label><input required autoComplete="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" className="w-full h-11 rounded-lg border border-white/[0.12] bg-[#101310] px-3.5 text-sm placeholder:text-zinc-700 outline-none focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10 transition"/></div>
                <div><label className="block text-[12px] text-zinc-300 mb-2">Password</label><input required minLength={8} autoComplete={mode==="login"?"current-password":"new-password"} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" className="w-full h-11 rounded-lg border border-white/[0.12] bg-[#101310] px-3.5 text-sm placeholder:text-zinc-700 outline-none focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10 transition"/></div>
              </> : <>
                <p className="text-sm text-zinc-400">Code sent to <span className="text-white">{email}</span></p>
                {devCode && <p className="text-xs text-amber-300 border border-amber-300/20 bg-amber-300/[0.06] rounded-lg p-3">Development email delivery is not configured. Temporary code: <strong className="font-mono">{devCode}</strong></p>}
                <input required inputMode="numeric" pattern="[0-9]{6}" aria-label="Six-digit verification code" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,6))} maxLength={6} placeholder="000000" className="w-full h-14 rounded-lg border border-white/[0.12] bg-[#101310] px-3 text-center text-xl tracking-[.5em] font-mono outline-none focus:border-emerald-400/70"/>
                <button type="button" onClick={()=>{setMode("signup");setOtp("");setAuthErr("");}} className="text-xs text-zinc-500 hover:text-white">Back to account details</button>
              </>}
              {authErr && <div role="alert" className="rounded-lg border border-red-400/20 bg-red-400/[0.07] px-3.5 py-3 text-sm leading-5 text-red-300">{authErr}</div>}
              <button type="submit" disabled={authBusy} className="w-full h-11 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-[#07100b] font-semibold text-sm transition disabled:opacity-50 disabled:cursor-wait">{authBusy?"Please wait…":mode==="login"?"Sign in to KotahBase":mode==="signup"?"Create account":"Verify email"}</button>
            </form>
            <div className="mt-7 flex items-center gap-3 text-[11px] text-zinc-600"><span className={`w-1.5 h-1.5 rounded-full ${health?.status==="healthy"?"bg-emerald-400":"bg-amber-400"}`}/>{health?.status==="healthy"?"API is reachable":"API connection not confirmed"}<span className="ml-auto">Secure account access</span></div>
            <p className="mt-8 text-[11px] leading-5 text-zinc-600">By continuing, you agree to use the platform responsibly. Keep your project secret keys private.</p>
          </div>
        </main>
      </div>
    );
  }

  if (view === "projects") {
    return (
      <div className="min-h-screen bg-[#080b09] text-white">
        <header className="border-b border-white/[0.08] px-5 sm:px-8 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-400 text-[#07100b] grid place-items-center font-black">a</div>
          <div><div className="font-semibold tracking-tight">KotahBase</div><div className="text-xs text-zinc-500">Your backend workspace</div></div>
          <div className="ml-auto flex items-center gap-3"><span className="hidden sm:block text-xs text-zinc-500">{user?.email}</span><button onClick={clearSession} className="text-xs text-zinc-400 hover:text-white">Sign out</button></div>
        </header>
        <main className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-9">
            <div><p className="text-xs uppercase tracking-[.2em] text-emerald-300 mb-3">Workspace</p><h1 className="text-3xl sm:text-4xl font-semibold tracking-[-.045em]">Your projects</h1><p className="mt-3 text-sm text-zinc-400 max-w-xl">Each project has its own reference, API URL and keys. Choose a project to open its backend controls.</p></div>
            <button onClick={() => {setPMsg("");setView("onboard");}} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-[#07100b] font-semibold text-sm px-5 py-3 transition"><span className="text-lg leading-none">+</span> Create project</button>
          </div>
          {authErr && <div role="alert" className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3 text-sm text-amber-100"><span>{authErr}</span><button onClick={() => window.location.reload()} className="self-start sm:self-auto text-xs font-medium text-emerald-300">Retry connection</button></div>}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map((p:any) => <button key={p.id} onClick={() => {setProject(p);setTab("overview");setView("app");}} className="group text-left rounded-2xl border border-white/[0.09] bg-white/[0.025] hover:bg-white/[0.045] hover:border-emerald-400/40 p-5 transition">
              <div className="flex items-start justify-between gap-3"><div className="w-11 h-11 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300 grid place-items-center font-semibold">{String(p.name||"A").slice(0,1).toUpperCase()}</div><span className="text-[11px] rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300 px-2.5 py-1">Project</span></div>
              <h2 className="mt-5 text-lg font-semibold tracking-tight group-hover:text-emerald-200">{p.name}</h2>
              <p className="mt-1 text-xs text-zinc-500 font-mono break-all">{p.ref || "Reference not available"}</p>
              <div className="mt-5 pt-4 border-t border-white/[0.07] flex items-center justify-between text-xs"><span className="text-zinc-500">Open project</span><span className="text-emerald-300 group-hover:translate-x-1 transition-transform">→</span></div>
            </button>)}
            <button onClick={() => {setPMsg("");setView("onboard");}} className="min-h-[190px] rounded-2xl border border-dashed border-white/[0.14] hover:border-emerald-400/40 hover:bg-emerald-400/[0.025] p-5 flex flex-col items-center justify-center text-center transition">
              <span className="w-10 h-10 rounded-full border border-white/10 text-zinc-300 text-2xl grid place-items-center">+</span><span className="mt-3 text-sm font-medium">Start another project</span><span className="mt-1 text-xs text-zinc-500">Create a separate app backend</span>
            </button>
          </div>
          <p className="mt-8 text-[11px] text-zinc-600">Keep service-role keys private. Public client keys belong in browser or mobile apps only when paired with proper database access policies.</p>
        </main>
      </div>
    );
  }

  if (view === "onboard") {
    return (
      <div className="min-h-screen bg-[#080b09] text-white relative overflow-hidden flex flex-col">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-emerald-400/[0.06] blur-[140px] pointer-events-none" />
        <header className="relative border-b border-white/[0.08] px-5 sm:px-8 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-400 text-[#07100b] grid place-items-center font-black">a</div><span className="font-semibold tracking-tight">KotahBase</span>
          {projects.length > 0 && <button onClick={() => setView("projects")} className="ml-auto text-xs text-zinc-400 hover:text-white">← All projects</button>}
          <button onClick={clearSession} className={projects.length > 0 ? "text-xs text-zinc-500 hover:text-white" : "ml-auto text-xs text-zinc-500 hover:text-white"}>Sign out</button>
        </header>
        <main className="relative flex-1 grid place-items-center px-5 py-12">
          <div className="w-full max-w-2xl">
            <div className="text-center mb-8"><div className="mx-auto w-14 h-14 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200 grid place-items-center text-2xl">✳</div><p className="mt-6 text-xs uppercase tracking-[.22em] text-emerald-300">{projects.length ? "New workspace" : "Let's get you started"}</p><h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-[-.045em]">{projects.length ? "Create another project" : "Create your first project"}</h1><p className="mt-3 text-sm leading-6 text-zinc-400 max-w-lg mx-auto">Give your app a home. KotahBase will create a project reference and connection keys you can use to connect your website, mobile app, or game.</p></div>
            <div className="rounded-2xl border border-white/[0.1] bg-[#0d110f]/90 shadow-2xl shadow-black/30 p-5 sm:p-7">
              <label className="block text-xs font-medium text-zinc-300 mb-2">Project name</label><input value={pName} onChange={e => setPName(e.target.value)} placeholder="e.g. my-storefront" autoComplete="off" className="w-full h-12 rounded-xl border border-white/[0.1] bg-black/30 px-4 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-300/60 focus:ring-4 focus:ring-emerald-300/[0.06] transition" />
              <label className="block text-xs font-medium text-zinc-300 mt-5 mb-2">Project password</label><input type="password" value={pPass} onChange={e => setPPass(e.target.value)} placeholder="Create a project password" autoComplete="new-password" className="w-full h-12 rounded-xl border border-white/[0.1] bg-black/30 px-4 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-300/60 focus:ring-4 focus:ring-emerald-300/[0.06] transition" />
              <p className="mt-3 text-[11px] leading-5 text-zinc-500">Use a strong password and keep your secret service key private. Project credentials are different from your KotahBase account password.</p>
              {pMsg && <p role="alert" className="mt-4 rounded-lg border border-rose-300/20 bg-rose-300/[0.06] px-3 py-2.5 text-sm text-rose-200">{pMsg}</p>}
              <button disabled={pBusy} onClick={createProject} className="mt-5 w-full h-12 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-[#07100b] font-semibold text-sm transition disabled:opacity-50">{pBusy ? "Creating your project…" : "Create project →"}</button>
            </div>
            <div className="mt-5 grid sm:grid-cols-3 gap-3">{[["01","Unique project reference"],["02","API URL + client key"],["03","Private server key"]].map(([n,label])=><div key={n} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3 flex items-center gap-3"><span className="text-xs font-mono text-emerald-300">{n}</span><span className="text-xs text-zinc-400">{label}</span></div>)}</div>
          </div>
        </main>
      </div>
    );
  }

  const nav = [
    { id: "overview", label: "Overview" },
    { id: "api", label: "API" },
    { id: "authentication", label: "Authentication" },
    { id: "tables", label: "Tables" },
    { id: "sql", label: "SQL" },
    { id: "logs", label: "Logs" },
    { id: "settings", label: "Settings" }
  ];

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-zinc-100 flex flex-col">
      <header className="h-12 border-b border-zinc-800 flex items-center px-4 gap-3 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-emerald-400 flex items-center justify-center text-[#07100b] font-black text-xs">a</div>
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
            <div className="max-w-6xl">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
                <div><p className="text-xs uppercase tracking-[.18em] text-emerald-300 mb-2">Project overview</p><h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{project?.name}</h1><p className="mt-2 text-sm text-zinc-500">A live view of your backend activity.</p></div>
                <div className="text-xs text-zinc-500 border border-white/[0.09] rounded-lg px-3 py-2"><span className={health?.status === "healthy" ? "text-emerald-300" : "text-amber-300"}>● </span>{health?.status === "healthy" ? "Platform API online" : "API status not confirmed"}</div>
              </div>
              <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-xs text-zinc-500">API requests</div><div className="mt-3 text-3xl font-semibold tracking-tight">{usage ? Number(usage.requests).toLocaleString() : "—"}</div><div className="mt-2 text-[11px] text-zinc-600">Persistent meter</div></div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-xs text-zinc-500">Successful requests</div><div className="mt-3 text-3xl font-semibold tracking-tight text-emerald-300">{usage ? Number(usage.successful).toLocaleString() : "—"}</div><div className="mt-2 text-[11px] text-zinc-600">HTTP 2xx–3xx</div></div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-xs text-zinc-500">Failed requests</div><div className="mt-3 text-3xl font-semibold tracking-tight text-rose-300">{usage ? Number(usage.failed).toLocaleString() : "—"}</div><div className="mt-2 text-[11px] text-zinc-600">HTTP 4xx–5xx</div></div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-xs text-zinc-500">Response egress</div><div className="mt-3 text-3xl font-semibold tracking-tight">{usage ? Number(usage.egressMB).toLocaleString() : "—"}<span className="text-sm font-normal text-zinc-500 ml-1">MB</span></div><div className="mt-2 text-[11px] text-zinc-600">Measured response payloads</div></div>
              </section>
              <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
                <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-5"><h2 className="font-medium">Project connection</h2><button onClick={() => setTab("api")} className="text-xs text-emerald-300 hover:text-emerald-200">View API keys →</button></div>
                  <div className="text-xs text-zinc-500 mb-2">Project API URL</div><div className="flex items-start gap-3"><code className="min-w-0 flex-1 break-all text-sm text-zinc-200">{project?.url || "URL will appear when project reference is available"}</code><button onClick={() => project?.url && copy(project.url, "overview-url")} className="shrink-0 text-xs text-emerald-300">{copied === "overview-url" ? "Copied" : "Copy"}</button></div>
                  <div className="mt-5 pt-5 border-t border-white/[0.07] grid sm:grid-cols-2 gap-4"><div><div className="text-xs text-zinc-500 mb-1">Database</div><div className="text-sm">{health?.database || "Checking connection…"}</div></div><div><div className="text-xs text-zinc-500 mb-1">Object storage</div><div className="text-sm">{health?.storage || "Checking connection…"}</div></div></div>
                </section>
                <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6"><h2 className="font-medium mb-4">Usage meter</h2><p className="text-sm leading-6 text-zinc-400">Request counts and response egress are stored in KotahBase Postgres. This is telemetry, not yet a billing-grade quota counter; egress measures API response payloads, not all network traffic.</p><div className="mt-5 pt-4 border-t border-white/[0.07] text-xs text-zinc-500">Last project request: {usage?.lastRequestAt ? new Date(usage.lastRequestAt).toLocaleString() : "No requests recorded yet"}</div></section>
              </div>
            </div>
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
          {tab === "logs" && (
            <div className="max-w-6xl">
              <div className="flex items-end justify-between gap-4 mb-5">
                <div><h1 className="text-lg font-medium">Request logs</h1><p className="text-sm text-zinc-500 mt-1">Latest 100 project API requests, with response size and latency.</p></div>
                <button onClick={() => api(`/projects/${project.id}/logs?limit=100`).then(({ res, data }) => { if (res.ok) setRequestLogs(data); })} className="text-xs text-emerald-300 border border-zinc-800 rounded-lg px-3 py-2">Refresh</button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900 text-zinc-400"><tr>{["Time","Method","Path","Status","Response","Latency"].map(x=><th key={x} className="px-3 py-3 font-medium whitespace-nowrap">{x}</th>)}</tr></thead>
                  <tbody>{requestLogs.map((log:any)=><tr key={log.id} className="border-t border-zinc-800/80"><td className="px-3 py-3 whitespace-nowrap text-zinc-500">{new Date(log.created_at).toLocaleString()}</td><td className="px-3 py-3 font-mono">{log.method}</td><td className="px-3 py-3 font-mono max-w-[360px] truncate">{log.path}</td><td className={`px-3 py-3 font-mono ${log.status_code >= 400 ? "text-rose-300" : "text-emerald-300"}`}>{log.status_code}</td><td className="px-3 py-3 whitespace-nowrap">{Number(log.response_bytes).toLocaleString()} B</td><td className="px-3 py-3 whitespace-nowrap">{Number(log.duration_ms)} ms</td></tr>)}</tbody>
                </table>
                {requestLogs.length === 0 && <p className="p-6 text-sm text-zinc-500">No request logs recorded yet. Make a request using this project's API key and refresh.</p>}
              </div>
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

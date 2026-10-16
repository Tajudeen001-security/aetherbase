import { Hono } from "hono";
import { cors } from "hono/cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { query, queryProject } from "./db/client";
import { hasS3, uploadFile, listFiles, getFileUrl, deleteFile } from "./storage";
import { sendOTPEmail } from "./email";
import dotenv from "dotenv";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { aiRoutes } from "./ai";
import { schemaRoutes } from "./schemas";
import { extraRoutes, ensureExtraTables } from "./extras";
import { projectClientRoutes, makeKeys, projectUrl } from "./project-client";
import { mountAuthSettings, ensureAuthColumns } from "./auth-settings";
import { getProjectUsage, getProjectLogs, ensureUsageTables } from "./usage";

dotenv.config();
const app = new Hono();
app.use("*", cors({ origin: "*", allowMethods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"], allowHeaders: ["Content-Type","Authorization","apikey","x-api-key"] }));
app.route("/ai", aiRoutes);
app.route("/schemas", schemaRoutes);
app.route("/v1", extraRoutes);
app.route("/p", projectClientRoutes);

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) throw new Error("JWT_SECRET must be configured in production");
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "kotahbase-dev-secret-change-me");
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://kotahbase-six.vercel.app";
const API_URL = process.env.API_URL || "https://kotahbase-api.onrender.com";
const PLATFORM_GOOGLE_ID = process.env.GOOGLE_CLIENT_ID || "";
const PLATFORM_GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const PLATFORM_GITHUB_ID = process.env.GITHUB_CLIENT_ID || "";
const PLATFORM_GITHUB_SECRET = process.env.GITHUB_CLIENT_SECRET || "";

function generateOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }
function createToken(payload: object, expiresIn = "7d") { return jwt.sign(payload, JWT_SECRET, { expiresIn } as any); }
async function getUserFromToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as any;
    const res = await query("SELECT id, email, created_at, provider FROM users WHERE id = $1", [payload.sub]);
    return res.rows[0] || null;
  } catch { return null; }
}

app.get("/", (c) => c.json({ name: "KotahBase API", version: "0.11.0", status: "ok" }));
app.get("/health", async (c) => {
  try { await query("SELECT 1"); return c.json({ status: "healthy", database: "connected", storage: hasS3 ? "connected" : "off", version: "0.11.0" }); }
  catch (err: any) { return c.json({ status: "unhealthy", error: err.message }, 500); }
});

app.post("/auth/v1/signup", async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "Email and password required" }, 400);
    if (password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);
    if ((await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()])).rows.length) return c.json({ error: "Email already registered" }, 400);
    const id = uuidv4();
    await query("INSERT INTO users (id, email, password, email_confirmed, provider) VALUES ($1,$2,$3,false,'email')", [id, email.toLowerCase(), await bcrypt.hash(password, 10)]);
    const code = generateOTP();
    await query(`INSERT INTO otp_codes (email, code, expires_at, type) VALUES ($1,$2,NOW()+INTERVAL '10 minutes','signup') ON CONFLICT (email) DO UPDATE SET code=$2, expires_at=NOW()+INTERVAL '10 minutes', type='signup'`, [email.toLowerCase(), code]);
    const sent = await sendOTPEmail(email, code, "signup");
    const response: any = { message: sent ? "Account created. Check email for code." : "Account created." };
    if (!sent) response.dev_code = code;
    return c.json(response);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.post("/auth/v1/verify", async (c) => {
  try {
    const { email, code } = await c.req.json();
    const otpRes = await query("SELECT code, expires_at FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
    if (!otpRes.rows.length) return c.json({ error: "No code found" }, 400);
    const record = otpRes.rows[0];
    if (new Date() > new Date(record.expires_at)) return c.json({ error: "Code expired" }, 400);
    if (record.code !== code) return c.json({ error: "Invalid code" }, 401);
    await query("DELETE FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
    await query("UPDATE users SET email_confirmed = true WHERE email = $1", [email.toLowerCase()]);
    const user = (await query("SELECT id, email, created_at, provider FROM users WHERE email = $1", [email.toLowerCase()])).rows[0];
    return c.json({ access_token: createToken({ sub: user.id, email: user.email }), token_type: "bearer", expires_in: 604800, user });
  } catch { return c.json({ error: "Verification failed" }, 500); }
});

app.post("/auth/v1/login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    const res = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (!res.rows.length) return c.json({ error: "Invalid email or password" }, 401);
    const user = res.rows[0];
    if (!user.password) return c.json({ error: "Use social login" }, 400);
    if (!(await bcrypt.compare(password, user.password))) return c.json({ error: "Invalid email or password" }, 401);
    if (!user.email_confirmed) return c.json({ error: "Verify your email first" }, 403);
    return c.json({ access_token: createToken({ sub: user.id, email: user.email }), token_type: "bearer", expires_in: 604800, user: { id: user.id, email: user.email, created_at: user.created_at, provider: user.provider } });
  } catch { return c.json({ error: "Login failed" }, 500); }
});

app.get("/auth/v1/user", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  return c.json(user);
});

app.get("/auth/v1/google", (c) => {
  if (!PLATFORM_GOOGLE_ID) return c.json({ error: "Platform Google not configured" }, 503);
  const redirectUri = `${API_URL}/auth/v1/callback/google`;
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${PLATFORM_GOOGLE_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=consent`);
});
app.get("/auth/v1/callback/google", async (c) => {
  try {
    const code = c.req.query("code");
    if (!code) return c.redirect(`${DASHBOARD_URL}?error=google_no_code`);
    const redirectUri = `${API_URL}/auth/v1/callback/google`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: PLATFORM_GOOGLE_ID, client_secret: PLATFORM_GOOGLE_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return c.redirect(`${DASHBOARD_URL}?error=google_token`);
    const profile = await (await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json();
    if (!profile.email) return c.redirect(`${DASHBOARD_URL}?error=google_no_email`);
    let userRow = await query("SELECT * FROM users WHERE email = $1", [profile.email.toLowerCase()]);
    let user;
    if (!userRow.rows.length) {
      const id = uuidv4();
      await query(`INSERT INTO users (id, email, password, email_confirmed, provider, provider_id) VALUES ($1,$2,NULL,true,'google',$3)`, [id, profile.email.toLowerCase(), profile.id]);
      user = { id, email: profile.email.toLowerCase() };
    } else user = userRow.rows[0];
    return c.redirect(`${DASHBOARD_URL}?token=${createToken({ sub: user.id, email: user.email })}`);
  } catch { return c.redirect(`${DASHBOARD_URL}?error=google_failed`); }
});
app.get("/auth/v1/github", (c) => {
  if (!PLATFORM_GITHUB_ID) return c.json({ error: "Platform GitHub not configured" }, 503);
  const redirectUri = `${API_URL}/auth/v1/callback/github`;
  return c.redirect(`https://github.com/login/oauth/authorize?client_id=${PLATFORM_GITHUB_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email`);
});
app.get("/auth/v1/callback/github", async (c) => {
  try {
    const code = c.req.query("code");
    if (!code) return c.redirect(`${DASHBOARD_URL}?error=github_no_code`);
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ client_id: PLATFORM_GITHUB_ID, client_secret: PLATFORM_GITHUB_SECRET, code }) });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return c.redirect(`${DASHBOARD_URL}?error=github_token`);
    const profile = await (await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" } })).json();
    let email = profile.email;
    if (!email) {
      const emails = await (await fetch("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" } })).json();
      email = (emails.find((e: any) => e.primary) || emails[0])?.email;
    }
    if (!email) return c.redirect(`${DASHBOARD_URL}?error=github_no_email`);
    let userRow = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    let user;
    if (!userRow.rows.length) {
      const id = uuidv4();
      await query(`INSERT INTO users (id, email, password, email_confirmed, provider, provider_id) VALUES ($1,$2,NULL,true,'github',$3)`, [id, email.toLowerCase(), String(profile.id)]);
      user = { id, email: email.toLowerCase() };
    } else user = userRow.rows[0];
    return c.redirect(`${DASHBOARD_URL}?token=${createToken({ sub: user.id, email: user.email })}`);
  } catch { return c.redirect(`${DASHBOARD_URL}?error=github_failed`); }
});

app.post("/projects", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const { name, password } = await c.req.json();
    if (!name || !password) return c.json({ error: "name and password required" }, 400);
    if ((await query("SELECT id FROM projects WHERE LOWER(name) = LOWER($1)", [name])).rows.length) return c.json({ error: "Name taken" }, 400);
    const id = uuidv4();
    const { ref, anon_key, service_role_key } = makeKeys();
    const schema = "kb_" + id.replace(/-/g, "");
    await query(`CREATE SCHEMA "${schema}"`);
    try {
      await query("INSERT INTO projects (id, name, password, owner_id, api_key, ref, anon_key, service_role_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [id, name, await bcrypt.hash(password, 10), user.id, service_role_key, ref, anon_key, service_role_key]);
    } catch (error) {
      await query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      throw error;
    }
    return c.json({ id, name, ref, url: projectUrl(ref), anon_key, service_role_key, api_key: service_role_key }, 201);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.get("/projects", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("SELECT id, name, ref, created_at FROM projects WHERE owner_id = $1 ORDER BY created_at DESC", [user.id]);
  return c.json(res.rows.map((r: any) => ({ ...r, url: r.ref ? projectUrl(r.ref) : null })));
});

app.get("/projects/:id/metrics", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const project = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [c.req.param("id"), user.id]);
  if (!project.rows.length) return c.json({ error: "Not found" }, 404);
  return c.json(await getProjectUsage(c.req.param("id")));
});

app.get("/projects/:id/storage", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const projectId = c.req.param("id");
  const owned = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [projectId, user.id]);
  if (!owned.rows.length) return c.json({ error: "Not found" }, 404);
  if (!hasS3) return c.json({ error: "Storage provider is not configured" }, 503);
  const items = await listFiles(projectId + "/");
  return c.json(items.map((item: any) => ({ key: item.key, size: item.size, lastModified: item.lastModified })));
});

app.post("/projects/:id/storage", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const projectId = c.req.param("id");
    const owned = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [projectId, user.id]);
    if (!owned.rows.length) return c.json({ error: "Not found" }, 404);
    if (!hasS3) return c.json({ error: "Storage provider is not configured" }, 503);
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);
    if (file.size < 1 || file.size > 25 * 1024 * 1024) return c.json({ error: "File must be between 1 byte and 25 MB" }, 413);
    const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload.bin";
    const key = projectId + "/" + uuidv4() + "-" + filename;
    await uploadFile(key, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
    return c.json({ key, name: filename, size: file.size, contentType: file.type || "application/octet-stream", url: await getFileUrl(key) }, 201);
  } catch (error: any) { return c.json({ error: error.message || "Upload failed" }, 500); }
});

app.get("/projects/:id/storage/url", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const projectId = c.req.param("id");
  const owned = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [projectId, user.id]);
  if (!owned.rows.length) return c.json({ error: "Not found" }, 404);
  const key = c.req.query("key") || "";
  if (!key.startsWith(projectId + "/") || key.split("/").some((part) => part === "..")) return c.json({ error: "Invalid object key" }, 400);
  try { return c.json({ url: await getFileUrl(key) }); } catch (error: any) { return c.json({ error: error.message || "Could not create download URL" }, 400); }
});

app.delete("/projects/:id/storage", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const projectId = c.req.param("id");
  const owned = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [projectId, user.id]);
  if (!owned.rows.length) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const key = String(body.key || "");
  if (!key.startsWith(projectId + "/") || key.split("/").some((part) => part === "..")) return c.json({ error: "Invalid object key" }, 400);
  try { await deleteFile(key); return c.json({ success: true }); } catch (error: any) { return c.json({ error: error.message || "Delete failed" }, 400); }
});
app.get("/projects/:id/logs", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const projectId = c.req.param("id");
  const owned = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [projectId, user.id]);
  if (!owned.rows.length) return c.json({ error: "Not found" }, 404);
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") || 100)));
  return c.json(await getProjectLogs(projectId, limit));
});

app.get("/projects/:id/keys", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("SELECT id, ref, anon_key, service_role_key FROM projects WHERE id = $1 AND owner_id = $2", [c.req.param("id"), user.id]);
  if (!res.rows.length) return c.json({ error: "Not found" }, 404);
  return c.json(res.rows[0]);
});

mountAuthSettings(app, getUserFromToken);

app.get("/projects/:id/users", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const proj = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [c.req.param("id"), user.id]);
  if (!proj.rows.length) return c.json({ error: "Not found" }, 404);
  return c.json((await query("SELECT id, email, provider, created_at FROM app_users WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100", [c.req.param("id")])).rows);
});

app.get("/tables", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const projectId = c.req.query("project_id") || "";
  const owned = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [projectId, user.id]);
  if (!owned.rows.length) return c.json({ error: "Project not found" }, 404);
  return c.json((await queryProject(projectId, `SELECT tablename AS table_name FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename`)).rows.map((r: any) => r.table_name));
});

app.post("/sql", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const { query: sqlQuery, project_id: projectId } = await c.req.json();
    if (!sqlQuery || !projectId) return c.json({ error: "query and project_id required" }, 400);
    const owned = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [projectId, user.id]);
    if (!owned.rows.length) return c.json({ error: "Project not found" }, 404);
    const lower = sqlQuery.toLowerCase();
    for (const b of ["drop database", "drop schema", "truncate", "alter system"]) {
      if (lower.includes(b)) return c.json({ error: `Blocked: ${b}` }, 403);
    }
    const result = await queryProject(projectId, sqlQuery);
    return c.json({ success: true, rows: result.rows || [], rowCount: result.rowCount, fields: result.fields?.map((f: any) => f.name) || [] });
  } catch (err: any) { return c.json({ success: false, error: err.message }, 400); }
});

async function ensureTables() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT, email_confirmed BOOLEAN DEFAULT false, provider TEXT DEFAULT 'email', provider_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY, name TEXT UNIQUE NOT NULL, password TEXT NOT NULL, owner_id UUID REFERENCES users(id) ON DELETE CASCADE, api_key TEXT UNIQUE NOT NULL, google_client_id TEXT, google_client_secret TEXT, github_client_id TEXT, github_client_secret TEXT, redirect_url TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS app_users (id UUID PRIMARY KEY, project_id UUID REFERENCES projects(id) ON DELETE CASCADE, email TEXT NOT NULL, password TEXT, provider TEXT DEFAULT 'email', provider_id TEXT, metadata JSONB, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(project_id, email))`);
    await query(`CREATE TABLE IF NOT EXISTS otp_codes (email TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, type TEXT NOT NULL)`);
    try {
      await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS ref TEXT UNIQUE`);
      await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS anon_key TEXT`);
      await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_role_key TEXT`);
    } catch (e: any) { console.log("[migrate]", e.message); }
    await ensureAuthColumns();
    await ensureExtraTables();
    await ensureUsageTables();
    const existingProjects = await query("SELECT id FROM projects");
    for (const project of existingProjects.rows) {
      const schema = "kb_" + String(project.id).replace(/-/g, "");
      await query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    }
    console.log("[DB] v0.11.0 ready");
  } catch (err: any) { console.error("[DB]", err.message); }
}

const rooms = new Map<string, Set<WebSocket>>();
function broadcast(room: string, data: any, exclude?: WebSocket) {
  const clients = rooms.get(room);
  if (!clients) return;
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) try { ws.send(msg); } catch {}
  }
}

const port = Number(process.env.PORT) || 4000;
ensureTables().then(() => {
  const server = createServer(async (req, res) => {
    const url = `http://localhost:${port}${req.url}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }
    let body: any;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      body = Buffer.concat(chunks);
    }
    const request = new Request(url, { method: req.method, headers, body });
    const response = await app.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  const wss = new WebSocketServer({ server, path: "/realtime/v1" });
  wss.on("connection", (ws) => {
    let currentRoom = "global";
    let clientId = uuidv4().slice(0, 8);
    if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Set());
    rooms.get(currentRoom)!.add(ws);
    ws.send(JSON.stringify({ type: "connected", clientId, room: currentRoom }));
    broadcast(currentRoom, { type: "presence", event: "join", clientId }, ws);
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "join" && msg.room) {
          rooms.get(currentRoom)?.delete(ws);
          broadcast(currentRoom, { type: "presence", event: "leave", clientId });
          currentRoom = String(msg.room).slice(0, 64);
          if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Set());
          rooms.get(currentRoom)!.add(ws);
          ws.send(JSON.stringify({ type: "joined", room: currentRoom }));
          broadcast(currentRoom, { type: "presence", event: "join", clientId }, ws);
        }
        if (msg.type === "broadcast") broadcast(currentRoom, { type: "broadcast", from: clientId, payload: msg.payload, room: currentRoom }, ws);
        if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
      } catch {}
    });
    ws.on("close", () => { rooms.get(currentRoom)?.delete(ws); broadcast(currentRoom, { type: "presence", event: "leave", clientId }); });
  });
  server.listen(port, () => console.log("KotahBase v0.11.0 — auth providers + redirects"));
});

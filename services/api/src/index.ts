import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { query } from "./db/client";
import { uploadFile, listFiles, deleteFile, hasS3 } from "./storage";
import { sendOTPEmail } from "./email";
import dotenv from "dotenv";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { aiRoutes } from "./ai";
import { schemaRoutes } from "./schemas";
import { extraRoutes, ensureExtraTables } from "./extras";

dotenv.config();

const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "apikey", "x-api-key"]
}));

app.route("/ai", aiRoutes);
app.route("/schemas", schemaRoutes);
app.route("/v1", extraRoutes);

const JWT_SECRET = process.env.JWT_SECRET || "kotahbase-dev-secret-change-me";
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://aetherbase-six.vercel.app";
const API_URL = process.env.API_URL || "https://kotahbase-api.onrender.com";
const PLATFORM_GOOGLE_ID = process.env.GOOGLE_CLIENT_ID || "";
const PLATFORM_GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const PLATFORM_GITHUB_ID = process.env.GITHUB_CLIENT_ID || "";
const PLATFORM_GITHUB_SECRET = process.env.GITHUB_CLIENT_SECRET || "";

const rateLimitMap = new Map<string, { count: number; reset: number }>();
app.use("*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for") || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.reset) rateLimitMap.set(ip, { count: 1, reset: now + 60000 });
  else { entry.count++; if (entry.count > 200) return c.json({ error: "Too many requests" }, 429); }
  await next();
});

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

app.get("/", (c) => c.json({
  name: "KotahBase API", version: "0.9.0", status: "ok",
  features: ["Per-project Auth", "Schema Packs", "SQL", "Storage", "Realtime", "Edge Functions", "AI", "Webhooks", "Table Browser", "Usage Metrics"]
}));

app.get("/health", async (c) => {
  try {
    await query("SELECT 1");
    return c.json({ status: "healthy", database: "connected", storage: hasS3 ? "connected" : "off", version: "0.9.0" });
  } catch (err: any) {
    return c.json({ status: "unhealthy", error: err.message }, 500);
  }
});

// Re-export rest of API by loading from a bootstrap - FULL API continues below
app.post("/auth/v1/signup", async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "Email and password required" }, 400);
    if (password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);
    const existing = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length > 0) return c.json({ error: "Email already registered" }, 400);
    const hashed = await bcrypt.hash(password, 10);
    const id = uuidv4();
    await query("INSERT INTO users (id, email, password, email_confirmed, provider) VALUES ($1,$2,$3,false,'email')", [id, email.toLowerCase(), hashed]);
    const code = generateOTP();
    await query(`INSERT INTO otp_codes (email, code, expires_at, type) VALUES ($1,$2,NOW()+INTERVAL '10 minutes','signup') ON CONFLICT (email) DO UPDATE SET code=$2, expires_at=NOW()+INTERVAL '10 minutes', type='signup'`, [email.toLowerCase(), code]);
    const sent = await sendOTPEmail(email, code, "signup");
    const response: any = { message: sent ? "Account created. Check your email for the 6-digit code." : "Account created." };
    if (!sent) response.dev_code = code;
    return c.json(response);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.post("/auth/v1/verify", async (c) => {
  try {
    const { email, code } = await c.req.json();
    if (!email || !code) return c.json({ error: "Email and code required" }, 400);
    const otpRes = await query("SELECT code, expires_at FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
    if (otpRes.rows.length === 0) return c.json({ error: "No code found" }, 400);
    const record = otpRes.rows[0];
    if (new Date() > new Date(record.expires_at)) return c.json({ error: "Code expired" }, 400);
    if (record.code !== code) return c.json({ error: "Invalid code" }, 401);
    await query("DELETE FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
    await query("UPDATE users SET email_confirmed = true WHERE email = $1", [email.toLowerCase()]);
    const userRes = await query("SELECT id, email, created_at, provider FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = userRes.rows[0];
    return c.json({ access_token: createToken({ sub: user.id, email: user.email }), token_type: "bearer", expires_in: 604800, user });
  } catch (err: any) { return c.json({ error: "Verification failed" }, 500); }
});

app.post("/auth/v1/login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "Email and password required" }, 400);
    const res = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (res.rows.length === 0) return c.json({ error: "Invalid email or password" }, 401);
    const user = res.rows[0];
    if (!user.password) return c.json({ error: "Use social login" }, 400);
    if (!(await bcrypt.compare(password, user.password))) return c.json({ error: "Invalid email or password" }, 401);
    if (!user.email_confirmed) return c.json({ error: "Verify your email first" }, 403);
    return c.json({ access_token: createToken({ sub: user.id, email: user.email }), token_type: "bearer", expires_in: 604800, user: { id: user.id, email: user.email, created_at: user.created_at, provider: user.provider } });
  } catch (err: any) { return c.json({ error: "Login failed" }, 500); }
});

app.post("/auth/v1/forgot-password", async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: "Email required" }, 400);
    const res = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (res.rows.length === 0) return c.json({ message: "If that email exists, a reset code has been sent." });
    const code = generateOTP();
    await query(`INSERT INTO otp_codes (email, code, expires_at, type) VALUES ($1,$2,NOW()+INTERVAL '10 minutes','reset') ON CONFLICT (email) DO UPDATE SET code=$2, expires_at=NOW()+INTERVAL '10 minutes', type='reset'`, [email.toLowerCase(), code]);
    const sent = await sendOTPEmail(email, code, "reset");
    const response: any = { message: "If that email exists, a reset code has been sent." };
    if (!sent) response.dev_code = code;
    return c.json(response);
  } catch (err: any) { return c.json({ error: "Failed" }, 500); }
});

app.post("/auth/v1/reset-password", async (c) => {
  try {
    const { email, code, new_password } = await c.req.json();
    if (!email || !code || !new_password) return c.json({ error: "Required fields missing" }, 400);
    if (new_password.length < 8) return c.json({ error: "Password min 8 chars" }, 400);
    const otpRes = await query("SELECT code, expires_at FROM otp_codes WHERE email = $1 AND type = 'reset'", [email.toLowerCase()]);
    if (otpRes.rows.length === 0) return c.json({ error: "No reset code" }, 400);
    if (new Date() > new Date(otpRes.rows[0].expires_at)) return c.json({ error: "Code expired" }, 400);
    if (otpRes.rows[0].code !== code) return c.json({ error: "Invalid code" }, 401);
    await query("UPDATE users SET password = $1 WHERE email = $2", [await bcrypt.hash(new_password, 10), email.toLowerCase()]);
    await query("DELETE FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
    return c.json({ message: "Password updated" });
  } catch (err: any) { return c.json({ error: "Reset failed" }, 500); }
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
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: PLATFORM_GOOGLE_ID, client_secret: PLATFORM_GOOGLE_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" })
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return c.redirect(`${DASHBOARD_URL}?error=google_token`);
    const profile = await (await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json();
    if (!profile.email) return c.redirect(`${DASHBOARD_URL}?error=google_no_email`);
    let userRow = await query("SELECT * FROM users WHERE email = $1", [profile.email.toLowerCase()]);
    let user;
    if (userRow.rows.length === 0) {
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
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: PLATFORM_GITHUB_ID, client_secret: PLATFORM_GITHUB_SECRET, code })
    });
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
    if (userRow.rows.length === 0) {
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
    const existing = await query("SELECT id FROM projects WHERE LOWER(name) = LOWER($1)", [name]);
    if (existing.rows.length > 0) return c.json({ error: "Name taken" }, 400);
    const id = uuidv4();
    const apiKey = `kb_${uuidv4().replace(/-/g, "")}`;
    await query("INSERT INTO projects (id, name, password, owner_id, api_key) VALUES ($1,$2,$3,$4,$5)", [id, name, await bcrypt.hash(password, 10), user.id, apiKey]);
    return c.json({ id, name, api_key: apiKey }, 201);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.get("/projects", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("SELECT id, name, api_key, created_at FROM projects WHERE owner_id = $1 ORDER BY created_at DESC", [user.id]);
  return c.json(res.rows);
});

app.put("/projects/:id/auth", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    const proj = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [id, user.id]);
    if (proj.rows.length === 0) return c.json({ error: "Project not found" }, 404);
    const updates: string[] = []; const values: any[] = []; let idx = 1;
    for (const key of ["google_client_id", "google_client_secret", "github_client_id", "github_client_secret", "redirect_url"]) {
      if (body[key] !== undefined) { updates.push(`${key} = $${idx++}`); values.push(body[key] || null); }
    }
    if (!updates.length) return c.json({ error: "Nothing to update" }, 400);
    values.push(id);
    await query(`UPDATE projects SET ${updates.join(", ")} WHERE id = $${idx}`, values);
    return c.json({ message: "Auth providers updated" });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.get("/projects/:id/users", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const proj = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [c.req.param("id"), user.id]);
  if (proj.rows.length === 0) return c.json({ error: "Not found" }, 404);
  const res = await query("SELECT id, email, provider, created_at FROM app_users WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100", [c.req.param("id")]);
  return c.json(res.rows);
});

app.post("/tables", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const { name, columns } = await c.req.json();
    if (!name || !Array.isArray(columns)) return c.json({ error: "name and columns required" }, 400);
    if (!/^[a-z][a-z0-9_]*$/.test(name)) return c.json({ error: "Invalid table name" }, 400);
    const allowed = ["text", "integer", "bigint", "boolean", "timestamptz", "uuid", "jsonb", "numeric", "real"];
    const defs = ["id UUID PRIMARY KEY DEFAULT gen_random_uuid()"];
    for (const col of columns) {
      if (!/^[a-z][a-z0-9_]*$/.test(col.name)) return c.json({ error: `Bad column: ${col.name}` }, 400);
      const t = (col.type || "text").toLowerCase();
      if (!allowed.includes(t)) return c.json({ error: `Type not allowed: ${t}` }, 400);
      defs.push(`${col.name} ${t.toUpperCase()}${col.nullable === false ? " NOT NULL" : ""}`);
    }
    defs.push("created_at TIMESTAMPTZ DEFAULT NOW()");
    await query(`CREATE TABLE IF NOT EXISTS ${name} (${defs.join(", ")})`);
    return c.json({ success: true, table: name }, 201);
  } catch (err: any) { return c.json({ error: err.message }, 400); }
});

app.get("/tables", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
  return c.json(res.rows.map((r: any) => r.table_name));
});

app.post("/sql", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const { query: sqlQuery } = await c.req.json();
    if (!sqlQuery) return c.json({ error: "query required" }, 400);
    const lower = sqlQuery.toLowerCase();
    for (const b of ["drop database", "drop schema", "truncate", "alter system"]) {
      if (lower.includes(b)) return c.json({ error: `Blocked: ${b}` }, 403);
    }
    const result = await query(sqlQuery);
    return c.json({ success: true, rows: result.rows || [], rowCount: result.rowCount, fields: result.fields?.map((f: any) => f.name) || [] });
  } catch (err: any) { return c.json({ success: false, error: err.message }, 400); }
});

app.get("/sql/tables", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
  return c.json(res.rows.map((r: any) => r.table_name));
});

app.post("/storage/buckets", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const { name, public: isPublic } = await c.req.json();
    if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) return c.json({ error: "Invalid bucket name" }, 400);
    const id = uuidv4();
    await query("INSERT INTO storage_buckets (id, name, public, owner_id) VALUES ($1,$2,$3,$4)", [id, name, isPublic !== false, user.id]);
    return c.json({ id, name, public: isPublic !== false }, 201);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.get("/storage/buckets", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("SELECT id, name, public, created_at FROM storage_buckets WHERE owner_id = $1 ORDER BY created_at DESC", [user.id]);
  return c.json(res.rows);
});

app.post("/storage/v1/object/:bucket/:key", async (c) => {
  try {
    if (!hasS3) return c.json({ error: "Storage not configured" }, 503);
    const result = await uploadFile(c.req.param("key"), Buffer.from(await c.req.arrayBuffer()), c.req.header("content-type") || "application/octet-stream");
    return c.json(result, 201);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.get("/storage/v1/list", async (c) => {
  try {
    if (!hasS3) return c.json({ error: "Storage not configured" }, 503);
    return c.json(await listFiles());
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.post("/functions", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const { name, code, description } = await c.req.json();
    if (!name || !code) return c.json({ error: "name and code required" }, 400);
    const existing = await query("SELECT id FROM edge_functions WHERE name = $1 AND owner_id = $2", [name, user.id]);
    if (existing.rows.length > 0) {
      await query("UPDATE edge_functions SET code=$1, description=$2, updated_at=NOW() WHERE name=$3 AND owner_id=$4", [code, description || "", name, user.id]);
      return c.json({ name, message: "Updated" });
    }
    await query("INSERT INTO edge_functions (id, name, code, description, owner_id) VALUES ($1,$2,$3,$4,$5)", [uuidv4(), name, code, description || "", user.id]);
    return c.json({ name }, 201);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.get("/functions", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  return c.json((await query("SELECT id, name, description, created_at FROM edge_functions WHERE owner_id = $1", [user.id])).rows);
});

app.post("/functions/:name/invoke", async (c) => {
  try {
    const res = await query("SELECT code FROM edge_functions WHERE name = $1", [c.req.param("name")]);
    if (res.rows.length === 0) return c.json({ error: "Not found" }, 404);
    const body = await c.req.json().catch(() => ({}));
    try {
      const fn = new Function("req", "console", `const module={exports:{}};${res.rows[0].code};if(typeof handler==="function")return handler(req);if(typeof module.exports==="function")return module.exports(req);return module.exports;`);
      return c.json({ success: true, result: await fn({ body }, console) });
    } catch (e: any) { return c.json({ success: false, error: e.message }, 400); }
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.post("/rls/policies", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const { table, name, command, using_expr } = await c.req.json();
    if (!table || !name || !command) return c.json({ error: "table, name, command required" }, 400);
    await query(`INSERT INTO rls_policies (id, table_name, policy_name, command, using_expr, owner_id) VALUES ($1,$2,$3,$4,$5,$6)`, [uuidv4(), table, name, command.toUpperCase(), using_expr || "true", user.id]);
    try {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await query(`CREATE POLICY "${name}" ON ${table} FOR ${command.toUpperCase()} USING (${using_expr || "true"})`);
    } catch (e: any) { console.log("[RLS]", e.message); }
    return c.json({ table, name }, 201);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.get("/rls/policies", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  return c.json((await query("SELECT id, table_name, policy_name, command, using_expr, created_at FROM rls_policies WHERE owner_id = $1", [user.id])).rows);
});

app.post("/domains", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const { domain } = await c.req.json();
    if (!domain) return c.json({ error: "domain required" }, 400);
    const id = uuidv4();
    const token = `kb-verify-${uuidv4().slice(0, 8)}`;
    await query(`INSERT INTO domains (id, domain, user_id, verification_token, status) VALUES ($1,$2,$3,$4,'pending')`, [id, domain.toLowerCase(), user.id, token]);
    return c.json({ id, domain: domain.toLowerCase(), status: "pending", verification_token: token, instructions: { type: "TXT", name: `_kotahbase.${domain}`, value: token } }, 201);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.get("/domains", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  return c.json((await query("SELECT id, domain, status, verification_token, created_at FROM domains WHERE user_id = $1 ORDER BY created_at DESC", [user.id])).rows);
});

app.get("/logs/auth", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  return c.json((await query("SELECT event, email, success, created_at FROM auth_logs ORDER BY created_at DESC LIMIT 50")).rows);
});

app.get("/logs/api", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  return c.json((await query("SELECT method, path, status, duration_ms, created_at FROM api_logs ORDER BY created_at DESC LIMIT 50")).rows);
});

app.get("/rest/v1/:table", async (c) => {
  try {
    const table = c.req.param("table");
    if (!/^[a-z][a-z0-9_]*$/.test(table)) return c.json({ error: "Invalid" }, 400);
    return c.json((await query(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 100`)).rows);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

async function ensureTables() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT, email_confirmed BOOLEAN DEFAULT false, provider TEXT DEFAULT 'email', provider_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY, name TEXT UNIQUE NOT NULL, password TEXT NOT NULL, owner_id UUID REFERENCES users(id) ON DELETE CASCADE, api_key TEXT UNIQUE NOT NULL, google_client_id TEXT, google_client_secret TEXT, github_client_id TEXT, github_client_secret TEXT, redirect_url TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS app_users (id UUID PRIMARY KEY, project_id UUID REFERENCES projects(id) ON DELETE CASCADE, email TEXT NOT NULL, password TEXT, provider TEXT DEFAULT 'email', provider_id TEXT, metadata JSONB, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(project_id, email))`);
    await query(`CREATE TABLE IF NOT EXISTS otp_codes (email TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, type TEXT NOT NULL)`);
    await query(`CREATE TABLE IF NOT EXISTS game_scores (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), player_name TEXT NOT NULL, score INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS domains (id UUID PRIMARY KEY, domain TEXT UNIQUE NOT NULL, user_id UUID REFERENCES users(id) ON DELETE CASCADE, project_id UUID, verification_token TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS auth_logs (id UUID PRIMARY KEY, event TEXT, email TEXT, success BOOLEAN, meta JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS api_logs (id UUID PRIMARY KEY, method TEXT, path TEXT, status INTEGER, duration_ms INTEGER, ip TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS storage_buckets (id UUID PRIMARY KEY, name TEXT UNIQUE NOT NULL, public BOOLEAN DEFAULT true, owner_id UUID REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS rls_policies (id UUID PRIMARY KEY, table_name TEXT, policy_name TEXT, command TEXT, using_expr TEXT, with_check TEXT, owner_id UUID REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS edge_functions (id UUID PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL, description TEXT, owner_id UUID REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(name, owner_id))`);
    await query(`CREATE TABLE IF NOT EXISTS embeddings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), content TEXT, metadata JSONB, embedding JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await ensureExtraTables();
    console.log("[DB] v0.9.0 ready");
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

  server.listen(port, () => console.log(`🚀 KotahBase v0.9.0 — webhooks, data browser, usage, seed`));
}).catch(() => serve({ fetch: app.fetch, port }));

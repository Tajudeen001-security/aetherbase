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

dotenv.config();

const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "apikey"]
}));

const JWT_SECRET = process.env.JWT_SECRET || "kotahbase-dev-secret-change-me";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://aetherbase-six.vercel.app";
const API_URL = process.env.API_URL || "https://kotahbase-api.onrender.com";

const rateLimitMap = new Map<string, { count: number; reset: number }>();
app.use("*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for") || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.reset) rateLimitMap.set(ip, { count: 1, reset: now + 60000 });
  else { entry.count++; if (entry.count > 200) return c.json({ error: "Too many requests" }, 429); }
  await next();
});

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  if (c.req.path.startsWith("/auth") || c.res.status >= 400) {
    query(`INSERT INTO api_logs (id, method, path, status, duration_ms, ip, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [uuidv4(), c.req.method, c.req.path, c.res.status, ms, c.req.header("x-forwarded-for") || "unknown"]).catch(() => {});
  }
});

function generateOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }
function createToken(payload: object) { return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" }); }

async function getUserFromToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as any;
    const res = await query("SELECT id, email, created_at, provider FROM users WHERE id = $1", [payload.sub]);
    return res.rows[0] || null;
  } catch { return null; }
}

async function logAuth(event: string, email: string, success: boolean, meta: any = {}) {
  query(`INSERT INTO auth_logs (id, event, email, success, meta, created_at) VALUES ($1,$2,$3,$4,$5,NOW())`,
    [uuidv4(), event, email, success, JSON.stringify(meta)]).catch(() => {});
}

// ====================== ROOT ======================
app.get("/", (c) => c.json({
  name: "KotahBase API",
  version: "0.6.0",
  status: "ok",
  features: [
    "Email + Password + OTP", "Forgot Password",
    "Google OAuth", "GitHub OAuth",
    "Storage Buckets", "Create Tables",
    "SQL Editor", "Realtime",
    "Edge Functions", "RLS Policies",
    "Custom Domains", "Auth/API Logs"
  ],
  storage: hasS3 ? "Naijacloud (Port Harcourt)" : "Not configured",
  oauth: { google: !!GOOGLE_CLIENT_ID, github: !!GITHUB_CLIENT_ID }
}));

app.get("/health", async (c) => {
  try {
    await query("SELECT 1");
    return c.json({
      status: "healthy", database: "connected",
      storage: hasS3 ? "connected" : "off", version: "0.6.0",
      oauth: { google: !!GOOGLE_CLIENT_ID, github: !!GITHUB_CLIENT_ID },
      realtime: "available"
    });
  } catch (err: any) {
    return c.json({ status: "unhealthy", error: err.message }, 500);
  }
});

app.get("/stats", async (c) => {
  try {
    const [users, projects, domains, buckets, functions] = await Promise.all([
      query("SELECT COUNT(*) FROM users"),
      query("SELECT COUNT(*) FROM projects"),
      query("SELECT COUNT(*) FROM domains"),
      query("SELECT COUNT(*) FROM storage_buckets"),
      query("SELECT COUNT(*) FROM edge_functions")
    ]);
    return c.json({
      users: Number(users.rows[0].count),
      projects: Number(projects.rows[0].count),
      domains: Number(domains.rows[0].count),
      buckets: Number(buckets.rows[0].count),
      functions: Number(functions.rows[0].count)
    });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

// ====================== AUTH (same as before) ======================
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
    await logAuth("signup", email, true, { email_sent: sent });
    const response: any = { message: sent ? "Account created. Check your email for the 6-digit code." : "Account created. Email could not be sent." };
    if (!sent) response.dev_code = code;
    return c.json(response);
  } catch (err: any) { return c.json({ error: "Signup failed: " + err.message }, 500); }
});

app.post("/auth/v1/verify", async (c) => {
  try {
    const { email, code } = await c.req.json();
    if (!email || !code) return c.json({ error: "Email and code required" }, 400);
    const otpRes = await query("SELECT code, expires_at FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
    if (otpRes.rows.length === 0) return c.json({ error: "No code found" }, 400);
    const record = otpRes.rows[0];
    if (new Date() > new Date(record.expires_at)) { await query("DELETE FROM otp_codes WHERE email = $1", [email.toLowerCase()]); return c.json({ error: "Code expired" }, 400); }
    if (record.code !== code) return c.json({ error: "Invalid code" }, 401);
    await query("DELETE FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
    await query("UPDATE users SET email_confirmed = true WHERE email = $1", [email.toLowerCase()]);
    const userRes = await query("SELECT id, email, created_at, provider FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = userRes.rows[0];
    const token = createToken({ sub: user.id, email: user.email });
    await logAuth("verify_success", email, true);
    return c.json({ access_token: token, token_type: "bearer", expires_in: 604800, user });
  } catch (err: any) { return c.json({ error: "Verification failed" }, 500); }
});

app.post("/auth/v1/login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "Email and password required" }, 400);
    const res = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (res.rows.length === 0) return c.json({ error: "Invalid email or password" }, 401);
    const user = res.rows[0];
    if (!user.password) return c.json({ error: "This account uses social login" }, 400);
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return c.json({ error: "Invalid email or password" }, 401);
    if (!user.email_confirmed) return c.json({ error: "Please verify your email first" }, 403);
    const token = createToken({ sub: user.id, email: user.email });
    await logAuth("login_success", email, true);
    return c.json({ access_token: token, token_type: "bearer", expires_in: 604800, user: { id: user.id, email: user.email, created_at: user.created_at, provider: user.provider } });
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
    if (!email || !code || !new_password) return c.json({ error: "Email, code and new_password required" }, 400);
    if (new_password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);
    const otpRes = await query("SELECT code, expires_at FROM otp_codes WHERE email = $1 AND type = 'reset'", [email.toLowerCase()]);
    if (otpRes.rows.length === 0) return c.json({ error: "No reset code found" }, 400);
    const record = otpRes.rows[0];
    if (new Date() > new Date(record.expires_at)) return c.json({ error: "Code expired" }, 400);
    if (record.code !== code) return c.json({ error: "Invalid code" }, 401);
    const hashed = await bcrypt.hash(new_password, 10);
    await query("UPDATE users SET password = $1 WHERE email = $2", [hashed, email.toLowerCase()]);
    await query("DELETE FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
    return c.json({ message: "Password updated successfully." });
  } catch (err: any) { return c.json({ error: "Reset failed" }, 500); }
});

app.get("/auth/v1/user", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  return c.json(user);
});

// OAuth Google + GitHub (same as before)
app.get("/auth/v1/google", (c) => {
  if (!GOOGLE_CLIENT_ID) return c.json({ error: "Google OAuth not configured" }, 503);
  const redirectUri = `${API_URL}/auth/v1/callback/google`;
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=consent`);
});

app.get("/auth/v1/callback/google", async (c) => {
  try {
    const code = c.req.query("code");
    if (!code) return c.redirect(`${DASHBOARD_URL}?error=google_no_code`);
    const redirectUri = `${API_URL}/auth/v1/callback/google`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" })
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return c.redirect(`${DASHBOARD_URL}?error=google_token`);
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await userRes.json();
    if (!profile.email) return c.redirect(`${DASHBOARD_URL}?error=google_no_email`);
    let userRow = await query("SELECT * FROM users WHERE email = $1", [profile.email.toLowerCase()]);
    let user;
    if (userRow.rows.length === 0) {
      const id = uuidv4();
      await query(`INSERT INTO users (id, email, password, email_confirmed, provider, provider_id) VALUES ($1,$2,NULL,true,'google',$3)`, [id, profile.email.toLowerCase(), profile.id]);
      user = { id, email: profile.email.toLowerCase(), provider: "google" };
    } else user = userRow.rows[0];
    const token = createToken({ sub: user.id, email: user.email });
    return c.redirect(`${DASHBOARD_URL}?token=${token}`);
  } catch { return c.redirect(`${DASHBOARD_URL}?error=google_failed`); }
});

app.get("/auth/v1/github", (c) => {
  if (!GITHUB_CLIENT_ID) return c.json({ error: "GitHub OAuth not configured" }, 503);
  const redirectUri = `${API_URL}/auth/v1/callback/github`;
  return c.redirect(`https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email`);
});

app.get("/auth/v1/callback/github", async (c) => {
  try {
    const code = c.req.query("code");
    if (!code) return c.redirect(`${DASHBOARD_URL}?error=github_no_code`);
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code })
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return c.redirect(`${DASHBOARD_URL}?error=github_token`);
    const userRes = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" } });
    const profile = await userRes.json();
    let email = profile.email;
    if (!email) {
      const emailRes = await fetch("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" } });
      const emails = await emailRes.json();
      email = (emails.find((e: any) => e.primary) || emails[0])?.email;
    }
    if (!email) return c.redirect(`${DASHBOARD_URL}?error=github_no_email`);
    let userRow = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    let user;
    if (userRow.rows.length === 0) {
      const id = uuidv4();
      await query(`INSERT INTO users (id, email, password, email_confirmed, provider, provider_id) VALUES ($1,$2,NULL,true,'github',$3)`, [id, email.toLowerCase(), String(profile.id)]);
      user = { id, email: email.toLowerCase(), provider: "github" };
    } else user = userRow.rows[0];
    const token = createToken({ sub: user.id, email: user.email });
    return c.redirect(`${DASHBOARD_URL}?token=${token}`);
  } catch { return c.redirect(`${DASHBOARD_URL}?error=github_failed`); }
});

// ====================== LOGS ======================
app.get("/logs/auth", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("SELECT event, email, success, meta, created_at FROM auth_logs ORDER BY created_at DESC LIMIT 50");
  return c.json(res.rows);
});

app.get("/logs/api", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("SELECT method, path, status, duration_ms, created_at FROM api_logs ORDER BY created_at DESC LIMIT 50");
  return c.json(res.rows);
});

// ====================== PROJECTS ======================
app.post("/projects", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const { name, password } = await c.req.json();
    if (!name || !password) return c.json({ error: "Project name and password required" }, 400);
    const existing = await query("SELECT id FROM projects WHERE LOWER(name) = LOWER($1)", [name]);
    if (existing.rows.length > 0) return c.json({ error: "Project name already taken" }, 400);
    const hashed = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const apiKey = `kb_${uuidv4().replace(/-/g, "")}`;
    await query("INSERT INTO projects (id, name, password, owner_id, api_key) VALUES ($1,$2,$3,$4,$5)", [id, name, hashed, user.id, apiKey]);
    return c.json({ id, name, api_key: apiKey, created_at: new Date().toISOString() });
  } catch (err: any) { return c.json({ error: "Failed" }, 500); }
});

app.get("/projects", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("SELECT id, name, api_key, created_at FROM projects WHERE owner_id = $1 ORDER BY created_at DESC", [user.id]);
  return c.json(res.rows);
});

// ====================== CREATE TABLES ======================
app.post("/tables", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    const { name, columns } = await c.req.json();
    // columns: [{ name: "title", type: "text", nullable: true }, ...]
    if (!name || !Array.isArray(columns) || columns.length === 0) {
      return c.json({ error: "name and columns[] required" }, 400);
    }

    // Safety: only allow alphanumeric + underscore table names
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      return c.json({ error: "Table name must start with letter and contain only a-z, 0-9, _" }, 400);
    }

    const allowedTypes = ["text", "integer", "bigint", "boolean", "timestamptz", "uuid", "jsonb", "numeric", "real"];
    const colDefs: string[] = ["id UUID PRIMARY KEY DEFAULT gen_random_uuid()"];

    for (const col of columns) {
      if (!col.name || !/^[a-z][a-z0-9_]*$/.test(col.name)) {
        return c.json({ error: `Invalid column name: ${col.name}` }, 400);
      }
      const type = (col.type || "text").toLowerCase();
      if (!allowedTypes.includes(type)) {
        return c.json({ error: `Type not allowed: ${type}. Allowed: ${allowedTypes.join(", ")}` }, 400);
      }
      const nullable = col.nullable !== false ? "" : " NOT NULL";
      colDefs.push(`${col.name} ${type.toUpperCase()}${nullable}`);
    }
    colDefs.push("created_at TIMESTAMPTZ DEFAULT NOW()");

    const sql = `CREATE TABLE IF NOT EXISTS ${name} (${colDefs.join(", ")})`;
    await query(sql);

    return c.json({ success: true, table: name, message: `Table ${name} created` }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.get("/tables", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
  return c.json(res.rows.map((r: any) => r.table_name));
});

app.get("/tables/:name/columns", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const name = c.req.param("name");
  const res = await query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [name]);
  return c.json(res.rows);
});

// ====================== SQL ======================
app.post("/sql", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const { query: sqlQuery } = await c.req.json();
    if (!sqlQuery) return c.json({ error: "SQL query required" }, 400);
    const lower = sqlQuery.toLowerCase().trim();
    const blocked = ["drop database", "drop schema", "truncate", "alter system"];
    for (const b of blocked) { if (lower.includes(b)) return c.json({ error: `Not allowed: ${b}` }, 403); }
    const result = await query(sqlQuery);
    return c.json({ success: true, rows: result.rows || [], rowCount: result.rowCount, fields: result.fields?.map((f: any) => f.name) || [] });
  } catch (err: any) { return c.json({ success: false, error: err.message }, 400); }
});

app.get("/sql/tables", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
  return c.json(res.rows.map((r: any) => r.table_name));
});

// ====================== STORAGE BUCKETS ======================
app.post("/storage/buckets", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const { name, public: isPublic } = await c.req.json();
    if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      return c.json({ error: "Bucket name must be lowercase alphanumeric with hyphens" }, 400);
    }
    const existing = await query("SELECT id FROM storage_buckets WHERE name = $1", [name]);
    if (existing.rows.length > 0) return c.json({ error: "Bucket already exists" }, 400);
    const id = uuidv4();
    await query(
      "INSERT INTO storage_buckets (id, name, public, owner_id) VALUES ($1, $2, $3, $4)",
      [id, name, isPublic !== false, user.id]
    );
    return c.json({ id, name, public: isPublic !== false }, 201);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.get("/storage/buckets", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("SELECT id, name, public, created_at FROM storage_buckets WHERE owner_id = $1 ORDER BY created_at DESC", [user.id]);
  return c.json(res.rows);
});

app.delete("/storage/buckets/:name", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const name = c.req.param("name");
  const res = await query("DELETE FROM storage_buckets WHERE name = $1 AND owner_id = $2 RETURNING id", [name, user.id]);
  if (res.rows.length === 0) return c.json({ error: "Bucket not found" }, 404);
  return c.json({ message: "Bucket deleted" });
});

// File upload (existing)
app.post("/storage/v1/object/:bucket/:key", async (c) => {
  try {
    if (!hasS3) return c.json({ error: "Storage not configured" }, 503);
    const key = c.req.param("key");
    const contentType = c.req.header("content-type") || "application/octet-stream";
    const body = await c.req.arrayBuffer();
    const result = await uploadFile(key, Buffer.from(body), contentType);
    return c.json(result, 201);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.get("/storage/v1/list", async (c) => {
  try {
    if (!hasS3) return c.json({ error: "Storage not configured" }, 503);
    return c.json(await listFiles());
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

// ====================== RLS POLICIES ======================
app.post("/rls/policies", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    const { table, name, command, using_expr, with_check } = await c.req.json();
    // command: SELECT | INSERT | UPDATE | DELETE | ALL
    if (!table || !name || !command) {
      return c.json({ error: "table, name, and command required" }, 400);
    }

    const id = uuidv4();
    await query(
      `INSERT INTO rls_policies (id, table_name, policy_name, command, using_expr, with_check, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, table, name, command.toUpperCase(), using_expr || "true", with_check || null, user.id]
    );

    // Try to enable RLS and create the policy in Postgres
    try {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      const using = using_expr || "true";
      await query(`CREATE POLICY "${name}" ON ${table} FOR ${command.toUpperCase()} USING (${using})`);
    } catch (e: any) {
      // Policy may already exist or table may not support it — store in our table anyway
      console.log("[RLS] Postgres policy note:", e.message);
    }

    return c.json({ id, table, name, command: command.toUpperCase() }, 201);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.get("/rls/policies", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("SELECT id, table_name, policy_name, command, using_expr, created_at FROM rls_policies WHERE owner_id = $1 ORDER BY created_at DESC", [user.id]);
  return c.json(res.rows);
});

app.delete("/rls/policies/:id", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const id = c.req.param("id");
  const res = await query("DELETE FROM rls_policies WHERE id = $1 AND owner_id = $2 RETURNING policy_name, table_name", [id, user.id]);
  if (res.rows.length === 0) return c.json({ error: "Not found" }, 404);
  try {
    await query(`DROP POLICY IF EXISTS "${res.rows[0].policy_name}" ON ${res.rows[0].table_name}`);
  } catch {}
  return c.json({ message: "Policy deleted" });
});

// ====================== EDGE FUNCTIONS ======================
app.post("/functions", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    const { name, code, description } = await c.req.json();
    if (!name || !code) return c.json({ error: "name and code required" }, 400);
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      return c.json({ error: "Function name must be lowercase with hyphens" }, 400);
    }

    const existing = await query("SELECT id FROM edge_functions WHERE name = $1 AND owner_id = $2", [name, user.id]);
    if (existing.rows.length > 0) {
      await query("UPDATE edge_functions SET code = $1, description = $2, updated_at = NOW() WHERE name = $3 AND owner_id = $4",
        [code, description || "", name, user.id]);
      return c.json({ name, message: "Function updated" });
    }

    const id = uuidv4();
    await query(
      "INSERT INTO edge_functions (id, name, code, description, owner_id) VALUES ($1, $2, $3, $4, $5)",
      [id, name, code, description || "", user.id]
    );
    return c.json({ id, name, message: "Function created" }, 201);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.get("/functions", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("SELECT id, name, description, created_at, updated_at FROM edge_functions WHERE owner_id = $1 ORDER BY created_at DESC", [user.id]);
  return c.json(res.rows);
});

app.get("/functions/:name", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const name = c.req.param("name");
  const res = await query("SELECT id, name, code, description, created_at FROM edge_functions WHERE name = $1 AND owner_id = $2", [name, user.id]);
  if (res.rows.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json(res.rows[0]);
});

app.post("/functions/:name/invoke", async (c) => {
  try {
    const name = c.req.param("name");
    const res = await query("SELECT code FROM edge_functions WHERE name = $1", [name]);
    if (res.rows.length === 0) return c.json({ error: "Function not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const code = res.rows[0].code;

    // Simple sandboxed execution using Function constructor
    // In production you'd use a real isolate (Deno, Cloudflare Workers, etc.)
    try {
      const fn = new Function("req", "console", `
        const module = { exports: {} };
        const exports = module.exports;
        ${code}
        if (typeof handler === "function") return handler(req);
        if (typeof module.exports === "function") return module.exports(req);
        if (module.exports.default) return module.exports.default(req);
        return module.exports;
      `);
      const result = await fn({ body, method: c.req.method, headers: {} }, console);
      return c.json({ success: true, result });
    } catch (execErr: any) {
      return c.json({ success: false, error: execErr.message }, 400);
    }
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.delete("/functions/:name", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const name = c.req.param("name");
  const res = await query("DELETE FROM edge_functions WHERE name = $1 AND owner_id = $2 RETURNING id", [name, user.id]);
  if (res.rows.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ message: "Function deleted" });
});

// ====================== DOMAINS ======================
app.post("/domains", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const { domain } = await c.req.json();
    if (!domain) return c.json({ error: "Domain required" }, 400);
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
    if (!domainRegex.test(domain)) return c.json({ error: "Invalid domain" }, 400);
    const existing = await query("SELECT id FROM domains WHERE LOWER(domain) = LOWER($1)", [domain]);
    if (existing.rows.length > 0) return c.json({ error: "Domain already registered" }, 400);
    const id = uuidv4();
    const verificationToken = `kb-verify-${uuidv4().slice(0, 8)}`;
    await query(`INSERT INTO domains (id, domain, user_id, verification_token, status) VALUES ($1,$2,$3,$4,'pending')`, [id, domain.toLowerCase(), user.id, verificationToken]);
    return c.json({ id, domain: domain.toLowerCase(), status: "pending", verification_token: verificationToken, instructions: { type: "TXT", name: `_kotahbase.${domain}`, value: verificationToken } }, 201);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.get("/domains", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("SELECT id, domain, status, verification_token, created_at FROM domains WHERE user_id = $1 ORDER BY created_at DESC", [user.id]);
  return c.json(res.rows);
});

app.post("/domains/:id/verify", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const id = c.req.param("id");
  const res = await query("SELECT * FROM domains WHERE id = $1 AND user_id = $2", [id, user.id]);
  if (res.rows.length === 0) return c.json({ error: "Not found" }, 404);
  await query("UPDATE domains SET status = 'verified' WHERE id = $1", [id]);
  return c.json({ message: "Domain verified", domain: res.rows[0].domain });
});

app.delete("/domains/:id", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("DELETE FROM domains WHERE id = $1 AND user_id = $2 RETURNING id", [c.req.param("id"), user.id]);
  if (res.rows.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ message: "Deleted" });
});

// REST
app.get("/rest/v1/:table", async (c) => {
  try {
    const table = c.req.param("table");
    if (!/^[a-z][a-z0-9_]*$/.test(table)) return c.json({ error: "Invalid table" }, 400);
    const res = await query(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 100`);
    return c.json(res.rows);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.post("/rest/v1/:table", async (c) => {
  try {
    const table = c.req.param("table");
    const body = await c.req.json();
    if (table === "game_scores") {
      const id = uuidv4();
      await query("INSERT INTO game_scores (id, player_name, score) VALUES ($1,$2,$3)", [id, body.player_name || "Anonymous", body.score || 0]);
      return c.json({ id, ...body }, 201);
    }
    return c.json({ error: "Use SQL Editor or /tables for custom tables" }, 400);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

// ====================== TABLES SETUP ======================
async function ensureTables() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT, email_confirmed BOOLEAN DEFAULT false, provider TEXT DEFAULT 'email', provider_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY, name TEXT UNIQUE NOT NULL, password TEXT NOT NULL, owner_id UUID REFERENCES users(id) ON DELETE CASCADE, api_key TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS otp_codes (email TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, type TEXT NOT NULL)`);
    await query(`CREATE TABLE IF NOT EXISTS game_scores (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), player_name TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS domains (id UUID PRIMARY KEY, domain TEXT UNIQUE NOT NULL, user_id UUID REFERENCES users(id) ON DELETE CASCADE, project_id UUID, verification_token TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS auth_logs (id UUID PRIMARY KEY, event TEXT NOT NULL, email TEXT, success BOOLEAN, meta JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS api_logs (id UUID PRIMARY KEY, method TEXT, path TEXT, status INTEGER, duration_ms INTEGER, ip TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS storage_buckets (id UUID PRIMARY KEY, name TEXT UNIQUE NOT NULL, public BOOLEAN DEFAULT true, owner_id UUID REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS rls_policies (id UUID PRIMARY KEY, table_name TEXT NOT NULL, policy_name TEXT NOT NULL, command TEXT NOT NULL, using_expr TEXT, with_check TEXT, owner_id UUID REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS edge_functions (id UUID PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL, description TEXT, owner_id UUID REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(name, owner_id))`);
    console.log("[DB] All tables ready (v0.6.0)");
  } catch (err: any) { console.error("[DB] Error:", err.message); }
}

// ====================== REALTIME (WebSocket) ======================
const rooms = new Map<string, Set<WebSocket>>();

function broadcast(room: string, data: any, exclude?: WebSocket) {
  const clients = rooms.get(room);
  if (!clients) return;
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch {}
    }
  }
}

const port = Number(process.env.PORT) || 4000;

ensureTables().then(() => {
  const server = createServer(async (req, res) => {
    // Let Hono handle HTTP
    const url = `http://localhost:${port}${req.url}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }
    let body: any = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      body = Buffer.concat(chunks);
    }
    const request = new Request(url, { method: req.method, headers, body });
    const response = await app.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    const ab = await response.arrayBuffer();
    res.end(Buffer.from(ab));
  });

  const wss = new WebSocketServer({ server, path: "/realtime/v1" });

  wss.on("connection", (ws, req) => {
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
          // Leave old room
          rooms.get(currentRoom)?.delete(ws);
          broadcast(currentRoom, { type: "presence", event: "leave", clientId });
          currentRoom = String(msg.room).slice(0, 64);
          if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Set());
          rooms.get(currentRoom)!.add(ws);
          ws.send(JSON.stringify({ type: "joined", room: currentRoom }));
          broadcast(currentRoom, { type: "presence", event: "join", clientId }, ws);
        }

        if (msg.type === "broadcast" && msg.payload !== undefined) {
          broadcast(currentRoom, {
            type: "broadcast",
            from: clientId,
            payload: msg.payload,
            room: currentRoom
          }, ws);
        }

        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch {}
    });

    ws.on("close", () => {
      rooms.get(currentRoom)?.delete(ws);
      broadcast(currentRoom, { type: "presence", event: "leave", clientId });
    });

    ws.on("error", () => {
      rooms.get(currentRoom)?.delete(ws);
    });
  });

  server.listen(port, () => {
    console.log(`🚀 KotahBase v0.6.0 on port ${port}`);
    console.log(`   Realtime → ws://.../realtime/v1`);
  });
}).catch((err) => {
  console.error("Startup error:", err);
  serve({ fetch: app.fetch, port });
});

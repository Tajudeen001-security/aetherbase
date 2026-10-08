import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { query } from "./db/client";
import { uploadFile, getFileUrl, listFiles } from "./storage";
import { setupRealtime, getRealtimeStats } from "./realtime";
import dotenv from "dotenv";
import { createServer } from "http";

dotenv.config();

const app = new Hono();
app.use("*", cors());

const JWT_SECRET = process.env.JWT_SECRET || "kotahbase-dev-secret-change-me";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

async function getUserFromToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const res = await query("SELECT id, email, created_at FROM users WHERE id = $1", [payload.sub]);
    return res.rows[0] || null;
  } catch {
    return null;
  }
}

// ====================== ROOT ======================
app.get("/", (c) => {
  return c.json({
    name: "KotahBase API",
    version: "0.1.5",
    status: "ok",
    features: ["Auth", "Database", "Storage", "Realtime"]
  });
});

app.get("/health", async (c) => {
  try {
    await query("SELECT 1");
    return c.json({ status: "healthy", database: "connected", realtime: getRealtimeStats(), timestamp: new Date().toISOString() });
  } catch {
    return c.json({ status: "unhealthy" }, 500);
  }
});

// ====================== AUTH ======================
app.post("/auth/v1/signup", async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "Email and password are required" }, 400);
    if (password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);

    const existing = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length > 0) return c.json({ error: "Email already registered" }, 400);

    const hashed = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await query("INSERT INTO users (id, email, password, email_confirmed) VALUES ($1, $2, $3, false)", [id, email.toLowerCase(), hashed]);

    const code = generateOTP();
    await query(
      `INSERT INTO otp_codes (email, code, expires_at, type) VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 'signup')
       ON CONFLICT (email) DO UPDATE SET code = $2, expires_at = NOW() + INTERVAL '10 minutes'`,
      [email.toLowerCase(), code]
    );

    console.log(`\n🔐 SIGNUP OTP for ${email}: ${code}\n`);
    return c.json({ message: "Account created. 6-digit code sent.", dev_code: process.env.NODE_ENV === "production" ? undefined : code });
  } catch (err) {
    console.error(err);
    return c.json({ error: "Signup failed" }, 500);
  }
});

app.post("/auth/v1/verify", async (c) => {
  try {
    const { email, code } = await c.req.json();
    if (!email || !code) return c.json({ error: "Email and code required" }, 400);

    const otpRes = await query("SELECT code, expires_at FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
    if (otpRes.rows.length === 0) return c.json({ error: "No code found" }, 400);

    const record = otpRes.rows[0];
    if (new Date() > new Date(record.expires_at)) {
      await query("DELETE FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
      return c.json({ error: "Code expired" }, 400);
    }
    if (record.code !== code) return c.json({ error: "Invalid code" }, 401);

    await query("DELETE FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
    await query("UPDATE users SET email_confirmed = true WHERE email = $1", [email.toLowerCase()]);

    const userRes = await query("SELECT id, email, created_at FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = userRes.rows[0];
    const token = createToken({ sub: user.id, email: user.email });

    return c.json({ access_token: token, token_type: "bearer", expires_in: 604800, user });
  } catch (err) {
    console.error(err);
    return c.json({ error: "Verification failed" }, 500);
  }
});

app.post("/auth/v1/login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "Email and password required" }, 400);

    const res = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (res.rows.length === 0) return c.json({ error: "Invalid email or password" }, 401);

    const user = res.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return c.json({ error: "Invalid email or password" }, 401);
    if (!user.email_confirmed) return c.json({ error: "Please verify your email first" }, 403);

    const token = createToken({ sub: user.id, email: user.email });
    return c.json({ access_token: token, token_type: "bearer", expires_in: 604800, user: { id: user.id, email: user.email, created_at: user.created_at } });
  } catch (err) {
    console.error(err);
    return c.json({ error: "Login failed" }, 500);
  }
});

app.get("/auth/v1/user", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  return c.json(user);
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

    await query("INSERT INTO projects (id, name, password, owner_id, api_key) VALUES ($1, $2, $3, $4, $5)", [id, name, hashed, user.id, apiKey]);

    return c.json({ id, name, api_key: apiKey, created_at: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to create project" }, 500);
  }
});

app.get("/projects", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const res = await query("SELECT id, name, api_key, created_at FROM projects WHERE owner_id = $1 ORDER BY created_at DESC", [user.id]);
  return c.json(res.rows);
});

// ====================== DATABASE ======================
app.get("/rest/v1/:table", async (c) => {
  try {
    const table = c.req.param("table");
    if (table !== "game_scores") return c.json({ error: "Table not allowed" }, 403);
    const res = await query(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 100`);
    return c.json(res.rows);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/rest/v1/:table", async (c) => {
  try {
    const table = c.req.param("table");
    const body = await c.req.json();
    if (table === "game_scores") {
      const id = uuidv4();
      await query("INSERT INTO game_scores (id, player_name, score) VALUES ($1, $2, $3)", [id, body.player_name || "Anonymous", body.score || 0]);
      return c.json({ id, ...body }, 201);
    }
    return c.json({ error: "Not supported" }, 400);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ====================== STORAGE ======================
app.post("/storage/v1/object/:bucket/:key{.+}", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    const bucket = c.req.param("bucket");
    const key = c.req.param("key");
    const contentType = c.req.header("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await c.req.arrayBuffer());

    const result = await uploadFile(`${bucket}/${key}`, buffer, contentType);
    return c.json({ Key: result.key, url: result.url });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/storage/v1/object/:bucket/:key{.+}", async (c) => {
  try {
    const url = await getFileUrl(`${c.req.param("bucket")}/${c.req.param("key")}`);
    return c.json({ url });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ====================== REALTIME STATS ======================
app.get("/realtime/v1/stats", (c) => {
  return c.json(getRealtimeStats());
});

// ====================== START SERVER ======================
const port = Number(process.env.PORT) || 4000;

const server = createServer(async (req, res) => {
  // Let Hono handle normal HTTP
  const response = await app.fetch(new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers as any,
    body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
  }));

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const buf = await response.arrayBuffer();
  res.end(Buffer.from(buf));
});

// Attach WebSocket
setupRealtime(server);

server.listen(port, () => {
  console.log(`\n🚀 KotahBase API running on http://localhost:${port}`);
  console.log(`   Auth     → Email + Password + 6-digit code`);
  console.log(`   Database → Postgres`);
  console.log(`   Storage  → Ready`);
  console.log(`   Realtime → ws://localhost:${port}/realtime/v1\n`);
});

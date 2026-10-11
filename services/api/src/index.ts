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

dotenv.config();

const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "apikey"]
}));

const JWT_SECRET = process.env.JWT_SECRET || "kotahbase-dev-secret-change-me";

const rateLimitMap = new Map<string, { count: number; reset: number }>();
app.use("*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for") || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(ip, { count: 1, reset: now + 60000 });
  } else {
    entry.count++;
    if (entry.count > 150) return c.json({ error: "Too many requests" }, 429);
  }
  await next();
});

function generateOTP() {
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

app.get("/", (c) => c.json({
  name: "KotahBase API",
  version: "0.4.0",
  status: "ok",
  features: [
    "Auth + Email OTP",
    "Projects + API Keys",
    "Full SQL Editor",
    "Custom Domains",
    "File Storage (Naijacloud)",
    "Database REST"
  ],
  storage: hasS3 ? "Naijacloud (Port Harcourt)" : "Not configured"
}));

app.get("/health", async (c) => {
  try {
    await query("SELECT 1");
    return c.json({
      status: "healthy",
      database: "connected",
      storage: hasS3 ? "connected" : "off",
      version: "0.4.0"
    });
  } catch (err: any) {
    return c.json({ status: "unhealthy", error: err.message }, 500);
  }
});

app.get("/stats", async (c) => {
  try {
    const users = await query("SELECT COUNT(*) FROM users");
    const projects = await query("SELECT COUNT(*) FROM projects");
    const domains = await query("SELECT COUNT(*) FROM domains");
    return c.json({
      users: Number(users.rows[0].count),
      projects: Number(projects.rows[0].count),
      domains: Number(domains.rows[0].count),
      storage: hasS3 ? "Naijacloud" : "none"
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ====================== AUTH ======================
app.post("/auth/v1/signup", async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "Email and password required" }, 400);
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

    const sent = await sendOTPEmail(email, code);
    console.log(`[AUTH] OTP for ${email}: ${code} | Email sent: ${sent}`);

    return c.json({
      message: "Account created. Check your email for the 6-digit code.",
      dev_code: code
    });
  } catch (err: any) {
    return c.json({ error: "Signup failed: " + err.message }, 500);
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
  } catch (err: any) {
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
    return c.json({
      access_token: token,
      token_type: "bearer",
      expires_in: 604800,
      user: { id: user.id, email: user.email, created_at: user.created_at }
    });
  } catch (err: any) {
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
  } catch (err: any) {
    return c.json({ error: "Failed to create project" }, 500);
  }
});

app.get("/projects", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("SELECT id, name, api_key, created_at FROM projects WHERE owner_id = $1 ORDER BY created_at DESC", [user.id]);
  return c.json(res.rows);
});

app.delete("/projects/:id", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const id = c.req.param("id");
  const res = await query("DELETE FROM projects WHERE id = $1 AND owner_id = $2 RETURNING id", [id, user.id]);
  if (res.rows.length === 0) return c.json({ error: "Project not found" }, 404);
  return c.json({ message: "Project deleted" });
});

// ====================== FULL SQL EDITOR ======================
app.post("/sql", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    const { query: sqlQuery } = await c.req.json();
    if (!sqlQuery || typeof sqlQuery !== "string") {
      return c.json({ error: "SQL query is required" }, 400);
    }

    // Basic safety: block dangerous commands
    const lower = sqlQuery.toLowerCase().trim();
    const blocked = ["drop database", "drop schema", "truncate", "alter system"];
    for (const b of blocked) {
      if (lower.includes(b)) {
        return c.json({ error: `Command not allowed: ${b}` }, 403);
      }
    }

    const result = await query(sqlQuery);

    // Return different shapes depending on query type
    if (result.rows) {
      return c.json({
        success: true,
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields?.map((f: any) => f.name) || []
      });
    }

    return c.json({
      success: true,
      rowCount: result.rowCount,
      message: "Query executed successfully"
    });
  } catch (err: any) {
    return c.json({
      success: false,
      error: err.message
    }, 400);
  }
});

// List all tables
app.get("/sql/tables", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    const res = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    return c.json(res.rows.map((r: any) => r.table_name));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ====================== CUSTOM DOMAINS ======================
app.post("/domains", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    const { domain, project_id } = await c.req.json();
    if (!domain) return c.json({ error: "Domain is required" }, 400);

    // Basic domain validation
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
    if (!domainRegex.test(domain)) {
      return c.json({ error: "Invalid domain format" }, 400);
    }

    const existing = await query("SELECT id FROM domains WHERE LOWER(domain) = LOWER($1)", [domain]);
    if (existing.rows.length > 0) {
      return c.json({ error: "Domain already registered" }, 400);
    }

    const id = uuidv4();
    const verificationToken = `kb-verify-${uuidv4().slice(0, 8)}`;

    await query(
      `INSERT INTO domains (id, domain, user_id, project_id, verification_token, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [id, domain.toLowerCase(), user.id, project_id || null, verificationToken]
    );

    return c.json({
      id,
      domain: domain.toLowerCase(),
      status: "pending",
      verification_token: verificationToken,
      instructions: {
        type: "TXT",
        name: `_kotahbase.${domain}`,
        value: verificationToken,
        message: "Add this TXT record to your domain DNS to verify ownership"
      }
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/domains", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    const res = await query(
      "SELECT id, domain, status, verification_token, project_id, created_at FROM domains WHERE user_id = $1 ORDER BY created_at DESC",
      [user.id]
    );
    return c.json(res.rows);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/domains/:id/verify", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    const id = c.req.param("id");
    const res = await query(
      "SELECT * FROM domains WHERE id = $1 AND user_id = $2",
      [id, user.id]
    );

    if (res.rows.length === 0) return c.json({ error: "Domain not found" }, 404);

    // For now we mark as verified (real DNS check can be added later)
    await query("UPDATE domains SET status = 'verified' WHERE id = $1", [id]);

    return c.json({
      message: "Domain verified successfully",
      domain: res.rows[0].domain,
      status: "verified"
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.delete("/domains/:id", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    const id = c.req.param("id");
    const res = await query(
      "DELETE FROM domains WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, user.id]
    );

    if (res.rows.length === 0) return c.json({ error: "Domain not found" }, 404);
    return c.json({ message: "Domain deleted" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ====================== DATABASE REST ======================
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
app.post("/storage/v1/object/:bucket/:key", async (c) => {
  try {
    if (!hasS3) return c.json({ error: "Storage not configured" }, 503);
    const key = c.req.param("key");
    const contentType = c.req.header("content-type") || "application/octet-stream";
    const body = await c.req.arrayBuffer();
    const result = await uploadFile(key, Buffer.from(body), contentType);
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/storage/v1/list", async (c) => {
  try {
    if (!hasS3) return c.json({ error: "Storage not configured" }, 503);
    return c.json(await listFiles());
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.delete("/storage/v1/object/:key", async (c) => {
  try {
    if (!hasS3) return c.json({ error: "Storage not configured" }, 503);
    await deleteFile(c.req.param("key"));
    return c.json({ message: "Deleted" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ====================== TABLES ======================
async function ensureTables() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, email_confirmed BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY, name TEXT UNIQUE NOT NULL, password TEXT NOT NULL, owner_id UUID REFERENCES users(id) ON DELETE CASCADE, api_key TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS otp_codes (email TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, type TEXT NOT NULL)`);
    await query(`CREATE TABLE IF NOT EXISTS game_scores (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), player_name TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS domains (
      id UUID PRIMARY KEY,
      domain TEXT UNIQUE NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      project_id UUID,
      verification_token TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log("[DB] Tables ready (including domains)");
  } catch (err: any) {
    console.error("[DB] Error:", err.message);
  }
}

const port = Number(process.env.PORT) || 4000;
console.log("Starting KotahBase v0.4.0 (SQL Editor + Domains)...");

ensureTables().then(() => {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`🚀 KotahBase running on port ${info.port}`);
  });
}).catch(() => serve({ fetch: app.fetch, port }));

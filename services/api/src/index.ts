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
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://aetherbase-six.vercel.app";
const API_URL = process.env.API_URL || "https://kotahbase-api.onrender.com";

// Simple in-memory rate limit
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

// Request logger middleware
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const method = c.req.method;
  const path = c.req.path;
  const status = c.res.status;
  console.log(`[${method}] ${path} → ${status} (${ms}ms)`);

  // Store important logs in DB (non-blocking)
  if (path.startsWith("/auth") || status >= 400) {
    query(
      `INSERT INTO api_logs (id, method, path, status, duration_ms, ip, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [uuidv4(), method, path, status, ms, c.req.header("x-forwarded-for") || "unknown"]
    ).catch(() => {});
  }
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
    const res = await query("SELECT id, email, created_at, provider FROM users WHERE id = $1", [payload.sub]);
    return res.rows[0] || null;
  } catch {
    return null;
  }
}

async function logAuth(event: string, email: string, success: boolean, meta: any = {}) {
  query(
    `INSERT INTO auth_logs (id, event, email, success, meta, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [uuidv4(), event, email, success, JSON.stringify(meta)]
  ).catch(() => {});
}

// ====================== ROOT ======================
app.get("/", (c) => c.json({
  name: "KotahBase API",
  version: "0.5.0",
  status: "ok",
  features: [
    "Email + Password + OTP",
    "Forgot Password",
    "Google OAuth",
    "GitHub OAuth",
    "Auth Logs",
    "API Logs",
    "SQL Editor",
    "Custom Domains",
    "File Storage (Naijacloud)"
  ],
  storage: hasS3 ? "Naijacloud (Port Harcourt)" : "Not configured",
  oauth: {
    google: !!GOOGLE_CLIENT_ID,
    github: !!GITHUB_CLIENT_ID
  }
}));

app.get("/health", async (c) => {
  try {
    await query("SELECT 1");
    return c.json({
      status: "healthy",
      database: "connected",
      storage: hasS3 ? "connected" : "off",
      version: "0.5.0",
      oauth: { google: !!GOOGLE_CLIENT_ID, github: !!GITHUB_CLIENT_ID }
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
    await query(
      "INSERT INTO users (id, email, password, email_confirmed, provider) VALUES ($1, $2, $3, false, 'email')",
      [id, email.toLowerCase(), hashed]
    );

    const code = generateOTP();
    await query(
      `INSERT INTO otp_codes (email, code, expires_at, type) VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 'signup')
       ON CONFLICT (email) DO UPDATE SET code = $2, expires_at = NOW() + INTERVAL '10 minutes', type = 'signup'`,
      [email.toLowerCase(), code]
    );

    const sent = await sendOTPEmail(email, code, "signup");
    await logAuth("signup", email, true, { email_sent: sent });

    // NEVER return the code in response when email was sent successfully
    const response: any = {
      message: sent
        ? "Account created. Check your email for the 6-digit code."
        : "Account created. Email could not be sent — check server logs."
    };

    // Only expose code if email failed (dev fallback)
    if (!sent) response.dev_code = code;

    return c.json(response);
  } catch (err: any) {
    await logAuth("signup", "unknown", false, { error: err.message });
    return c.json({ error: "Signup failed: " + err.message }, 500);
  }
});

app.post("/auth/v1/verify", async (c) => {
  try {
    const { email, code } = await c.req.json();
    if (!email || !code) return c.json({ error: "Email and code required" }, 400);

    const otpRes = await query("SELECT code, expires_at, type FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
    if (otpRes.rows.length === 0) return c.json({ error: "No code found" }, 400);

    const record = otpRes.rows[0];
    if (new Date() > new Date(record.expires_at)) {
      await query("DELETE FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
      return c.json({ error: "Code expired" }, 400);
    }
    if (record.code !== code) {
      await logAuth("verify_failed", email, false);
      return c.json({ error: "Invalid code" }, 401);
    }

    await query("DELETE FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
    await query("UPDATE users SET email_confirmed = true WHERE email = $1", [email.toLowerCase()]);

    const userRes = await query("SELECT id, email, created_at, provider FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = userRes.rows[0];
    const token = createToken({ sub: user.id, email: user.email });

    await logAuth("verify_success", email, true);
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
    if (res.rows.length === 0) {
      await logAuth("login_failed", email, false, { reason: "not_found" });
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const user = res.rows[0];
    if (!user.password) {
      return c.json({ error: "This account uses social login. Please sign in with Google/GitHub." }, 400);
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await logAuth("login_failed", email, false, { reason: "wrong_password" });
      return c.json({ error: "Invalid email or password" }, 401);
    }
    if (!user.email_confirmed) return c.json({ error: "Please verify your email first" }, 403);

    const token = createToken({ sub: user.id, email: user.email });
    await logAuth("login_success", email, true);

    return c.json({
      access_token: token,
      token_type: "bearer",
      expires_in: 604800,
      user: { id: user.id, email: user.email, created_at: user.created_at, provider: user.provider }
    });
  } catch (err: any) {
    return c.json({ error: "Login failed" }, 500);
  }
});

// Forgot Password
app.post("/auth/v1/forgot-password", async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: "Email required" }, 400);

    const res = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    // Always return success to avoid email enumeration
    if (res.rows.length === 0) {
      return c.json({ message: "If that email exists, a reset code has been sent." });
    }

    const code = generateOTP();
    await query(
      `INSERT INTO otp_codes (email, code, expires_at, type) VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 'reset')
       ON CONFLICT (email) DO UPDATE SET code = $2, expires_at = NOW() + INTERVAL '10 minutes', type = 'reset'`,
      [email.toLowerCase(), code]
    );

    const sent = await sendOTPEmail(email, code, "reset");
    await logAuth("forgot_password", email, true, { email_sent: sent });

    const response: any = { message: "If that email exists, a reset code has been sent." };
    if (!sent) response.dev_code = code; // only if email failed

    return c.json(response);
  } catch (err: any) {
    return c.json({ error: "Failed to process request" }, 500);
  }
});

// Reset Password
app.post("/auth/v1/reset-password", async (c) => {
  try {
    const { email, code, new_password } = await c.req.json();
    if (!email || !code || !new_password) {
      return c.json({ error: "Email, code and new_password required" }, 400);
    }
    if (new_password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const otpRes = await query(
      "SELECT code, expires_at, type FROM otp_codes WHERE email = $1 AND type = 'reset'",
      [email.toLowerCase()]
    );
    if (otpRes.rows.length === 0) return c.json({ error: "No reset code found" }, 400);

    const record = otpRes.rows[0];
    if (new Date() > new Date(record.expires_at)) {
      await query("DELETE FROM otp_codes WHERE email = $1", [email.toLowerCase()]);
      return c.json({ error: "Code expired" }, 400);
    }
    if (record.code !== code) return c.json({ error: "Invalid code" }, 401);

    const hashed = await bcrypt.hash(new_password, 10);
    await query("UPDATE users SET password = $1 WHERE email = $2", [hashed, email.toLowerCase()]);
    await query("DELETE FROM otp_codes WHERE email = $1", [email.toLowerCase()]);

    await logAuth("password_reset", email, true);
    return c.json({ message: "Password updated successfully. You can now login." });
  } catch (err: any) {
    return c.json({ error: "Reset failed" }, 500);
  }
});

app.get("/auth/v1/user", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  return c.json(user);
});

// ====================== OAUTH ======================
// Google
app.get("/auth/v1/google", (c) => {
  if (!GOOGLE_CLIENT_ID) {
    return c.json({ error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." }, 503);
  }
  const redirectUri = `${API_URL}/auth/v1/callback/google`;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=consent`;
  return c.redirect(url);
});

app.get("/auth/v1/callback/google", async (c) => {
  try {
    const code = c.req.query("code");
    if (!code) return c.redirect(`${DASHBOARD_URL}?error=google_no_code`);

    const redirectUri = `${API_URL}/auth/v1/callback/google`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error("[Google] Token error:", tokens);
      return c.redirect(`${DASHBOARD_URL}?error=google_token`);
    }

    // Get user info
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const profile = await userRes.json();

    if (!profile.email) return c.redirect(`${DASHBOARD_URL}?error=google_no_email`);

    // Find or create user
    let userRow = await query("SELECT * FROM users WHERE email = $1", [profile.email.toLowerCase()]);
    let user;

    if (userRow.rows.length === 0) {
      const id = uuidv4();
      await query(
        `INSERT INTO users (id, email, password, email_confirmed, provider, provider_id)
         VALUES ($1, $2, NULL, true, 'google', $3)`,
        [id, profile.email.toLowerCase(), profile.id]
      );
      user = { id, email: profile.email.toLowerCase(), provider: "google" };
      await logAuth("oauth_google_signup", profile.email, true);
    } else {
      user = userRow.rows[0];
      await logAuth("oauth_google_login", profile.email, true);
    }

    const token = createToken({ sub: user.id, email: user.email });
    return c.redirect(`${DASHBOARD_URL}?token=${token}`);
  } catch (err: any) {
    console.error("[Google] Callback error:", err.message);
    return c.redirect(`${DASHBOARD_URL}?error=google_failed`);
  }
});

// GitHub
app.get("/auth/v1/github", (c) => {
  if (!GITHUB_CLIENT_ID) {
    return c.json({ error: "GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET." }, 503);
  }
  const redirectUri = `${API_URL}/auth/v1/callback/github`;
  const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email`;
  return c.redirect(url);
});

app.get("/auth/v1/callback/github", async (c) => {
  try {
    const code = c.req.query("code");
    if (!code) return c.redirect(`${DASHBOARD_URL}?error=github_no_code`);

    // Exchange code
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code
      })
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error("[GitHub] Token error:", tokens);
      return c.redirect(`${DASHBOARD_URL}?error=github_token`);
    }

    // Get user
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/json"
      }
    });
    const profile = await userRes.json();

    // Get email (GitHub may hide it)
    let email = profile.email;
    if (!email) {
      const emailRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json"
        }
      });
      const emails = await emailRes.json();
      const primary = emails.find((e: any) => e.primary) || emails[0];
      email = primary?.email;
    }

    if (!email) return c.redirect(`${DASHBOARD_URL}?error=github_no_email`);

    let userRow = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    let user;

    if (userRow.rows.length === 0) {
      const id = uuidv4();
      await query(
        `INSERT INTO users (id, email, password, email_confirmed, provider, provider_id)
         VALUES ($1, $2, NULL, true, 'github', $3)`,
        [id, email.toLowerCase(), String(profile.id)]
      );
      user = { id, email: email.toLowerCase(), provider: "github" };
      await logAuth("oauth_github_signup", email, true);
    } else {
      user = userRow.rows[0];
      await logAuth("oauth_github_login", email, true);
    }

    const token = createToken({ sub: user.id, email: user.email });
    return c.redirect(`${DASHBOARD_URL}?token=${token}`);
  } catch (err: any) {
    console.error("[GitHub] Callback error:", err.message);
    return c.redirect(`${DASHBOARD_URL}?error=github_failed`);
  }
});

// ====================== LOGS ======================
app.get("/logs/auth", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const res = await query(
    "SELECT event, email, success, meta, created_at FROM auth_logs ORDER BY created_at DESC LIMIT 50"
  );
  return c.json(res.rows);
});

app.get("/logs/api", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const res = await query(
    "SELECT method, path, status, duration_ms, created_at FROM api_logs ORDER BY created_at DESC LIMIT 50"
  );
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

// ====================== SQL ======================
app.post("/sql", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    const { query: sqlQuery } = await c.req.json();
    if (!sqlQuery || typeof sqlQuery !== "string") return c.json({ error: "SQL query required" }, 400);

    const lower = sqlQuery.toLowerCase().trim();
    const blocked = ["drop database", "drop schema", "truncate", "alter system"];
    for (const b of blocked) {
      if (lower.includes(b)) return c.json({ error: `Command not allowed: ${b}` }, 403);
    }

    const result = await query(sqlQuery);
    return c.json({
      success: true,
      rows: result.rows || [],
      rowCount: result.rowCount,
      fields: result.fields?.map((f: any) => f.name) || []
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

app.get("/sql/tables", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
  return c.json(res.rows.map((r: any) => r.table_name));
});

// ====================== DOMAINS ======================
app.post("/domains", async (c) => {
  try {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    const { domain, project_id } = await c.req.json();
    if (!domain) return c.json({ error: "Domain required" }, 400);

    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
    if (!domainRegex.test(domain)) return c.json({ error: "Invalid domain format" }, 400);

    const existing = await query("SELECT id FROM domains WHERE LOWER(domain) = LOWER($1)", [domain]);
    if (existing.rows.length > 0) return c.json({ error: "Domain already registered" }, 400);

    const id = uuidv4();
    const verificationToken = `kb-verify-${uuidv4().slice(0, 8)}`;

    await query(
      `INSERT INTO domains (id, domain, user_id, project_id, verification_token, status) VALUES ($1, $2, $3, $4, $5, 'pending')`,
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
        value: verificationToken
      }
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/domains", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query("SELECT id, domain, status, verification_token, project_id, created_at FROM domains WHERE user_id = $1 ORDER BY created_at DESC", [user.id]);
  return c.json(res.rows);
});

app.post("/domains/:id/verify", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const id = c.req.param("id");
  const res = await query("SELECT * FROM domains WHERE id = $1 AND user_id = $2", [id, user.id]);
  if (res.rows.length === 0) return c.json({ error: "Domain not found" }, 404);
  await query("UPDATE domains SET status = 'verified' WHERE id = $1", [id]);
  return c.json({ message: "Domain verified", domain: res.rows[0].domain, status: "verified" });
});

app.delete("/domains/:id", async (c) => {
  const user = await getUserFromToken(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const id = c.req.param("id");
  const res = await query("DELETE FROM domains WHERE id = $1 AND user_id = $2 RETURNING id", [id, user.id]);
  if (res.rows.length === 0) return c.json({ error: "Domain not found" }, 404);
  return c.json({ message: "Domain deleted" });
});

// ====================== REST + STORAGE ======================
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
    await query(`CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      email_confirmed BOOLEAN DEFAULT false,
      provider TEXT DEFAULT 'email',
      provider_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
      api_key TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS otp_codes (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      type TEXT NOT NULL
    )`);
    await query(`CREATE TABLE IF NOT EXISTS game_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      player_name TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS domains (
      id UUID PRIMARY KEY,
      domain TEXT UNIQUE NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      project_id UUID,
      verification_token TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS auth_logs (
      id UUID PRIMARY KEY,
      event TEXT NOT NULL,
      email TEXT,
      success BOOLEAN,
      meta JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS api_logs (
      id UUID PRIMARY KEY,
      method TEXT,
      path TEXT,
      status INTEGER,
      duration_ms INTEGER,
      ip TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log("[DB] All tables ready (v0.5.0)");
  } catch (err: any) {
    console.error("[DB] Error:", err.message);
  }
}

const port = Number(process.env.PORT) || 4000;
console.log("Starting KotahBase v0.5.0 (Phase 1: OAuth + Logs + Forgot Password)...");

ensureTables().then(() => {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`🚀 KotahBase running on port ${info.port}`);
  });
}).catch(() => serve({ fetch: app.fetch, port }));

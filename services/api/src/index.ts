import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const app = new Hono();

// Enable CORS
app.use("*", cors());

// In-memory store for now (will move to Postgres next)
const users: any[] = [];
const JWT_SECRET = process.env.JWT_SECRET || "kotahbase-dev-secret-change-me";

app.get("/", (c) => {
  return c.json({
    name: "KotahBase API",
    version: "0.1.0",
    status: "ok",
    message: "Welcome to KotahBase — Backend for apps, websites & games"
  });
});

app.get("/health", (c) => {
  return c.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// ========== AUTH (Email only) ==========

// Sign up
app.post("/auth/v1/signup", async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const existing = users.find(u => u.email === email.toLowerCase());
    if (existing) {
      return c.json({ error: "User already registered" }, 400);
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      email: email.toLowerCase(),
      password: hashed,
      created_at: new Date().toISOString(),
      email_confirmed: true // for now
    };

    users.push(user);

    const token = jwt.sign(
      { sub: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return c.json({
      access_token: token,
      token_type: "bearer",
      expires_in: 604800,
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at
      }
    });
  } catch (err) {
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Sign in
app.post("/auth/v1/token", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const user = users.find(u => u.email === email.toLowerCase());
    if (!user) {
      return c.json({ error: "Invalid login credentials" }, 401);
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return c.json({ error: "Invalid login credentials" }, 401);
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return c.json({
      access_token: token,
      token_type: "bearer",
      expires_in: 604800,
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at
      }
    });
  } catch (err) {
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Magic Link (placeholder - will send real email later)
app.post("/auth/v1/magiclink", async (c) => {
  const { email } = await c.req.json();
  if (!email) {
    return c.json({ error: "Email is required" }, 400);
  }
  // TODO: Generate token + send email
  return c.json({ message: "Magic link sent (simulated for now)" });
});

// Get current user
app.get("/auth/v1/user", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return c.json({ error: "Not authenticated" }, 401);
  }

  try {
    const token = auth.split(" ")[1];
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const user = users.find(u => u.id === payload.sub);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json({
      id: user.id,
      email: user.email,
      created_at: user.created_at
    });
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});

// ========== DATABASE (placeholder) ==========
app.get("/rest/v1/:table", (c) => {
  return c.json({ message: "Database REST coming next", table: c.req.param("table") });
});

// ========== STORAGE (placeholder) ==========
app.get("/storage/v1/object/public/:bucket/*", (c) => {
  return c.json({ message: "Storage coming next" });
});

const port = Number(process.env.PORT) || 4000;
console.log(`\n🚀 KotahBase API running on http://localhost:${port}\n`);

serve({
  fetch: app.fetch,
  port
});

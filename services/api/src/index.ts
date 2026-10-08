import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const app = new Hono();
app.use("*", cors());

// ====================== IN-MEMORY STORE (will move to Postgres next) ======================
const users: any[] = [];
const projects: any[] = [];
const otpCodes: Map<string, { code: string; expires: number; email: string }> = new Map();

const JWT_SECRET = process.env.JWT_SECRET || "kotahbase-dev-secret-change-me";

// ====================== HELPERS ======================
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
}

function createToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

// ====================== ROOT ======================
app.get("/", (c) => {
  return c.json({
    name: "KotahBase API",
    version: "0.1.1",
    status: "ok",
    message: "KotahBase — Backend for apps, websites & games",
    auth: "Email + 6-digit code"
  });
});

app.get("/health", (c) => {
  return c.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// ====================== AUTH ======================

/**
 * Step 1: Request 6-digit code
 * POST /auth/v1/otp
 * Body: { email: string }
 */
app.post("/auth/v1/otp", async (c) => {
  try {
    const { email } = await c.req.json();

    if (!email || !email.includes("@")) {
      return c.json({ error: "Valid email is required" }, 400);
    }

    const code = generateOTP();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpCodes.set(email.toLowerCase(), { code, expires, email: email.toLowerCase() });

    // TODO: Send real email with the 6-digit code
    // For now we return it in development so you can test
    console.log(`\n🔐 OTP for ${email}: ${code}\n`);

    return c.json({
      message: "6-digit code sent to your email",
      // Only in development:
      dev_code: process.env.NODE_ENV === "production" ? undefined : code
    });
  } catch (err) {
    return c.json({ error: "Failed to send code" }, 500);
  }
});

/**
 * Step 2: Verify 6-digit code + create/login user
 * POST /auth/v1/verify
 * Body: { email: string, code: string }
 */
app.post("/auth/v1/verify", async (c) => {
  try {
    const { email, code } = await c.req.json();

    if (!email || !code) {
      return c.json({ error: "Email and 6-digit code are required" }, 400);
    }

    const record = otpCodes.get(email.toLowerCase());

    if (!record) {
      return c.json({ error: "No code found. Please request a new one." }, 400);
    }

    if (Date.now() > record.expires) {
      otpCodes.delete(email.toLowerCase());
      return c.json({ error: "Code expired. Please request a new one." }, 400);
    }

    if (record.code !== code) {
      return c.json({ error: "Invalid 6-digit code" }, 401);
    }

    // Code is valid → remove it
    otpCodes.delete(email.toLowerCase());

    // Find or create user
    let user = users.find(u => u.email === email.toLowerCase());

    if (!user) {
      user = {
        id: uuidv4(),
        email: email.toLowerCase(),
        created_at: new Date().toISOString(),
        email_confirmed: true
      };
      users.push(user);
    }

    const token = createToken({ sub: user.id, email: user.email });

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
    return c.json({ error: "Verification failed" }, 500);
  }
});

/**
 * Get current user
 */
app.get("/auth/v1/user", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Not authenticated" }, 401);
  }

  try {
    const token = auth.split(" ")[1];
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const user = users.find(u => u.id === payload.sub);

    if (!user) return c.json({ error: "User not found" }, 404);

    return c.json({
      id: user.id,
      email: user.email,
      created_at: user.created_at
    });
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});

// ====================== PROJECTS ======================

/**
 * Create a new project
 * POST /projects
 * Body: { name: string, password: string }
 */
app.post("/projects", async (c) => {
  try {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const token = auth.split(" ")[1];
    const payload = jwt.verify(token, JWT_SECRET) as any;

    const { name, password } = await c.req.json();

    if (!name || !password) {
      return c.json({ error: "Project name and password are required" }, 400);
    }

    if (password.length < 6) {
      return c.json({ error: "Project password must be at least 6 characters" }, 400);
    }

    const existing = projects.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      return c.json({ error: "Project name already taken" }, 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const project = {
      id: uuidv4(),
      name,
      password: hashedPassword,
      owner_id: payload.sub,
      created_at: new Date().toISOString(),
      api_key: `kb_${uuidv4().replace(/-/g, "")}`
    };

    projects.push(project);

    return c.json({
      id: project.id,
      name: project.name,
      api_key: project.api_key,
      created_at: project.created_at,
      message: "Project created successfully"
    });
  } catch (err) {
    return c.json({ error: "Failed to create project" }, 500);
  }
});

/**
 * List my projects
 */
app.get("/projects", async (c) => {
  try {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const token = auth.split(" ")[1];
    const payload = jwt.verify(token, JWT_SECRET) as any;

    const myProjects = projects
      .filter(p => p.owner_id === payload.sub)
      .map(p => ({
        id: p.id,
        name: p.name,
        api_key: p.api_key,
        created_at: p.created_at
      }));

    return c.json(myProjects);
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

// ====================== DATABASE & STORAGE (placeholders) ======================
app.get("/rest/v1/:table", (c) => {
  return c.json({ message: "Database REST coming next", table: c.req.param("table") });
});

app.get("/storage/v1/object/public/:bucket/*", (c) => {
  return c.json({ message: "Storage coming next" });
});

// ====================== START ======================
const port = Number(process.env.PORT) || 4000;
console.log(`\n🚀 KotahBase API running on http://localhost:${port}`);
console.log(`   Auth: Email + 6-digit code\n`);

serve({
  fetch: app.fetch,
  port
});

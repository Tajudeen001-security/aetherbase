/**
 * Per-project client API (Supabase-style)
 * Each project has:
 *   url:              https://api.../p/{ref}
 *   anon_key:         public key for browsers / mobile apps
 *   service_role_key: secret key for servers (full access)
 *
 * Client sends:  apikey: <anon_key|service_role_key>
 * Optional:      Authorization: Bearer <user_jwt>
 */
import { Hono } from "hono";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { query } from "./db/client";

const JWT_SECRET = process.env.JWT_SECRET || "kotahbase-dev-secret-change-me";
const API_URL = process.env.API_URL || "https://kotahbase-api.onrender.com";

function createToken(payload: object, expiresIn = "7d") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as any);
}

/** Resolve project from apikey header or path ref */
export async function resolveProject(ref: string, apikey: string | undefined) {
  if (!apikey) return null;
  const res = await query(
    `SELECT id, name, ref, anon_key, service_role_key, api_key, owner_id, google_client_id, google_client_secret, github_client_id, github_client_secret, redirect_url
     FROM projects WHERE ref = $1 AND (anon_key = $2 OR service_role_key = $2 OR api_key = $2)`,
    [ref, apikey]
  );
  if (res.rows.length === 0) return null;
  const p = res.rows[0];
  const role = apikey === p.service_role_key || apikey === p.api_key ? "service_role" : "anon";
  return { ...p, role };
}

export function projectUrl(ref: string) {
  return `${API_URL}/p/${ref}`;
}

export function makeKeys() {
  const ref = uuidv4().replace(/-/g, "").slice(0, 12);
  const anon_key = `kb_anon_${uuidv4().replace(/-/g, "")}`;
  const service_role_key = `kb_service_${uuidv4().replace(/-/g, "")}`;
  return { ref, anon_key, service_role_key };
}

export const projectClientRoutes = new Hono();

async function projectMw(c: any, next: any) {
  const ref = c.req.param("ref");
  const apikey = c.req.header("apikey") || c.req.header("x-api-key") || "";
  const project = await resolveProject(ref, apikey);
  if (!project) return c.json({ error: "Invalid project ref or apikey" }, 401);
  c.set("project", project);
  await next();
}
projectClientRoutes.use("/:ref", projectMw);
projectClientRoutes.use("/:ref/*", projectMw);

projectClientRoutes.get("/:ref", async (c) => {
  const project = (c as any).get("project");
  return c.json({
    name: project.name,
    ref: project.ref,
    url: projectUrl(project.ref),
    role: project.role,
    version: "0.10.0"
  });
});

projectClientRoutes.get("/:ref/", async (c) => {
  const project = (c as any).get("project");
  return c.json({
    name: project.name,
    ref: project.ref,
    url: projectUrl(project.ref),
    role: project.role
  });
});

projectClientRoutes.post("/:ref/auth/v1/signup", async (c) => {
  try {
    const project = (c as any).get("project");
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "Email and password required" }, 400);
    if (password.length < 6) return c.json({ error: "Password min 6 chars" }, 400);
    const existing = await query(
      "SELECT id FROM app_users WHERE project_id = $1 AND email = $2",
      [project.id, email.toLowerCase()]
    );
    if (existing.rows.length > 0) return c.json({ error: "Email already registered" }, 400);
    const id = uuidv4();
    const hashed = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO app_users (id, project_id, email, password, provider) VALUES ($1,$2,$3,$4,'email')`,
      [id, project.id, email.toLowerCase(), hashed]
    );
    const token = createToken({ sub: id, email: email.toLowerCase(), project_id: project.id, role: "authenticated" });
    return c.json({
      access_token: token,
      token_type: "bearer",
      expires_in: 604800,
      user: { id, email: email.toLowerCase(), role: "authenticated" }
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

projectClientRoutes.post("/:ref/auth/v1/login", async (c) => {
  try {
    const project = (c as any).get("project");
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "Email and password required" }, 400);
    const res = await query(
      "SELECT * FROM app_users WHERE project_id = $1 AND email = $2",
      [project.id, email.toLowerCase()]
    );
    if (res.rows.length === 0) return c.json({ error: "Invalid login" }, 401);
    const u = res.rows[0];
    if (!u.password || !(await bcrypt.compare(password, u.password))) {
      return c.json({ error: "Invalid login" }, 401);
    }
    const token = createToken({ sub: u.id, email: u.email, project_id: project.id, role: "authenticated" });
    return c.json({
      access_token: token,
      token_type: "bearer",
      expires_in: 604800,
      user: { id: u.id, email: u.email, role: "authenticated" }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

projectClientRoutes.get("/:ref/auth/v1/user", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return c.json({ error: "Not authenticated" }, 401);
  try {
    const payload = jwt.verify(auth.split(" ")[1], JWT_SECRET) as any;
    const project = (c as any).get("project");
    if (payload.project_id && payload.project_id !== project.id) {
      return c.json({ error: "Token not for this project" }, 401);
    }
    const res = await query(
      "SELECT id, email, provider, created_at FROM app_users WHERE id = $1 AND project_id = $2",
      [payload.sub, project.id]
    );
    if (res.rows.length === 0) return c.json({ error: "User not found" }, 401);
    return c.json({ ...res.rows[0], role: "authenticated" });
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});

projectClientRoutes.get("/:ref/rest/v1/:table", async (c) => {
  try {
    const table = c.req.param("table");
    if (!/^[a-z][a-z0-9_]*$/.test(table)) return c.json({ error: "Invalid table" }, 400);
    const limit = Math.min(Number(c.req.query("limit") || 100), 1000);
    const res = await query(`SELECT * FROM ${table} LIMIT $1`, [limit]);
    return c.json(res.rows);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

projectClientRoutes.post("/:ref/rest/v1/:table", async (c) => {
  try {
    const table = c.req.param("table");
    if (!/^[a-z][a-z0-9_]*$/.test(table)) return c.json({ error: "Invalid table" }, 400);
    const body = await c.req.json();
    const keys = Object.keys(body).filter((k) => /^[a-z][a-z0-9_]*$/.test(k));
    if (!keys.length) return c.json({ error: "No fields" }, 400);
    const cols = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const values = keys.map((k) => body[k]);
    const res = await query(
      `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return c.json(res.rows[0], 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

projectClientRoutes.patch("/:ref/rest/v1/:table", async (c) => {
  try {
    const table = c.req.param("table");
    if (!/^[a-z][a-z0-9_]*$/.test(table)) return c.json({ error: "Invalid table" }, 400);
    const body = await c.req.json();
    const id = c.req.query("id") || body.id;
    if (!id) return c.json({ error: "id required (query or body)" }, 400);
    const keys = Object.keys(body).filter((k) => k !== "id" && /^[a-z][a-z0-9_]*$/.test(k));
    if (!keys.length) return c.json({ error: "No fields to update" }, 400);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = [...keys.map((k) => body[k]), id];
    const res = await query(
      `UPDATE ${table} SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`,
      values
    );
    return c.json(res.rows[0] || { error: "Not found" });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

projectClientRoutes.delete("/:ref/rest/v1/:table", async (c) => {
  try {
    const table = c.req.param("table");
    if (!/^[a-z][a-z0-9_]*$/.test(table)) return c.json({ error: "Invalid table" }, 400);
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id query required" }, 400);
    await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

projectClientRoutes.get("/:ref/realtime/v1", (c) => {
  const project = (c as any).get("project");
  return c.json({
    websocket: `${API_URL.replace("https://", "wss://").replace("http://", "ws://")}/realtime/v1`,
    room: `project:${project.ref}`,
    note: "Connect with WebSocket, then send { type: 'join', room: 'project:' + ref }"
  });
});

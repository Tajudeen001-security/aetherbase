/**
 * Per-project client API (Supabase-style)
 * Auth for APP USERS (not dashboard owners):
 *   Email/password signup+login
 *   Google / GitHub OAuth with Site URL + redirect allow-list
 */
import { Hono } from "hono";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { query, queryProject } from "./db/client";
import { recordProjectUsage } from "./usage";

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "kotahbase-dev-secret-change-me");
const API_URL = process.env.API_URL || "https://kotahbase-api.onrender.com";

function createToken(payload: object, expiresIn = "7d") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as any);
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

async function loadProjectByRef(ref: string) {
  const res = await query(
    `SELECT id, name, ref, anon_key, service_role_key, api_key, owner_id,
            google_client_id, google_client_secret, github_client_id, github_client_secret,
            discord_client_id, discord_client_secret, enable_discord,
            redirect_url, site_url, additional_redirect_urls,
            enable_email, enable_google, enable_github
     FROM projects WHERE ref = $1`,
    [ref]
  );
  return res.rows[0] || null;
}

export async function resolveProject(ref: string, apikey: string | undefined) {
  if (!apikey) return null;
  const p = await loadProjectByRef(ref);
  if (!p) return null;
  if (apikey !== p.anon_key && apikey !== p.service_role_key && apikey !== p.api_key) return null;
  const role = apikey === p.service_role_key || apikey === p.api_key ? "service_role" : "anon";
  return { ...p, role };
}

function isAllowedRedirect(project: any, target: string | null | undefined): boolean {
  if (!target) return false;
  try {
    const u = new URL(target);
    const allowed: string[] = [];
    if (project.site_url) allowed.push(project.site_url);
    if (project.redirect_url) allowed.push(project.redirect_url);
    let extra = project.additional_redirect_urls;
    if (typeof extra === "string") {
      try { extra = JSON.parse(extra); } catch { extra = []; }
    }
    if (Array.isArray(extra)) allowed.push(...extra);
    return allowed.some((a) => {
      try {
        const b = new URL(a);
        return b.origin === u.origin;
      } catch {
        return a === target || target.startsWith(a);
      }
    });
  } catch {
    return false;
  }
}

function pickRedirect(project: any, requested: string | undefined) {
  if (requested && isAllowedRedirect(project, requested)) return requested;
  return project.site_url || project.redirect_url || null;
}

export const projectClientRoutes = new Hono();

projectClientRoutes.use("/:ref", projectMw);
projectClientRoutes.use("/:ref/*", projectMw);

// OAuth authorize + callback must work WITHOUT apikey (browser redirect)
projectClientRoutes.get("/:ref/auth/v1/authorize/:provider", async (c) => {
  const ref = c.req.param("ref");
  const provider = c.req.param("provider");
  const redirectTo = c.req.query("redirect_to") || undefined;
  const project = await loadProjectByRef(ref);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const state = Buffer.from(JSON.stringify({ ref, redirect_to: redirectTo || null })).toString("base64url");

  if (provider === "google") {
    if (project.enable_google === false) return c.json({ error: "Google disabled for this project" }, 403);
    if (!project.google_client_id) return c.json({ error: "Google not configured. Add Client ID in Auth settings." }, 400);
    const redirectUri = `${API_URL}/p/${ref}/auth/v1/callback/google`;
    const url =
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(project.google_client_id)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=consent` +
      `&state=${state}`;
    return c.redirect(url);
  }

  if (provider === "github") {
    if (project.enable_github === false) return c.json({ error: "GitHub disabled for this project" }, 403);
    if (!project.github_client_id) return c.json({ error: "GitHub not configured. Add Client ID in Auth settings." }, 400);
    const redirectUri = `${API_URL}/p/${ref}/auth/v1/callback/github`;
    const url =
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(project.github_client_id)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=user:email&state=${state}`;
    return c.redirect(url);
  }

  if (provider === "discord") {
    if (project.enable_discord !== true) return c.json({ error: "Discord disabled for this project" }, 403);
    if (!project.discord_client_id) return c.json({ error: "Discord not configured. Add Client ID in Auth settings." }, 400);
    const redirectUri = `${API_URL}/p/${ref}/auth/v1/callback/discord`;
    const url = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(project.discord_client_id)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20email&state=${state}`;
    return c.redirect(url);
  }

  return c.json({ error: "Unknown provider. Use google, github or discord." }, 400);
});

projectClientRoutes.get("/:ref/auth/v1/callback/google", async (c) => {
  const ref = c.req.param("ref");
  try {
    const code = c.req.query("code");
    const stateRaw = c.req.query("state") || "";
    let redirectTo: string | undefined;
    try {
      const st = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
      redirectTo = st.redirect_to || undefined;
    } catch {}
    const project = await loadProjectByRef(ref);
    if (!project || !code || !project.google_client_id || !project.google_client_secret) {
      return c.text("OAuth failed", 400);
    }
    const redirectUri = `${API_URL}/p/${ref}/auth/v1/callback/google`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: project.google_client_id,
        client_secret: project.google_client_secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return c.text("Token exchange failed", 400);
    const profile = await (
      await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      })
    ).json();
    if (!profile.email) return c.text("No email from Google", 400);

    let row = await query(
      "SELECT * FROM app_users WHERE project_id = $1 AND email = $2",
      [project.id, profile.email.toLowerCase()]
    );
    let user;
    if (row.rows.length === 0) {
      const id = uuidv4();
      await query(
        `INSERT INTO app_users (id, project_id, email, password, provider, provider_id) VALUES ($1,$2,$3,NULL,'google',$4)`,
        [id, project.id, profile.email.toLowerCase(), String(profile.id)]
      );
      user = { id, email: profile.email.toLowerCase(), provider: "google" };
    } else {
      user = row.rows[0];
      await query(`UPDATE app_users SET provider='google', provider_id=$1 WHERE id=$2`, [
        String(profile.id),
        user.id
      ]);
    }

    const access_token = createToken({
      sub: user.id,
      email: user.email,
      project_id: project.id,
      role: "authenticated"
    });
    const dest = pickRedirect(project, redirectTo);
    if (!dest) {
      return c.json({
        access_token,
        token_type: "bearer",
        expires_in: 604800,
        user: { id: user.id, email: user.email, provider: "google" },
        note: "Set Site URL in Auth settings to redirect to your app"
      });
    }
    const sep = dest.includes("#") ? "&" : "#";
    return c.redirect(
      `${dest}${sep}access_token=${access_token}&token_type=bearer&provider=google`
    );
  } catch (e: any) {
    return c.text("Google callback error: " + (e.message || "failed"), 500);
  }
});

projectClientRoutes.get("/:ref/auth/v1/callback/github", async (c) => {
  const ref = c.req.param("ref");
  try {
    const code = c.req.query("code");
    const stateRaw = c.req.query("state") || "";
    let redirectTo: string | undefined;
    try {
      const st = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
      redirectTo = st.redirect_to || undefined;
    } catch {}
    const project = await loadProjectByRef(ref);
    if (!project || !code || !project.github_client_id || !project.github_client_secret) {
      return c.text("OAuth failed", 400);
    }
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: project.github_client_id,
        client_secret: project.github_client_secret,
        code
      })
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return c.text("Token exchange failed", 400);
    const profile = await (
      await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" }
      })
    ).json();
    let email = profile.email;
    if (!email) {
      const emails = await (
        await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" }
        })
      ).json();
      email = (emails.find((e: any) => e.primary) || emails[0])?.email;
    }
    if (!email) return c.text("No email from GitHub", 400);

    let row = await query(
      "SELECT * FROM app_users WHERE project_id = $1 AND email = $2",
      [project.id, email.toLowerCase()]
    );
    let user;
    if (row.rows.length === 0) {
      const id = uuidv4();
      await query(
        `INSERT INTO app_users (id, project_id, email, password, provider, provider_id) VALUES ($1,$2,$3,NULL,'github',$4)`,
        [id, project.id, email.toLowerCase(), String(profile.id)]
      );
      user = { id, email: email.toLowerCase(), provider: "github" };
    } else {
      user = row.rows[0];
      await query(`UPDATE app_users SET provider='github', provider_id=$1 WHERE id=$2`, [
        String(profile.id),
        user.id
      ]);
    }

    const access_token = createToken({
      sub: user.id,
      email: user.email,
      project_id: project.id,
      role: "authenticated"
    });
    const dest = pickRedirect(project, redirectTo);
    if (!dest) {
      return c.json({
        access_token,
        token_type: "bearer",
        expires_in: 604800,
        user: { id: user.id, email: user.email, provider: "github" }
      });
    }
    const sep = dest.includes("#") ? "&" : "#";
    return c.redirect(
      `${dest}${sep}access_token=${access_token}&token_type=bearer&provider=github`
    );
  } catch (e: any) {
    return c.text("GitHub callback error: " + (e.message || "failed"), 500);
  }
});

projectClientRoutes.get("/:ref/auth/v1/callback/discord", async (c) => {
  const ref = c.req.param("ref");
  try {
    const code = c.req.query("code");
    const stateRaw = c.req.query("state") || "";
    let redirectTo: string | undefined;
    try { const st = JSON.parse(Buffer.from(stateRaw, "base64url").toString()); redirectTo = st.redirect_to || undefined; } catch {}
    const project = await loadProjectByRef(ref);
    if (!project || project.enable_discord !== true || !project.discord_client_id || !project.discord_client_secret || !code) return c.text("Discord OAuth is not configured or authorization failed", 400);
    const redirectUri = `${API_URL}/p/${ref}/auth/v1/callback/discord`;
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: project.discord_client_id, client_secret: project.discord_client_secret, grant_type: "authorization_code", code, redirect_uri: redirectUri }) });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) return c.text("Discord token exchange failed", 400);
    const profileRes = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.email) return c.text("Discord did not provide an email. Enable the email OAuth scope.", 400);
    const email = String(profile.email).toLowerCase();
    const existing = await query("SELECT * FROM app_users WHERE project_id = $1 AND email = $2", [project.id, email]);
    let user: any;
    if (!existing.rows.length) {
      const id = uuidv4();
      await query("INSERT INTO app_users (id, project_id, email, password, provider, provider_id) VALUES ($1,$2,$3,NULL,'discord',$4)", [id, project.id, email, String(profile.id)]);
      user = { id, email, provider: "discord" };
    } else {
      user = existing.rows[0];
      await query("UPDATE app_users SET provider = 'discord', provider_id = $1 WHERE id = $2 AND project_id = $3", [String(profile.id), user.id, project.id]);
    }
    const access_token = createToken({ sub: user.id, email: user.email, project_id: project.id, role: "authenticated" });
    const dest = pickRedirect(project, redirectTo);
    if (!dest) return c.json({ access_token, token_type: "bearer", expires_in: 604800, user: { id: user.id, email: user.email, provider: "discord" } });
    const sep = dest.includes("#") ? "&" : "#";
    return c.redirect(`${dest}${sep}access_token=${access_token}&token_type=bearer&provider=discord`);
  } catch (error: any) { return c.text("Discord callback failed: " + (error.message || "failed"), 500); }
});

async function projectMw(c: any, next: any) {
  const startedAt = Date.now();
  const path = c.req.path || "";
  const ref = c.req.param("ref");
  // OAuth browser redirects do not carry an API key; still meter them against their project.
  if (path.includes("/auth/v1/authorize/") || path.includes("/auth/v1/callback/")) {
    const project = await loadProjectByRef(ref);
    await next();
    if (project) {
      const bytes = await c.res.clone().arrayBuffer().then((body: ArrayBuffer) => body.byteLength).catch(() => 0);
      await recordProjectUsage(project.id, c.res.status, bytes, c.req.method, path, Date.now() - startedAt);
    }
    return;
  }
  const apikey = c.req.header("apikey") || c.req.header("x-api-key") || "";
  const project = await resolveProject(ref, apikey);
  if (!project) return c.json({ error: "Invalid project ref or apikey" }, 401);
  c.set("project", project);
  await next();
  const bytes = await c.res.clone().arrayBuffer().then((body: ArrayBuffer) => body.byteLength).catch(() => 0);
  await recordProjectUsage(project.id, c.res.status, bytes, c.req.method, path, Date.now() - startedAt);
}


projectClientRoutes.get("/:ref", async (c) => {
  const project = (c as any).get("project");
  return c.json({
    name: project.name,
    ref: project.ref,
    url: projectUrl(project.ref),
    role: project.role,
    version: "0.11.0",
    auth: {
      email: project.enable_email !== false,
      google: !!(project.enable_google !== false && project.google_client_id),
      github: !!(project.enable_github !== false && project.github_client_id),
      discord: !!(project.enable_discord === true && project.discord_client_id),
      site_url: project.site_url || null
    }
  });
});

projectClientRoutes.post("/:ref/auth/v1/signup", async (c) => {
  try {
    const project = (c as any).get("project");
    if (project.enable_email === false) return c.json({ error: "Email auth disabled" }, 403);
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "email and password required" }, 400);
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
    const access_token = createToken({
      sub: id,
      email: email.toLowerCase(),
      project_id: project.id,
      role: "authenticated"
    });
    return c.json({
      access_token,
      token_type: "bearer",
      expires_in: 604800,
      user: { id, email: email.toLowerCase(), provider: "email" }
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

projectClientRoutes.post("/:ref/auth/v1/login", async (c) => {
  try {
    const project = (c as any).get("project");
    if (project.enable_email === false) return c.json({ error: "Email auth disabled" }, 403);
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "email and password required" }, 400);
    const res = await query(
      "SELECT * FROM app_users WHERE project_id = $1 AND email = $2",
      [project.id, email.toLowerCase()]
    );
    if (res.rows.length === 0) return c.json({ error: "Invalid credentials" }, 401);
    const user = res.rows[0];
    if (!user.password) return c.json({ error: "Use social login for this account" }, 400);
    if (!(await bcrypt.compare(password, user.password))) {
      return c.json({ error: "Invalid credentials" }, 401);
    }
    const access_token = createToken({
      sub: user.id,
      email: user.email,
      project_id: project.id,
      role: "authenticated"
    });
    return c.json({
      access_token,
      token_type: "bearer",
      expires_in: 604800,
      user: { id: user.id, email: user.email, provider: user.provider }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

projectClientRoutes.get("/:ref/auth/v1/user", async (c) => {
  try {
    const auth = c.req.header("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return c.json({ error: "Missing token" }, 401);
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

projectClientRoutes.get("/:ref/auth/v1/settings", async (c) => {
  const project = (c as any).get("project");
  return c.json({
    email: project.enable_email !== false,
    google: !!(project.enable_google !== false && project.google_client_id),
    github: !!(project.enable_github !== false && project.github_client_id),
    site_url: project.site_url || null,
    authorize: {
      google: `${projectUrl(project.ref)}/auth/v1/authorize/google`,
      github: `${projectUrl(project.ref)}/auth/v1/authorize/github`,
      discord: `${projectUrl(project.ref)}/auth/v1/authorize/discord`
    }
  });
});

projectClientRoutes.get("/:ref/rest/v1/:table", async (c) => {
  try {
    const project = (c as any).get("project");
    const table = c.req.param("table");
    if (!/^[a-z][a-z0-9_]*$/.test(table)) return c.json({ error: "Invalid table" }, 400);
    const limit = Math.min(Number(c.req.query("limit") || 100), 1000);
    const res = await queryProject(project.id, `SELECT * FROM ${table} LIMIT $1`, [limit]);
    return c.json(res.rows);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

projectClientRoutes.post("/:ref/rest/v1/:table", async (c) => {
  try {
    const project = (c as any).get("project");
    const table = c.req.param("table");
    if (!/^[a-z][a-z0-9_]*$/.test(table)) return c.json({ error: "Invalid table" }, 400);
    const body = await c.req.json();
    const keys = Object.keys(body).filter((k) => /^[a-z][a-z0-9_]*$/.test(k));
    if (!keys.length) return c.json({ error: "No fields" }, 400);
    const cols = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const values = keys.map((k) => body[k]);
    const res = await queryProject(project.id,
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
    const project = (c as any).get("project");
    const table = c.req.param("table");
    if (!/^[a-z][a-z0-9_]*$/.test(table)) return c.json({ error: "Invalid table" }, 400);
    const body = await c.req.json();
    const id = c.req.query("id") || body.id;
    if (!id) return c.json({ error: "id required (query or body)" }, 400);
    const keys = Object.keys(body).filter((k) => k !== "id" && /^[a-z][a-z0-9_]*$/.test(k));
    if (!keys.length) return c.json({ error: "No fields to update" }, 400);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = [...keys.map((k) => body[k]), id];
    const res = await queryProject(project.id,
      `UPDATE ${table} SET ${sets} WHERE id = ${keys.length + 1} RETURNING *`,
      values
    );
    return c.json(res.rows[0] || { error: "Not found" });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

projectClientRoutes.delete("/:ref/rest/v1/:table", async (c) => {
  try {
    const project = (c as any).get("project");
    const table = c.req.param("table");
    if (!/^[a-z][a-z0-9_]*$/.test(table)) return c.json({ error: "Invalid table" }, 400);
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id query required" }, 400);
    await queryProject(project.id, `DELETE FROM ${table} WHERE id = $1`, [id]);
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

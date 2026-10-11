import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { query } from "./db/client";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "kotahbase-dev-secret-change-me";

async function getUser(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as any;
    const res = await query("SELECT id, email FROM users WHERE id = $1", [payload.sub]);
    return res.rows[0] || null;
  } catch { return null; }
}

export const extraRoutes = new Hono();

// ---------- Table data browser (view rows without writing SQL) ----------
extraRoutes.get("/data/:table", async (c) => {
  try {
    const user = await getUser(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const table = c.req.param("table");
    if (!/^[a-z][a-z0-9_]*$/.test(table)) return c.json({ error: "Invalid table" }, 400);
    const limit = Math.min(Number(c.req.query("limit") || 50), 200);
    const offset = Number(c.req.query("offset") || 0);
    const res = await query(`SELECT * FROM ${table} ORDER BY 1 DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    const countRes = await query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    return c.json({
      table,
      rows: res.rows,
      total: countRes.rows[0]?.count ?? 0,
      limit,
      offset,
      fields: res.fields?.map((f: any) => f.name) || (res.rows[0] ? Object.keys(res.rows[0]) : [])
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

extraRoutes.post("/data/:table", async (c) => {
  try {
    const user = await getUser(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const table = c.req.param("table");
    if (!/^[a-z][a-z0-9_]*$/.test(table)) return c.json({ error: "Invalid table" }, 400);
    const body = await c.req.json();
    const keys = Object.keys(body).filter(k => /^[a-z][a-z0-9_]*$/.test(k));
    if (keys.length === 0) return c.json({ error: "No valid fields" }, 400);
    const cols = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const values = keys.map(k => body[k]);
    const res = await query(
      `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return c.json({ success: true, row: res.rows[0] }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// ---------- Regenerate project API key ----------
extraRoutes.post("/projects/:id/regenerate-key", async (c) => {
  try {
    const user = await getUser(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const id = c.req.param("id");
    const proj = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [id, user.id]);
    if (proj.rows.length === 0) return c.json({ error: "Not found" }, 404);
    const apiKey = `kb_${uuidv4().replace(/-/g, "")}`;
    await query("UPDATE projects SET api_key = $1 WHERE id = $2", [apiKey, id]);
    return c.json({ api_key: apiKey, message: "API key regenerated. Update your apps." });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ---------- Webhooks ----------
extraRoutes.post("/webhooks", async (c) => {
  try {
    const user = await getUser(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const { url, events, project_id } = await c.req.json();
    if (!url || !Array.isArray(events)) return c.json({ error: "url and events[] required" }, 400);
    const id = uuidv4();
    const secret = `whsec_${uuidv4().replace(/-/g, "").slice(0, 24)}`;
    await query(
      `INSERT INTO webhooks (id, user_id, project_id, url, events, secret, active) VALUES ($1,$2,$3,$4,$5,$6,true)`,
      [id, user.id, project_id || null, url, JSON.stringify(events), secret]
    );
    return c.json({ id, url, events, secret, active: true }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

extraRoutes.get("/webhooks", async (c) => {
  const user = await getUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const res = await query(
    "SELECT id, url, events, active, created_at FROM webhooks WHERE user_id = $1 ORDER BY created_at DESC",
    [user.id]
  );
  return c.json(res.rows);
});

extraRoutes.delete("/webhooks/:id", async (c) => {
  const user = await getUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  await query("DELETE FROM webhooks WHERE id = $1 AND user_id = $2", [c.req.param("id"), user.id]);
  return c.json({ message: "Deleted" });
});

// Fire webhook helper (can be called internally)
export async function fireWebhooks(event: string, payload: any) {
  try {
    const res = await query("SELECT url, secret FROM webhooks WHERE active = true AND events::text LIKE $1", [`%${event}%`]);
    for (const wh of res.rows) {
      fetch(wh.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-KotahBase-Event": event, "X-KotahBase-Secret": wh.secret },
        body: JSON.stringify({ event, payload, ts: new Date().toISOString() })
      }).catch(() => {});
    }
  } catch {}
}

// ---------- Usage / metrics ----------
extraRoutes.get("/usage", async (c) => {
  try {
    const user = await getUser(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const [projects, buckets, functions, domains, appUsers, apiCalls] = await Promise.all([
      query("SELECT COUNT(*)::int AS c FROM projects WHERE owner_id = $1", [user.id]),
      query("SELECT COUNT(*)::int AS c FROM storage_buckets WHERE owner_id = $1", [user.id]),
      query("SELECT COUNT(*)::int AS c FROM edge_functions WHERE owner_id = $1", [user.id]),
      query("SELECT COUNT(*)::int AS c FROM domains WHERE user_id = $1", [user.id]),
      query("SELECT COUNT(*)::int AS c FROM app_users au JOIN projects p ON au.project_id = p.id WHERE p.owner_id = $1", [user.id]),
      query("SELECT COUNT(*)::int AS c FROM api_logs WHERE created_at > NOW() - INTERVAL '24 hours'")
    ]);
    return c.json({
      projects: projects.rows[0].c,
      buckets: buckets.rows[0].c,
      functions: functions.rows[0].c,
      domains: domains.rows[0].c,
      app_users: appUsers.rows[0].c,
      api_calls_24h: apiCalls.rows[0].c,
      limits: {
        note: "Free tier — soft limits",
        projects: 10,
        storage_gb: 1,
        api_calls_day: 50000
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ---------- Seed sample data ----------
extraRoutes.post("/seed/:pack", async (c) => {
  try {
    const user = await getUser(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const pack = c.req.param("pack");
    if (pack === "social") {
      await query(`INSERT INTO profiles (username, display_name, bio) VALUES
        ('demo_user', 'Demo User', 'Hello from KotahBase'),
        ('jane', 'Jane Doe', 'Building on KotahBase')
        ON CONFLICT DO NOTHING`);
      await query(`INSERT INTO posts (content, likes_count) VALUES
        ('Welcome to KotahBase social!', 3),
        ('Building African backends 🚀', 7)`);
      return c.json({ message: "Social sample data seeded" });
    }
    if (pack === "game") {
      await query(`INSERT INTO game_scores (player_name, score) VALUES
        ('Ace', 1200), ('Nova', 980), ('Kai', 750)`);
      return c.json({ message: "Game sample scores seeded" });
    }
    return c.json({ error: "Unknown pack. Use social or game" }, 400);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// Ensure webhooks table
export async function ensureExtraTables() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS webhooks (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      project_id UUID,
      url TEXT NOT NULL,
      events JSONB NOT NULL,
      secret TEXT NOT NULL,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  } catch (e: any) {
    console.log("[extras]", e.message);
  }
}

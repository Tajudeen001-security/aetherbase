import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { query, queryProject } from "./db/client";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "kotahbase-dev-secret-change-me");
export const aiRoutes = new Hono();

async function authorizedProject(authHeader: string | undefined, projectId: string) {
  if (!authHeader?.startsWith("Bearer ") || !projectId) return false;
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as any;
    const user = await query("SELECT id FROM users WHERE id = $1", [payload.sub]);
    if (!user.rows.length) return false;
    const project = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [projectId, user.rows[0].id]);
    return project.rows.length > 0;
  } catch { return false; }
}

async function ensureEmbeddings(projectId: string) {
  await queryProject(projectId, `CREATE TABLE IF NOT EXISTS embeddings (
    id UUID PRIMARY KEY,
    content TEXT NOT NULL,
    embedding JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

aiRoutes.post("/embeddings", async (c) => {
  try {
    const { content, embedding, metadata, project_id: projectId } = await c.req.json();
    if (!content) return c.json({ error: "content required" }, 400);
    if (!await authorizedProject(c.req.header("Authorization"), String(projectId || ""))) return c.json({ error: "Project not found or not authorized" }, 404);
    await ensureEmbeddings(projectId);
    const id = uuidv4();
    await queryProject(projectId,
      "INSERT INTO embeddings (id, content, embedding, metadata) VALUES ($1, $2, $3, $4)",
      [id, content, embedding ? JSON.stringify(embedding) : null, metadata ? JSON.stringify(metadata) : null]
    );
    return c.json({ id, content, message: "Stored" }, 201);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

aiRoutes.get("/embeddings", async (c) => {
  try {
    const projectId = c.req.query("project_id") || "";
    if (!await authorizedProject(c.req.header("Authorization"), projectId)) return c.json({ error: "Project not found or not authorized" }, 404);
    await ensureEmbeddings(projectId);
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") || 50)));
    const res = await queryProject(projectId, "SELECT id, content, metadata, created_at FROM embeddings ORDER BY created_at DESC LIMIT $1", [limit]);
    return c.json(res.rows);
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

aiRoutes.get("/search", async (c) => {
  try {
    const projectId = c.req.query("project_id") || "";
    const q = c.req.query("q") || "";
    const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") || 10)));
    if (!q) return c.json({ error: "q required" }, 400);
    if (!await authorizedProject(c.req.header("Authorization"), projectId)) return c.json({ error: "Project not found or not authorized" }, 404);
    await ensureEmbeddings(projectId);
    const res = await queryProject(projectId,
      `SELECT id, content, metadata, created_at,
       ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) AS rank
       FROM embeddings WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC LIMIT $2`,
      [q, limit]
    );
    if (res.rows.length) return c.json({ results: res.rows, method: "fulltext" });
    const fallback = await queryProject(projectId,
      "SELECT id, content, metadata, created_at FROM embeddings WHERE content ILIKE $1 ORDER BY created_at DESC LIMIT $2",
      [`%${q}%`, limit]
    );
    return c.json({ results: fallback.rows, method: "ilike" });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

aiRoutes.delete("/embeddings/:id", async (c) => {
  try {
    const projectId = c.req.query("project_id") || "";
    if (!await authorizedProject(c.req.header("Authorization"), projectId)) return c.json({ error: "Project not found or not authorized" }, 404);
    await ensureEmbeddings(projectId);
    await queryProject(projectId, "DELETE FROM embeddings WHERE id = $1", [c.req.param("id")]);
    return c.json({ message: "Deleted" });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

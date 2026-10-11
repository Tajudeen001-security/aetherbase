import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { query } from "./db/client";

export const aiRoutes = new Hono();

aiRoutes.post("/embeddings", async (c) => {
  try {
    const { content, embedding, metadata } = await c.req.json();
    if (!content) return c.json({ error: "content required" }, 400);
    const id = uuidv4();
    await query(
      `INSERT INTO embeddings (id, content, embedding, metadata) VALUES ($1, $2, $3, $4)`,
      [id, content, embedding ? JSON.stringify(embedding) : null, metadata ? JSON.stringify(metadata) : null]
    );
    return c.json({ id, content, message: "Stored" }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

aiRoutes.get("/embeddings", async (c) => {
  try {
    const limit = Math.min(Number(c.req.query("limit") || 50), 200);
    const res = await query(
      `SELECT id, content, metadata, created_at FROM embeddings ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return c.json(res.rows);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

aiRoutes.get("/search", async (c) => {
  try {
    const q = c.req.query("q") || "";
    const limit = Math.min(Number(c.req.query("limit") || 10), 50);
    if (!q) return c.json({ error: "q required" }, 400);

    try {
      const res = await query(
        `SELECT id, content, metadata, created_at,
                ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) as rank
         FROM embeddings
         WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
         ORDER BY rank DESC LIMIT $2`,
        [q, limit]
      );
      if (res.rows.length > 0) return c.json({ results: res.rows, method: "fulltext" });
    } catch {}

    const fallback = await query(
      `SELECT id, content, metadata, created_at FROM embeddings
       WHERE content ILIKE $1 ORDER BY created_at DESC LIMIT $2`,
      [`%${q}%`, limit]
    );
    return c.json({ results: fallback.rows, method: "ilike" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

aiRoutes.delete("/embeddings/:id", async (c) => {
  try {
    await query("DELETE FROM embeddings WHERE id = $1", [c.req.param("id")]);
    return c.json({ message: "Deleted" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

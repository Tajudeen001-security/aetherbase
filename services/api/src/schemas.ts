import { Hono } from "hono";
import { query, queryProject } from "./db/client";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "kotahbase-dev-secret-change-me");
async function getOwnerProject(authHeader: string | undefined, projectId: string) {
  if (!authHeader?.startsWith("Bearer ") || !projectId) return null;
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as any;
    const user = await query("SELECT id FROM users WHERE id = $1", [payload.sub]);
    if (!user.rows.length) return null;
    const project = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [projectId, user.rows[0].id]);
    return project.rows[0] || null;
  } catch { return null; }
}

export const schemaRoutes = new Hono();

const SOCIAL_SQL = `
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID,
  content TEXT NOT NULL,
  media_url TEXT,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID,
  author_id UUID,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID,
  following_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID,
  receiver_id UUID,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  type TEXT,
  content TEXT,
  is_read BOOLEAN DEFAULT false,
  related_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

const GAME_SQL = `
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  username TEXT UNIQUE,
  avatar_url TEXT,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  game_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS game_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host_id UUID,
  status TEXT DEFAULT 'open',
  max_players INTEGER DEFAULT 8,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS room_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID,
  player_id UUID,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, player_id)
);
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID,
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

schemaRoutes.get("/packs", (c) => {
  return c.json({
    packs: [
      {
        id: "social",
        name: "Social Media",
        description: "profiles, posts, likes, comments, follows, messages, notifications",
        tables: ["profiles", "posts", "likes", "comments", "follows", "messages", "notifications"]
      },
      {
        id: "game",
        name: "Games",
        description: "players, scores, rooms, room_players, inventory",
        tables: ["players", "game_scores", "game_rooms", "room_players", "inventory"]
      }
    ]
  });
});

schemaRoutes.post("/packs/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const projectId = String(body.project_id || "");
    const owned = await getOwnerProject(c.req.header("Authorization"), projectId);
    if (!owned) return c.json({ error: "Project not found or not authorized" }, 404);
    let sql = "";
    if (id === "social") sql = SOCIAL_SQL;
    else if (id === "game") sql = GAME_SQL;
    else return c.json({ error: "Unknown pack. Use social or game" }, 400);

    // Run each statement
    const statements = sql.split(";").map(s => s.trim()).filter(s => s.length > 10);
    const created: string[] = [];
    for (const stmt of statements) {
      await queryProject(projectId, stmt);
      const match = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
      if (match) created.push(match[1]);
    }

    return c.json({
      success: true,
      pack: id,
      tables_created: created,
      message: `${id} pack installed. Tables are ready.`
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

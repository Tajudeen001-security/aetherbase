export const SQL_EXAMPLES = {
  createTable: `CREATE TABLE IF NOT EXISTS my_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);`,
  insertRow: `INSERT INTO my_items (title, body)
VALUES ('Hello', 'First row');
`,
  selectRows: `SELECT * FROM my_items ORDER BY created_at DESC LIMIT 20;`,
  updateRow: `UPDATE my_items SET title = 'Updated' WHERE title = 'Hello';`,
  deleteRow: `DELETE FROM my_items WHERE title = 'Hello';`
};

export const PACK_INFO = [
  {
    id: "social",
    name: "Social Media Pack",
    desc: "profiles, posts, likes, comments, follows, messages, notifications",
    tables: ["profiles", "posts", "likes", "comments", "follows", "messages", "notifications"]
  },
  {
    id: "game",
    name: "Games Pack",
    desc: "players, scores, rooms, inventory",
    tables: ["players", "game_scores", "game_rooms", "room_players", "inventory"]
  }
];

import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/", (c) => {
  return c.json({
    name: "KoraBase API",
    version: "0.1.0",
    status: "ok",
    message: "Welcome to KoraBase — Backend for apps, websites & games"
  });
});

app.get("/health", (c) => {
  return c.json({ status: "healthy" });
});

// Auth routes (email only) - placeholders
app.post("/auth/v1/signup", async (c) => {
  const body = await c.req.json();
  // TODO: implement email + password signup
  return c.json({ message: "Signup endpoint — coming soon", email: body.email });
});

app.post("/auth/v1/token", async (c) => {
  // TODO: login
  return c.json({ message: "Login endpoint — coming soon" });
});

app.post("/auth/v1/magiclink", async (c) => {
  // TODO: magic link
  return c.json({ message: "Magic link endpoint — coming soon" });
});

// Database placeholder
app.get("/rest/v1/:table", (c) => {
  return c.json({ message: "Database REST API — coming soon", table: c.req.param("table") });
});

// Storage placeholder
app.get("/storage/v1/object/:bucket/*", (c) => {
  return c.json({ message: "Storage — coming soon" });
});

const port = Number(process.env.PORT) || 4000;

console.log(`KoraBase API running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port
});

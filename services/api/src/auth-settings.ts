/**
 * Dashboard-facing Auth settings for a project (Supabase-style)
 * GET/PUT /projects/:id/auth
 */
import { Hono } from "hono";
import { query } from "./db/client";
import { projectUrl } from "./project-client";

export function mountAuthSettings(app: any, getUserFromToken: (h: string | undefined) => Promise<any>) {
  app.get("/projects/:id/auth", async (c: any) => {
    const user = await getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const id = c.req.param("id");
    const res = await query(
      `SELECT id, name, ref,
              google_client_id, github_client_id, discord_client_id, microsoft_client_id,
              CASE WHEN google_client_secret IS NOT NULL AND google_client_secret <> '' THEN true ELSE false END AS google_secret_set,
              CASE WHEN github_client_secret IS NOT NULL AND github_client_secret <> '' THEN true ELSE false END AS github_secret_set,
              CASE WHEN discord_client_secret IS NOT NULL AND discord_client_secret <> '' THEN true ELSE false END AS discord_secret_set,
              CASE WHEN microsoft_client_secret IS NOT NULL AND microsoft_client_secret <> '' THEN true ELSE false END AS microsoft_secret_set,
              redirect_url, site_url, additional_redirect_urls,
              COALESCE(enable_email, true) AS enable_email,
              COALESCE(enable_google, true) AS enable_google,
              COALESCE(enable_github, true) AS enable_github,
              COALESCE(enable_discord, false) AS enable_discord,
              COALESCE(enable_microsoft, false) AS enable_microsoft
       FROM projects WHERE id = $1 AND owner_id = $2`,
      [id, user.id]
    );
    if (res.rows.length === 0) return c.json({ error: "Not found" }, 404);
    const p = res.rows[0];
    let extra = p.additional_redirect_urls;
    if (typeof extra === "string") {
      try { extra = JSON.parse(extra); } catch { extra = []; }
    }
    if (!Array.isArray(extra)) extra = [];
    return c.json({
      project_id: p.id,
      name: p.name,
      ref: p.ref,
      site_url: p.site_url || "",
      redirect_url: p.redirect_url || "",
      additional_redirect_urls: extra,
      enable_email: p.enable_email,
      enable_google: p.enable_google,
      enable_github: p.enable_github,
      enable_discord: p.enable_discord,
      enable_microsoft: p.enable_microsoft,
      google_client_id: p.google_client_id || "",
      google_secret_set: p.google_secret_set,
      github_client_id: p.github_client_id || "",
      github_secret_set: p.github_secret_set,
      discord_client_id: p.discord_client_id || "",
      discord_secret_set: p.discord_secret_set,
      microsoft_client_id: p.microsoft_client_id || "",
      microsoft_secret_set: p.microsoft_secret_set,
      callback_urls: {
        google: p.ref ? `${projectUrl(p.ref)}/auth/v1/callback/google` : null,
        github: p.ref ? `${projectUrl(p.ref)}/auth/v1/callback/github` : null,
        discord: p.ref ? `${projectUrl(p.ref)}/auth/v1/callback/discord` : null,
        microsoft: p.ref ? `${projectUrl(p.ref)}/auth/v1/callback/microsoft` : null
      },
      authorize_urls: {
        google: p.ref ? `${projectUrl(p.ref)}/auth/v1/authorize/google` : null,
        github: p.ref ? `${projectUrl(p.ref)}/auth/v1/authorize/github` : null,
        discord: p.ref ? `${projectUrl(p.ref)}/auth/v1/authorize/discord` : null,
        microsoft: p.ref ? `${projectUrl(p.ref)}/auth/v1/authorize/microsoft` : null
      }
    });
  });

  app.put("/projects/:id/auth", async (c: any) => {
    try {
      const user = await getUserFromToken(c.req.header("Authorization"));
      if (!user) return c.json({ error: "Not authenticated" }, 401);
      const id = c.req.param("id");
      const body = await c.req.json();
      const proj = await query("SELECT id FROM projects WHERE id = $1 AND owner_id = $2", [id, user.id]);
      if (proj.rows.length === 0) return c.json({ error: "Project not found" }, 404);

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      const strFields = [
        "google_client_id",
        "google_client_secret",
        "github_client_id",
        "github_client_secret",
        "discord_client_id",
        "discord_client_secret",
        "microsoft_client_id",
        "microsoft_client_secret",
        "redirect_url",
        "site_url"
      ];
      for (const key of strFields) {
        if (body[key] !== undefined) {
          // empty secret means "don't change" for secrets
          if ((key === "google_client_secret" || key === "github_client_secret" || key === "discord_client_secret" || key === "microsoft_client_secret") && body[key] === "") continue;
          updates.push(`${key} = $${idx++}`);
          values.push(body[key] === "" ? null : body[key]);
        }
      }

      if (body.additional_redirect_urls !== undefined) {
        const arr = Array.isArray(body.additional_redirect_urls)
          ? body.additional_redirect_urls.filter((x: any) => typeof x === "string" && x.trim())
          : [];
        updates.push(`additional_redirect_urls = $${idx++}`);
        values.push(JSON.stringify(arr));
      }

      for (const key of ["enable_email", "enable_google", "enable_github", "enable_discord", "enable_microsoft"]) {
        if (body[key] !== undefined) {
          updates.push(`${key} = $${idx++}`);
          values.push(!!body[key]);
        }
      }

      if (!updates.length) return c.json({ error: "Nothing to update" }, 400);
      values.push(id);
      await query(`UPDATE projects SET ${updates.join(", ")} WHERE id = $${idx}`, values);
      return c.json({ message: "Auth settings saved" });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });
}

export async function ensureAuthColumns() {
  const cols = [
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_url TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS additional_redirect_urls JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS enable_email BOOLEAN DEFAULT true`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS enable_google BOOLEAN DEFAULT true`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS enable_github BOOLEAN DEFAULT true`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS discord_client_id TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS discord_client_secret TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS enable_discord BOOLEAN DEFAULT false`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS microsoft_client_id TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS microsoft_client_secret TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS enable_microsoft BOOLEAN DEFAULT false`
  ];
  for (const sql of cols) {
    try {
      await query(sql);
    } catch {}
  }
}

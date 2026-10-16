# KotahBase

**Your app's backend: database, authentication, APIs, and storage — designed for developers in Nigeria and beyond.**

### Current prototype capabilities
- Auth → Email + Password + 6-digit code
- Projects → Create/select projects, project reference, API URL and keys
- Database → Real Postgres + REST API
- Storage → S3-compatible storage adapter (configure credentials as deployment environment variables)

---

## Local Development

```bash
git clone https://github.com/Tajudeen001-security/aetherbase.git
cd kotahbase

# Start Postgres + MinIO
cd infra && docker compose up -d

# API
cd ../services/api
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

API → http://localhost:4000

---

## Deploy to Render (you said you have it)

1. Go to https://dashboard.render.com
2. Click **New** → **Blueprint**
3. Connect the GitHub repo `Tajudeen001-security/aetherbase`
4. Render will read the `render.yaml` file automatically
5. Add your S3/R2 keys later (or use MinIO temporarily)

I already prepared the `render.yaml` for you.

Just tell me when you create the Render service and I will help you finish the environment variables.


## Architecture and roadmap

See [Platform Architecture](docs/PLATFORM_ARCHITECTURE.md) for the project lifecycle, domain/DNS plan, usage metrics, security priorities, and the isolation work required before production use.

**Production readiness:** KotahBase now provisions a dedicated PostgreSQL schema for each project, scopes the project REST/SQL paths to that schema, and stores request metrics/logs in PostgreSQL. This is an important MVP boundary, not a substitute for database-role isolation, row-level policies, adversarial tenant-isolation tests, backups/restore drills, and a security review. Rotate the previously exposed storage credentials at the provider immediately; source-code fallbacks have been removed.

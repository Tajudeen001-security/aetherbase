# KotahBase

**Your app's backend: database, authentication, APIs, and storage — designed for developers in Nigeria and beyond.**

### Current prototype capabilities
- Auth → Email/password verification, Google, GitHub, Discord, and Microsoft/Azure OAuth for project users
- Projects → Create/select/delete projects, project reference, key rotation, and project API URL
- Database → PostgreSQL schema per project, SQL editor, REST-style CRUD (public-key CRUD denied until RLS policies exist), and social/game starter schemas
- Storage → Project-scoped S3-compatible object storage, signed downloads, upload/list/delete controls
- Observability → Persistent per-project API request counts, response egress estimates, status codes, latency, and request logs
- Realtime → Project-authenticated WebSocket connections with project-scoped rooms
- AI utilities → Project-scoped embeddings and text search

---

## Local Development

```bash
git clone https://github.com/Tajudeen001-security/aetherbase.git
cd aetherbase

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

## Deploy to Render

1. Go to https://dashboard.render.com
2. Choose **New → Blueprint**.
3. Connect `Tajudeen001-security/aetherbase`.
4. Render reads the repository's `render.yaml`.
5. Configure production secrets and database/storage resources in the Render dashboard; never commit real credentials.

## JagX Connect migration

Use the dedicated [JagX Connect migration runbook](docs/JAGX_CONNECT_MIGRATION.md) before moving the website or Flutter app from Supabase. It covers source inventory, schema and identity mapping, Tigris media migration, authorization checks, reconciliation, staged cutover, and rollback.

**Important:** KotahBase is an MVP, not yet a production-verified drop-in Supabase replacement. It provisions per-project PostgreSQL schemas and scopes project API operations, but production use still requires database-role isolation, row-level policies, cross-tenant security tests, verified backups/restores, and a security review. Keep the original Supabase project and data intact until migration acceptance checks pass.

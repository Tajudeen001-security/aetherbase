# KotahBase Platform Architecture

KotahBase aims to provide a Supabase-style backend workspace for applications, websites, and games, with infrastructure choices that work for Nigerian developers and global users.

## Product experience

1. Sign in or create an account.
2. If the account has no projects, show a focused **Create your first project** step.
3. If projects already exist, show a **Project picker** first. A user chooses a project or creates another one before entering its console.
4. Each project console should provide Overview, Database, SQL editor, Authentication, Storage, API keys, Logs, Usage, and Settings.
5. The project API URL, public client key, and secret server key are shown in the API section. Secret keys must never be included in client-side examples.

## URL and domain plan

Do not hard-code a made-up domain into the platform. The actual domain should be selected and registered before DNS is configured.

Recommended production layout after a domain is owned:
- `app.<owned-domain>` — dashboard and project picker.
- `api.<owned-domain>` — shared API gateway and project API traffic.
- `<project-ref>.api.<owned-domain>` — preferred Supabase-style project endpoint, using wildcard DNS and a valid wildcard TLS certificate.
- `docs.<owned-domain>` — documentation and SDK guides.
- `status.<owned-domain>` — service health and incident updates.

Until wildcard DNS and TLS are configured, keep the existing API URL format and project reference routing. The current implementation uses `API_URL/p/<project-ref>`; a future gateway resolver should map a project reference to its isolated resources and preserve backwards compatibility during migration.

DNS plan:
1. Register the chosen domain.
2. Point dashboard DNS to the frontend host.
3. Point API DNS to the backend host or edge gateway.
4. Configure wildcard DNS for project subdomains only when the gateway supports resolving project refs safely.
5. Provision TLS, HTTPS redirects, health checks, and rate limits.
6. Verify OAuth callback URLs, CORS allow-lists, SDK examples, and old project URLs before switching the default.

## Project isolation requirement

KotahBase now provisions a PostgreSQL schema derived from each project's immutable UUID, routes project REST/SQL/template/embedding operations through a per-project search path, and blocks schema-qualified access in the project SQL editor. Public client keys are denied database CRUD by default until row-level policy support is available. This is an MVP isolation layer—not production-grade tenant isolation by itself. The API still uses a shared database connection role, so database-role separation, strict privilege grants, RLS policy management, migration isolation tests, and adversarial cross-tenant tests remain mandatory before production claims.

Existing legacy tables in PostgreSQL `public` are not automatically migrated into per-project schemas because the old records do not reliably identify a single owning project. Back up legacy data and migrate it explicitly into the correct project schema before deleting or repurposing any old tables.

Target design:
- One control-plane database for platform accounts, projects, billing/plan metadata, key hashes, and resource mapping.
- A separate database or safely isolated database/schema per project, chosen after load and operations testing.
- All project data requests resolve the project reference and API key, then use only that project's database context.
- Never expose service-role credentials to browser/mobile clients.
- Encrypt OAuth provider secrets and protect API keys at rest; keep encryption keys outside the database and rotate keys safely.
- Enforce authorization and row-level access policies server-side; deny access by default.
- Add migration, backup/restore, deletion, and recovery workflows for project resources.
- Scope storage objects by project and verify project ownership on every upload, download, and delete.

## Usage and reliability metrics

Dashboard metrics should include:
- API requests total.
- Successful requests (2xx–3xx).
- Failed requests (4xx–5xx), with status-code breakdown.
- Egress bytes/MB measured from response payloads, plus storage egress when the provider exposes reliable usage data.
- Database query count/latency and errors.
- Storage upload/download count and failures.
- Auth signups, logins, verification failures, and OAuth failures.
- Current service status, uptime, latency percentiles, and rate-limit events.

Request counters and request logs are now persisted in PostgreSQL per project, including method, path, status code, response bytes, latency, and timestamp. Egress currently measures API response payload bytes only, not full network transfer, CDN/storage downloads, retries, or all gateway overhead. Before billing or quotas, add idempotent event IDs, aggregation/retention jobs, provider-side storage egress, and reconciliation.


## Supabase-style capability map

### Available in the current prototype
- Account email/password signup and email verification flow.
- Project picker, project creation, project refs, public/secret key display, and project API URL.
- PostgreSQL project schemas and SQL editor scoped to a selected project.
- REST-style CRUD endpoints, currently restricted to the server-only service-role key until RLS policies exist.
- Authentication providers: email/password, Google OAuth, GitHub OAuth, Discord OAuth, and Microsoft/Azure OAuth configuration per project.
- Object storage configuration through deployment environment variables, per-project object prefixes, upload/list/download-signed-URL/delete controls (25 MB dashboard upload cap).
- Persistent request metrics and request logs.
- Starter schema packs for social and game data; embeddings/search endpoints scoped to authenticated projects.

### Planned parity features, in priority order
1. **Database:** visual table editor, columns/types/defaults, foreign keys, indexes, SQL history, migrations, schema diff, import/export CSV/SQL, backups and point-in-time restore.
2. **Security:** RLS enable/disable and policy builder, role grants, JWT claims, secret-key rotation UI, audit trail, rate limits, abuse detection, tenant-boundary automated tests.
3. **Authentication:** password reset, email change, magic links, OTP, phone/SMS, sessions and refresh tokens, MFA/TOTP, account linking, invite flow, custom SMTP, OAuth providers for Apple, Microsoft/Azure, Discord, GitLab and others as integrations are implemented and tested.
4. **Storage:** bucket creation, public/private policy controls, object metadata, resumable multipart uploads, signed uploads/downloads, image transformations, lifecycle rules, per-project quotas and provider egress reporting.
5. **Realtime:** authenticated WebSocket channels, broadcast, presence, database change streams, topic permissions, reconnection and durable event delivery.
6. **Server-side compute:** Edge Functions, scheduled jobs/cron, queues, webhooks with signed delivery/retries, secrets management, local CLI and deployment logs.
7. **AI/vector:** optional pgvector-backed embeddings, indexes, hybrid search, document ingestion, and project-scoped retrieval. Do not require an external AI key for ordinary database/auth/storage functions.
8. **Observability:** searchable request logs, traces, p50/p95/p99 latency, database slow-query reports, auth/security events, uptime/incident status and alert destinations.
9. **Developer workflow:** TypeScript/JavaScript SDK, REST/OpenAPI docs, generated database types, local emulator, GitHub integration, preview environments and one-click migration/import tooling.
10. **Operations:** custom domains, TLS automation, project deletion/export, regional placement, backup verification, usage limits, transparent free/pro tiers and service health reporting.

A feature is not considered complete because a button or route exists: it needs authorization tests, tenant-isolation tests, documented limits, observability, and a verified deployment.

## Build order

1. **Stability and security:** rotate exposed storage credentials at the provider, remove source-code fallbacks, validate login inputs, use deployment environment variables, and align dashboard/API URLs.
2. **Project lifecycle:** project picker, create/select project, per-project URL and key display, project deletion and safe key rotation.
3. **Isolation:** provision per-project database resources and remove shared-schema access from user-facing project operations.
4. **Observability:** durable per-project usage, request logs, latency/error breakdowns, database and storage telemetry.
5. **Core backend:** production-ready Postgres API, migrations, backups, RLS/policy tooling, authentication providers, signed storage URLs.
6. **Developer experience:** typed SDKs, copy-paste quickstarts, API reference, local development CLI, import/migration tools.
7. **Scale and trust:** rate limits, abuse prevention, alerts, status page, restore drills, security review, load tests, documented service limits.

KotahBase should compete on reliability, clear developer experience, transparent usage, and a safe project isolation model—not merely on matching a long feature list.

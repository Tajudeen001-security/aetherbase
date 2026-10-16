# AetherBase Platform Architecture

AetherBase aims to provide a Supabase-style backend workspace for applications, websites, and games, with infrastructure choices that work for Nigerian developers and global users.

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

A project reference and API keys alone do not provide database isolation. Before production claims or paid plans, each project must have isolated data access. The current code still has dashboard database operations that query the shared PostgreSQL `public` schema, so project-level database isolation is an unfinished critical milestone.

Target design:
- One control-plane database for platform accounts, projects, billing/plan metadata, key hashes, and resource mapping.
- A separate database or safely isolated database/schema per project, chosen after load and operations testing.
- All project data requests resolve the project reference and API key, then use only that project's database context.
- Never expose service-role credentials to browser/mobile clients.
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

The initial request meter is process-local beta telemetry and resets when the API restarts. It is useful for validating the dashboard UI, but it is not durable billing-grade usage. Before usage-based billing or quotas, persist usage events/aggregates, define exact byte accounting, prevent duplicate counting, and add retention/aggregation jobs.

## Build order

1. **Stability and security:** rotate exposed storage credentials, remove source-code fallbacks, validate login inputs, use deployment environment variables, and align dashboard/API URLs.
2. **Project lifecycle:** project picker, create/select project, per-project URL and key display, project deletion and safe key rotation.
3. **Isolation:** provision per-project database resources and remove shared-schema access from user-facing project operations.
4. **Observability:** durable per-project usage, request logs, latency/error breakdowns, database and storage telemetry.
5. **Core backend:** production-ready Postgres API, migrations, backups, RLS/policy tooling, authentication providers, signed storage URLs.
6. **Developer experience:** typed SDKs, copy-paste quickstarts, API reference, local development CLI, import/migration tools.
7. **Scale and trust:** rate limits, abuse prevention, alerts, status page, restore drills, security review, load tests, documented service limits.

AetherBase should compete on reliability, clear developer experience, transparent usage, and a safe project isolation model—not merely on matching a long feature list.

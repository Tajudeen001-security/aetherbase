# JagX Connect migration plan (Supabase → KotahBase)

This runbook is for migrating the live JagX Connect website and Flutter app to KotahBase. It is deliberately conservative: **do not delete, modify, pause, or overwrite the source Supabase project during preparation**. A backend switch is not approved until the acceptance checks below pass.

## Current status

- [ ] KotahBase production API and dashboard URLs confirmed from live health checks.
- [ ] Dedicated KotahBase project created for JagX Connect; save its project ref and API URL.
- [ ] Project database isolation, public-key restrictions, and authorization tested.
- [ ] Source schema and row counts inventoried from Supabase.
- [ ] Destination schema created and reviewed.
- [ ] Data export encrypted and stored privately.
- [ ] Data imported and row counts/references verified.
- [ ] Media copied to Tigris and every copied object verified.
- [ ] Authentication migration plan tested with real test accounts.
- [ ] Website and Flutter builds tested without changing production endpoints.
- [ ] Rollback procedure rehearsed.
- [ ] Cutover approved.

## Architecture decision

Use KotahBase as the future application backend, PostgreSQL for structured data, and Tigris/S3-compatible storage for media. Keep media object keys and metadata in PostgreSQL, not file bytes. Do not assume that replacing Supabase requires copying Supabase's internal auth tables or storage system tables.

KotahBase currently has an MVP project API and per-project PostgreSQL schema. Its README explicitly notes that this is not yet a substitute for database-role isolation, RLS, adversarial tenant-isolation tests, backup/restore drills, and a security review. Treat the project as **migration staging only** until these checks are complete.

## Phase 1 — Inventory the source (read-only)

From Supabase SQL Editor, run read-only inventory queries and save the results privately. Never put credentials, user emails, tokens, or exported records into GitHub issues or commits.

List public tables:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
```

List columns and types:

```sql
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

List foreign keys:

```sql
select tc.table_name, kcu.column_name, ccu.table_name as foreign_table_name,
       ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.constraint_schema = kcu.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
order by tc.table_name, kcu.column_name;
```

Record row counts for every application table. Include policies, indexes, triggers, views, functions, enums, realtime publication membership, and storage buckets separately. Identify user-owned data and service/admin-only data. Do not export Supabase internal schemas as if they were application tables.

Likely JagX Connect areas to check (confirm actual names in the source rather than creating blindly): profiles, posts/media metadata, comments/reactions, follows, chats/messages/group membership/read receipts, notifications, business verification, TravelPass requests/payments, wallet/coin ledger, subscriptions, reports/moderation, support requests, and app settings.

## Phase 2 — Prepare the destination

1. Create a separate KotahBase project named `JagX Connect`; do not use the platform's own control-plane tables as app data.
2. Save the project reference, API URL, public client key, and service-role key in a private password manager. The service-role key must never be placed in web or Flutter client code.
3. Create destination tables using explicit UUIDs where possible so relationships survive migration. Preserve timestamps, status values, and stable IDs. Recreate unique constraints, foreign keys, indexes, and check constraints.
4. Define authorization policies before exposing any user data. Public/anonymous keys must not read or write private user, chat, wallet, payment, identity, or verification records.
5. Test that a key from a different KotahBase project cannot read or write this project's data. If this isolation test fails, stop and do not migrate production data.
6. Configure Tigris bucket access using server-side environment variables. Never commit access keys. Keep the bucket private by default; use short-lived signed URLs or an authenticated proxy for private media.
7. Verify upload, download, delete authorization, maximum size, content type checks, and orphan cleanup before copying old media.

## Phase 3 — Authentication

Do not copy Supabase internal auth tables directly into application tables. Do not assume password hashes or active sessions are portable.

Choose and test one supported strategy:
- Keep Supabase Auth temporarily while migrating application data, if Supabase service is available and this is operationally acceptable; or
- Have users sign in through a controlled account-recovery/password-reset flow on KotahBase; or
- Implement and test a reviewed password-hash migration only if the source hash format and verification behavior are known and supported.

Preserve stable application user IDs where possible and maintain a private mapping between source auth user IDs and destination user IDs. Test email verification, duplicate emails, Google OAuth account linking, password reset, expired sessions, sign-out, and account deletion. Never mark an account verified solely because an imported row says so unless the source record is trusted and the policy has been reviewed.

## Phase 4 — Import in dependency order

Use a private, encrypted export. Import into a staging destination first, in transactions/batches with repeatable upserts and a migration run ID. Suggested dependency order:

1. Reference/lookup tables and app configuration.
2. User identity mapping and profiles.
3. Business/government verification records (restrict access).
4. Posts and media metadata.
5. Comments, reactions, follows, and other post relations.
6. Conversations, memberships, messages, read receipts.
7. Notifications and preferences.
8. TravelPass requests and document metadata.
9. Wallet/coin ledger, subscriptions, payments, boosts, and purchase records.
10. Support/moderation records and remaining tables.

Do not invent balances, payment states, verification results, or ownership when a source row cannot be mapped. Put unresolved rows in a private exception report for manual review. Treat financial records as append-only where possible; do not recompute balances from incomplete history.

## Phase 5 — Verify before cutover

For each table compare source and destination:
- row counts;
- primary-key counts and duplicate IDs;
- null counts for required fields;
- foreign-key/orphan counts;
- representative record checksums or field-by-field samples;
- timestamps and status values;
- ownership and authorization behavior.

For media compare source and destination object counts, byte sizes, MIME types, and checksums where available. Test old media URLs and replace references only after each destination object is confirmed.

Run functional tests on both the website and Flutter app: signup/login/recovery, feed, profile, post/media upload, follows, chat and group permissions, notifications, TravelPass, wallet ledger, subscriptions/payments, business verification, account deletion, and admin-only screens.

## Phase 6 — Cutover and rollback

1. Announce a short write-freeze or define a final delta-sync strategy.
2. Take a final source backup/export and record its timestamp.
3. Apply final deltas; repeat reconciliation.
4. Switch one controlled staging deployment to KotahBase and test it with test accounts.
5. Cut over production only after all acceptance checks pass and an operator explicitly approves.
6. Keep Supabase project, exports, and old media intact during the agreed rollback window. Do not delete or repurpose the source.
7. If login, data integrity, permissions, or media access fails, switch application configuration back to the previous backend and investigate. Avoid dual-writing unless conflict resolution and idempotency have been implemented.

## Required go/no-go checks

- [ ] Cross-project tenant-isolation tests pass.
- [ ] No service-role key is bundled in web/Flutter assets.
- [ ] No anonymous access to private chats, wallets, identity documents, or payment records.
- [ ] Authentication/recovery works for migrated test users.
- [ ] Every imported table reconciles and exceptions are accounted for.
- [ ] Tigris media object verification passes.
- [ ] Backups and rollback restore have been tested.
- [ ] Website and Flutter acceptance tests pass.
- [ ] Production cutover explicitly approved.

**Never report migration complete merely because an export/import command succeeded.** Completion means the data, relationships, auth, authorization, files, and rollback have all been verified.

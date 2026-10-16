# KotahBase deployment environment

Set these in the API hosting provider's secret/environment settings, not in source code.

## Required in production

- `DATABASE_URL` — PostgreSQL connection string.
- `JWT_SECRET` — long random secret used to sign account and app-user tokens. Never use the development fallback in production.
- `API_URL` — public HTTPS base URL of the API, currently expected to be `https://kotahbase-api.onrender.com`.
- `DASHBOARD_URL` — dashboard redirect URL. Until a KotahBase-owned domain is configured, keep the actual deployed dashboard alias: `https://aetherbase-six.vercel.app`.

## Storage provider

Configure all of these only in the API host's secret settings:

- `S3_ENDPOINT` — provider's S3-compatible endpoint.
- `S3_ACCESS_KEY` — storage access key.
- `S3_SECRET_KEY` — storage secret key.
- `S3_BUCKET` — bucket name, for example `kotahbase-files`.
- `S3_REGION` — provider region, when required.
- `S3_PUBLIC_URL` — optional public base URL. Private downloads use short-lived signed URLs.

Storage credentials that were previously committed in source must be revoked/rotated at the provider. Removing the source fallback does not invalidate a provider credential or remove it from Git history.

## Platform-owner OAuth (optional)

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

These variables are for signing in to the KotahBase dashboard. App-user OAuth providers configured inside each project are stored in that project's Auth settings.

## Verification after changing environment variables

1. Redeploy/restart the API service.
2. Check `GET /health` for database status and whether storage is configured.
3. Test signup/login, create a project, create a table in its SQL editor, and verify another project cannot see that table.
4. Upload/download/delete a small file and inspect project request logs.
5. Verify OAuth callback URLs match the provider's configured redirect URLs.

Do not treat a successful frontend deployment as proof that the API has deployed or that storage credentials work.

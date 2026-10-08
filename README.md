# KotahBase

**Simple, cheap backend for apps, websites & games.**

### Features ready now
- Auth → Email + Password + 6-digit code
- Projects → Name + Project Password + API Key
- Database → Real Postgres + REST API
- Storage → File upload (MinIO / S3 compatible)

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

## Deploy to Render (you said you have it)

1. Go to https://dashboard.render.com
2. Click **New** → **Blueprint**
3. Connect the GitHub repo `Tajudeen001-security/aetherbase`
4. Render will read the `render.yaml` file automatically
5. Add your S3/R2 keys later (or use MinIO temporarily)

I already prepared the `render.yaml` for you.

Just tell me when you create the Render service and I will help you finish the environment variables.

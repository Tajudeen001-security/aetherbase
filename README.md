# KotahBase

**Simple, cheap backend for apps, websites & games.**

### Auth
- Sign up → Email + Password → 6-digit code verification
- Login → Email + Password
- Projects → Name + Project Password + auto API Key

### Current Status

✅ Auth (Email + Password + 6-digit code)  
✅ Real Postgres database  
✅ Projects system  
✅ Basic Database REST API  
🔄 Storage (next)  
🔄 Realtime (next)  
🔄 Dashboard UI (next)

---

## Local Setup

```bash
git clone https://github.com/Tajudeen001-security/aetherbase.git
cd aetherbase

# 1. Start Postgres + MinIO
cd infra
docker compose up -d

# 2. Setup API
cd ../services/api
cp .env.example .env
npm install

# 3. Run migrations
npm run db:migrate

# 4. Start server
npm run dev
```

API → http://localhost:4000

### Quick Test

**Sign up:**
```bash
curl -X POST http://localhost:4000/auth/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123"}'
```

Check terminal for the 6-digit code, then:

```bash
curl -X POST http://localhost:4000/auth/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","code":"123456"}'
```

# KotahBase

**The simple, cheap backend platform for apps, websites & games.**

### Authentication
- Email + **6-digit code** only (no magic link, no password login for users)

### Projects
Every project has:
- Project **Name**
- Project **Password**
- Auto-generated API Key

---

## Current Status

✅ Auth with 6-digit code  
✅ Create Project (name + password)  
✅ SDK updated  
🔄 Database (next)  
🔄 Storage (next)  
🔄 Realtime (next)  
🔄 Dashboard UI (next)

---

## Local Development

```bash
git clone https://github.com/Tajudeen001-security/aetherbase.git
cd aetherbase

# Start Postgres + MinIO
cd infra && docker compose up -d

# Start API
cd ../services/api
npm install
npm run dev
```

API → http://localhost:4000

### Test Auth quickly

1. Request code:
```bash
curl -X POST http://localhost:4000/auth/v1/otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

2. Check terminal for the 6-digit code, then verify:
```bash
curl -X POST http://localhost:4000/auth/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"123456"}'
```

---

You have Render ready — tell me when you want me to prepare the deployment files.

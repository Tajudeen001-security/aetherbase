# KotahBase

**The simple, cheap backend platform for apps, websites & games.**

KotahBase is a practical alternative to Firebase and Supabase.

### Core Features (v1)
- **Authentication** — Email + Password + Magic Link only
- **Database** — Postgres with Realtime
- **Storage** — File & media hosting (perfect for game assets)
- **Realtime** — Live updates, presence, multiplayer rooms
- **Hosting** — Static websites + serverless functions

### Why KotahBase?
- Cheap pricing
- Built for games + normal apps + websites
- Low-stress to run and maintain
- Clean developer experience

### Current Status
Active development. Core foundation is live.

---

## Project Structure

```
kotahbase/
├── apps/
│   └── dashboard/          # Admin dashboard (Next.js)
├── packages/
│   └── sdk/                # JavaScript/TypeScript SDK
├── services/
│   └── api/                # Main API (Hono)
└── infra/                  # Docker, local development
```

## Local Development

```bash
# Start database + storage
cd infra
docker compose up -d

# Start API
cd services/api
npm install
npm run dev
```

API will run on http://localhost:4000

## License
MIT

# KoraBase

**The open backend platform for apps, websites & games.**

KoraBase is a simple, cheap, and powerful alternative to Firebase and Supabase.

### Core Features (v1)
- **Authentication** — Email + Password + Magic Link only
- **Database** — Postgres with Realtime subscriptions
- **Storage** — File & media hosting (game assets, images, videos)
- **Realtime** — Live updates, presence, multiplayer rooms
- **Hosting** — Static websites + serverless functions

### Why KoraBase?
- Cheap pricing
- Built for games + normal apps + websites
- Low-stress to run and maintain
- Clean developer experience

### Status
Currently in active development.

Repo: https://github.com/Tajudeen001-security/aetherbase  
(We will rename the repository to `korabase` soon)

---

## Project Structure

```
korabase/
├── apps/
│   ├── dashboard/          # Admin dashboard (Next.js)
│   └── docs/               # Documentation site
├── packages/
│   ├── sdk/                # JavaScript/TypeScript SDK
│   ├── auth/               # Auth service
│   ├── database/           # Database + Realtime
│   ├── storage/            # File storage
│   └── hosting/            # Static hosting + functions
├── services/
│   └── api/                # Main API gateway
└── infra/                  # Docker, deployment configs
```

## Getting Started (coming soon)

```bash
npm create korabase@latest
```

## License
MIT

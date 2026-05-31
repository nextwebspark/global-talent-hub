# Global Talent Hub

AI-powered executive search & talent mapping platform. Search for companies and executives using natural language, visualised on an interactive globe.

## Tech Stack

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS + Mapbox GL
- **Backend:** Express.js 5 + TypeScript + Drizzle ORM
- **Database:** PostgreSQL 16
- **LLMs:** OpenRouter → Gemini 2.5 Flash (primary) / Claude Sonnet 4 (fallback)
- **Search:** Serper API (Google Search)
- **CRM:** Clockwork Recruiting API

---

## Local Development

### 1. Prerequisites

- Node.js 20+
- PostgreSQL 16 running locally (or a remote connection string)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Your local Postgres: `postgresql://user:pass@localhost:5432/global_talent_hub` |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| `SERPER_API_KEY` | https://serper.dev |
| `MAPBOX_ACCESS_TOKEN` | https://account.mapbox.com/access-tokens |

### 4. Set up the database

```bash
npm run db:push
```

### 5. Start the dev server

```bash
npm run dev
```

App runs at **http://localhost:5000** — backend and frontend served from the same port.

---

## Production Build (test locally)

```bash
npm run build
npm start
```

`npm start` sets `NODE_ENV=production` and serves the compiled bundle from `dist/`.  
Test the health check: `curl http://localhost:5000/api/health`

---

## Deploy to Railway

### First-time setup

1. Push this repo to GitHub.
2. Create a new project at [railway.app](https://railway.app).
3. Add a **PostgreSQL** service inside the Railway project.
4. Add a **GitHub repo** service, point it at this repo.

### Environment variables

In the Railway service dashboard → Variables, add all keys from `.env.example`:

**Required:**
- `DATABASE_URL` — Railway auto-injects this when you link the Postgres service
- `OPENROUTER_API_KEY`
- `SERPER_API_KEY`
- `MAPBOX_ACCESS_TOKEN`
- `NODE_ENV` = `production`

**Optional (Clockwork CRM):**
- `CLOCKWORK_API_KEY`
- `CLOCKWORK_API_SECRET`
- `CLOCKWORK_FIRM_KEY`
- `CLOCKWORK_FIRM_SLUG`

### Deploy

Railway auto-deploys on every push to `main`. Build and start commands are in `railway.toml`:

```
build:  npm install && npm run build
start:  node ./dist/index.cjs
```

Health check: `GET /api/health` — Railway uses this to confirm deployment success.

### Database migrations

After first deploy, run migrations via Railway's shell or the Drizzle Kit CLI:

```bash
npm run db:push
```

---

## Project Structure

```
├── client/          # React frontend (Vite)
│   └── src/
│       ├── pages/   # Route pages
│       ├── components/
│       ├── hooks/
│       └── lib/     # API client, state store, utilities
├── server/          # Express backend
│   ├── index.ts     # App entry point
│   ├── routes.ts    # All API endpoints
│   ├── services/    # Business logic (discovery, enrichment, search pipeline)
│   └── db.ts        # Database connection
├── shared/          # Types and schema shared between client and server
│   └── schema.ts    # Drizzle table definitions + Zod schemas
├── migrations/      # Database migration files
├── script/          # Build scripts
├── .env.example     # Environment variable template
└── railway.toml     # Railway deployment config
```

---

## Key API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/search` | Start a search |
| GET | `/api/search/stream` | Stream search results (SSE) |
| GET | `/api/companies` | List all companies |
| GET | `/api/companies/:id` | Get single company |
| GET | `/api/executives/:id/details` | Get executive details |
| GET | `/api/clockwork/diagnostics` | Test Clockwork connection |

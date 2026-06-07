# OpenRouter – Reliability-Aware Multi-LLM Routing Service

OpenRouter is a backend service for routing chat completion requests across multiple LLM providers such as OpenAI, Claude, and Google Gemini.

I extended the project with reliability-aware routing features: provider fallback, retry policies, failure classification, rate limiting, latency tracking, and provider health observability.

## Features

- Multi-provider LLM routing
- PostgreSQL-backed users, API keys, models, providers, and usage tracking
- API key validation and credit checks
- Provider fallback when one provider fails
- Retry policy for transient provider failures
- Failure classification for auth errors, rate limits, bad requests, timeouts, and provider 5xxs
- Per-API-key rate limiting
- Provider attempt latency tracking
- Provider health endpoint for observability

## Tech Stack

- Backend: TypeScript, Bun, Elysia
- Frontend: React, TypeScript
- Database: PostgreSQL, Prisma
- Providers: OpenAI, Anthropic Claude, Google Gemini/Vertex

## Architecture Flow

```text
Client
  ↓
OpenRouter API key validation
  ↓
Rate limit check
  ↓
Model/provider lookup in PostgreSQL
  ↓
Provider attempt with retry policy
  ↓
Fallback to next provider if needed
  ↓
Credit and usage update
  ↓
Response returned to client
```

## APIs

### Chat Completions

```http
POST /api/v1/chat/completions
```

Example:

```bash
curl -i -X POST http://localhost:4000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "google/gemini-2.5-flash",
    "messages": [
      {
        "role": "user",
        "content": "Reply with exactly: fallback test passed"
      }
    ]
  }'
```

### Provider Health

```http
GET /api/v1/provider-health
```

Example:

```bash
curl http://localhost:4000/api/v1/provider-health
```

Example response:

```json
{
  "OpenAI": {
    "requests": 1,
    "successes": 0,
    "failures": 1,
    "avgLatencyMs": 553
  },
  "Google API": {
    "requests": 1,
    "successes": 1,
    "failures": 0,
    "avgLatencyMs": 1307
  }
}
```

## Local Setup

Install dependencies:

```bash
bun install
```

Start PostgreSQL:

```bash
docker start openrouter-postgres
```

If creating the database container for the first time:

```bash
docker run --name openrouter-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=openrouter \
  -p 5433:5432 \
  -d postgres:16
```

Create `packages/db/.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/openrouter?schema=public"
```

Create `apps/api-backend/.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/openrouter?schema=public"

OPENAI_API_KEY="dummy"
GOOGLE_API_KEY="your_google_ai_studio_key"
GEMINI_API_KEY="your_google_ai_studio_key"
ANTHROPIC_API_KEY="dummy"
```

Run Prisma:

```bash
cd packages/db
bunx prisma generate
bunx prisma migrate deploy
cd ../..
```

Run backend:

```bash
cd apps/api-backend
bun run dev
```

Run frontend:

```bash
cd apps/dashboard-frontend
bun run dev
```

## Demo

For local demo data and detailed setup commands, see:

```text
docs/local-setup.md
```

Demo behavior:

```text
OpenAI fails with dummy API key
Router classifies it as AUTH_ERROR
Router falls back to Google API
Google Gemini succeeds
Provider health endpoint shows request/failure/success/latency stats
```

## Notes

Provider health stats and rate limiting are currently in memory. They reset when the backend restarts. A production version would use Redis, PostgreSQL, Prometheus, or another metrics pipeline.
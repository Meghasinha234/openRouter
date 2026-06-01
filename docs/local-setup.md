# Local Setup Notes

## Day 1 Verified Setup

This project runs locally with:

- Backend API: http://localhost:4000
- Frontend dashboard: http://localhost:3001
- PostgreSQL Docker container: openrouter-postgres
- PostgreSQL local port: 5433

## Why PostgreSQL uses port 5433

Port 5432 may conflict with an existing local PostgreSQL service on the Mac.

Use this local database URL:

DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/openrouter?schema=public"

## Start PostgreSQL

If the container already exists:

docker start openrouter-postgres

If creating the container for the first time:

docker run --name openrouter-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=openrouter \
  -p 5433:5432 \
  -d postgres:16

## Environment files

Create packages/db/.env:

DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/openrouter?schema=public"

Create apps/api-backend/.env:

DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/openrouter?schema=public"

OPENAI_API_KEY="dummy"
GOOGLE_API_KEY="dummy"
ANTHROPIC_API_KEY="dummy"

The dummy keys only allow SDK clients to initialize locally. Real provider calls require valid API keys.

## Install dependencies

From repo root:

bun install

## Prisma setup

From repo root:

cd packages/db
bunx prisma generate
bunx prisma migrate deploy
cd ../..

## Run backend

From repo root:

cd apps/api-backend
bun run dev

Expected:

Elysia is running at localhost:4000

## Run frontend

From repo root:

cd apps/dashboard-frontend
bun run dev

Expected:

Server running at http://localhost:3001/

## Verify backend

curl http://localhost:4000

Expected:

NOT_FOUND

Verify the chat route:

curl -i -X POST http://localhost:4000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [
      {
        "role": "user",
        "content": "hello"
      }
    ]
  }'

Expected:

HTTP/1.1 403 Forbidden
{"message":"Invalid api key"}

## Day 1 result

Verified:

- PostgreSQL runs locally through Docker
- Prisma migrations apply successfully
- Backend starts on port 4000
- Frontend starts on port 3001
- Backend route reaches database and rejects invalid API key correctly

# OpenRouter

OpenRouter is a multi-backend AI API router built with TypeScript, Bun, and Elysia. It allows you to connect to multiple LLM providers like OpenAI, Claude, and Google Gemini/Vertex.

## Features

- Routes chat completions to multiple LLM providers.
- Tracks API key usage and credits.
- Supports PostgreSQL database for users, keys, and conversations.
- Modular backend structure for easy scaling.
- Frontend dashboard to manage keys and view conversations.

## Tech Stack

- **Backend**: TypeScript + [Elysia](https://elysiajs.com)
- **Frontend**: React + TypeScript
- **Database**: PostgreSQL + Prisma
- **Runtime**: Bun

## Getting Started

### 1. Clone the repo

git clone https://github.com/Meghasinha234/openrouter.git
cd openrouter 

### 2. Setup the database
bun run prisma generate
bun run prisma db push

### 3. Create a .env file

### 4. Run the backend
cd apps/api-backend
bun run dev or npm run dev

###5. Run the frontend
cd apps/dashboard-frontend
bun run dev

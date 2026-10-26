# Task Manager

A small Express, MongoDB, and React task manager with an optional Groq-powered planning endpoint.

## Requirements

- Node.js 20 or newer
- MongoDB connection string
- Groq API key only if you want to use AI planning

## Configure and run the backend

Copy `.env.example` to `.env` and set `MONGO_URI`. Set `GROQ_API_KEY` to enable AI planning; the key stays on the server and is never sent to the browser. The API listens on port 5000 by default. `CLIENT_ORIGIN` is a comma-separated allowlist for browser origins and defaults to `http://localhost:5173`.

```sh
npm install
npm run dev
```

The server connects to MongoDB before it starts listening. `GET /api` is the health endpoint.

## Configure and run the frontend

Install the frontend dependencies and start Vite:

```sh
npm install --prefix frontend
npm run dev:frontend
```

The frontend uses `http://localhost:5000` by default. To use a different backend URL, copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL`.

## Tests and production build

```sh
npm test
npm run test:integration
npm run build:frontend
```

The integration tests use `mongodb-memory-server`, which may download a MongoDB binary the first time they run. They do not call the external Groq service.

## API routes

- `GET /api/tasks` — list tasks
- `POST /api/tasks` — create a task
- `GET /api/tasks/:id` — fetch a task
- `PUT /api/tasks/:id` — replace a task
- `DELETE /api/tasks/:id` — delete a task
- `POST /api/ai/plan-task` — generate a task plan

Task statuses are `pending`, `in-progress`, and `completed`.

## Deployment security

This project does not include user authentication or per-user task ownership. Anyone who can reach the API can access and modify its shared task list. Do not expose it as a multi-user/public service until an authentication and data-isolation model is implemented. CORS is a browser policy, not authentication. AI planning is limited to 20 requests per IP per 15 minutes in each server process; use a shared limiter for multi-instance deployments.

# Exact Virtual Assistant for Project Management (Phase 1)

A minimal React + Tailwind prototype with a center chat window, file attach button, and a right-hand preview panel.

## Local Dev (Vite)

```bash
npm i
npm run dev
```

Open the printed localhost URL.

## Deploy to Vercel

1. Push this folder to a new GitHub repo.
2. In Vercel, **Add New Project** → import the repo.
3. Framework Preset: **Vite** (auto-detected).
4. Build command: `vite build` (auto) ; Output: `dist` (auto).
5. Deploy.

## Where to add a real LLM
- See `src/App.jsx` → `callLLM(text)` — currently returns a mocked reply.
- Replace with a real fetch to `/api/chat` or your preferred endpoint.
- For Vercel Functions, create `api/chat.js` at the repo root and return `{ reply: string }`.

## Notes
- Tailwind is preconfigured (see `tailwind.config.js`, `postcss.config.js`, and `src/index.css`).
- The “Auto-extract (beta)” toggle is wired to a mocked filename-based extractor. Swap in a real parser later.
- This is a UI-only prototype; no data persistence yet.



## OpenAI Endpoint

This project includes a Vercel serverless function at **`/api/chat`** that calls the OpenAI API using the official Node SDK.

### Set your API key
In Vercel Project Settings → *Environment Variables*:
- `OPENAI_API_KEY` = your key

For local development, you can use Vercel CLI which reads `.vercel/.env.*` or you can export the var before running:

```bash
export OPENAI_API_KEY=sk-...    # macOS/Linux
setx OPENAI_API_KEY sk-...      # Windows (new shell required)
```

### Run locally with Vercel dev (recommended)
```bash
npm i -g vercel
vercel dev
```
This runs both the Vite frontend and the `/api/chat` function locally.

### How the frontend calls the endpoint
`src/App.jsx` → `callLLM(text)` makes a POST to `/api/chat` with a chat `messages` array. The server responds with `{ reply }` and the UI displays it.

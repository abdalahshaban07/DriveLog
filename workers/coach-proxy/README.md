# DriveLog coach proxy (Cloudflare Worker + Groq)

Holds your **Groq** API key so the Angular app never sees it. Client calls this Worker; Worker calls Groq.

## One-time setup

1. Free Groq key: https://console.groq.com/keys
2. Cloudflare account + Wrangler login:

```bash
cd workers/coach-proxy
npm install
npx wrangler login
npx wrangler secret put GROQ_API_KEY
# paste key when prompted (not into git / chat / config.ts)
npx wrangler deploy
```

3. Copy the printed URL (e.g. `https://drivelog-coach.<you>.workers.dev`) into `src/app/core/config.ts`:

```ts
export const COACH_PROXY_URL = 'https://drivelog-coach.<you>.workers.dev';
```

4. Rebuild / redeploy DriveLog (GitHub Pages).

## Local Worker

```bash
# from repo root (uses workers/coach-proxy/.dev.vars — gitignored)
npm run coach:dev
# App on http://localhost:4200 auto-targets http://127.0.0.1:8787 (skips Zscaler on workers.dev)
```

Or manually:

```bash
# workers/coach-proxy/.dev.vars
GROQ_API_KEY=gsk_...
npm run dev
```

## CORS

`ALLOWED_ORIGINS` in `wrangler.toml` includes localhost + GitHub Pages. Add more origins there if needed.

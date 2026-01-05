# Development Environment Setup

## Prerequisites

- Node.js 20.x (required - project uses `engines: { "node": "20.x" }`)
- PostgreSQL database (DATABASE_URL must be set in `api/.env`)

## Node 20 Setup

Node 20.19.6 is installed via Homebrew at `/opt/homebrew/opt/node@20/bin/node`.

**For zsh users:**
- `.zshrc` has been updated to prioritize Node 20 in PATH
- Run: `exec zsh -l` to reload shell, then verify with `node -v` (should show v20.19.6)

**For bash users:**
- Add to `~/.bash_profile`: `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`
- Run: `exec bash -l` to reload shell

## Starting Services

### 1. Start API Server (Port 8080)

```bash
# In a dedicated terminal, ensure Node 20 is active:
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
node -v  # Should show v20.19.6

# Navigate to API directory
cd ~/Documents/month-end-dashboard/api

# Start API (use dev:stable to avoid watch mode restart loops)
PORT=8080 HOST=0.0.0.0 npm run dev:stable
```

**Verify API is running:**
```bash
# In another terminal:
curl -i http://127.0.0.1:8080/api/health
curl -i http://127.0.0.1:8080/api/orgs
```

**Expected output:**
- Health: `{"ok":true,"service":"month-end-dashboard-api"}`
- Orgs: `{"ok":true,"count":N,"orgs":[...]}`

### 2. Start Web Server (Port 3011)

**Only start web AFTER API is confirmed working.**

```bash
# In a new terminal, ensure Node 20 is active:
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
node -v  # Should show v20.19.6

# Navigate to web directory
cd ~/Documents/month-end-dashboard/web

# Start web (disable Turbopack for stability)
NEXT_DISABLE_TURBOPACK=1 npm run dev -- -p 3011
```

**Verify web is running:**
- Open browser: http://localhost:3011
- Check browser console for API connectivity
- API health indicator in top bar should show "API: OK"
- Org dropdown should populate

## Environment Variables

**API (`api/.env`):**
- `DATABASE_URL` - PostgreSQL connection string (required)
- `PORT=8080` - Server port (optional, defaults to 8081)
- `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI` - QuickBooks OAuth (required for QBO features)

**Web (`web/.env.local`):**
- `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8080` - API base URL (no trailing slash)
- API prefix is automatically added: `/api`

## Troubleshooting

### API won't start / crashes
- Check `DATABASE_URL` is set and PostgreSQL is running
- Verify Node 20: `node -v` must show v20.x (not v24.x)
- Check API logs for database connection errors

### API stuck in restart loop
- Use `npm run dev:stable` instead of `npm run dev` (avoids tsx watch mode)
- Or kill all tsx processes: `pkill -9 -f tsx`

### Web shows "API: OFFLINE"
- Verify API is running: `curl http://127.0.0.1:8080/api/health`
- Check `web/.env.local` has correct `NEXT_PUBLIC_API_BASE_URL`
- Restart web server after changing `.env.local`

### Ports already in use
```bash
# Find and kill processes on ports:
lsof -ti tcp:8080 | xargs kill -9
lsof -ti tcp:3011 | xargs kill -9

# Or kill all dev processes:
pkill -9 -f "next dev"
pkill -9 -f "tsx"
```

## Clean Reinstall

If dependencies are corrupted:

**API:**
```bash
cd api
rm -rf node_modules package-lock.json
npm install
```

**Web:**
```bash
cd web
rm -rf .next node_modules/.cache
npm install
```


# Verified Environment Setup

## Shell Detection

**Active shell:** `bash` (determined via `ps -p $$ -o comm=`)
**SHELL env:** `/bin/bash`

## Node 20 Detection

**Brew locations checked:**
- `/usr/local/opt/node@20/bin/node`: ✅ EXISTS
- `/opt/homebrew/opt/node@20/bin/node`: ✅ EXISTS (v20.19.6)

**Primary brew:** Both locations exist; script prioritizes `/usr/local` first, then `/opt/homebrew`

## PATH Configuration

**Shared script created:** `~/.node20_path`
- Checks `/usr/local/opt/node@20/bin/node` first (Intel Mac compatibility)
- Falls back to `/opt/homebrew/opt/node@20/bin/node` (Apple Silicon)
- Pre-pends to PATH

**Updated startup files:**
- `~/.bash_profile`: Added `source ~/.node20_path` (line 35)
- `~/.zshrc`: Updated to use `source ~/.node20_path`

**Verification (after sourcing ~/.node20_path):**
```
which -a node:
/usr/local/opt/node@20/bin/node  (first - wins)
/opt/homebrew/opt/node@20/bin/node
/usr/local/bin/node

node -v:
v20.19.6
```

✅ Node 20 is now first in PATH (prioritizes /usr/local, then /opt/homebrew)

## Port Status

**All dev processes stopped:**
- `pkill -9 -f "next dev"` ✓
- `pkill -9 -f "tsx"` ✓
- `pkill -9 -f "node .*8080"` ✓

**Ports verified free:**
- Port 8080: ✅ Free
- Port 3011: ✅ Free

## API Dev Script Verification

**package.json scripts:**
- `dev`: `tsx watch --ignore '../node_modules/**' --ignore 'node_modules/**' src/server.ts` 
  - Watch mode with node_modules ignored (should prevent restart loops)
- `dev:stable`: `tsx src/server.ts` 
  - Single run, no watch mode (for production-like testing)

✅ Both scripts are safe (single process, no loops)

## Web Environment

**web/.env.local configured:**
- `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8080` ✓

## Next Steps (Run in Your Terminal)

### 1. Reload Shell and Verify Node 20

**For bash:**
```bash
exec bash -l
which -a node  # First entry should be /usr/local/opt/node@20/bin/node
node -v        # Should show v20.19.6
```

**For zsh (if switching):**
```bash
exec zsh -l
which -a node  # First entry should be /usr/local/opt/node@20/bin/node
node -v        # Should show v20.19.6
```

### 2. Start API Server (Foreground - Keep Terminal Open)

```bash
cd ~/Documents/month-end-dashboard/api
PORT=8080 HOST=0.0.0.0 npm run dev
```

**Expected output:**
- `[env] Loaded .env from: /Users/vitaliyulitovsky/Documents/month-end-dashboard/api/.env`
- `Starting API with ENV.PORT = 8080 host = 0.0.0.0`
- `API listening on http://0.0.0.0:8080`

**Keep this terminal open** - API must stay running in foreground.

### 3. Verify API (Second Terminal)

**In a NEW terminal (reload shell first):**
```bash
exec bash -l  # or exec zsh -l

# Verify API is listening
lsof -nP -iTCP:8080 -sTCP:LISTEN

# Test endpoints
curl -i http://127.0.0.1:8080/api/health
curl -i http://127.0.0.1:8080/api/orgs
```

**Expected results:**
- `lsof` shows node process listening on port 8080
- `/api/health` returns: `HTTP/1.1 200 OK` with body `{"ok":true,"service":"month-end-dashboard-api"}`
- `/api/orgs` returns: `HTTP/1.1 200 OK` with body `{"ok":true,"count":N,"orgs":[...]}`

### 4. Start Web Server (Third Terminal)

**Only after API is confirmed working and stable:**

```bash
cd ~/Documents/month-end-dashboard/web
NEXT_DISABLE_TURBOPACK=1 npm run dev -- -p 3011
```

**Verify in browser:**
- Open http://localhost:3011
- Check DevTools → Network tab
- Requests should go to `http://127.0.0.1:8080/api/...`
- Top bar should show "API: OK" (not "API: OFFLINE")
- Org dropdown should populate with available orgs

## Success Criteria

✅ Node 20 is first in PATH for both bash and zsh
✅ API listens on port 8080 and responds to /api/health and /api/orgs
✅ Web server runs on port 3011 without Turbopack
✅ Web UI successfully connects to API and loads orgs
✅ No background processes used (all servers run in foreground terminals)

## Troubleshooting

### Node version still shows v24.x
- Ensure you ran `exec bash -l` or `exec zsh -l` to reload shell
- Check: `cat ~/.node20_path`
- Verify: `which node` shows node@20 path first
- Test: `source ~/.node20_path && node -v`

### API won't start
- Check `DATABASE_URL` in `api/.env` is set and valid
- Verify PostgreSQL is running: `psql -l` or check Postgres.app
- Check API terminal for error messages (database connection, missing env vars)

### API starts but curl fails
- Ensure API terminal shows "API listening on http://0.0.0.0:8080"
- Use `127.0.0.1` not `localhost` (some systems resolve differently)
- Check: `lsof -nP -iTCP:8080 -sTCP:LISTEN` shows a node process
- Try: `curl -v http://127.0.0.1:8080/api/health` for verbose output

### Web shows "API: OFFLINE"
- Verify API is running and responding: `curl http://127.0.0.1:8080/api/health`
- Check `web/.env.local` has: `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8080` (no trailing slash)
- Restart web server after changing `.env.local`
- Check browser DevTools → Network tab for actual request URLs

### API stuck in restart loop (if using `npm run dev`)
- Use `npm run dev:stable` instead (single run, no watch)
- Or kill all tsx processes: `pkill -9 -f tsx`
- Check if node_modules changes are triggering restarts (should be ignored by watch)

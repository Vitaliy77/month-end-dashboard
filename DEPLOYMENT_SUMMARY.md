# Deployment Summary for DigitalOcean App Platform

## Files Changed for Deploy-Readiness

### Backend (API)
- `api/src/env.ts` - Removed localhost fallbacks, require env vars
- `api/src/routes.ts` - Require WEB_BASE_URL (no localhost fallback)
- `api/src/qboAuth.ts` - Require QBO_REDIRECT_URI (no dev fallback)
- `api/src/server.ts` - Uses PORT from env, binds to 0.0.0.0
- `api/package.json` - Added build and start scripts

### Frontend (Web)
- `web/src/lib/api.ts` - Require NEXT_PUBLIC_API_BASE_URL in production
- `web/package.json` - Updated start script to use PORT env var

### Configuration
- `.gitignore` - Already ignores .env files (verified)
- `README.md` - Added comprehensive deployment section
- Removed tracked .env files from git

## DigitalOcean App Platform Configuration

### Component 1: API (Service)

**Source Directory:** `api`

**Build Command:**
```bash
npm ci && npm run build
```

**Run Command:**
```bash
npm start
```

**HTTP Port:** `$PORT` (DigitalOcean provides automatically)

**Environment Variables:**
```
DATABASE_URL=postgres://user:password@host:port/database
PORT=8081
HOST=0.0.0.0
QBO_CLIENT_ID=<your_client_id>
QBO_CLIENT_SECRET=<your_client_secret>
QBO_ENV=sandbox
QBO_REDIRECT_URI=https://<API_DOMAIN>/api/auth/qbo/callback
WEB_BASE_URL=https://<WEB_DOMAIN>
APP_BASE_URL=https://<WEB_DOMAIN>
```

**Important:** Replace `<API_DOMAIN>` and `<WEB_DOMAIN>` with actual DigitalOcean-assigned domains after deployment.

### Component 2: Web (Web Service)

**Source Directory:** `web`

**Build Command:**
```bash
npm ci && npm run build
```

**Run Command:**
```bash
npm start
```

**HTTP Port:** `$PORT` (DigitalOcean provides automatically)

**Environment Variables:**
```
NEXT_PUBLIC_API_BASE_URL=https://<API_DOMAIN>
NEXT_PUBLIC_API_PREFIX=/api
PORT=3010
```

**Important:** Replace `<API_DOMAIN>` with actual API domain.

## Intuit Redirect URI

After DigitalOcean assigns your API domain, configure in Intuit Developer Portal:

**Exact Redirect URI:**
```
https://<API_DOMAIN>/api/auth/qbo/callback
```

**Critical Requirements:**
- Must match exactly (character-for-character) with `QBO_REDIRECT_URI` in API env vars
- Protocol must be `https://` (not `http://`)
- No trailing slash
- Path must be exactly `/api/auth/qbo/callback`

**Example:**
If your API domain is `month-end-api-abc123.ondigitalocean.app`, then:
- `QBO_REDIRECT_URI=https://month-end-api-abc123.ondigitalocean.app/api/auth/qbo/callback`
- Intuit Redirect URI: `https://month-end-api-abc123.ondigitalocean.app/api/auth/qbo/callback`

## Post-Deployment Verification

### 1. API Health Check
```bash
curl https://<API_DOMAIN>/api/health
```
**Expected:** `{"ok":true,"service":"month-end-dashboard-api"}`

### 2. Web Loads
- Open `https://<WEB_DOMAIN>` in browser
- Should see dashboard interface

### 3. OAuth Flow
- Click "Connect QBO" in dashboard
- Should redirect to Intuit login
- After authorization, should redirect to: `https://<WEB_DOMAIN>/?connected=1&orgId=...`

### 4. Month-End Run
- Select organization and date range
- Click "Run Month-End"
- Should fetch QBO data and display findings

## Notes

- All localhost references removed from production code
- Environment variables are required (no fallbacks in production)
- API listens on `0.0.0.0` to accept connections from DO load balancer
- Next.js reads `PORT` from environment automatically

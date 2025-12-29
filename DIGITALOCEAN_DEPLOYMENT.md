# DigitalOcean App Platform Deployment Guide

## ✅ Git Status

**Commit Hash:** `475239c64c2e4f985063ba202bf12c6f28e5f82c`

**Repository:** `https://github.com/Vitaliy77/month-end-dashboard`

**Note:** If repository doesn't exist yet, create it on GitHub first, then push:
```bash
git remote set-url origin https://github.com/Vitaliy77/month-end-dashboard.git
git push -u origin main
```

## 📋 Files Changed for Deploy-Readiness

### Backend (API)
- `api/src/env.ts` - Removed localhost fallbacks
- `api/src/routes.ts` - Require WEB_BASE_URL
- `api/src/qboAuth.ts` - Require QBO_REDIRECT_URI
- `api/src/server.ts` - Uses PORT from env, binds to 0.0.0.0
- `api/package.json` - Added build and start scripts

### Frontend (Web)
- `web/src/lib/api.ts` - Require NEXT_PUBLIC_API_BASE_URL in production
- `web/package.json` - Start script uses PORT env var

### Configuration
- `.gitignore` - Updated to ignore .env files
- `README.md` - Added deployment section

## 🚀 DigitalOcean App Platform Configuration

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

## 🔗 Intuit Redirect URI

**Exact Format:**
```
https://<API_DOMAIN>/api/auth/qbo/callback
```

**Example:**
If your API domain is `month-end-api-abc123.ondigitalocean.app`:
```
https://month-end-api-abc123.ondigitalocean.app/api/auth/qbo/callback
```

**Critical Requirements:**
- Must match exactly (character-for-character) with `QBO_REDIRECT_URI` in API env vars
- Protocol must be `https://` (not `http://`)
- No trailing slash
- Path must be exactly `/api/auth/qbo/callback`

## ✅ Post-Deployment Verification

### 1. API Health Check
```bash
curl -sS https://<API_DOMAIN>/api/health
```
**Expected Output:**
```json
{"ok":true,"service":"month-end-dashboard-api"}
```

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

## 📝 Step-by-Step DO Setup

1. **Create App in DigitalOcean:**
   - Go to DigitalOcean App Platform
   - Click "Create App"
   - Connect to GitHub repo: `Vitaliy77/month-end-dashboard`

2. **Add API Component:**
   - Click "Add Component" → "Service"
   - Source Directory: `api`
   - Build Command: `npm ci && npm run build`
   - Run Command: `npm start`
   - Set all API environment variables listed above

3. **Add Web Component:**
   - Click "Add Component" → "Web Service"
   - Source Directory: `web`
   - Build Command: `npm ci && npm run build`
   - Run Command: `npm start`
   - Set all Web environment variables listed above

4. **Deploy:**
   - Review configuration
   - Click "Create Resources"
   - Wait for deployment to complete

5. **Update Intuit:**
   - Once DO assigns domains, update Intuit Developer Portal with the exact redirect URI

6. **Verify:**
   - Run all verification steps above


# Month-End Dashboard

An improved version of the Month-End Checker application for reviewing QuickBooks Online financial data.

## Features

- Organization management
- QuickBooks Online OAuth integration
- Month-end financial checks and rule evaluation
- Custom rule configuration
- P&L, Balance Sheet, Trial Balance, and Cash Flow report views
- **Accruals Detection & Management**: Automatically detect recurring expenses missing in current period and post accrual journal entries to QBO

## Architecture

- **Backend API**: Express.js with TypeScript (Port 8081)
- **Frontend Web**: Next.js with React and TypeScript (Port 3010)
- **Database**: PostgreSQL (all tables use PostgreSQL)

## Quick Start

### One-Command Setup

```bash
# Install all dependencies
npm install

# Copy environment files
cp api/.env.example api/.env
cp web/.env.example web/.env.local

# Edit api/.env with your database and QBO credentials
# web/.env.local should work as-is for local development

# Start both services
npm run dev
```

This will start:
- API server on `http://localhost:8080` (or port 8081 if PORT not set)
- Web app on `http://localhost:3010` (or port 3011 if 3010 is in use)

**For local development:**
- API: `cd api && PORT=8080 npm run dev`
- Web: `cd web && npm run dev` (defaults to port 3000, use `-p 3011` to override)

### Verify Setup

```bash
# Check API health
curl -i http://127.0.0.1:8080/api/health

# Check API orgs endpoint
curl -i http://127.0.0.1:8080/api/orgs

# Check web server
curl -I http://localhost:3010
```

**Environment Configuration:**
- `web/.env.local` should contain: `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8080`
- This ensures the web app can reach the API server

Or run the diagnostic script:
```bash
./scripts/doctor.sh
```

## Setup Instructions

### Prerequisites

- Node.js 20.x
- npm 10.x
- PostgreSQL database
- QuickBooks Online app credentials (from Intuit Developer Portal)

### 1. Database Setup

Create a PostgreSQL database:

```bash
createdb month_end_dashboard
# Or using psql:
# CREATE DATABASE month_end_dashboard;
```

### 2. Environment Configuration

**API (`api/.env`):**
```bash
cp api/.env.example api/.env
# Edit api/.env and add your DATABASE_URL, QBO_CLIENT_ID, QBO_CLIENT_SECRET, etc.
```

**Web (`web/.env.local`):**
```bash
cp web/.env.example web/.env.local
# web/.env.local should work as-is (points to http://localhost:8080/api)
```

### 3. Start Services

**Option A: Start both together (recommended):**
```bash
npm run dev
```

**Option B: Start separately:**
```bash
# Terminal 1: API
npm run dev:api

# Terminal 2: Web
npm run dev:web
```

The API will start on `http://localhost:8081`  
The web app will start on `http://localhost:3010`

**Required Environment Variables (API):**
- `DATABASE_URL`: PostgreSQL connection string
- `QBO_CLIENT_ID`: QuickBooks OAuth client ID
- `QBO_CLIENT_SECRET`: QuickBooks OAuth client secret
- `QBO_REDIRECT_URI`: Must match Intuit Developer Portal exactly

### 4. QuickBooks OAuth Setup

1. Go to [Intuit Developer Portal](https://developer.intuit.com/)
2. Create or select your app
3. Add redirect URI: `http://localhost:8081/api/auth/qbo/callback` (for sandbox)
4. Copy Client ID and Client Secret to your `.env` file

**Troubleshooting OAuth Errors:**

If you encounter `401 invalid_client` errors during token exchange, this is almost always a **Client Secret mismatch**. Follow these steps:

1. **Verify Current Configuration:**
   ```bash
   # Check QBO credentials (dev-only endpoint)
   curl http://localhost:8080/api/debug/qbo-creds
   
   # Or run the verification script
   ./scripts/verify-qbo.sh
   ```

2. **Fix Client Secret Mismatch (Most Common Issue):**
   
   **Step 1:** Go to [Intuit Developer Portal](https://developer.intuit.com/)
   
   **Step 2:** Navigate to your app → **Keys & OAuth** section
   
   **Step 3:** Make sure you're on the **Development** tab (not Production)
   
   **Step 4:** Click **"Regenerate"** next to the Client Secret
   
   **Step 5:** Copy the **entire** new Client Secret (it will be ~40 characters for sandbox)
   
   **Step 6:** Open `api/.env` and update the line:
   ```
   QBO_CLIENT_SECRET=<paste the new secret here>
   ```
   **Important:** 
   - Copy the entire secret, no spaces or line breaks
   - Make sure there are no quotes around the value
   - The line should be exactly: `QBO_CLIENT_SECRET=...` (no spaces around `=`)
   
   **Step 7:** Restart the API:
   ```bash
   # Stop the API (Ctrl+C if running in foreground)
   # Then restart:
   cd api
   npm run dev
   ```
   
   **Step 8:** Verify the new secret is loaded:
   ```bash
   curl http://localhost:8080/api/debug/qbo-creds
   ```
   Check that `fingerprint_sha256_first8` has changed (confirming new secret is loaded)
   
   **Step 9:** Retry the OAuth flow:
   - Click "Connect QBO" in the web app
   - Complete the authorization
   - Token exchange should now return 200 (not 401)

3. **Verify Redirect URI:**
   - The redirect URI in `api/.env` must match exactly (including protocol, host, port, and path) with what's configured in Intuit Developer Portal
   - Common issues: `localhost` vs `127.0.0.1`, missing port, trailing slashes
   - For development: `http://localhost:8080/api/auth/qbo/callback`

## Key Improvements from Original

1. **Unified Database**: All data now uses PostgreSQL instead of mixing PostgreSQL and SQLite
2. **Better Error Handling**: Improved error handling and logging throughout
3. **API Route Fixes**: Added PUT method support for rules endpoint (frontend compatibility)
4. **Database Schema Initialization**: Automatic schema creation on startup
5. **Type Safety**: Enhanced TypeScript types for better code safety
6. **Default Ports**: Changed to 8081 (API) and 3001 (Web) to avoid conflicts

## Development

### Running Both Services

**From repo root (recommended):**
```bash
npm run dev
```

**Or separately:**
```bash
# Terminal 1: API
npm run dev:api

# Terminal 2: Web
npm run dev:web
```

### Building for Production

```bash
# Build API
cd api
npm run build
npm start

# Build Web
cd web
npm run build
npm start
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/orgs` - List organizations
- `POST /api/orgs` - Create organization
- `GET /api/orgs/:orgId/rules` - Get rules for organization
- `POST /api/orgs/:orgId/rules` - Save rules for organization
- `PUT /api/orgs/:orgId/rules` - Save rules for organization (alternative)
- `GET /api/auth/qbo/connect` - Initiate QBO OAuth flow
- `GET /api/auth/qbo/callback` - QBO OAuth callback
- `POST /api/runs/month-end/qbo` - Run month-end checks
- `GET /api/qbo/pnl` - Get Profit & Loss report
- `GET /api/qbo/tb` - Get Trial Balance report
- `GET /api/qbo/bs` - Get Balance Sheet report
- `GET /api/qbo/cf` - Get Cash Flow report
- `GET /api/debug/qbo` - QBO configuration debug (dev-only, requires `NODE_ENV !== 'production'`)

## Database Schema

The following tables are automatically created on startup:

- `orgs` - Organizations
- `oauth_states` - OAuth state management
- `qbo_connections` - QuickBooks OAuth tokens
- `org_rules` - Custom rules per organization

## Deployment to DigitalOcean App Platform

### Prerequisites

- DigitalOcean account
- PostgreSQL database (DO Managed Database recommended)
- Intuit Developer Portal app configured

### Environment Variables

#### API Component

Set these in DigitalOcean App Platform for the API component:

```
DATABASE_URL=postgres://user:password@host:port/database
PORT=8081
HOST=0.0.0.0
QBO_CLIENT_ID=your_client_id
QBO_CLIENT_SECRET=your_client_secret
QBO_ENV=sandbox
QBO_REDIRECT_URI=https://<API_DOMAIN>/api/auth/qbo/callback
WEB_BASE_URL=https://<WEB_DOMAIN>
APP_BASE_URL=https://<WEB_DOMAIN>
```

**Important:** Replace `<API_DOMAIN>` and `<WEB_DOMAIN>` with your actual DigitalOcean-assigned domains.

#### Web Component

Set these in DigitalOcean App Platform for the Web component:

```
NEXT_PUBLIC_API_BASE_URL=https://<API_DOMAIN>
NEXT_PUBLIC_API_PREFIX=/api
PORT=3010
```

**Important:** Replace `<API_DOMAIN>` with your actual API domain.

### DigitalOcean App Platform Configuration

#### Component 1: API (Service)

- **Source Directory:** `api`
- **Build Command:** `npm ci && npm run build`
- **Run Command:** `npm start`
- **HTTP Port:** Use `$PORT` (DigitalOcean provides this automatically)
- **Environment Variables:** See API Component section above

#### Component 2: Web (Web Service)

- **Source Directory:** `web`
- **Build Command:** `npm ci && npm run build`
- **Run Command:** `npm start`
- **HTTP Port:** Use `$PORT` (DigitalOcean provides this automatically)
- **Environment Variables:** See Web Component section above

### Intuit Developer Portal Configuration

After DigitalOcean assigns your API domain, update your Intuit app:

1. Go to [Intuit Developer Portal](https://developer.intuit.com/)
2. Select your app
3. Navigate to "Keys & OAuth" or "Redirect URIs"
4. Add the production redirect URI:

```
https://<API_DOMAIN>/api/auth/qbo/callback
```

**Critical:** This must match exactly (including protocol, domain, port if any, and path) with `QBO_REDIRECT_URI` in your API environment variables.

### Post-Deployment Verification

1. **API Health Check:**
   ```bash
   curl https://<API_DOMAIN>/api/health
   ```
   Expected: `{"ok":true,"service":"month-end-dashboard-api"}`

2. **Web Loads:**
   - Open `https://<WEB_DOMAIN>` in browser
   - Should see the dashboard interface

3. **OAuth Flow:**
   - Click "Connect QBO" in the dashboard
   - Should redirect to Intuit login
   - After authorization, should redirect back to `https://<WEB_DOMAIN>/?connected=1&orgId=...`

4. **Month-End Run:**
   - Select organization and date range
   - Click "Run Month-End"
   - Should fetch QBO data and display findings

### Local Development

For local development, create `.env` files:

**`api/.env`:**
```bash
DATABASE_URL=postgres://user:password@localhost:5432/month_end_dashboard
PORT=8081
HOST=0.0.0.0
QBO_CLIENT_ID=your_client_id
QBO_CLIENT_SECRET=your_client_secret
QBO_ENV=sandbox
QBO_REDIRECT_URI=http://localhost:8081/api/auth/qbo/callback
WEB_BASE_URL=http://localhost:3010
APP_BASE_URL=http://localhost:3010
```

**`web/.env.local`:**
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8081
NEXT_PUBLIC_API_PREFIX=/api
```

## License

Private project

# Month-End Dashboard

An improved version of the Month-End Checker application for reviewing QuickBooks Online financial data.

## Features

- Organization management
- QuickBooks Online OAuth integration
- Month-end financial checks and rule evaluation
- Custom rule configuration
- P&L, Balance Sheet, Trial Balance, and Cash Flow report views

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
- API server on `http://localhost:8081`
- Web app on `http://localhost:3010`

### Verify Setup

```bash
# Check API health
curl -i http://localhost:8081/api/health

# Check API orgs endpoint
curl -i http://localhost:8081/api/orgs

# Check web server
curl -I http://localhost:3010
```

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
# web/.env.local should work as-is (points to http://localhost:8081/api)
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

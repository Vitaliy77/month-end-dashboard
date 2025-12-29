# DigitalOcean App Platform Deployment Steps

## ✅ Step 1: Push to GitHub

**Status:** Code committed locally at `475239c64c2e4f985063ba202bf12c6f28e5f82c`

**Action:** Push to GitHub (see commands above)

## 🚀 Step 2: Create DigitalOcean App

### 2.1 Create New App
1. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Click **"Create App"**
3. Select **"GitHub"** as source
4. Authorize if needed
5. Select repository: **`Vitaliy77/month-end-dashboard`**
6. Select branch: **`main`**
7. Click **"Next"**

### 2.2 Configure API Component (Service)

**Component Type:** Service

**Configuration:**
- **Name:** `api` (or `month-end-api`)
- **Source Directory:** `api`
- **Build Command:** `npm ci && npm run build`
- **Run Command:** `npm start`
- **HTTP Port:** Leave empty or use `$PORT` (DO will inject it automatically)

**Environment Variables:**
```
DATABASE_URL=postgres://user:password@host:port/database
QBO_CLIENT_ID=<your_client_id>
QBO_CLIENT_SECRET=<your_client_secret>
QBO_ENV=sandbox
QBO_REDIRECT_URI=https://<API_DOMAIN>/api/auth/qbo/callback
WEB_BASE_URL=https://<WEB_DOMAIN>
APP_BASE_URL=https://<WEB_DOMAIN>
```

**Important Notes:**
- Do NOT set `PORT=8081` - let DO inject `$PORT`
- Replace `<API_DOMAIN>` and `<WEB_DOMAIN>` AFTER DO assigns domains
- You can set placeholder values initially, then update after deployment

### 2.3 Configure Web Component (Web Service)

**Component Type:** Web Service

**Configuration:**
- **Name:** `web` (or `month-end-web`)
- **Source Directory:** `web`
- **Build Command:** `npm ci && npm run build`
- **Run Command:** `npm start`
- **HTTP Port:** Leave empty or use `$PORT` (DO will inject it automatically)

**Environment Variables:**
```
NEXT_PUBLIC_API_BASE_URL=https://<API_DOMAIN>
NEXT_PUBLIC_API_PREFIX=/api
```

**Important Notes:**
- Do NOT set `PORT=3010` - let DO inject `$PORT`
- Replace `<API_DOMAIN>` AFTER DO assigns API domain

### 2.4 Add Database (Optional but Recommended)

1. Click **"Add Resource"** → **"Database"**
2. Select **PostgreSQL**
3. Choose plan (Basic $15/mo minimum)
4. This will provide `DATABASE_URL` automatically

### 2.5 Deploy

1. Review all settings
2. Click **"Create Resources"**
3. Wait for build and deployment (5-10 minutes)

## 📝 Step 3: Update Environment Variables After Deployment

Once DO assigns domains:

1. Go to your App → **Settings** → **App-Level Environment Variables**
2. Update these values with actual domains:
   - `QBO_REDIRECT_URI=https://<ACTUAL_API_DOMAIN>/api/auth/qbo/callback`
   - `WEB_BASE_URL=https://<ACTUAL_WEB_DOMAIN>`
   - `APP_BASE_URL=https://<ACTUAL_WEB_DOMAIN>`
   - `NEXT_PUBLIC_API_BASE_URL=https://<ACTUAL_API_DOMAIN>`

3. Save and redeploy if needed

## 🔗 Step 4: Update Intuit Developer Portal

1. Go to [Intuit Developer Portal](https://developer.intuit.com/)
2. Select your app
3. Navigate to **"Keys & OAuth"** or **"Redirect URIs"**
4. Add the production redirect URI:
   ```
   https://<ACTUAL_API_DOMAIN>/api/auth/qbo/callback
   ```
5. Save changes

**Critical:** This must match exactly (character-for-character) with `QBO_REDIRECT_URI` in DO env vars.

## ✅ Step 5: Verification

### 5.1 API Health Check
```bash
curl -sS https://<API_DOMAIN>/api/health
```

**Expected Output:**
```json
{"ok":true,"service":"month-end-dashboard-api"}
```

### 5.2 Web Loads
- Open `https://<WEB_DOMAIN>` in browser
- Should see dashboard interface

### 5.3 OAuth Flow
1. Click **"Connect QBO"** in dashboard
2. Should redirect to Intuit login
3. After authorization, should redirect to:
   ```
   https://<WEB_DOMAIN>/?connected=1&orgId=...
   ```

### 5.4 Month-End Run
1. Select organization and date range
2. Click **"Run Month-End"**
3. Should fetch QBO data and display findings

## 🐛 Troubleshooting

### Build Fails
- Check DO build logs for errors
- Verify `package.json` has correct scripts
- Ensure Node.js version matches (20.x)

### Runtime Errors
- Check DO runtime logs
- Verify all environment variables are set
- Check database connection (DATABASE_URL)

### OAuth Fails
- Verify `QBO_REDIRECT_URI` matches Intuit exactly
- Check API logs for redirect errors
- Ensure `WEB_BASE_URL` is set correctly

### Web Can't Connect to API
- Verify `NEXT_PUBLIC_API_BASE_URL` is set correctly
- Check CORS settings in API
- Verify API domain is accessible


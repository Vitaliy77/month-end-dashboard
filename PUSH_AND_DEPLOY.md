# Push to GitHub & Deploy to DigitalOcean

## Step 1: Push to GitHub

Your code is committed locally at: `475239c64c2e4f985063ba202bf12c6f28e5f82c`

**Push command:**
```bash
cd ~/Documents/month-end-dashboard
git push -u origin main
```

If prompted for credentials:
- **Username:** `Vitaliy77`
- **Password:** Use a GitHub Personal Access Token (not your GitHub password)

**Verify push succeeded:**
Visit: https://github.com/Vitaliy77/month-end-dashboard
Confirm commit `475239c` is visible

## Step 2: DigitalOcean App Platform Deployment

### Create App

1. Go to: https://cloud.digitalocean.com/apps
2. Click **"Create App"**
3. Select **"GitHub"** → Authorize → Select repo: `Vitaliy77/month-end-dashboard`
4. Branch: `main`
5. Click **"Next"**

### Component A: API (Service)

**Settings:**
- **Type:** Service
- **Name:** `api`
- **Source Directory:** `api`
- **Build Command:** `npm ci && npm run build`
- **Run Command:** `npm start`
- **HTTP Port:** Leave empty (DO will inject `$PORT`)

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

**Important:**
- Do NOT set `PORT=8081` - let DO inject `$PORT`
- Use placeholder domains initially, update after deployment

### Component B: Web (Web Service)

**Settings:**
- **Type:** Web Service
- **Name:** `web`
- **Source Directory:** `web`
- **Build Command:** `npm ci && npm run build`
- **Run Command:** `npm start`
- **HTTP Port:** Leave empty (DO will inject `$PORT`)

**Environment Variables:**
```
NEXT_PUBLIC_API_BASE_URL=https://<API_DOMAIN>
NEXT_PUBLIC_API_PREFIX=/api
```

**Important:**
- Do NOT set `PORT=3010` - let DO inject `$PORT`
- Update `<API_DOMAIN>` after DO assigns domain

### Deploy

1. Review settings
2. Click **"Create Resources"**
3. Wait 5-10 minutes for deployment

### After Deployment: Update Environment Variables

Once DO assigns domains (e.g., `month-end-api-abc123.ondigitalocean.app`):

1. Go to App → **Settings** → **App-Level Environment Variables**
2. Update with actual domains:
   - `QBO_REDIRECT_URI=https://<ACTUAL_API_DOMAIN>/api/auth/qbo/callback`
   - `WEB_BASE_URL=https://<ACTUAL_WEB_DOMAIN>`
   - `APP_BASE_URL=https://<ACTUAL_WEB_DOMAIN>`
   - `NEXT_PUBLIC_API_BASE_URL=https://<ACTUAL_API_DOMAIN>`
3. Save and redeploy

## Step 3: Update Intuit Developer Portal

1. Go to: https://developer.intuit.com/
2. Select your app
3. **Keys & OAuth** → **Redirect URIs**
4. Add: `https://<ACTUAL_API_DOMAIN>/api/auth/qbo/callback`
5. Save

**Critical:** Must match `QBO_REDIRECT_URI` exactly (character-for-character)

## Step 4: Verification

### API Health
```bash
curl -sS https://<API_DOMAIN>/api/health
```
**Expected:** `{"ok":true,"service":"month-end-dashboard-api"}`

### Web
- Open: `https://<WEB_DOMAIN>`
- Should see dashboard

### OAuth
- Click "Connect QBO"
- Should redirect to Intuit → back to `https://<WEB_DOMAIN>/?connected=1&orgId=...`

### Month-End
- Select org/period → Run Month-End
- Should fetch data and show findings

## Troubleshooting

**Build fails:**
- Check DO build logs
- Verify Node.js 20.x
- Check package.json scripts

**Runtime errors:**
- Check DO runtime logs
- Verify all env vars set
- Check DATABASE_URL connection

**OAuth fails:**
- Verify QBO_REDIRECT_URI matches Intuit exactly
- Check API logs
- Verify WEB_BASE_URL

**Web can't connect:**
- Verify NEXT_PUBLIC_API_BASE_URL
- Check CORS in API
- Verify API domain accessible

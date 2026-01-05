# DigitalOcean API Component Migration: Buildpack → Dockerfile

## Problem
Current API component uses buildpack (`environment_slug: node-js`) and ignores `api/Dockerfile`, causing `ERR_MODULE_NOT_FOUND` for express.

## Solution
Create a NEW Dockerfile-based API component and migrate from the old buildpack component.

---

## Step-by-Step Migration

### Step 1: Create New Dockerfile-Based API Component

1. **Go to DigitalOcean App Platform:**
   - Navigate to: `monthenddashboard` app
   - Click **"Settings"** → **"Components"** (or **"Add Component"**)

2. **Add New Web Service:**
   - Click **"Add Component"** → **"Web Service"**
   - Configure:
     - **Name:** `month-end-dashboard-api-docker`
     - **Source:** Same repo/branch as current app
     - **Source Directory:** `api`
     - **Build Method:** `Dockerfile` (NOT buildpack)
     - **Dockerfile Path:** `Dockerfile` (relative to `api/` directory)
     - **HTTP Port:** `8080`
     - **Health Check Path:** `/api/health` (optional but recommended)

3. **Copy Environment Variables:**
   - In the new component settings, go to **"Environment Variables"**
   - Copy ALL env vars from the old API component:
     - `DATABASE_URL`
     - `PORT` (if set, or use default 8080)
     - `QBO_CLIENT_ID`
     - `QBO_CLIENT_SECRET`
     - `QBO_REDIRECT_URI`
     - `QBO_ENV`
     - `QBO_BASE_URL`
     - `APP_BASE_URL`
     - `WEB_BASE_URL`
     - Any other API-specific env vars

4. **Save and Deploy:**
   - Click **"Save"** or **"Deploy"**
   - Wait for build to complete

---

### Step 2: Verify Docker Build Logs

**Expected build log output:**
```
Step 1/8 : FROM node:20-alpine
Step 2/8 : WORKDIR /app
Step 3/8 : COPY package.json package-lock.json ./
Step 4/8 : RUN npm ci
  → Should show express@4.22.1 (or similar) installing
Step 5/8 : RUN node -p "require.resolve('express')"
  → Should show: /app/node_modules/express/...
Step 6/8 : COPY . .
Step 7/8 : RUN npm run build || true
  → Should show TypeScript compilation
Step 8/8 : CMD ["npm", "start"]
```

**If you see:**
- ✅ `FROM node:20-alpine` → Docker is being used
- ✅ `RUN npm ci` → Dependencies installing
- ✅ `require.resolve('express')` → Express is found
- ✅ `RUN npm run build` → Build completing

**If you DON'T see Docker steps:**
- Build method is still set to buildpack
- Go back to component settings and verify "Build Method: Dockerfile"

---

### Step 3: Verify New API Component is Healthy

1. **Check Health Endpoint:**
   - New component should have its own URL (e.g., `https://month-end-dashboard-api-docker-xxxxx.ondigitalocean.app`)
   - Test: `curl https://month-end-dashboard-api-docker-xxxxx.ondigitalocean.app/api/health`
   - Should return: `{"ok":true,"service":"month-end-dashboard-api"}`

2. **Check Runtime Logs:**
   - Go to **"Runtime Logs"** tab
   - Should see: `API listening on http://0.0.0.0:8080`
   - No `ERR_MODULE_NOT_FOUND` errors

---

### Step 4: Update Routing (If Needed)

**Option A: Update Ingress Route (if using separate domains)**
- If old API component had a route like `/api/*`, update it to point to new component
- Or keep both running temporarily for testing

**Option B: Update WEB Component API URL**
- If WEB component uses `NEXT_PUBLIC_API_BASE_URL`, update it to new component URL
- Or use internal service name if DO supports service discovery

**Option C: Keep Both Running (Testing Phase)**
- Keep old component running during migration
- Test new component independently
- Once verified, proceed to Step 5

---

### Step 5: Delete Old Buildpack Component

**⚠️ Only after new component is verified healthy:**

1. **Go to Components:**
   - Find `month-end-dashboard-api` (old buildpack component)

2. **Delete Component:**
   - Click **"Settings"** → **"Delete Component"**
   - Confirm deletion

3. **Verify:**
   - Old component removed
   - New `month-end-dashboard-api-docker` component is the only API service
   - WEB component can still reach API (if routing updated)

---

## Verification Checklist

- [ ] New Dockerfile-based component created
- [ ] Build logs show Docker steps (`FROM node:20-alpine`, `RUN npm ci`)
- [ ] Build logs show `require.resolve('express')` succeeds
- [ ] Build completes successfully
- [ ] Runtime logs show `API listening on http://0.0.0.0:8080`
- [ ] Health endpoint `/api/health` returns 200 OK
- [ ] No `ERR_MODULE_NOT_FOUND` errors in runtime logs
- [ ] Environment variables copied from old component
- [ ] Old buildpack component deleted (after verification)
- [ ] Routing updated (if needed)

---

## Troubleshooting

### Build fails with "Cannot find module 'express'"
- **Check:** Build logs should show `RUN npm ci` installing express
- **Fix:** Verify `package-lock.json` is committed and contains express
- **Verify:** `RUN node -p "require.resolve('express')"` step should pass

### Build succeeds but runtime fails with "Cannot find package 'express'"
- **Check:** Dockerfile `RUN npm ci` installs to `/app/node_modules`
- **Check:** `CMD ["npm", "start"]` runs from `/app` directory
- **Fix:** Ensure Dockerfile doesn't use `--omit=dev` (we need all deps for build)

### Build method still shows "Buildpack"
- **Check:** Component settings → Build Method → Must be "Dockerfile"
- **Check:** Dockerfile Path is set to `Dockerfile` (relative to source directory)
- **Fix:** Delete and recreate component if settings don't stick

---

## Expected Final State

- **API Component:** `month-end-dashboard-api-docker` (Dockerfile-based)
- **Build Method:** Dockerfile
- **Source Directory:** `api`
- **Dockerfile:** `api/Dockerfile`
- **Port:** 8080
- **Status:** Healthy, `/api/health` returns 200
- **Old Component:** Deleted


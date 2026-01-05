# DigitalOcean App Platform Configuration

## Repository Structure
- **Monorepo** with two components:
  - `/web` - Next.js frontend
  - `/api` - Express.js backend

## Component Configuration

### WEB Component

**Settings:**
- **Source Directory:** `web`
- **Build Command:** `npm ci && npm run build:ensure`
- **Run Command:** `npm run start`
- **HTTP Port:** `3010`
- **Environment:** Production

**Expected Build Log:**
```
npm ci
npm run build:ensure
  → rm -rf .next
  → next build
  → Verification: .next/server/pages-manifest.json exists
```

**Expected Runtime:**
```
npm run start
  → Verification: .next/server/pages-manifest.json exists
  → next start -p 3010
  → App listening on port 3010
```

### API Component

**Settings:**
- **Source Directory:** `api`
- **Build Command:** `npm ci && npm run build`
- **Run Command:** `npm start`
- **HTTP Port:** `8080`
- **Environment:** Production

**Expected Build Log:**
```
npm ci
npm run build
  → tsc -p tsconfig.json
  → Creates dist/server.js
```

**Expected Runtime:**
```
npm start
  → node dist/server.js
  → API listening on port 8080
```

## Important Notes

1. **NO Global Build Command:** Each component must have its own build + run commands at the component level.

2. **Source Directories:** 
   - WEB: `web`
   - API: `api`

3. **Ports:**
   - WEB: 3010
   - API: 8080

4. **Environment Variables:**
   - Set at component level (not app level)
   - WEB needs: `NEXT_PUBLIC_API_BASE_URL` (points to API component URL)
   - API needs: Database URL, QBO credentials, etc.

5. **Buildpack:**
   - Use `digitalocean/custom` or auto-detect Node.js
   - Both components use Node.js 20.x

## Verification Checklist

After deployment, verify:

- [ ] WEB build log shows `npm run build:ensure` completes
- [ ] WEB build log shows `.next/server/pages-manifest.json` created
- [ ] WEB runtime shows "Build OK" message
- [ ] WEB responds with HTTP 200 on root path
- [ ] API build log shows `npm run build` completes
- [ ] API runtime shows server listening on port 8080
- [ ] API responds with HTTP 200 on `/api/health`
- [ ] WEB can reach API (no CORS or connection errors)


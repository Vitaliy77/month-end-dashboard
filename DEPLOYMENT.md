# Deployment Guide

## Local Deployment

### Quick Start

1. **Setup Database**
   ```bash
   createdb month_end_dashboard
   ```

2. **Setup API**
   ```bash
   cd api
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm run dev
   ```
   API runs on: http://localhost:8081

3. **Setup Web**
   ```bash
   cd web
   npm install
   cp .env.example .env.local
   npm run dev
   ```
   Web runs on: http://localhost:3001

### Environment Variables

#### API (.env)

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `QBO_CLIENT_ID` - QuickBooks OAuth client ID
- `QBO_CLIENT_SECRET` - QuickBooks OAuth client secret
- `QBO_REDIRECT_URI` - Must match Intuit Developer Portal (e.g., `http://localhost:8081/api/auth/qbo/callback`)

Optional:
- `PORT` - API port (default: 8081)
- `HOST` - API host (default: 0.0.0.0)
- `WEB_BASE_URL` - Frontend URL (default: http://localhost:3001)
- `QBO_ENV` - sandbox or production (default: sandbox)

#### Web (.env.local)

Optional:
- `NEXT_PUBLIC_API_BASE_URL` - API URL (default: http://localhost:8081)
- `NEXT_PUBLIC_API_PREFIX` - API prefix (default: /api)
- `PORT` - Web port (default: 3001)

## Production Deployment

### Build for Production

```bash
# API
cd api
npm install
npm run build
npm start

# Web
cd web
npm install
npm run build
npm start
```

### Production Environment Variables

Update your production `.env` files with production values:

- Use production PostgreSQL database
- Use production QuickBooks credentials
- Set `QBO_ENV=production`
- Update `QBO_REDIRECT_URI` to production URL
- Set appropriate `WEB_BASE_URL` and `APP_BASE_URL`

### Database Migration

The database schema is automatically created on first API startup. Ensure your PostgreSQL database is accessible and the `DATABASE_URL` is correctly configured.

### Port Configuration

Default ports:
- API: 8081
- Web: 3001

To change ports, set `PORT` environment variable in respective `.env` files.

## Troubleshooting

### Database Connection Issues

- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL is running
- Check database user permissions

### OAuth Issues

- Verify `QBO_REDIRECT_URI` matches Intuit Developer Portal exactly
- Check that `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET` are correct
- Ensure you're using the correct environment (sandbox vs production)

### Port Conflicts

If ports 8081 or 3001 are in use:
- Change `PORT` in API `.env`
- Change `PORT` in Web `.env.local` or use `npm run dev -p <port>`
- Update `NEXT_PUBLIC_API_BASE_URL` in Web `.env.local` to match new API port


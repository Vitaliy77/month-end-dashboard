#!/bin/bash
# scripts/doctor.sh - Diagnostic script for month-end-dashboard

set -e

echo "=== Month-End Dashboard Diagnostics ==="
echo ""

ERRORS=0

# Check web server
echo "1. Checking web server (http://localhost:3010)..."
if curl -sSf -o /dev/null --max-time 3 http://localhost:3010; then
  echo "   ✅ Web server is responding"
else
  echo "   ❌ Web server is NOT responding"
  echo "      Run: npm run dev:web"
  ERRORS=$((ERRORS + 1))
fi

# Check API health
echo ""
echo "2. Checking API health endpoint (http://localhost:8081/api/health)..."
HEALTH_RESPONSE=$(curl -sS --max-time 3 http://localhost:8081/api/health 2>&1 || echo "FAILED")
if echo "$HEALTH_RESPONSE" | grep -q '"ok":true'; then
  echo "   ✅ API health check passed"
  echo "   Response: $HEALTH_RESPONSE"
else
  echo "   ❌ API health check failed"
  echo "   Response: $HEALTH_RESPONSE"
  echo "      Run: npm run dev:api"
  ERRORS=$((ERRORS + 1))
fi

# Check API orgs endpoint
echo ""
echo "3. Checking API orgs endpoint (http://localhost:8081/api/orgs)..."
ORGS_RESPONSE=$(curl -sS --max-time 3 http://localhost:8081/api/orgs 2>&1 || echo "FAILED")
if echo "$ORGS_RESPONSE" | grep -q '"ok":true'; then
  echo "   ✅ API orgs endpoint working"
  echo "   Response: $(echo "$ORGS_RESPONSE" | head -c 100)..."
else
  echo "   ❌ API orgs endpoint failed"
  echo "   Response: $ORGS_RESPONSE"
  echo "      Check API server logs"
  ERRORS=$((ERRORS + 1))
fi

# Check environment files
echo ""
echo "4. Checking environment files..."
if [ -f "web/.env.local" ]; then
  echo "   ✅ web/.env.local exists"
  if grep -q "NEXT_PUBLIC_API_BASE_URL=http://localhost:8081" web/.env.local; then
    echo "   ✅ NEXT_PUBLIC_API_BASE_URL is set correctly"
  else
    echo "   ⚠️  NEXT_PUBLIC_API_BASE_URL may be incorrect"
  fi
else
  echo "   ⚠️  web/.env.local not found (copy from web/.env.example)"
fi

if [ -f "api/.env" ]; then
  echo "   ✅ api/.env exists"
else
  echo "   ⚠️  api/.env not found (copy from api/.env.example)"
fi

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "✅ All checks passed! App is ready."
  exit 0
else
  echo "❌ Found $ERRORS issue(s). Please fix and retry."
  exit 1
fi

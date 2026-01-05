#!/bin/bash
# scripts/verify-web.sh - Verify web server is running and reachable on port 3010

set -e

PORT=${1:-3010}
URL_IP="http://127.0.0.1:$PORT"
URL_HOST="http://localhost:$PORT"

echo "=== Verifying web server on port $PORT ==="
echo ""

# Check if something is listening
LISTENER=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null || true)

if [ -z "$LISTENER" ]; then
  echo "❌ No process is listening on port $PORT"
  echo "   Start the server with: npm run dev:web"
  exit 1
fi

echo "✅ Process listening on port $PORT:"
echo "$LISTENER"
echo ""

# Check for Turbopack env vars (they might force Turbopack mode)
TURBO_ENV=$(env | grep -i turbo || true)
if [ -n "$TURBO_ENV" ]; then
  echo "⚠️  Warning: Turbopack-related environment variables detected:"
  echo "$TURBO_ENV"
  echo ""
fi

# Test both 127.0.0.1 and localhost
FAILED=0

echo "Testing http://127.0.0.1:$PORT/ ..."
HTTP_RESPONSE_IP=$(curl -I --max-time 5 "$URL_IP" 2>&1 || echo "FAILED")

if echo "$HTTP_RESPONSE_IP" | grep -q "HTTP/"; then
  echo "✅ http://127.0.0.1:$PORT/ is responding:"
  echo "$HTTP_RESPONSE_IP" | head -3
  echo ""
else
  echo "❌ http://127.0.0.1:$PORT/ failed"
  echo "Response: $HTTP_RESPONSE_IP"
  FAILED=1
fi

echo "Testing http://localhost:$PORT/ ..."
HTTP_RESPONSE_HOST=$(curl -I --max-time 5 "$URL_HOST" 2>&1 || echo "FAILED")

if echo "$HTTP_RESPONSE_HOST" | grep -q "HTTP/"; then
  echo "✅ http://localhost:$PORT/ is responding:"
  echo "$HTTP_RESPONSE_HOST" | head -3
  echo ""
else
  echo "❌ http://localhost:$PORT/ failed"
  echo "Response: $HTTP_RESPONSE_HOST"
  FAILED=1
fi

if [ $FAILED -eq 0 ]; then
  echo "✅ Web server verification passed! Both URLs are responding."
  exit 0
else
  echo "❌ One or more URLs failed"
  echo ""
  echo "Debug info:"
  echo "  Port listeners:"
  lsof -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null || echo "    (none)"
  echo "  DNS lookup for localhost:"
  node -e "require('dns').lookup('localhost',{all:true},(e,a)=>{console.log(e||JSON.stringify(a,null,2))})" 2>&1 || echo "    (DNS lookup failed)"
  echo "  Turbopack env vars:"
  env | grep -i turbo || echo "    (none)"
  echo ""
  echo "The server may still be compiling or may have binding issues. Check server logs."
  exit 1
fi


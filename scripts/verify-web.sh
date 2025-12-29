#!/bin/bash
# scripts/verify-web.sh - Verify web server is running and reachable on port 3010

set -e

PORT=${1:-3010}
URL="http://127.0.0.1:$PORT"

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

# Check HTTP response - REQUIRE real HTTP headers
echo "Testing HTTP response (must return headers within 5s)..."
HTTP_RESPONSE=$(curl -I --max-time 5 "$URL" 2>&1 || echo "FAILED")

if echo "$HTTP_RESPONSE" | grep -q "HTTP/"; then
  echo "✅ HTTP server is responding:"
  echo "$HTTP_RESPONSE" | head -5
  echo ""
  echo "✅ Web server verification passed!"
  exit 0
else
  echo "❌ HTTP server is not responding correctly"
  echo "Response: $HTTP_RESPONSE"
  echo ""
  echo "Debug info:"
  echo "  Port listeners:"
  lsof -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null || echo "    (none)"
  echo "  Turbopack env vars:"
  env | grep -i turbo || echo "    (none)"
  echo ""
  echo "The server may still be compiling or may be stuck. Check server logs."
  exit 1
fi


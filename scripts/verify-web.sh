#!/bin/bash
# scripts/verify-web.sh - Verify web server is running and reachable on port 3010

set -e

PORT=${1:-3010}
URL="http://localhost:$PORT"

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

# Check HTTP response
echo "Testing HTTP response..."
HTTP_RESPONSE=$(curl -I --max-time 3 "$URL" 2>&1 || echo "FAILED")

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
  echo "The server may still be compiling. Wait a few seconds and try again."
  exit 1
fi


#!/bin/bash
# scripts/free-port.sh - Free a port by killing any process listening on it

set -e

PORT=${1:-3010}

echo "=== Freeing port $PORT ==="

# Check if anything is listening
LISTENERS=$(lsof -ti tcp:$PORT 2>/dev/null || true)

if [ -z "$LISTENERS" ]; then
  echo "✅ Port $PORT is already free"
  exit 0
fi

echo "Found process(es) listening on port $PORT:"
lsof -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null || true

echo ""
echo "Killing process(es)..."
echo "$LISTENERS" | xargs kill -9 2>/dev/null || true

sleep 1

# Verify port is free
REMAINING=$(lsof -ti tcp:$PORT 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
  echo "⚠️  Some processes may still be holding the port. Retrying..."
  echo "$REMAINING" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# Final check
FINAL=$(lsof -ti tcp:$PORT 2>/dev/null || true)
if [ -z "$FINAL" ]; then
  echo "✅ Port $PORT is now free"
  exit 0
else
  echo "❌ Port $PORT is still in use by:"
  lsof -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null || true
  exit 1
fi


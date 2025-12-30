#!/bin/bash
# Verify QBO configuration and OAuth flow setup

set -e

API_URL="${API_URL:-http://localhost:8080}"

echo "=== QBO Credentials Verification ==="
echo ""

# Check if API is running
if ! curl -s --max-time 2 "${API_URL}/api/health" > /dev/null 2>&1; then
  echo "❌ ERROR: API is not running at ${API_URL}"
  echo "   Start the API with: cd api && npm run dev"
  exit 1
fi

echo "✓ API is running"
echo ""

# Get QBO credentials info
echo "=== QBO Credentials Debug ==="
CREDS_JSON=$(curl -s --max-time 5 "${API_URL}/api/debug/qbo-creds")

if [ -z "$CREDS_JSON" ]; then
  echo "❌ ERROR: Failed to fetch QBO credentials debug info"
  exit 1
fi

echo "$CREDS_JSON" | python3 -m json.tool 2>/dev/null || echo "$CREDS_JSON"
echo ""

# Extract values for validation
QBO_ENV=$(echo "$CREDS_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin).get('qbo_env', ''))" 2>/dev/null || echo "")
CLIENT_ID_LEN=$(echo "$CREDS_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin).get('client_id_length', 0))" 2>/dev/null || echo "0")
CLIENT_SECRET_LEN=$(echo "$CREDS_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin).get('client_secret_length', 0))" 2>/dev/null || echo "0")
CLIENT_ID_LAST6=$(echo "$CREDS_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin).get('client_id_last6', ''))" 2>/dev/null || echo "")

# Validate credentials
echo "=== Validation ==="
ERRORS=0

if [ -z "$CLIENT_ID_LAST6" ] || [ "$CLIENT_ID_LAST6" = "N/A" ]; then
  echo "❌ ERROR: Client ID is missing or invalid"
  ERRORS=$((ERRORS + 1))
else
  echo "✓ Client ID present (last6: $CLIENT_ID_LAST6)"
fi

if [ "$QBO_ENV" = "sandbox" ]; then
  # Sandbox Client Secret is typically 40 characters
  if [ "$CLIENT_SECRET_LEN" -ne 40 ]; then
    echo "⚠ WARNING: Sandbox Client Secret length is $CLIENT_SECRET_LEN (expected ~40)"
    echo "   This might indicate a wrong secret or copy/paste issue"
  else
    echo "✓ Client Secret length looks correct for sandbox ($CLIENT_SECRET_LEN chars)"
  fi
fi

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "❌ Validation failed with $ERRORS error(s)"
  exit 1
fi

echo ""

# Test OAuth connect endpoint
echo "=== Testing OAuth Connect Endpoint ==="

# Get first org ID
ORG_JSON=$(curl -s --max-time 5 "${API_URL}/api/orgs")
FIRST_ORG_ID=$(echo "$ORG_JSON" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('orgs', [{}])[0].get('id', '') if data.get('orgs') else '')" 2>/dev/null || echo "")

if [ -z "$FIRST_ORG_ID" ]; then
  echo "⚠ WARNING: No organizations found. Creating a test org..."
  # Try to create one
  CREATE_RESP=$(curl -s -X POST "${API_URL}/api/orgs" \
    -H "Content-Type: application/json" \
    -d '{"name":"Test Org for OAuth"}')
  FIRST_ORG_ID=$(echo "$CREATE_RESP" | python3 -c "import sys, json; print(json.load(sys.stdin).get('org', {}).get('id', ''))" 2>/dev/null || echo "")
fi

if [ -z "$FIRST_ORG_ID" ]; then
  echo "❌ ERROR: Could not get or create an organization ID"
  exit 1
fi

echo "Using orgId: $FIRST_ORG_ID"
echo ""

# Test connect endpoint
CONNECT_RESP=$(curl -s -i --max-time 5 "${API_URL}/api/auth/qbo/connect?orgId=${FIRST_ORG_ID}")

# Check for Location header
if echo "$CONNECT_RESP" | grep -qi "Location:"; then
  LOCATION=$(echo "$CONNECT_RESP" | grep -i "Location:" | head -1 | sed 's/^[^:]*: *//' | tr -d '\r')
  echo "✓ OAuth connect endpoint returns Location header"
  echo "  Location: $LOCATION"
  if echo "$LOCATION" | grep -q "appcenter.intuit.com"; then
    echo "✓ Location points to Intuit OAuth (correct)"
  else
    echo "⚠ WARNING: Location does not point to Intuit OAuth"
  fi
else
  echo "❌ ERROR: OAuth connect endpoint does not return Location header"
  echo ""
  echo "Response (first 25 lines):"
  echo "$CONNECT_RESP" | head -25
  exit 1
fi

echo ""
echo "=== Verification Complete ==="
echo "✓ API is running"
echo "✓ QBO credentials are configured"
echo "✓ OAuth connect endpoint works"
echo ""
echo "Next steps:"
echo "1. Click 'Connect QBO' in the web app"
echo "2. Complete the OAuth flow"
echo "3. If you get 401 invalid_client, regenerate the Client Secret in Intuit Portal"
echo "   (see README for detailed instructions)"


#!/bin/bash
# Test script to verify API routes are working

echo "=== Step 1: Kill existing API server ==="
lsof -ti tcp:8080 | xargs kill -9 2>/dev/null && echo "Killed" || echo "No process found"
sleep 2

echo ""
echo "=== Step 2: Start API server ==="
cd /Users/vitaliyulitovsky/Documents/month-end-dashboard/api
npm run dev > /tmp/api-server.log 2>&1 &
API_PID=$!
echo "API server started with PID: $API_PID"
sleep 8

echo ""
echo "=== Step 3: Test /api/health ==="
curl -i http://localhost:8080/api/health
echo ""
echo ""

echo "=== Step 4: Test /api/runs/month-end/qbo ==="
curl -i "http://localhost:8080/api/runs/month-end/qbo?orgId=bf6c00c9-de64-4450-ba26-e7445eddb4da&from=2025-10-01&to=2025-11-30"
echo ""
echo ""

echo "=== Step 5: Test /api/debug/routes ==="
curl -s http://localhost:8080/api/debug/routes | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8080/api/debug/routes
echo ""
echo ""

echo "=== Step 6: Check if /api/runs/month-end/qbo is in routes list ==="
curl -s http://localhost:8080/api/debug/routes | grep -i "runs/month-end" && echo "✅ Route found!" || echo "❌ Route NOT found!"
echo ""

echo "=== API server log (last 20 lines) ==="
tail -20 /tmp/api-server.log


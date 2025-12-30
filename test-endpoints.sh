#!/bin/bash
# Test script for API endpoints

echo "=== 1. Testing API Health ==="
curl -i http://localhost:8080/api/health
echo ""
echo ""

echo "=== 2. Testing API Runs Endpoint ==="
curl -i "http://localhost:8080/api/runs/month-end/qbo?orgId=bf6c00c9-de64-4450-ba26-e7445eddb4da&from=2025-10-01&to=2025-11-30"
echo ""
echo ""

echo "=== 3. Testing Debug Routes Endpoint ==="
curl http://localhost:8080/api/debug/routes | jq '.' 2>/dev/null || curl http://localhost:8080/api/debug/routes
echo ""
echo ""

echo "=== 4. Verifying /api/runs/month-end/qbo exists in routes ==="
curl -s http://localhost:8080/api/debug/routes | grep -i "runs/month-end" || echo "Route NOT FOUND in debug/routes output"
echo ""


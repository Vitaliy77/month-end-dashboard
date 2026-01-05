#!/usr/bin/env bash
set -euo pipefail

echo "== Node =="
node -v
echo

echo "== API health =="
curl -sf http://127.0.0.1:8080/api/health | cat
echo
echo

echo "== Orgs =="
curl -sf http://127.0.0.1:8080/api/orgs | head -c 400
echo
echo

echo "== Web listening (3011) =="
lsof -nP -iTCP:3011 -sTCP:LISTEN >/dev/null && echo "OK: web listening" || (echo "FAIL: web not listening" && exit 1)

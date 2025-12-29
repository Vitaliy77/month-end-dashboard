#!/bin/bash
# Push script for month-end-dashboard

set -e

echo "=== Checking GitHub Repository ==="
GITHUB_TOKEN="${GITHUB_TOKEN:?Set GITHUB_TOKEN env var}"

# Check if repo exists
echo "Checking if repo exists..."
REPO_CHECK=$(curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/Vitaliy77/month-end-dashboard 2>&1)

if echo "$REPO_CHECK" | grep -q '"message":"Not Found"'; then
  echo "❌ Repo not found. Listing your repos..."
  curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
    "https://api.github.com/user/repos?per_page=200" \
    | python3 -c "import sys, json; r=json.load(sys.stdin); print('\n'.join(sorted([x['full_name'] for x in r])))" \
    | grep -i "month-end" || echo "No month-end repos found"
  exit 1
else
  echo "✅ Repo exists: Vitaliy77/month-end-dashboard"
  echo "$REPO_CHECK" | grep -E '"full_name"|"default_branch"' | head -2
fi

echo ""
echo "=== Git Remote Status ==="
cd ~/Documents/month-end-dashboard
git remote -v

echo ""
echo "=== Setting Remote ==="
git remote set-url origin https://github.com/Vitaliy77/month-end-dashboard.git
git remote -v

echo ""
echo "=== Current Commit ==="
git log -1 --oneline

echo ""
echo "=== Pushing to GitHub ==="
echo "Note: You may be prompted for credentials"
echo "Username: Vitaliy77"
echo "Password: Use your GitHub Personal Access Token"
echo ""
git push -u origin main

echo ""
echo "✅ Push complete! Verify at: https://github.com/Vitaliy77/month-end-dashboard"

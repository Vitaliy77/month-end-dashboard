# Create GitHub Repo and Push

## Status
❌ Repository `Vitaliy77/month-end-dashboard` does NOT exist yet (404)

## Step 1: Create the Repository

### Option A: Via GitHub Web UI (Recommended)
1. Go to: https://github.com/new
2. Repository name: `month-end-dashboard`
3. Owner: `Vitaliy77`
4. Description: "Month-End Dashboard for QuickBooks Online"
5. Visibility: Private or Public (your choice)
6. **DO NOT** initialize with README, .gitignore, or license
7. Click **"Create repository"**

### Option B: Via GitHub API
```bash
(redacted) Use your GitHub PAT: <YOUR_GITHUB_PAT>

curl -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/user/repos \
  -d '{
    "name": "month-end-dashboard",
    "description": "Month-End Dashboard for QuickBooks Online",
    "private": false
  }'
```

## Step 2: Push Code

After creating the repo, push your code:

```bash
cd ~/Documents/month-end-dashboard

# Verify remote
git remote -v

# Set remote (if needed)
git remote set-url origin https://github.com/Vitaliy77/month-end-dashboard.git

# Push
git push -u origin main
```

**When prompted:**
- Username: `Vitaliy77`
- Password: Use your GitHub Personal Access Token (the one from GitHub settings (PAT))

## Step 3: Verify Push

Visit: https://github.com/Vitaliy77/month-end-dashboard

You should see:
- Commit `475239c` - "Deploy-ready: env-based URLs, DO App Platform support"
- All your code files

## Troubleshooting

### If push fails with 403:
1. Your PAT may not have write permissions
2. Create a new fine-grained PAT:
   - Go to: https://github.com/settings/tokens?type=beta
   - Resource owner: `Vitaliy77`
   - Repository access: Only selected repositories → `month-end-dashboard`
   - Permissions: Repository permissions → Contents: Read and write
3. Use the new PAT as password when pushing

### If push fails with "repository not found":
- Verify repo was created successfully
- Check repo name matches exactly: `month-end-dashboard`
- Verify you're pushing to the correct owner: `Vitaliy77`

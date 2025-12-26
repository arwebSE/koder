# Git Setup

This repository is ready for GitHub connection with PAT token configured.

## Current Status

✅ Repository initialized with all files
✅ GitHub Actions workflow configured (matches yapper pattern)
✅ PAT token added to `.env` for CI/CD operations
⏳ Waiting for GitHub repository creation

## Instructions for Human:

The PAT token lacks repository creation permissions. Please create the repo manually:

1. **Visit GitHub**: https://github.com/arwebSE/new
2. **Create repository**:
   - Name: `kod`
   - Description: `Mobile web wrapper for Claude Code CLI`
   - Visibility: **Private**
   - Don't initialize with README (already exists)
3. **Connect and push**:
   ```bash
   cd ../kod
   git remote set-url origin https://github.com/arwebSE/kod.git
   git push -u origin master
   ```

## GitHub Repository Details

- **Name**: kod
- **Visibility**: Private
- **Owner**: arwebSE
- **Description**: Mobile web wrapper for Claude Code CLI

## Automated Setup Ready

Once pushed to GitHub:
- ✅ GitHub Actions will trigger on `main` branch
- ✅ Self-hosted runner with `homelab` label will execute
- ✅ Automated deployment to buntubox server
- ✅ Health checks and verification

## Workflow Features

- **Test job**: Syntax verification and dependency checks
- **Deploy job**: Production deployment with container rebuild
- **Manual trigger**: `workflow_dispatch` for manual deployments
- **Environment variables**: Centralized stack path configuration
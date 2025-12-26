# Git Setup

This repository is ready for GitHub connection with PAT token configured.

## Current Status

✅ Repository initialized with all files
✅ GitHub Actions workflow configured (matches yapper pattern)
✅ PAT token added to `.env` for CI/CD operations
⏳ Waiting for GitHub repository creation

## Instructions for Human:

1. Create private repository: `https://github.com/micr0-dev/code-webapp`
2. Connect and push:
   ```bash
   cd ../code-webapp
   git remote add origin https://micr0-dev:GITHUB_TOKEN@github.com/micr0-dev/code-webapp.git
   git push -u origin master
   ```
   *Or use GitHub CLI/SSH key if preferred*

## GitHub Repository Details

- **Name**: code-webapp
- **Visibility**: Private
- **Owner**: micr0-dev
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
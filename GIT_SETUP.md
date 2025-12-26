# Git Setup

This repository needs to be connected to a private GitHub repository.

## Instructions for Human:

1. Create a private repository on GitHub: `https://github.com/micr0-dev/code-webapp`
2. Add this repository as remote:
   ```bash
   cd ../code-webapp
   git remote add origin git@github.com:micr0-dev/code-webapp.git
   git push -u origin master
   ```

## GitHub Repository

- **Name**: code-webapp
- **Visibility**: Private
- **Owner**: micr0-dev
- **Description**: Mobile web wrapper for Claude Code CLI

## Next Steps

1. Connect to GitHub repository
2. Enable GitHub Actions with self-hosted runner
3. Configure runner with label `homelab`
4. Set up repository secrets if needed
5. Test deployment workflow

The GitHub Actions workflow is already configured and will trigger on push to main branch once the repository is connected.
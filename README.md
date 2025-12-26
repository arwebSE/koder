# Code Web App

Mobile web wrapper for Claude Code CLI that provides a chat interface with predefined path selection.

## Overview

This is a minimal web application that acts as a wrapper for the Claude Code CLI, providing a mobile-friendly chat interface accessible via `code.arweb.dev`. Users can select predefined working directories and interact with Claude Code through a conversational interface.

## Features

- **Mobile-first responsive design** optimized for touch interaction
- **Predefined path selection** for quick directory switching
- **Session management** with UUID tracking
- **Real-time chat interface** with typing indicators
- **Code block formatting** with syntax highlighting
- **Secure deployment** via public network with SSL

## Architecture

- **Frontend**: Vanilla HTML/CSS/JavaScript with mobile-first design
- **Backend**: Express.js server executing Claude CLI commands
- **Deployment**: Docker containerized with Nginx Proxy Manager
- **Session Storage**: In-memory session management with 30-minute timeout

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm start
```

## Deployment

This project uses GitHub Actions with self-hosted runners for CI/CD deployment. See `.github/workflows/deploy.yml` for the automated deployment pipeline.

### Manual Deployment

```bash
# Deploy to homelab server
scp . mi@buntubox:~/docker/stacks/code-webapp/
ssh mi@buntubox "cd ~/docker/stacks/code-webapp && docker compose -f code-webapp.yml up -d --build"
```

## URLs

- **Web App**: https://code.arweb.dev
- **API**: https://code.arweb.dev/api

## Session Management

Sessions are tracked using UUIDs and automatically expire after 30 minutes of inactivity. Each session maintains its own working directory context.

## Security

- Read-only file system access to user directories
- Container runs as non-root user
- SSL enforced via Nginx Proxy Manager
- Session isolation and automatic cleanup

## API Endpoints

- `POST /api/chat` - Send message to Claude Code
- `POST /api/session/:sessionId/end` - End session
- `GET /api/health` - Health check

## Predefined Paths

- `/Users/Pc/repos/homelab` - Homelab repository
- `/Users/Pc/repos` - Main repositories directory
- `/Users/Pc` - User home directory
- `/Users/Pc/repos/code-webapp` - This project

## AGENTS.md

See [AGENTS.md](./AGENTS.md) for deployment instructions and guidelines for AI agents working on this repository.
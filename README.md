# Koder

Mobile web wrapper for Claude Code CLI that provides a chat interface with predefined path selection.

## Overview

This is a minimal web application that acts as a wrapper for the Claude Code CLI, providing a mobile-friendly chat interface accessible via `kod.arweb.dev`. Users can select predefined working directories and interact with Claude Code through a conversational interface.

## Features

- **React-based SPA** with modern component architecture
- **Mobile-first responsive design** optimized for touch interaction
- **AI Provider Toggle**: Switch between Claude Code and opencode
- **Predefined path selection** for quick directory switching
- **Session management** with UUID tracking per AI provider
- **Real-time chat interface** with typing indicators
- **Code block formatting** with syntax highlighting
- **Provider-specific visual indicators** for responses
- **Hot reload development** with Vite dev server
- **Secure deployment** via public network with SSL

## Architecture

- **Frontend**: React + Vite with mobile-first responsive design
- **Backend**: Python FastAPI server executing AI CLI commands (Claude Code or opencode)
- **Async Support**: Non-blocking I/O for better concurrency
- **Package Management**: uv for Python, npm for frontend
- **Task Runner**: Just for shorthand commands
- **API Documentation**: Auto-generated at `/docs` endpoint
- **Deployment**: Multi-stage Docker build for production optimization
- **Session Storage**: In-memory session management with 30-minute timeout

## Development

```bash
# Install just (if not already installed)
# macOS: brew install just
# Linux: cargo install just

# Install dependencies
just install

# Start development server
just run

# Start with hot reload
just dev

# Build and run Docker container
just docker-run
```

## Deployment

This project uses GitHub Actions with self-hosted runners for CI/CD deployment. See `.github/workflows/deploy.yml` for the automated deployment pipeline.

### Manual Deployment

```bash
# Deploy to homelab server
just deploy

# Or deploy only code changes (faster)
just deploy-code
```

## URLs

- **Web App**: https://kod.arweb.dev
- **API**: https://kod.arweb.dev/api
- **API Docs**: https://kod.arweb.dev/docs (FastAPI auto-documentation)

## Session Management

Sessions are tracked using UUIDs and automatically expire after 30 minutes of inactivity. Each session maintains its own working directory context.

## Security

- Read-only file system access to user directories
- Container runs as non-root user
- SSL enforced via Nginx Proxy Manager
- Session isolation and automatic cleanup

## API Endpoints

- `POST /api/chat` - Send message to AI (Claude Code or opencode)
- `POST /api/session/{sessionId}/end` - End session
- `GET /api/health` - Health check with session statistics
- `GET /docs` - Interactive API documentation (FastAPI)

## Predefined Paths

- `/Users/Pc/repos/homelab` - Homelab repository
- `/Users/Pc/repos` - Main repositories directory
- `/Users/Pc` - User home directory
- `/Users/Pc/repos/koder` - This project

## AGENTS.md

See [AGENTS.md](./AGENTS.md) for deployment instructions and guidelines for AI agents working on this repository.

## Recent Changes

This project has been renamed from "kod" to "koder" with the following updates:
- ✅ Repository renamed to `koder`
- ✅ Container renamed to `koder` 
- ✅ Domain updated to `kod.arweb.dev`
- ✅ All documentation updated
- ✅ Deployment path updated to `/home/mi/docker/stacks/koder/`

**Note:** You may need to update your Nginx Proxy Manager configuration to point `kod.arweb.dev` to the new `koder` container.
# AGENTS.md

This file provides guidance to AI agents when working with the koder repository.

## Project Overview

This is a mobile web wrapper for AI CLI tools deployed as part of the homelab infrastructure. The application provides a chat interface with predefined path selection for interacting with either Claude Code or opencode, with provider toggle functionality.

## Deployment Instructions

### GitHub Actions Workflow

This project uses GitHub Actions with self-hosted runners for automated deployment. The workflow is defined in `.github/workflows/deploy.yml`.

**IMPORTANT:** Always use the self-hosted runner with label `homelab` for deployment:

```yaml
jobs:
  deploy:
    runs-on: [self-hosted, homelab]
```

### Deployment Process

1. **Changes are pushed** to the repository
2. **GitHub Actions** triggers on push to main branch
3. **Self-hosted runner** executes deployment script
4. **Files are copied** to `~/docker/stacks/koder/` on buntubox
5. **Docker container** is rebuilt and restarted
6. **NPM proxy** is configured for `kod.arweb.dev`

### Manual Deployment (if needed)

```bash
# Using just commands (recommended)
just deploy
just deploy-code

# Or manual commands
scp . mi@buntubox:~/docker/stacks/koder/
ssh mi@buntubox "cd ~/docker/stacks/koder && docker compose -f kod.yml up -d --build"
```

## Repository Structure

```
koder/
├── frontend/
│   ├── src/                # React source code
│   │   ├── App.jsx         # Main React component
│   │   ├── App.css         # Component styles
│   │   ├── main.jsx        # React entry point
│   │   └── index.css       # Global styles
│   ├── package.json        # Frontend dependencies
│   ├── vite.config.js      # Vite configuration
│   └── index.html         # HTML template
├── server/
│   └── app.py              # Python FastAPI backend
├── kod.yml         # Docker Compose configuration
├── Dockerfile              # Multi-stage build (React + Python)
├── pyproject.toml          # Python dependencies with uv
├── justfile                # Task runner commands
├── .github/workflows/
│   └── deploy.yml          # GitHub Actions workflow
├── README.md               # Project documentation
└── AGENTS.md               # This file
```

## Key Files and Their Purpose

### Frontend (`frontend/src/`)
- React SPA with modern component architecture
- Mobile-first responsive chat interface
- AI provider toggle (Claude Code vs opencode)
- Path selection dropdown for predefined directories
- WebSocket-like real-time messaging
- Session management with UUID tracking
- Provider-specific visual indicators for responses
- Hot reload development with Vite

### Backend (`server/app.py`)
- Python FastAPI server executing AI CLI commands (Claude Code or opencode)
- Async support for better concurrency and performance
- Session management with 30-minute timeout per provider
- File system access with security constraints
- Automatic API documentation at `/docs` endpoint
- Request/response validation with Pydantic models
- Provider-aware session isolation

### Deployment (`kod.yml`)
- Docker Compose configuration
- Uses `public_net` for internet exposure via NPM
- Read-only mount of user directories for security

## Configuration

### Predefined Paths
Paths are hardcoded in `public/index.html`:
- `/Users/Pc/repos/homelab`
- `/Users/Pc/repos`
- `/Users/Pc`
- `/Users/Pc/repos/koder`

### Docker Configuration
- Runs as non-root user (python:1001)
- Uses Python 3.11 with uv for dependency management
- Exposes port 3000 internally
- Connects to `public_net` network for NPM proxying
- Installs both Claude CLI and opencode in container

## Testing

After deployment, verify:
1. **Web interface** loads at `https://kod.arweb.dev`
2. **Path selection** works correctly
3. **Chat interface** responds to messages
4. **API documentation** is accessible at `https://kod.arweb.dev/docs`
5. **Claude CLI** executes commands properly
6. **opencode** executes commands properly
7. **AI provider toggle** switches between providers correctly
8. **Mobile responsiveness** on different screen sizes
9. **Session isolation** works between providers
5. **Mobile responsiveness** on different screen sizes

## Security Considerations

- Container runs with read-only file system access
- Non-root user execution
- SSL enforced via NPM
- Session isolation and automatic cleanup
- No direct file write access from the web interface

## NPM Proxy Configuration

The service is proxied through Nginx Proxy Manager:
- **Domain**: `kod.arweb.dev`
  - **Container**: `koder`
- **Port**: 3000
- **SSL**: Forced with wildcard certificate
- **WebSocket**: Supported for real-time features

## Common Issues and Solutions

### Container won't start
```bash
# Check logs
ssh mi@buntubox "docker logs koder"

# Rebuild and restart
ssh mi@buntubox "cd ~/docker/stacks/koder && docker compose down && docker compose up -d --build"
```

### NPM proxy not working
```bash
# Connect NPM to network (if needed)
ssh mi@buntubox "docker network connect public_net npm-public"

# Verify NPM proxy host configuration via web UI
# http://100.70.44.41:82
```

### Claude CLI not found
Ensure Claude CLI is installed on the buntubox host:
```bash
ssh mi@buntubox "which claude"
```

## Development Guidelines

### When Making Changes

1. **Frontend changes**: Update React components in `frontend/src/` and test mobile responsiveness
2. **Backend changes**: Update `server/app.py` and test API endpoints at `/docs`
3. **Deployment changes**: Update `kod.yml` or `Dockerfile`
4. **New Python dependencies**: Add to `pyproject.toml` and rebuild container
5. **New frontend dependencies**: Add to `frontend/package.json` and rebuild frontend
6. **API changes**: Test with FastAPI auto-docs at `http://localhost:3000/docs`

### Commit and Deploy Workflow

1. **Make changes** locally
2. **Test** functionality if possible
3. **Commit changes** with descriptive message
4. **Push to main branch** (triggers automatic deployment)
5. **Verify deployment** at `https://kod.arweb.dev`

### Session Management

Sessions are stored in memory and expire after 30 minutes. Each session maintains:
- UUID identifier
- Working directory path
- Creation timestamp
- Automatic cleanup

## Homelab Integration

This service integrates with the existing homelab infrastructure:
- **Server**: `buntubox` (192.168.1.30)
- **Network**: `public_net` for internet exposure
- **Proxy**: NPM-Public at `100.70.44.41:82`
- **SSL**: Wildcard certificate for `*.arweb.dev`
- **Monitoring**: Part of homelab service suite

## Contact and Support

For issues or questions about this deployment:
1. Check container logs on buntubox
2. Verify NPM proxy configuration
3. Test Claude CLI availability on host
4. Review GitHub Actions workflow logs
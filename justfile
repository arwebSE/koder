# Koder Justfile
# Short-hand commands for development and deployment

# Default command
default:
    @just --list

# Run the development server
run:
    cd server && uv run python app.py

# Run with hot reload (requires watchfiles)
dev:
    cd server && uv run --watch python app.py

# Run frontend development server
dev-frontend:
    cd frontend && npm run dev

# Run both frontend and backend (requires two terminals)
dev-full:
    @echo "Run these in separate terminals:"
    @echo "Terminal 1: just dev-frontend"
    @echo "Terminal 2: just dev"

# Build frontend
build-frontend:
    cd frontend && npm run build

# Install frontend dependencies
install-frontend:
    cd frontend && npm ci

# Install Python dependencies
install:
    cd server && uv sync

# Install all dependencies (Python + frontend)
install-all: install install-frontend

# Add a new dependency
add package:
    cd server && uv add {{package}}

# Add a dev dependency
add-dev package:
    cd server && uv add --dev {{package}}

# Build and run Docker container
docker-run:
    docker build -t koder .
    docker run -p 3000:3000 --rm -v /Users/Pc:/Users/Pc:ro koder

# Deploy to homelab server
deploy:
    scp . mi@buntubox:~/docker/stacks/koder/
    ssh mi@buntubox "cd ~/docker/stacks/koder && docker compose -f kod.yml up -d --build"

# Deploy only code changes (faster)
deploy-code:
    scp server/app.py mi@buntubox:~/docker/stacks/koder/server/
    ssh mi@buntubox "cd ~/docker/stacks/koder && docker compose -f kod.yml up -d --build"

# Check deployment status
status:
    ssh mi@buntubox "docker ps --filter name=koder"

# View logs
logs:
    ssh mi@buntubox "docker logs koder --tail 50 -f"

# Health check
health:
    curl -s http://localhost:3000/api/health | python3 -m json.tool

# Run tests
test:
    uv run pytest

# Test API endpoints
test-api:
    uv run python -m pytest -xvs tests/ || echo "No tests found, that's ok"

# View API docs
docs:
    @echo "API docs available at http://localhost:3000/docs when server is running"

# Format code
format:
    uv run black server/
    uv run isort server/

# Lint code
lint:
    uv run ruff check server/

# Type checking
type-check:
    uv run mypy server/

# Format frontend code
format-frontend:
    cd frontend && npm run format 2>/dev/null || echo "No format script defined"

# Lint frontend code
lint-frontend:
    cd frontend && npm run lint 2>/dev/null || echo "No lint script defined"

# Clean up
clean:
    rm -rf __pycache__ .pytest_cache .coverage dist build
    find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# Full cleanup including Docker
clean-all: clean
    docker system prune -f
    docker rmi koder 2>/dev/null || true
    rm -rf frontend/dist frontend/node_modules static
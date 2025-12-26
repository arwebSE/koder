# Multi-stage build
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Python backend stage
FROM python:3.11-alpine

# Install uv for package management
RUN pip install uv

WORKDIR /app

# Copy server dependencies and install them
COPY server/pyproject.toml ./
RUN uv pip install --system

# Install opencode CLI tool
RUN pip install opencode

# Copy application code
COPY server/ ./server/
COPY --from=frontend-builder /app/frontend/dist ./static/

# Create non-root user
RUN addgroup -g 1001 -S python
RUN adduser -S python -u 1001

# Change ownership of the app directory
RUN chown -R python:python /app

USER python

EXPOSE 3000

CMD ["uv", "run", "uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "3000"]
# Multi-stage build
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Python backend stage
FROM python:3.11-slim

# Install uv for package management
RUN pip install uv

WORKDIR /app

# Copy server files
COPY server/ .

# Install dependencies as root first
RUN uv pip install --system -e .

# Copy frontend build (vite builds to ../static relative to frontend dir)
COPY --from=frontend-builder /app/static ./static/

# Create non-root user and setup directories
RUN groupadd -g 1001 python && \
    useradd -u 1001 -g python python && \
    mkdir -p /home/python/.cache && \
    chown -R python:python /app /home/python

USER python

EXPOSE 5174

CMD ["uv", "run", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5174"]
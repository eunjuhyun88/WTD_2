FROM python:3.11-slim

WORKDIR /app/engine

RUN apt-get update && apt-get install -y --no-install-recommends curl build-essential && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv

# Build this image with the `engine/` directory as the Docker build context:
#   docker build -f engine/Dockerfile engine
COPY pyproject.toml ./pyproject.toml
COPY uv.lock ./uv.lock
RUN uv sync --frozen || uv sync

COPY . ./

EXPOSE 8000

# UVICORN_WORKERS: set to >1 for multi-process CPU parallelism.
# When UVICORN_WORKERS>1 you must also set ENGINE_ENABLE_SCHEDULER=false
# and let worker-control handle background scanning to avoid N schedulers.
CMD ["sh", "-c", "uv run uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${UVICORN_WORKERS:-1}"]

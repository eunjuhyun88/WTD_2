FROM python:3.11-slim

WORKDIR /app/engine

RUN apt-get update && apt-get install -y --no-install-recommends curl build-essential && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv

COPY pyproject.toml ./pyproject.toml
COPY uv.lock ./uv.lock
RUN uv sync --frozen || uv sync

COPY . ./

CMD ["uv", "run", "python", "-m", "worker.main"]

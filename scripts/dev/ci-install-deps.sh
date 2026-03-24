#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if [ -f pnpm-lock.yaml ]; then
	echo "[ci:install] pnpm-lock.yaml found"
	corepack enable
	pnpm install --frozen-lockfile
	exit 0
fi

if [ -f yarn.lock ]; then
	echo "[ci:install] yarn.lock found"
	corepack enable
	yarn install --immutable || yarn install --frozen-lockfile
	exit 0
fi

if [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
	echo "[ci:install] npm lockfile found"
	npm ci
	exit 0
fi

if [ -f package.json ]; then
	echo "[ci:install] package.json found without lockfile; running npm install"
	npm install --no-audit --no-fund
	exit 0
fi

echo "[ci:install] no package manifest found; skipping dependency install"

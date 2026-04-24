FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

ARG APP_DEPLOY_TARGET=cloudrun
ENV APP_DEPLOY_TARGET=${APP_DEPLOY_TARGET}
ENV HOST=0.0.0.0
ENV PORT=3000

COPY app/package*.json ./
RUN npm install --include=optional \
    && npm install --no-save @rollup/rollup-linux-x64-gnu

COPY app/ ./

RUN npm run build:cloudrun

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "build"]

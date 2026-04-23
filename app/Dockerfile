FROM node:20-alpine AS build

WORKDIR /app/app

RUN apk add --no-cache curl

ARG APP_BUILD_TARGET=cloud-run
ENV APP_BUILD_TARGET=${APP_BUILD_TARGET}
ENV NODE_ENV=production

COPY app/package*.json ./
RUN npm ci

COPY app/ ./

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app/app

RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY app/package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/app/build ./build

EXPOSE 8080

CMD ["npm", "run", "start"]

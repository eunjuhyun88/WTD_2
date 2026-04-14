FROM node:20-alpine

WORKDIR /app/app

RUN apk add --no-cache curl

COPY app/package*.json ./
RUN npm ci

COPY app/ ./

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start", "--", "--host", "0.0.0.0", "--port", "3000"]


FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY dist/ ./dist/

CMD ["node", "dist/ops-agent/index.js", "--once", "--config", "/config/config.json"]

FROM node:22-alpine as deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine as runtime

ARG COMMIT_SHA=unknown
ARG BUILD_TIME=unknown

ENV NODE_ENV=production \
    PORT=3000 \
    COMMIT_SHA=${COMMIT_SHA} \
    BUILD_TIME=${BUILD_TIME}

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
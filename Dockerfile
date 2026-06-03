# API backend — use when Render "Root Directory" is the repo root (.)
# If Root Directory is "backend", Render uses backend/Dockerfile instead.
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ ffmpeg wget

COPY backend/package*.json ./
RUN npm ci --only=production

COPY backend/src/ ./src/

RUN mkdir -p /var/media/music /var/media/jingles /var/media/ads /var/recordings

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD sh -c 'wget --spider -q "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1'

CMD ["node", "src/index.js"]

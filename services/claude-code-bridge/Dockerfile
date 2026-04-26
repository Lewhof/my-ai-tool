FROM node:22-bookworm-slim

# git is required for sandbox repo clones; ca-certificates for HTTPS.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

ENV NODE_ENV=production
ENV PORT=8787
ENV SANDBOX_ROOT=/var/lib/cc-bridge/sessions
RUN mkdir -p /var/lib/cc-bridge/sessions

EXPOSE 8787
CMD ["node", "dist/server.js"]

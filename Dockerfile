FROM node:22 as base

# Use system Chromium in Docker (skip Puppeteer's download)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Build tools for native addons (e.g. sqlite3) + runtime deps + Chromium for Puppeteer
RUN apt-get update && apt-get install -y \
  build-essential \
  python3 \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  libu2f-udev \
  libxshmfence1 \
  libglu1-mesa \
  chromium \
  chromium-sandbox \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /home/node/app

COPY package*.json ./

# Force sqlite3 to build from source so it links against this image's glibc (2.36).
# Prebuilds are often built on glibc 2.38+ and fail with "version `GLIBC_2.38' not found".
ENV npm_config_build_from_source=true
RUN npm i

COPY . .

RUN chmod +x scripts/docker-entrypoint.sh
ENTRYPOINT ["scripts/docker-entrypoint.sh"]

FROM base as production

ENV NODE_PATH=./build
WORKDIR /home/node/app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN npm run build

# Data directory for both DBs; volume mounts here so they persist across rebuilds
ENV DATA_DIR=/home/node/app/data

EXPOSE 3000

# Verify native deps (e.g. sqlite3) load in this image before we ship it
RUN npm run test

CMD ["npm", "run", "start"]

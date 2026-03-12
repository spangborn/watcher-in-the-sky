FROM node:22 as base

# Use system Chromium in Docker (skip Puppeteer's download)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Runtime deps + Chromium for Puppeteer
RUN apt-get update && apt-get install -y \
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

# Default path for aircraft DB; app will create it at startup if missing (entrypoint)
ENV AIRCRAFT_INFO_DB=/home/node/app/data/aircraft_info.db

EXPOSE 3000

RUN npm run test

CMD ["npm", "run", "start"]

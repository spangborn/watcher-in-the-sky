FROM node:22 as base

# Runtime deps for Puppeteer's bundled Chrome
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
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /home/node/app

COPY package*.json ./

RUN npm i && npm run install:browser

COPY . .



FROM base as production

ENV NODE_PATH=./build
WORKDIR /home/node/app

RUN npm run build

# Default path for aircraft DB; app will create it at startup if missing (see index.ts)
ENV AIRCRAFT_INFO_DB=/home/node/app/aircraft_info.db

RUN npm run test

#CMD ["node", "build/index.js"]

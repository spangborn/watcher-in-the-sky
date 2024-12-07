FROM node:22 as base

# We don't need the standalone Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

# Install necessary dependencies for Puppeteer and Chromium
RUN apt-get update && apt-get install -y \
  libnss3 \
  chromium \
  chromium-sandbox \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /home/node/app

COPY package*.json ./

RUN npm i

COPY . .

FROM base as production

ENV NODE_PATH=./build

# Puppeteer setup: Skip Chromium download and use the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

RUN npm run build

# Attempting to see if puppeteer works now
RUN npm run test

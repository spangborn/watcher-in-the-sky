FROM ghcr.io/puppeteer/puppeteer:16.1.0 as base

# We don't need the standalone Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

WORKDIR /home/node/app

COPY package*.json ./

RUN npm i

COPY . .

FROM base as production

ENV NODE_PATH=./build

RUN npm run build

# Attempting to see if puppeteer works now
RUN npm run test

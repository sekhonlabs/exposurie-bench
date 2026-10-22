FROM node:24-slim

ARG LITESTREAM_VERSION=0.3.13
ADD https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64.deb /tmp/litestream.deb
RUN dpkg -i /tmp/litestream.deb && rm /tmp/litestream.deb

WORKDIR /app
RUN corepack enable
COPY package.json ./
RUN pnpm install --prod
COPY . .
COPY litestream.yml /etc/litestream.yml

ENV NODE_ENV=production
CMD ["scripts/start.sh"]

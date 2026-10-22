#!/bin/sh
# Local runs read the same 1Password items that Fly's secrets are set from,
# so there is never a .env file to leak. Usage: scripts/run.sh pnpm dev
export POSTMARK_TOKEN="op://Private/satchel postmark/server token"
export PADDLE_API_KEY="op://Private/satchel paddle sandbox/api key"
export PADDLE_WEBHOOK_SECRET="op://Private/satchel paddle sandbox/webhook secret"
export PADDLE_PRICE_ID="op://Private/satchel paddle sandbox/price id"
export PADDLE_CLIENT_TOKEN="op://Private/satchel paddle sandbox/client token"
export SESSION_SECRET="op://Private/satchel session/secret"
export PADDLE_ENV=sandbox
export MAIL_FROM="Satchel <hello@localhost>"

exec op run -- "$@"

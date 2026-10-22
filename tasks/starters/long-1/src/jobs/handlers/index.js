import { fetchArticle } from './fetch-article.js'
import { paddleEvent } from './paddle-event.js'
import { sendMagicLink } from './send-magic-link.js'
import { weeklyDigest } from './weekly-digest.js'

export const handlers = {
  fetch_article: fetchArticle,
  paddle_event: paddleEvent,
  send_magic_link: sendMagicLink,
  weekly_digest: weeklyDigest,
}

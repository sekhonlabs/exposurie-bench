import { Hono } from 'hono'
import { requireUser } from '../auth/session.js'
import { layout } from '../views/layout.js'
import { linksPage, tagChip } from '../views/links.js'
import { cleanTag, linksWithTag, tagLink, untagLink } from './tags.js'

export function tagRoutes(db) {
  const app = new Hono()

  app.post('/links/:id/tags', requireUser, async (c) => {
    const name = cleanTag((await c.req.parseBody()).name)
    if (!name) return c.text('A tag needs a name.', 422)
    tagLink(db, c.get('user'), c.req.param('id'), name)
    return c.html(tagChip(c.req.param('id'), name), 201)
  })

  app.delete('/links/:id/tags/:name', requireUser, (c) => {
    untagLink(db, c.get('user'), c.req.param('id'), c.req.param('name'))
    return c.body(null, 200)
  })

  app.get('/tags/:name', requireUser, (c) => {
    const name = c.req.param('name')
    const links = linksWithTag(db, c.get('user'), name)
    return c.html(
      layout(`Tagged ${name}`, linksPage({ view: 'tag', tag: name, links, page: 1, more: false }), {
        user: c.get('user'),
      }),
    )
  })

  return app
}

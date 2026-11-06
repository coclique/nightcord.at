import type { Handle } from '@sveltejs/kit/hooks'
import { paraglideMiddleware } from '@/lib/paraglide/server.js'
import { getDb, getMockDb, type Database } from '@nightcord/shared/db'
import { N25_PUBLIC_DEPLOYMENT_ENV } from '$app/env/public'
import { env } from 'cloudflare:workers'

export const handle: Handle = ({ event, resolve }) => {
  event.locals.db =
    N25_PUBLIC_DEPLOYMENT_ENV === 'development'
      ? (getMockDb() as unknown as Database)
      : getDb(env.DB)

  return paraglideMiddleware(event.request, ({ locale }) => {
    return resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale),
    })
  })
}

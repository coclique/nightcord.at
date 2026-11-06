import { command, getRequestEvent } from '$app/server'
import z from 'zod'
import { getRateLimitKey } from '@/lib/server/util'
import { posts } from '@nightcord/shared/db/schema'
import { eq, sql } from 'drizzle-orm'
import { env } from 'cloudflare:workers'

export const recordView = command(
  z.object({
    postId: z.number(),
  }),
  async ({ postId }): Promise<void> => {
    console.log('Received view for post ID:', postId)

    const { locals, getClientAddress } = getRequestEvent()
    const ip = getClientAddress()

    const { success } = await env.VIEW_RATE_LIMITER.limit({ key: getRateLimitKey(ip) })
    if (!success) {
      console.warn(`View rate limit exceeded for IP ${ip}`)
      return // Don't block the view, just don't record it
    }

    await locals.db
      .update(posts)
      .set({ views: sql`${posts.views} + 1` })
      .where(eq(posts.id, postId))
    return
  },
)

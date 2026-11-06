import { command, getRequestEvent } from '$app/server'
import z from 'zod'
import { analyzeTextModeration, analyzeTextSentiment } from '@/lib/server/analyze'
import { posts } from '@nightcord/shared/db/schema'
import { N25_PUBLIC_DEPLOYMENT_ENV } from '$app/env/public'
import { getRateLimitKey } from '@/lib/server/util'
import { validateTurnstile } from '@/lib/server/turnstile'
import type { NewPostRow } from '@nightcord/shared/db'
import { env, waitUntil } from 'cloudflare:workers'

export type SubmitPostResult =
  { success: true; crisisResources: boolean } | { success: false; error: string }

async function validateAndStore(validate: Promise<boolean>, row: NewPostRow) {
  if (!(await validate)) {
    console.error('Turnstile validation failed, not saving post')
    return
  }

  const sentiment = await analyzeTextSentiment(row.content)
  console.log('Inferred sentiment for post content:', sentiment)
  row.inferredSentiment = sentiment

  await getRequestEvent().locals.db.insert(posts).values(row)
  console.log('Post saved to database successfully:', row)
}

export const submitPost = command(
  z.object({
    nickname: z.string().max(100),
    content: z.string().min(1).max(1000),
    turnstileToken: z.string(),
  }),
  async ({ nickname: rawNickname, content, turnstileToken }): Promise<SubmitPostResult> => {
    console.log('Received post submission:', { rawNickname, content, turnstileToken })

    const { getClientAddress, request } = getRequestEvent()
    const ip = getClientAddress()
    const nickname = rawNickname.trim() || null
    const { success } = await env.POST_RATE_LIMITER.limit({ key: getRateLimitKey(ip) })

    if (!success) {
      console.error(`Rate limit exceeded for IP ${ip}, rejecting`)
      return {
        success: false,
        error: 'Rate limit exceeded. Please wait a while before submitting another post.',
      }
    }

    // Launch Turnstile validation non-blockingly
    const turnstilePromise =
      N25_PUBLIC_DEPLOYMENT_ENV === 'production'
        ? validateTurnstile(turnstileToken, ip)
        : Promise.resolve(true)

    // Text analysis for moderation purposes
    const analysis = await analyzeTextModeration(nickname ? `${nickname}: ${content}` : content)
    console.log('Moderation analysis result:', analysis)
    if (analysis.verdict !== 'accept') {
      // TODO: Maybe treat policy-rejects differently later, for now just silently discard them
      // outright
      console.log('Moderation verdict: reject, silently discarding post')
      return { success: true, crisisResources: false }
    }

    let inferredSelfHarmIntent = analysis.flags.includes('self-harm/intent')

    const cf = request.cf as IncomingRequestCfProperties | undefined
    waitUntil(
      validateAndStore(turnstilePromise, {
        nickname,
        content,
        authorIp: ip,
        authorUserAgent: request.headers.get('user-agent') ?? null,
        authorCity: cf?.city ?? 'Unknown',
        authorRegion: cf?.region ?? 'Unknown',
        authorCountry: cf?.country ?? 'ZZ',
        inferredSelfHarmIntent,
      }),
    )

    return { success: true, crisisResources: inferredSelfHarmIntent }
  },
)

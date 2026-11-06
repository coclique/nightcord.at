import { N25_CF_TURNSTILE_SECRET } from '$app/env/private'
import z from 'zod'

const zTurnstileApiResponse = z.object({
  success: z.boolean(),
  'error-codes': z.array(z.string()).optional(),
})

export async function validateTurnstile(token: string, ip: string | null): Promise<boolean> {
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: N25_CF_TURNSTILE_SECRET,
        response: token,
        remoteip: ip,
      }),
    })

    if (!response.ok) {
      console.error(`Turnstile verification failed (non-200 status):`, response.statusText)
      return false
    }

    const data = zTurnstileApiResponse.parse(await response.json())
    if (!data.success) console.error(`Turnstile verification unsuccessful:`, data['error-codes'])
    return data.success
  } catch (error) {
    console.error(`Error validating Turnstile token:`, error)
    return false
  }
}

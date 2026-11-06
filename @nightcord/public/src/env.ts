import { defineEnvVars } from '@sveltejs/kit/env'

export const variables = defineEnvVars({
  N25_PUBLIC_DEPLOYMENT_ENV: { public: true, static: true },
  N25_PUBLIC_CF_TURNSTILE_SITEKEY: { public: true, static: true },
  N25_OPENAI_APIKEY: { schema: (input) => input ?? '' },
  N25_HF_APIKEY: { schema: (input) => input ?? '' },
  N25_CF_TURNSTILE_SECRET: { schema: (input) => input ?? '' },
})

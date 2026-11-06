import { N25_OPENAI_APIKEY, N25_HF_APIKEY } from '$app/env/private'
import { singleton } from '@/lib/util'
import { InferenceClient } from '@huggingface/inference'
import OpenAI from 'openai'

export type RejectVerdict = 'policy-reject' | 'hard-reject'
export type ModerationFlag = keyof OpenAI.Moderation.Categories

export type TextAnalysis =
  | { verdict: 'accept'; flags: ModerationFlag[] }
  | { verdict: RejectVerdict; reasons: ModerationFlag[] }

const openai = singleton(() => new OpenAI({ apiKey: N25_OPENAI_APIKEY }))
const hf = singleton(() => new InferenceClient(N25_HF_APIKEY))

const hardRejectCategories: ModerationFlag[] = [
  'sexual/minors',
  'harassment/threatening',
  'hate',
  'hate/threatening',
  'self-harm/instructions',
]

const policyRejectThresholds: Partial<Record<ModerationFlag, number>> = {
  harassment: 0.8,
  'illicit/violent': 0.8,
  'violence/graphic': 0.9,
}

export async function analyzeTextModeration(content: string): Promise<TextAnalysis> {
  try {
    const moderation = await openai().moderations.create({
      model: 'omni-moderation-latest',
      input: content,
    })

    if (moderation.results.length === 0) {
      console.warn('OpenAI Moderation API returned no results; defaulting to accept with no flags')
      return { verdict: 'accept', flags: [] }
    }

    const [result] = moderation.results

    for (const category of hardRejectCategories) {
      if (result.categories[category]) {
        return { verdict: 'hard-reject', reasons: [category] }
      }
    }

    const policyRejectReasons: ModerationFlag[] = []
    for (const [category, threshold] of Object.entries(policyRejectThresholds)) {
      if (result.category_scores[category as ModerationFlag] >= threshold) {
        policyRejectReasons.push(category as ModerationFlag)
      }
    }

    if (policyRejectReasons.length > 0) {
      return { verdict: 'policy-reject', reasons: policyRejectReasons }
    }

    return {
      verdict: 'accept',
      flags: Object.entries(result.categories)
        .filter(([, flagged]) => flagged)
        .map(([category]) => category as ModerationFlag),
    }
  } catch (error) {
    console.error(
      'Error calling OpenAI Moderation API:',
      error,
      'defaulting to accept with no flags',
    )
    return { verdict: 'accept', flags: [] }
  }
}

export async function analyzeTextSentiment(content: string): Promise<number> {
  try {
    const result = await hf().textClassification({
      provider: 'hf-inference',
      model: 'distilbert-base-uncased-finetuned-sst-2-english',
      inputs: content,
    })
    return result[0].label === 'POSITIVE' ? result[0].score : -result[0].score
  } catch (error) {
    // If the sentiment analysis fails, we don't want to reject the post outright, so we just log
    // the error and return a neutral sentiment
    console.error(
      'Error calling Hugging Face Inference API:',
      error,
      'defaulting to neutral sentiment',
    )
    return 0
  }
}

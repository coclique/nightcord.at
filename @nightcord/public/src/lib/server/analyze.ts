import { N25_OPENAI_APIKEY } from '$app/env/private'
import { singleton } from '@/lib/util'
import OpenAI from 'openai'
import { env } from 'cloudflare:workers'

export type RejectVerdict = 'policy-reject' | 'hard-reject'
export type ModerationFlag = keyof OpenAI.Moderation.Categories

export type TextAnalysis =
  | { verdict: 'accept'; flags: ModerationFlag[] }
  | { verdict: RejectVerdict; reasons: ModerationFlag[] }

const openai = singleton(() => new OpenAI({ apiKey: N25_OPENAI_APIKEY }))

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

type DecisionModelAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | {
      type: 'score'
      score: number
      legend: Record<string, string>
      probabilities: Record<string, number>
      confidence: number
    }

interface DecisionModelOutput {
  model: string
  answers: Record<string, DecisionModelAnswer>
  usage: { input_tokens: number; output_tokens: number }
}

export async function analyzeTextSentiment(content: string): Promise<number> {
  try {
    const result = (await env.AI.run('@cf/cloudflare/clef-flash', {
      model: 'clef-flash',
      state: content,
      questions: {
        sentiment: {
          type: 'score',
          instructions: 'What is the overall sentiment of this text?',
          criteria: ['negative', 'neutral', 'positive'],
        },
      },
    })) as unknown as DecisionModelOutput

    if (result.answers['sentiment'].type !== 'score')
      throw new Error('Unexpected answer type from Workers AI: ' + result.answers['sentiment'].type)

    return result.answers['sentiment'].score - 1
  } catch (error) {
    // If the sentiment analysis fails, we don't want to reject the post outright, so we just log
    // the error and return a neutral sentiment
    console.error('Error calling Workers AI binding:', error, 'defaulting to neutral sentiment')
    return 0
  }
}

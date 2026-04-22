import Anthropic from '@anthropic-ai/sdk'

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY missing')
}

// maxRetries honors the 429 retry-after header automatically — we hit org-level
// 8K output tokens/min on batch cron runs, so one partial 429 used to blow up
// a whole Promise.all. SDK retry absorbs those.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 5,
})

// Two-stage classification: Haiku for pre-filter, Sonnet for full classification
export const MODEL_HAIKU  = 'claude-haiku-4-5-20251001'   // pre-filter, cheap
export const MODEL_SONNET = 'claude-sonnet-4-5-20250929'  // full classification

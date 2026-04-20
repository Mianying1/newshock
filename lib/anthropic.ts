import Anthropic from '@anthropic-ai/sdk'

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY missing')
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Two-stage classification: Haiku for pre-filter, Sonnet for full classification
export const MODEL_HAIKU  = 'claude-haiku-4-5-20251001'   // pre-filter, cheap
export const MODEL_SONNET = 'claude-sonnet-4-5-20250929'  // full classification

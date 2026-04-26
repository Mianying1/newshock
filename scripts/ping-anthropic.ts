import { config } from 'dotenv'
config({ path: '.env.local' })
async function main() {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic()
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }],
    })
    console.log('OK', msg.usage)
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    console.log('FAIL', err.status, err.message)
  }
}
main()

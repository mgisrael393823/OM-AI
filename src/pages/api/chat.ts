import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next'
import { withAuth, withRateLimit } from '@/lib/auth-middleware'
import { createChatCompletion } from '@/lib/services/openai'

const baseHandler: NextApiHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const body = (req.body ?? {}) as any
  const messages = Array.isArray(body.messages) ? body.messages : []
  const clientModel = typeof body.model === 'string' ? body.model : undefined

  const model = (clientModel || process.env.OPENAI_MODEL || process.env.OPENAI_FALLBACK_MODEL || 'gpt-4.1').trim()
  console.log('[chat] Using OpenAI model:', model)

  const ai = await createChatCompletion({
    model,
    messages,
    temperature: 0.2,
    max_output_tokens: Number(process.env.CHAT_MAX_TOKENS ?? 2000)
  })

  return res.status(200).json({ ok: true, text: ai.text, model: ai.model })
}

// Make sure we pass a real function to wrappers:
const wrapped = withRateLimit(withAuth(baseHandler))
export default wrapped
import type { NextApiRequest, NextApiResponse } from 'next'
import { withAuth, withRateLimit } from '@/lib/auth-middleware'
import { createChatCompletion } from '@/lib/services/openai'

async function baseHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = (req.body ?? {}) as any
  const messages = Array.isArray(body.messages) ? body.messages : []
  const clientModel = typeof body.model === 'string' ? body.model.trim() : undefined

  const model =
    clientModel ||
    (process.env.OPENAI_MODEL || '').trim() ||
    (process.env.OPENAI_FALLBACK_MODEL || '').trim()

  try {
    const ai = await createChatCompletion({
      model,
      messages,
      temperature: 0.2,
      max_output_tokens: Number(process.env.CHAT_MAX_TOKENS ?? 2000)
    })

    return res.status(200).json({
      ok: true,
      text: ai.text,
      model: ai.model,
      ...(ai.usage ? { usage: ai.usage } : {}),
      ...(ai.requestId ? { requestId: ai.requestId } : {})
    })
  } catch (err: any) {
    console.error('[api/chat]', err)
    return res.status(200).json({ ok: false, error: 'Failed to generate response' })
  }
}

export default withRateLimit(withAuth(baseHandler))
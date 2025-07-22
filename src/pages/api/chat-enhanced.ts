import { NextApiRequest, NextApiResponse } from "next"
import OpenAI from "openai"
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { message, chat_session_id } = req.body

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: "Message is required" })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OpenAI API key not configured" })
  }

  // Get auth user
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  try {
    let sessionId = chat_session_id

    // If no session provided, create a new one
    if (!sessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: message.slice(0, 50) + (message.length > 50 ? '...' : '')
        })
        .select()
        .single()

      if (sessionError) {
        return res.status(500).json({ error: 'Failed to create chat session' })
      }

      sessionId = newSession.id
    }

    // Verify session belongs to user
    const { data: session, error: sessionVerifyError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (sessionVerifyError) {
      return res.status(404).json({ error: 'Chat session not found' })
    }

    // Save user message
    const { error: userMessageError } = await supabase
      .from('messages')
      .insert({
        chat_session_id: sessionId,
        role: 'user',
        content: message
      })

    if (userMessageError) {
      console.error('Error saving user message:', userMessageError)
    }

    // Get conversation history
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('chat_session_id', sessionId)
      .order('created_at', { ascending: true })

    if (messagesError) {
      console.error('Error fetching messages:', messagesError)
    }

    const systemMessage = {
      role: "system" as const,
      content: `You are OM Intel, an advanced AI assistant specializing in commercial real estate analysis and document review. You are professional, insightful, and highly knowledgeable about:

- Commercial real estate transactions and valuations
- Property investment analysis and due diligence
- Market trends and comparative analysis
- Financial modeling and cash flow projections
- Lease agreements and property management
- Zoning, development, and regulatory matters
- Risk assessment and mitigation strategies

Your communication style is:
- Professional yet approachable
- Clear and concise
- Data-driven with actionable insights
- Focused on helping users make informed decisions

When analyzing documents or answering questions:
- Provide specific, detailed analysis
- Highlight key risks and opportunities
- Offer practical recommendations
- Ask clarifying questions when needed
- Reference relevant market standards and best practices

Always maintain confidentiality and provide accurate, helpful information to support commercial real estate professionals in their decision-making process.`
    }

    // Set up Server-Sent Events headers for streaming
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Chat-Session-Id": sessionId, // Return session ID in header
    })

    const conversationHistory = messages || []
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [systemMessage, ...conversationHistory],
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
    })

    let assistantResponse = ""

    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || ""
      if (content) {
        assistantResponse += content
        res.write(content)
      }
    }

    // Save assistant response
    if (assistantResponse) {
      await supabase
        .from('messages')
        .insert({
          chat_session_id: sessionId,
          role: 'assistant',
          content: assistantResponse
        })

      // Update session timestamp
      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId)
    }

    res.end()
  } catch (error) {
    console.error("Chat API error:", error)
    res.status(500).json({ 
      error: "Failed to get response from AI",
      details: error instanceof Error ? error.message : "Unknown error"
    })
  }
}
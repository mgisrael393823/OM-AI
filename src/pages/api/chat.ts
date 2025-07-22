import { NextApiRequest, NextApiResponse } from "next"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { messages } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OpenAI API key not configured" })
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

  try {
    // Set up Server-Sent Events headers for streaming
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    })

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [systemMessage, ...messages],
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
    })

    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || ""
      if (content) {
        res.write(content)
      }
    }

    res.end()
  } catch (error) {
    console.error("OpenAI API error:", error)
    res.status(500).json({ 
      error: "Failed to get response from AI",
      details: error instanceof Error ? error.message : "Unknown error"
    })
  }
}
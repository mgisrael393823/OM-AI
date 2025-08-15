# CHAT-ENHANCEMENT-STATUS

## Executive Summary

Transform our chat system from a rigid JSON-output API into a conversational CRE advisor that feels like talking to an elite investment professional. This document provides a lean, fast-path implementation plan optimized for Claude Code execution.

**Core Goal**: Users upload an OM → Chat naturally with an expert who has read and understood their document → Get investment insights with specific page references → **Ship ONE working endpoint quickly**.

## Current Problems & Solutions

| Problem | Current State | Target State |
|---------|--------------|--------------|
| **Document Context Lost** | memoryId not returned from upload | Upload returns memoryId → Chat uses it seamlessly |
| **Robotic Responses** | JSON-focused, data-dump style | Natural conversation with a trusted advisor |
| **No Personality** | Generic AI responses | "Michael" - 20+ year CRE veteran with opinions |
| **Poor Document References** | Vague or no citations | "Looking at page 12 of your rent roll..." |
| **Complex Implementation** | 3 chat endpoints, 2 API styles | Single conversational endpoint |

## Implementation Plan - Lean Phase 1 (Ship Fast)

### 🚨 Phase 0: Critical Prerequisites (Verify First!)

#### Verify Memory ID Return
**File**: `src/pages/api/process-pdf-memory.ts`

Check around line 220 that memoryId is being returned:
```typescript
memoryId: result.requestId, // This should already exist
```

If not present, add it to the response.

### ✅ Phase 1: Minimal Conversational Endpoint (Ship in Days)

#### Step 1: Single Endpoint
**Create File**: `src/pages/api/chat-conversational.ts`

Create endpoint with SSE, memoryId wiring, minimal retrieveTopK, and fixed context cap. Add kill switch CONVERSATIONAL_CHAT (default 0).

**Bold Context ID Flow**:
- **/api/process-pdf-memory returns memoryId**
- **Client must send documentId = memoryId**
- **Accept only mem-* or UUID. Reject req-***
- **Route mem-* to transient memory, UUID to DB**

**SSE Must-Haves**:

Set headers before streaming and flush:
```typescript
res.setHeader('Content-Type','text/event-stream');
res.setHeader('Cache-Control','no-cache, no-transform');
res.setHeader('Connection','keep-alive');
res.flushHeaders?.();
```

Add 30s heartbeat and abort on disconnect:
```typescript
const controller = new AbortController();
const hb = setInterval(()=>res.write(':heartbeat\n\n'), 30000);
req.on('close', ()=>{ clearInterval(hb); controller.abort(); res.end(); });
```

Always `res.end()` on completion or error.

**Simple Context Cap**:
```typescript
const MAX_CONTEXT_CHARS = 24000; // ~6k tokens rough cap
documentContext = documentContext.slice(0, MAX_CONTEXT_CHARS);
```

**Full Implementation**:
```typescript
import type { NextApiRequest, NextApiResponse } from 'next'
import { OpenAI } from 'openai'
import { z } from 'zod'
import { ELITE_OM_ADVISOR_PROMPT } from '@/lib/prompts/elite-om-advisor'
import { getRelevantChunks } from '@/lib/rag/conversational-retriever'
import { withAuth } from '@/lib/auth-middleware'

export const config = {
  api: { 
    bodyParser: { sizeLimit: '1mb' },
    responseLimit: false
  },
  runtime: 'nodejs',
  maxDuration: 60
}

// Validation schema
const ChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string()
  })).min(1).max(50),
  documentId: z.string().optional(),
  sessionId: z.string().optional()
})

// Document ID validation
function isValidDocumentId(id: string): boolean {
  return id.startsWith('mem-') || /^[0-9a-fA-F-]{36}$/.test(id)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Kill switch
  if (process.env.CONVERSATIONAL_CHAT !== '1') {
    const { default: legacyHandler } = await import('./chat')
    return legacyHandler(req, res)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const validation = ChatSchema.safeParse(req.body)
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  const { messages, documentId } = validation.data
  const safeDocId = documentId && isValidDocumentId(documentId) ? documentId : undefined

  // SSE headers
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('Connection','keep-alive');
  res.flushHeaders?.();

  // Heartbeat and cleanup
  const controller = new AbortController();
  const hb = setInterval(()=>res.write(':heartbeat\n\n'), 30000);
  req.on('close', ()=>{ clearInterval(hb); controller.abort(); res.end(); });

  try {
    // Get document context
    let documentContext = ''
    if (safeDocId) {
      const chunks = await getRelevantChunks(safeDocId, messages)
      if (chunks?.length) {
        documentContext = '\n\nDocument context:\n' + 
          chunks.map(c => `[Page ${c.page}] ${c.content}`).join('\n')
        
        // Context cap
        const MAX_CONTEXT_CHARS = 24000;
        documentContext = documentContext.slice(0, MAX_CONTEXT_CHARS);
      }
    }

    // Stream response
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const stream = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: ELITE_OM_ADVISOR_PROMPT + documentContext },
        ...messages
      ],
      temperature: 0.7,
      stream: true
    }, { signal: controller.signal })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
  } catch (error) {
    console.error('[CHAT-CONV] Error:', error)
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream failed' })}\n\n`)
  } finally {
    clearInterval(hb)
    res.end()
  }
}

export default withAuth(handler)
```

#### Step 2: Minimal Prompt
**Create File**: `src/lib/prompts/elite-om-advisor.ts`

One advisor system prompt (natural text, no JSON schema):

```typescript
export const ELITE_OM_ADVISOR_PROMPT = `You are Michael, a senior commercial real estate investment advisor with 20+ years of experience closing $2B+ in transactions.

When you have document context with [Page X] markers, always reference specific page numbers.
Focus on investment merit, key metrics (cap rate, IRR, DSCR), and actionable insights.
Be conversational and direct - like a trusted advisor, not a robot.
Point out opportunities and risks without sugarcoating.

If no document context is available, provide general CRE insights based on the question.`
```

#### Step 3: Basic Retrieval
**Create File**: `src/lib/rag/conversational-retriever.ts`

Using last user message as query, k=8, dedupe by page:

```typescript
import { retrieveTopK } from '@/lib/rag/retriever'

export async function getRelevantChunks(documentId: string, messages: any[]) {
  if (!documentId || !messages?.length) return []
  
  // Use last user message as query
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  if (!lastUserMsg) return []

  try {
    const chunks = await retrieveTopK({
      documentId,
      query: lastUserMsg.content,
      k: 8,
      maxCharsPerChunk: 1500
    })

    // Dedupe by page
    const byPage = new Map()
    chunks.forEach(c => {
      const page = c.page || c.metadata?.page || 0
      if (!byPage.has(page) || c.content.length > byPage.get(page).content.length) {
        byPage.set(page, { content: c.content, page })
      }
    })

    return Array.from(byPage.values()).sort((a,b) => a.page - b.page)
  } catch (error) {
    console.error('[RETRIEVER] Error:', error)
    return []
  }
}
```

#### Step 4: Validation
Messages must be an array ≤ 50 items. DocumentId must be mem-* or UUID; ignore others.

### Environment Configuration

Add to `.env.local`:
```bash
CONVERSATIONAL_CHAT=0  # Kill switch - keep OFF until tested
```

**Model Configuration**:
Use `process.env.OPENAI_MODEL || 'gpt-4o'` as the model. Do not reference non-existent aliases.

### Validation & Testing

1. **TypeScript Check**: `npm run typecheck`
2. **Build Check**: `npm run build`
3. **SSE Smoke Test**:
   ```bash
   curl -N -X POST http://localhost:3000/api/chat-conversational \
     -H "Content-Type: application/json" \
     -d '{"messages": [{"role": "user", "content": "What is a cap rate?"}]}'
   ```
4. **Kill Switch Test**: Toggle `CONVERSATIONAL_CHAT=0|1`
5. **Upload→Chat Flow**: Verify memoryId returned and used

### Acceptance Gates

✅ **Gate 1**: Upload returns memoryId; calling the endpoint with that id streams grounded text with page refs.
✅ **Gate 2**: Invalid documentId does not crash; still streams.
✅ **Gate 3**: Stream starts, heartbeats prevent timeouts, ends cleanly.
✅ **Gate 4**: Flag off routes to legacy /api/chat with no regressions.

## Later Enhancements (Phase 2+)

**Deferred for speed**:
- withRateLimit wrapper and rate limiting
- Proactive analysis on upload
- A/B rollout infrastructure
- Advanced telemetry and analytics
- Dynamic token budgeting
- Complex error recovery
- Percentage-based rollout
- User allowlists
- Comprehensive Sentry integration

These can be added after the core conversational experience is proven.

## Phase 5: Complete Simplification & Cleanup (Future)

**GOAL**: Eliminate ALL complexity and achieve single endpoint architecture

After Phase 1 is proven in production:
- Delete `/api/chat-enhanced.ts` and `/api/chat-v2.ts`
- Remove all OpenAI abstractions (builders, modelUtils, types)
- Consolidate to single prompt system
- Reduce codebase by ~80%

## Current Status

### 📋 To Do
- [ ] Verify memoryId is returned from upload
- [ ] Create minimal conversational endpoint
- [ ] Create elite advisor prompt
- [ ] Create basic retriever
- [ ] Test all acceptance gates

### Success Metrics

| Metric | Target |
|--------|--------|
| **Time to Ship** | < 1 week |
| **Lines of Code** | < 200 |
| **Dependencies** | Minimal |
| **User Experience** | Natural conversation |

## Claude Code Instructions

1. **Start Here**: Verify memoryId is being returned
2. **Create 3 Files**: Follow Step 1-3 exactly
3. **Test Incrementally**: Run typecheck after each file
4. **Use Kill Switch**: Keep CONVERSATIONAL_CHAT=0 until ready
5. **Focus on Working**: Ship fast, enhance later

---

*Last Updated: 2025-01-25*
*Status: Lean Phase 1 - Ship Fast*
*Owner: OM-AI Development Team*
*Goal: ONE working endpoint in days, not weeks*
# Technical & UX Audit of OM‑AI (Commercial Real Estate Intelligence Platform)

**Repository:** `mgisrael393823/OM-AI` (snapshot f679759)

## 1 Ranked critical issues

| Rank | Issue | Evidence & rationale | Impact |
|------|-------|---------------------|---------|
| **1** | **Synchronous PDF processing blocks the upload API** | The `/api/upload.ts` endpoint validates and parses PDFs in the request handler. It reads the uploaded file into memory, runs `PDFParserAgent.parseBuffer` and stores chunks **before** responding to the user[\[1\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/pages/api/upload.ts#L50-L100). For 20--100 page OMs, parsing can take tens of seconds. The Supabase docs recommend using **background tasks** so long‑running work can continue after the HTTP response[\[2\]](https://supabase.com/docs/guides/functions/background-tasks#:~:text=Edge%20Function%20instances%20can%20process,task%20running%20in%20the%20background). Keeping the request open until parsing completes risks timeouts on Vercel/Edge functions and makes the UI feel hung. | High impact on reliability and scalability. Large files may cause function timeouts or out‑of‑memory errors, blocking other requests. Users receive no feedback until processing finishes. |
| **2** | **Incomplete/placeholder chat interface** | `src/components/app/ChatInterface.tsx` contains mostly placeholder JSX---hard‑coded messages and large commented sections rather than a finished UI[\[3\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/components/app/ChatInterface.tsx#L30-L47). There is no token counter, cost estimation, or accessible controls. Users cannot edit or retry questions and there are no loading or error states. | High impact on user experience. Chat is the core of OM‑AI, and the current interface does not represent real interactions. Without proper states, users are confused when streaming stalls or costs exceed limits. |
| **3** | **Poor accessibility and inconsistent design** | The platform uses `shadcn/ui` components but the list and chat UIs lack WCAG‑compliant navigation, alt text or focus styles. The W3C guidelines emphasize clear navigation, identifiable interactive elements and feedback[\[4\]](https://www.w3.org/WAI/tips/designing/#:~:text=,83). In `DocumentList.tsx`, icons are rendered without screen‑reader labels and there are no ARIA roles[\[5\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/components/app/DocumentList.tsx#L54-L77). Error and loading states are hidden inside comments. | Accessibility gaps reduce usability for keyboard or screen‑reader users and harm the product's perception among enterprise customers. |
| **4** | **Naïve rate limiting and token bucket** | `auth-middleware.ts` implements a simple in‑memory token bucket per user[\[6\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/lib/auth-middleware.ts#L81-L116). Because Next.js API routes are stateless, each serverless instance maintains its own `Map`, allowing attackers to bypass limits by hitting different regions or cold starts. No usage tracking limits the expensive OpenAI calls. | Potential abuse can lead to large OpenAI bills and degraded service for honest users. |
| **5** | **Bug in enhanced PDF parser chunk structure** | `EnhancedPDFParser.createTextChunks` pushes a final chunk with a `content` property instead of `text`[\[7\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/lib/services/pdf/enhanced-parser.ts#L269-L277). Downstream code expects `text`, so these final chunks may not be indexed or stored. Additionally, the parser processes pages sequentially, which is slow for large documents and duplicates functionality already implemented in `PDFParserAgent`. | Bug leads to missing text in Supabase and search failures. Slow parsing harms performance. |
| **6** | **Lack of robust mobile responsiveness** | Components like `DocumentList` and the chat interface use fixed paddings and row layouts with icons but no responsive wrappers. The W3C recommends designing for different viewport sizes[\[4\]](https://www.w3.org/WAI/tips/designing/#:~:text=,83). On small screens, multiple sidebars and fixed side‑panels may break. | Reduces usability on mobile devices---an important growth area. |
| **7** | **No bulk upload or multi‑document search** | Users dealing with portfolios must upload files one at a time. There is no batch upload endpoint and the UI does not allow selecting multiple documents. Search is limited to the active document; there is no cross‑document filtering. | High user‑value feature gap; reduces productivity for power users. |
| **8** | **Missing API rate limiting for OpenAI** | `/api/chat.ts` streams completions but does not enforce per‑user or per‑model token budgets. Rate limiting is only applied on the request count[\[8\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/pages/api/chat.ts#L114-L119). There is no cost or token meter and misuse could generate large bills. | Financial risk and fairness issues. |
| **9** | **Inadequate error boundaries and logging** | React components lack error boundaries, so a parsing or network error can crash the page. The server logs errors but does not report them to Sentry or structured logs. | Makes debugging difficult and reduces reliability. |
| **10** | **Sparse documentation and inconsistent types** | The codebase mixes JS and TS. Several return types are `any` and not enforced (e.g., `EnhancedParseOptions` uses implicit generics). There is no architectural diagram or onboarding guide. | Hinders maintainability and onboarding for new contributors. |

## 2 Quick Wins (<2 hours each)

These tasks deliver high ROI with minimal effort.

| Task | Description & rationale | Claude‑compatible prompt (copy into Claude Code) |
|------|------------------------|--------------------------------------------------|
| **Fix chunk property bug** | In `EnhancedPDFParser.createTextChunks`, the final chunk uses `content` instead of `text`[\[7\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/lib/services/pdf/enhanced-parser.ts#L269-L277). This prevents storing the last chunk correctly. Replace the `content` property with `text` and remove redundant fields. | ```markdown<br/>Please open `src/lib/services/pdf/enhanced-parser.ts`.<br/>In the `createTextChunks` method, find the final chunk<br/>where `content: currentChunk.trim()` is set. Replace<br/>`content` with `text` so it matches the `TextChunk`<br/>interface. Ensure all chunks use the same keys (`id`,<br/>`text`, `page_number`, `chunk_index`, `type`,<br/>`word_count`, `char_count`). After the change, run<br/>existing tests to confirm the last chunk is stored.<br/>``` |
| **Add alt text and ARIA labels** | Components such as `DocumentList` use icons without accessible labels[\[5\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/components/app/DocumentList.tsx#L54-L77). Follow WCAG guidance to ensure interactive elements are identifiable[\[4\]](https://www.w3.org/WAI/tips/designing/#:~:text=,83). Add `aria-label` to buttons (e.g., "Delete document", "Download document") and include `sr-only` text for icons. | ```markdown<br/>Update `src/components/app/DocumentList.tsx`: for each<br/>icon button (e.g., trash/delete, download), wrap the<br/>icon with a `<button>` that has an `aria-label`<br/>attribute describing its action (e.g.,<br/>`aria-label="Delete document"`). Also include visually<br/>hidden text using a `span` with `className="sr-only"`<br/>inside the button to improve screen‑reader<br/>accessibility. Repeat this for other interactive icons<br/>in the chat interface and sidebar components.<br/>``` |
| **Display loading and error states in chat UI** | `ChatInterface.tsx` has placeholder comments instead of proper UI[\[3\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/components/app/ChatInterface.tsx#L30-L47). Use `useChat` state (`isLoading`, `messages`) to display a spinner, disable the send button during streaming, and show errors returned from the API. | ```markdown<br/>Open `src/components/app/ChatInterface.tsx`. Remove the<br/>placeholder messages and instead map over the<br/>`messages` from the `useChat` hook. Show a spinner<br/>(e.g., using `Loader2` icon with `animate-spin`) when<br/>`isLoading` is true. Disable the send button during<br/>loading. At the bottom of the component, if the last<br/>message has a role of `assistant` and its content<br/>contains an error prefix (e.g., "I apologize"),<br/>render an alert component to inform the user. Ensure<br/>the UI works on mobile by wrapping the messages list in<br/>a `<ScrollArea>` component with a max height on small<br/>screens.<br/>``` |
| **Improve date formatting and file size display** | `DocumentList` shows size in MB without formatting. Convert file sizes to KB/MB/GB with one decimal place and use locale-aware dates. | ```markdown<br/>In `src/components/app/DocumentList.tsx`, create a<br/>helper function `formatSize(bytes: number): string`<br/>that returns values in KB/MB/GB with at most one<br/>decimal (e.g., "1.2 MB"). Replace the raw<br/>`document.size` rendering with<br/>`formatSize(document.size)`. Use `Intl.DateTimeFormat`<br/>with options<br/>`{ dateStyle: 'medium', timeStyle: 'short' }` for<br/>`uploadedAt`.<br/>``` |
| **Ensure responsive layout** | Use Tailwind's responsive utilities to stack sidebars vertically on small screens. For example, change flex containers from `flex-row` to `flex-col md:flex-row`. | ```markdown<br/>Update the main layout in `src/pages/app.tsx` or the<br/>relevant layout component. Wrap sidebar and main<br/>content in a<br/>`<div className="flex flex-col md:flex-row h-full">`.<br/>Ensure the sidebar uses `w-full md:w-64` and the chat<br/>area grows with `flex-1`. Test at different<br/>breakpoints.<br/>``` |
| **Add a basic error boundary** | React components can crash if an API call throws. Implement a simple error boundary in `src/components/ErrorBoundary.tsx` and wrap the main app component. | ```markdown<br/>Create `src/components/ErrorBoundary.tsx` exporting a<br/>class component that implements `componentDidCatch` and<br/>renders a fallback UI with a "Something went wrong"<br/>message and a reset button. In `src/pages/_app.tsx`,<br/>import `ErrorBoundary` and wrap<br/>`<Component {...pageProps} />` inside it. Optionally<br/>log errors to Sentry using `Sentry.captureException`.<br/>``` |
| **Document key environment variables** | Add a `docs/ENVIRONMENT.md` file explaining required env vars like `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` and how to obtain them. | ```markdown<br/>Create a new markdown file `docs/ENVIRONMENT.md` that<br/>lists all required environment variables, their<br/>purpose, whether they should be public or secret, and<br/>instructions for retrieving them from Supabase/OpenAI.<br/>Update `README.md` to link to this file.<br/>``` |

## 3 Architecture recommendations

1. **Offload PDF parsing to background tasks** -- Move heavy PDF parsing into a Supabase Edge Function or background worker. The request handler should upload the file, save metadata with status `processing`, return a response immediately and trigger a background function that parses the PDF and stores chunks. The Supabase docs explain that background tasks allow you to respond quickly while processing continues[\[2\]](https://supabase.com/docs/guides/functions/background-tasks#:~:text=Edge%20Function%20instances%20can%20process,task%20running%20in%20the%20background). Use `EdgeRuntime.waitUntil()` or a queue like Inngest/Trigger.dev to handle long running tasks. Provide SSE or polling endpoints so the UI can show progress.

2. **Implement real‑time status updates** -- Use Supabase's real‑time features or WebSockets to push document processing status to clients. When the background parser finishes, broadcast an update to subscribed clients so the UI can refresh automatically. This addresses the lack of feedback during long processing.

3. **Consolidate PDF parsing implementations** -- There are two competing parsers: `PDFParserAgent` (with table detection, OCR, semantic chunking) and `EnhancedPDFParser` (with fallback and CRE patterns). Maintain a single, well‑tested parser. Remove unused code or clearly document when to use each. Consider processing pages concurrently to improve throughput and reuse extracted text across features.

4. **Strengthen rate limiting and usage tracking** -- Replace the in‑memory token bucket with a persistent store such as Upstash Redis or Supabase `rate_limits` table. Record daily/hourly usage per user and per model. Enforce subscription limits. Use Upstash's example of caching LLM responses and controlling streaming[\[9\]](https://upstash.com/blog/sse-streaming-llm-responses#:~:text=AI,promptly%2C%20enhancing%20its%20perceived%20worth).

5. **Secure file handling and storage** -- Although the code generates unique filenames, always validate MIME types and disallow path traversal. The Web Security Academy explains that path traversal vulnerabilities allow attackers to read arbitrary files[\[10\]](https://portswigger.net/web-security/file-path-traversal#:~:text=What%20is%20path%20traversal%3F). Use libraries like `path` to join directories and check canonical paths. Validate that user‑supplied filenames contain only whitelisted characters[\[11\]](https://portswigger.net/web-security/file-path-traversal#:~:text=The%20most%20effective%20way%20to,behavior%20in%20a%20safer%20way).

6. **Implement multi‑file upload and multi‑doc search** -- Extend the upload API to handle multiple files simultaneously. On the client, allow users to select multiple OMs and show progress per file. In the database, add a composite `tsvector` index over `content` and `document_id` in `document_chunks` to enable full‑text search across documents.

7. **Add an OM comparison tool** -- Provide an API endpoint that accepts two or more document IDs, retrieves relevant chunks and prompts GPT‑4 to produce comparative analysis (NOI, Cap Rate, lease terms). Build a UI that lets users pick documents and view a side‑by‑side comparison. Use streaming to deliver results gradually.

8. **Export features** -- Offer endpoints to download analyses or extracted tables as CSV/Excel/PDF. For CSV/Excel, use `json2csv` or `xlsx`. For PDF export, generate a report with `pdf-lib` or via serverless function. Ensure these endpoints respect the user's access rights.

9. **Structured logging and monitoring** -- Integrate Sentry and Supabase log drains. Use a consistent `logError` utility and capture user context. Include correlation IDs in requests to trace errors across services. Log OpenAI latency and cost metrics.

10. **Improve type safety** -- Convert JS files to TypeScript, define explicit return types for parse functions and API handlers. This prevents accidental `any` and makes it easier to refactor.

## 4 Claude code prompts

Below are examples of prompts you can feed into Claude Code to implement some of the recommendations. Each prompt references the correct file paths and describes the steps clearly.

### 4.1 Background PDF processing

```
You are working on `mgisrael393823/OM-AI`. Move heavy PDF parsing into a background job using Supabase Edge Functions.

1. In `src/pages/api/upload.ts`, modify the handler so that after uploading the file to Supabase Storage and saving the document record with status `processing`, it **returns** the response immediately (omit parsing).
2. Create a new file `supabase/functions/parse-pdf/index.ts`. In this edge function, retrieve the document from storage, use `PDFParserAgent` to parse it (including OCR if necessary), then store chunks and tables in the database. Use `EdgeRuntime.waitUntil()` to run the parsing as a background task[2].
3. After parsing, update the document's status to `completed` and emit a real‑time event (e.g., via Supabase channel `documents:updated`).
4. Ensure the `upload` endpoint publishes a message to invoke the edge function (use Supabase's invoke API or a queue like Inngest).
```

### 4.2 Implement persistent rate limiting

```
In `src/lib/auth-middleware.ts`, replace the in‑memory token bucket with a persistent store using Supabase.

1. Create a new table `rate_limits` with columns: `user_id (uuid)`, `bucket (text)`, `tokens (int)`, `last_refill (timestamp)` and a composite primary key `(user_id, bucket)`.
2. In `withRateLimit`, query the table for the given `user_id` and `bucket` (e.g., `api_chat`). If no record exists, insert one with `maxTokens` and `last_refill` = now.
3. Calculate `tokensToAdd` based on the elapsed time and refill rate, update the record accordingly. If `tokens <= 0`, throw a rate‑limit error.
4. Use Supabase's row‑level security to ensure users can only read their own limits. Cache the record in a Redis store (optional) to improve performance.
```

### 4.3 Unified, accessible chat interface

```
Revamp the chat interface to support real messages, streaming and accessibility:

1. Open `src/components/app/ChatInterface.tsx`. Replace the hard‑coded `messages` array with `const { messages, isLoading, sendMessage } = useChat()`. Map over `messages` to render each bubble. For each message, set `role="user"` or `role="assistant"` class names to style bubbles differently.
2. Add a `<form>` wrapping the input and send button. On submit, call `sendMessage`. Disable the send button when `isLoading` is true.
3. Use `aria-label` on the text input (e.g., `aria-label="Ask a question about your OM"`) and on the send button (e.g., `aria-label="Send message"`).
4. Wrap the messages list in a `<ScrollArea>` with `role="log"` and `aria-live="polite"` so screen readers announce new content.
5. For mobile responsiveness, use Tailwind classes `max-h-[60vh] overflow-y-auto` for the message area and stack elements vertically on screens below `md`.
```

### 4.4 Search across multiple documents

```
Implement multi‑document search.

1. Add a Supabase `tsvector` column `search_vector` to `document_chunks` and create an index on it. Populate it with `to_tsvector('english', content)`.
2. Create an API route `src/pages/api/search.ts` that accepts a `query` and an optional array of `documentIds`. Use Supabase's full‑text search (`.textSearch('search_vector', query)`) to find matching chunks across the specified documents. Return snippets and page numbers.
3. On the client, build a search bar in `DocumentList` or a new component. When the user types a query and presses enter, call `/api/search` and display grouped results. Allow filtering by tags (e.g., NOI, cap rate).
```

### 4.5 OM comparison tool

```
Create an OM comparison tool.

1. Add a page `src/pages/compare.tsx` where users can select two or more documents from their list. Use a multi‑select dropdown.
2. Create an API route `src/pages/api/compare.ts` that accepts `documentIds` and a `query` (e.g., "Compare NOI and Cap Rate"). The handler fetches the relevant chunks from `document_chunks` for each document, builds a structured prompt and calls OpenAI's Chat API. Use the streaming mode to send incremental comparison results.
3. On the compare page, display a table showing key metrics (e.g., NOI, cap rate, occupancy) side by side. Provide a download button to export the comparison as CSV.
```

## 5 Code snippets for top fixes

### 5.1 Fixing the chunk property bug

```javascript
// src/lib/services/pdf/enhanced-parser.ts
// ... inside EnhancedPDFParser class
private createTextChunks(text: string, pageNumber: number, chunkSize: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  // ... build chunks …

  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push({
      id: uuidv4(),
      text: currentChunk.trim(),       // ✅ use text instead of content
      page_number: pageNumber,
      chunk_index: chunkIndex,
      type: this.classifyChunkType(currentChunk),
      word_count: currentChunk.trim().split(/\s+/).length,
      char_count: currentChunk.length
    });
  }

  return chunks;
}
```

### 5.2 Uploading without blocking

```javascript
// src/pages/api/upload.ts (simplified)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, async (req, res) => {
    if (req.method !== 'POST') return apiError(res, 405, 'Method not allowed');
    // handle upload …
    // store metadata with status 'processing'
    const { data: document, error } = await supabase.from('documents').insert({
      user_id: req.user.id,
      filename: fileName,
      original_filename: file.originalFilename,
      status: 'processing',
      // …
    }).select().single();
    if (error) return apiError(res, 500, 'Failed to save document');
    // trigger background job
    await supabase.functions.invoke('parse-pdf', { body: { documentId: document.id } });
    // respond immediately
    return res.status(200).json({ success: true, document });
  });
}
```

### 5.3 Persistent rate limiting

```javascript
// src/lib/auth-middleware.ts (pseudocode)
export async function withRateLimit(userId: string, maxTokens = 10, refillRate = 1, handler: () => Promise<void>) {
  const { data, error } = await supabase.from('rate_limits').select('*').eq('user_id', userId).single();
  let bucket = data;
  const now = Date.now();
  if (!bucket) {
    bucket = { user_id: userId, tokens: maxTokens, last_refill: now };
    await supabase.from('rate_limits').insert(bucket);
  }
  // refill tokens
  const elapsed = now - bucket.last_refill;
  const tokensToAdd = Math.floor(elapsed / (60000 / refillRate));
  const newTokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
  if (newTokens < 1) throw new Error('Rate limit exceeded');
  await supabase.from('rate_limits').update({ tokens: newTokens - 1, last_refill: now }).eq('user_id', userId);
  return handler();
}
```

## 6 Security audit findings

1. **Path traversal protection** -- According to the Web Security Academy, path traversal allows attackers to read arbitrary files or write to the server[\[10\]](https://portswigger.net/web-security/file-path-traversal#:~:text=What%20is%20path%20traversal%3F). OM‑AI generates unique filenames, which mitigates traversal, but it still passes user‑supplied data (UUIDs) into storage paths. Validate that filenames match a UUID pattern and reject anything else. Use `path.join` with a fixed base directory and confirm that the canonical path starts with that base[\[11\]](https://portswigger.net/web-security/file-path-traversal#:~:text=The%20most%20effective%20way%20to,behavior%20in%20a%20safer%20way).

2. **Rate limiting** -- In‑memory buckets are ineffective in serverless environments. Attackers can bypass them by hitting multiple instances. Implement persistent rate limits as described above and set explicit quotas on OpenAI calls (e.g., max tokens per day).

3. **Service role key exposure** -- The `SUPABASE_SERVICE_ROLE_KEY` is used on the server side, but ensure it is never exposed to the client bundle. Use environment variables only in API routes. For client calls, use `anon` keys.

4. **Upload validation** -- Validate MIME types and PDF signatures. Reject encrypted PDFs unless the parser can handle them securely. Limit file size (already set to 50 MB) and enforce scanning for malware.

5. **Authentication weaknesses** -- Tokens are accepted from the `Authorization` header or cookies. Ensure cookies are marked `HttpOnly` and `Secure`. Consider rotating tokens regularly and adding CSRF protection on forms.

6. **Error handling** -- Avoid leaking internal errors to clients. `upload.ts` returns raw error messages (e.g., `validationResult.errors.join('; ')`). Replace with generic messages and log details server‑side.

## 7 Performance bottleneck report

- **PDF parsing throughput** -- Processing pages sequentially slows down parsing. Consider processing multiple pages in parallel (e.g., using `Promise.all` with concurrency limits) or using WebAssembly‑based parsers. Profiling should guide concurrency level.

- **Database writes** -- Inserting chunks one by one is inefficient. Use bulk insert with `supabase.from('document_chunks').insert(chunks)` as already done. Ensure proper indexes on `document_id` and `page_number` to speed up retrieval.

- **OpenAI response latency** -- Streaming reduces perceived latency. The Upstash article notes that streaming partial responses provides immediate feedback to users[\[9\]](https://upstash.com/blog/sse-streaming-llm-responses#:~:text=AI,promptly%2C%20enhancing%20its%20perceived%20worth). Maintain small flush intervals (e.g., 50 ms) and flush buffers when enough characters accumulate[\[12\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/pages/api/chat.ts#L488-L515). Cache common queries with Upstash Redis or Supabase caching layer.

- **Bundle size** -- Large dependencies (e.g., `pdfjs-dist`) should be dynamically imported only in server environments. Tree‑shake unused icons and components. Use `next/dynamic` to load heavy components on demand.

- **Database indexes** -- Add indexes to `document_chunks.page_number`, `document_chunks.document_id` and `document_chunks.search_vector`. For chat sessions, index `messages.chat_session_id` and `created_at` to speed up history retrieval.

- **Memory usage** -- When parsing large files, avoid loading the entire PDF into memory. Use streaming extraction if possible. When reading from `formidable`, pipe directly into storage. Use Supabase's resumable uploads for files up to 50 GB.

## 8 UI/UX redesign suggestions

1. **Streamlined upload flow** -- Present a multi‑file drag‑and‑drop area with progress bars. After upload, immediately list documents with status "Processing..." and show a spinner. Use real‑time updates to change status to "Ready." Include a clear call to action to open the chat once processing is complete.

2. **Unified dashboard** -- Consolidate navigation into a single sidebar with icons and text. Provide a top bar with account, settings and documentation links. Follow the W3C recommendation to provide clear and consistent navigation options[\[4\]](https://www.w3.org/WAI/tips/designing/#:~:text=,83).

3. **Responsive design** -- Design for mobile by stacking panels vertically on small screens and hiding less‑important panels behind a hamburger menu. Use Tailwind's responsive classes. Ensure touch targets are at least 44 × 44 px.

4. **Accessible components** -- Ensure all buttons and inputs have labels and roles. Provide a visible focus indicator for keyboard navigation[\[13\]](https://www.w3.org/WAI/tips/designing/#:~:text=Ensure%20that%20interactive%20elements%20are,easy%20to%20identify). Use semantic HTML (`<button>`, `<nav>`, `<header>`) rather than divs. Avoid using color alone to convey status; use icons and text together[\[4\]](https://www.w3.org/WAI/tips/designing/#:~:text=,83).

5. **Document explorer enhancements** -- Allow users to tag documents (e.g., "multifamily", "office", "Los Angeles") and filter by tags, upload date or size. Display metadata such as page count and extracted tables count. Provide sorting (by date, name or status).

6. **Improved chat experience** -- Use chat bubbles with avatars (user vs assistant), show the document name at the top, and provide quick actions like "Summarize OM", "Extract financials" or "Export to CSV". Include a token counter and cost estimate to inform the user before sending a request.

7. **Result dashboards** -- After analysis, provide dashboards summarizing key metrics (NOI, cap rate, IRR, occupancy) with charts. Let users drill down into the original text snippet from which the metric was extracted.

8. **Collaboration features** -- Allow users to add comments or highlights to text chunks, share documents with team members (role‑based access), and view changes in real time.

## Conclusion

OM‑AI demonstrates a solid foundation---a modern Next.js frontend, Supabase backend, and robust chat API. However, the platform's current implementation blocks on long‑running tasks, lacks accessibility, and omits key productivity features. By offloading PDF processing to background tasks, strengthening rate limits, fixing bugs in the parser, and redesigning the UI with accessibility in mind, the team can significantly improve reliability, scalability and user satisfaction. The code prompts and snippets provided here should serve as actionable starting points for your development team.

[\[1\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/pages/api/upload.ts#L50-L100) upload.ts  
<https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/pages/api/upload.ts>

[\[2\]](https://supabase.com/docs/guides/functions/background-tasks#:~:text=Edge%20Function%20instances%20can%20process,task%20running%20in%20the%20background) Background Tasks | Supabase Docs  
<https://supabase.com/docs/guides/functions/background-tasks>

[\[3\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/components/app/ChatInterface.tsx#L30-L47) ChatInterface.tsx  
<https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/components/app/ChatInterface.tsx>

[\[4\]](https://www.w3.org/WAI/tips/designing/#:~:text=,83) [\[13\]](https://www.w3.org/WAI/tips/designing/#:~:text=Ensure%20that%20interactive%20elements%20are,easy%20to%20identify) Designing for Web Accessibility -- Tips for Getting Started | Web Accessibility Initiative (WAI) | W3C  
<https://www.w3.org/WAI/tips/designing/>

[\[5\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/components/app/DocumentList.tsx#L54-L77) DocumentList.tsx  
<https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/components/app/DocumentList.tsx>

[\[6\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/lib/auth-middleware.ts#L81-L116) auth-middleware.ts  
<https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/lib/auth-middleware.ts>

[\[7\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/lib/services/pdf/enhanced-parser.ts#L269-L277) enhanced-parser.ts  
<https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/lib/services/pdf/enhanced-parser.ts>

[\[8\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/pages/api/chat.ts#L114-L119) [\[12\]](https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/pages/api/chat.ts#L488-L515) chat.ts  
<https://github.com/mgisrael393823/OM-AI/blob/f6797596ff1545a5e98e75fddb5f509d703a2103/src/pages/api/chat.ts>

[\[9\]](https://upstash.com/blog/sse-streaming-llm-responses#:~:text=AI,promptly%2C%20enhancing%20its%20perceived%20worth) Using Server-Sent Events (SSE) to stream LLM responses in Next.js | Upstash Blog  
<https://upstash.com/blog/sse-streaming-llm-responses>

[\[10\]](https://portswigger.net/web-security/file-path-traversal#:~:text=What%20is%20path%20traversal%3F) [\[11\]](https://portswigger.net/web-security/file-path-traversal#:~:text=The%20most%20effective%20way%20to,behavior%20in%20a%20safer%20way) What is path traversal, and how to prevent it? | Web Security Academy  
<https://portswigger.net/web-security/file-path-traversal>
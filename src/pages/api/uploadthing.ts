import type { NextApiHandler } from "next"
import { createRouteHandler } from "uploadthing/next-legacy"
import { ourFileRouter } from "@/lib/uploadthing"
import { DebugResponse } from "@/lib/uploadthing-debug"

/**
 * Disable Next.js body parsing so UploadThing can handle the request stream.
 * This allows uploads larger than Vercel's 4.5MB limit.
 */
export const config = {
  api: {
    bodyParser: false,
  },
}

const uploadThingHandler = createRouteHandler({
  router: ourFileRouter,
  config: {
    token: process.env.UPLOADTHING_TOKEN,
  },
})

const handler: NextApiHandler = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  // Basic body presence check
  const hasBody =
    Boolean(req.headers['content-length']) ||
    Boolean(req.headers['transfer-encoding'])
  if (!hasBody) {
    return res.status(400).json({ error: 'Missing or empty JSON body' })
  }

  // Track whether we've sent a response
  let responseHandled = false

  // Wrap response to debug what UploadThing is returning
  const debugRes = new DebugResponse(res)
  
  try {
    console.log(`UploadThing API: ${req.method} ${req.url}`)
    console.log(`UploadThing API: Query params:`, req.query)
    console.log(`UploadThing API: Headers:`, Object.fromEntries(
      Object.entries(req.headers).filter(([key]) => key !== 'cookie')
    ))
    
    // Ensure token is present
    if (!process.env.UPLOADTHING_TOKEN) {
      console.error("UploadThing API: Missing UPLOADTHING_TOKEN environment variable")
      res.status(500).json({ error: "Missing UPLOADTHING_TOKEN" })
      responseHandled = true
      return
    }
    
    console.log("UploadThing API: Calling uploadThingHandler...")
    
    // Call the handler - it will send the response directly
    await uploadThingHandler(req, debugRes.getResponse())
    responseHandled = true
    
    console.log("UploadThing API handler completed")
    console.log("🔍 UploadThing response status code:", res.statusCode)
    console.log("🔍 UploadThing raw response body:", debugRes.getBodyAsString())
    
  } catch (error) {
    console.error("UploadThing API handler error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })

    if (!res.headersSent && !responseHandled) {
      // Provide a more specific message for JSON parse errors
      const message =
        error instanceof SyntaxError && /JSON/.test(error.message)
          ? "Invalid JSON body"
          : "UploadThing API failed"

      res.status(message === "Invalid JSON body" ? 400 : 500).json({
        error: message,
        message: String(error instanceof Error ? error.message : error),
        details: "Check server logs for more information",
        timestamp: new Date().toISOString(),
      })
      responseHandled = true
    } else {
      console.error(
        "UploadThing API: Response already sent, cannot send error response"
      )
    }
  } finally {
    // Final safety check - ensure SOMETHING was sent
    if (!res.headersSent && !responseHandled) {
      console.error("UploadThing API: No response sent! Sending emergency fallback")
      res.status(500).json({
        error: "No response generated",
        message: "The upload handler failed to generate any response",
        timestamp: new Date().toISOString()
      })
    }
    
    // Log final state
    console.log("UploadThing API: Final response sent:", res.headersSent)
    console.log("UploadThing API: Final status code:", res.statusCode)
  }
}

export default handler

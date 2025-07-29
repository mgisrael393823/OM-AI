import type { NextApiHandler } from "next"
import { createRouteHandler } from "uploadthing/next"
import { ourFileRouter } from "@/lib/uploadthing"

/**
 * Disable Next.js body parsing so UploadThing can handle the request stream.
 * This allows uploads larger than Vercel's 4.5MB limit.
 */
export const config = {
  api: {
    bodyParser: false,
  },
}

// Create the UploadThing handler for v7
const utHandler = createRouteHandler({
  router: ourFileRouter,
  config: {
    token: process.env.UPLOADTHING_TOKEN,
  },
})

const handler: NextApiHandler = async (req, res) => {
  // Basic CORS headers for dev and production
  const allowOrigin =
    process.env.NODE_ENV === "development"
      ? "*"
      : process.env.NEXT_PUBLIC_APP_URL || ""
  res.setHeader("Access-Control-Allow-Origin", allowOrigin)
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  )
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  try {
    await utHandler(req, res)
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json")
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error"
    if (!res.headersSent) {
      res
        .status(500)
        .json({ success: false, error: message, documentId: null })
    }
  }
}

export default handler

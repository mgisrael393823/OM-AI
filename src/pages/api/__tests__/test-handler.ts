import type { NextApiHandler } from "next"

// Test handler that matches the expected behavior without importing uploadthing
const handler: NextApiHandler = async (req, res) => {
  try {
    // Fast-fail validation: Check token first
    if (!process.env.UPLOADTHING_TOKEN) {
      console.error("UploadThing API: Missing UPLOADTHING_TOKEN environment variable")
      return res
        .status(500)
        .setHeader('Content-Type', 'application/json')
        .json({
          success: false,
          error: "Missing or invalid UPLOADTHING_TOKEN",
          documentId: null
        })
    }

    // Validate HTTP method
    if (req.method !== 'POST') {
      console.warn(`UploadThing API: Invalid method ${req.method}`)
      return res
        .status(405)
        .setHeader('Content-Type', 'application/json')
        .json({
          success: false,
          error: "Method not allowed",
          documentId: null
        })
    }

    // Validate query parameters
    const { actionType, slug } = req.query
    
    if (actionType !== 'upload') {
      console.warn(`UploadThing API: Invalid actionType ${actionType}`)
      return res
        .status(400)
        .setHeader('Content-Type', 'application/json')
        .json({
          success: false,
          error: "Invalid actionType",
          documentId: null
        })
    }

    if (!slug || typeof slug !== 'string') {
      console.warn(`UploadThing API: Invalid or missing slug ${slug}`)
      return res
        .status(400)
        .setHeader('Content-Type', 'application/json')
        .json({
          success: false,
          error: "Invalid or missing slug",
          documentId: null
        })
    }

    // Mock successful upload
    return res
      .status(200)
      .setHeader('Content-Type', 'application/json')
      .json({
        success: true,
        documentId: 'test-document-id'
      })

  } catch (error) {
    if (!res.headersSent) {
      return res
        .status(500)
        .setHeader('Content-Type', 'application/json')
        .json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          documentId: null
        })
    }
  }
}

export default handler
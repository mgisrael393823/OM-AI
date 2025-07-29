import type { NextApiHandler } from "next"

// Mock handler for tests - simulates v7 UploadThing behavior
const handler: NextApiHandler = async (req, res) => {
  // Check for token first
  if (!process.env.UPLOADTHING_TOKEN) {
    return res.status(500).json({
      success: false,
      error: "Missing UPLOADTHING_TOKEN",
      documentId: null
    })
  }
  
  // Validate token format (basic check for invalid tokens)
  if (process.env.UPLOADTHING_TOKEN === 'invalid-token') {
    return res.status(401).json({
      success: false,
      error: "Invalid UPLOADTHING_TOKEN",
      documentId: null
    })
  }
  
  // Method validation
  if (req.method === 'GET') {
    // GET for route config (actionType should be 'upload' for proper requests)
    if (req.query.actionType === 'upload' && req.query.slug === 'pdfUploader') {
      return res.status(200).json({
        routeConfig: {
          pdfUploader: {
            maxFileSize: "16MB",
            maxFileCount: 1
          }
        }
      })
    }
    return res.status(200).json({ routeConfig: {} })
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
      documentId: null
    })
  }
  
  // POST request validation
  const { actionType, slug } = req.query
  
  // Check actionType
  if (!actionType || actionType !== 'upload') {
    return res.status(400).json({
      success: false,
      error: "Invalid actionType",
      documentId: null
    })
  }
  
  // Check slug
  if (!slug || typeof slug !== 'string' || slug !== 'pdfUploader') {
    return res.status(400).json({
      success: false,
      error: "Invalid or missing slug",
      documentId: null
    })
  }
  
  // Success case
  return res.status(200).json({
    success: true,
    documentId: 'test-document-id'
  })
}

export default handler
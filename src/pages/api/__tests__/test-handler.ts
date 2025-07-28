import type { NextApiHandler } from "next"

// Mock handler for tests - simulates v6 UploadThing behavior
const handler: NextApiHandler = async (req, res) => {
  // v6 UploadThing handles its own validation and responses
  // This is a simplified mock for testing
  
  if (req.method === 'GET') {
    // v6 uses GET for fetching router config
    return res.status(200).json({
      routeConfig: {
        pdfUploader: {
          maxFileSize: "16MB",
          maxFileCount: 1
        }
      }
    })
  }
  
  if (req.method === 'POST' && req.query.actionType === 'upload') {
    return res.status(200).json({
      success: true,
      documentId: 'test-document-id'
    })
  }
  
  return res.status(405).json({ 
    error: "Method not allowed" 
  })
}

export default handler
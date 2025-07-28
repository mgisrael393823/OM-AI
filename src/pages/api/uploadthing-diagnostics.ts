import type { NextApiHandler } from "next"

const handler: NextApiHandler = async (req, res) => {
  const token = process.env.UPLOADTHING_TOKEN
  
  if (!token) {
    return res.status(500).json({ error: "Missing UPLOADTHING_TOKEN" })
  }

  try {
    // Decode the token
    const tokenData = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'))
    console.log("Token data:", tokenData)

    // Test connection to UploadThing
    console.log("Testing UploadThing API connection...")
    
    // Try to get presigned URLs (similar to what the SDK does internally)
    const response = await fetch("https://api.uploadthing.com/v6.4/prepareUpload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-uploadthing-api-key": tokenData.apiKey,
        "x-uploadthing-app-id": tokenData.appId,
        "x-uploadthing-version": "7.7.3",
      },
      body: JSON.stringify({
        files: [{ name: "test.pdf", size: 1024, type: "application/pdf" }],
        routeConfig: {
          slug: "pdfUploader",
          config: {
            pdf: { maxFileSize: "16MB", maxFileCount: 1 }
          }
        },
        metadata: {}
      })
    })

    console.log("UploadThing API response status:", response.status)
    const responseText = await response.text()
    console.log("UploadThing API response:", responseText)

    let responseData
    try {
      responseData = JSON.parse(responseText)
    } catch (e) {
      return res.status(200).json({
        success: false,
        error: "Invalid JSON from UploadThing",
        rawResponse: responseText,
        status: response.status
      })
    }

    return res.status(200).json({
      success: response.ok,
      tokenValid: true,
      apiResponse: {
        status: response.status,
        data: responseData
      }
    })
  } catch (error) {
    console.error("Diagnostics error:", error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    })
  }
}

export default handler
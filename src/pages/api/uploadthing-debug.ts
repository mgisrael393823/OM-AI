import type { NextApiHandler } from "next"

/**
 * Debug endpoint to test UploadThing connectivity and response
 */
const handler: NextApiHandler = async (req, res) => {
  console.log("UploadThing Debug: Starting test...")
  
  const token = process.env.UPLOADTHING_TOKEN
  if (!token) {
    return res.status(500).json({ error: "Missing UPLOADTHING_TOKEN" })
  }

  try {
    // Decode the token to inspect it
    const tokenData = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'))
    console.log("UploadThing Debug: Token data:", tokenData)

    // Make a simple request to UploadThing to test connectivity
    const testUrl = "https://api.uploadthing.com/v6/getAppData"
    console.log("UploadThing Debug: Testing connection to:", testUrl)
    
    const response = await fetch(testUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-uploadthing-api-key": tokenData.apiKey,
        "x-uploadthing-version": "7.7.3"
      },
      body: JSON.stringify({
        appId: tokenData.appId
      })
    })

    console.log("UploadThing Debug: Response status:", response.status)
    console.log("UploadThing Debug: Response headers:", Object.fromEntries(response.headers.entries()))
    
    const responseText = await response.text()
    console.log("UploadThing Debug: Raw response:", responseText)
    
    let responseData
    try {
      responseData = JSON.parse(responseText)
    } catch (e) {
      console.error("UploadThing Debug: Failed to parse response as JSON")
      return res.status(200).json({
        success: false,
        error: "Invalid JSON response",
        rawResponse: responseText,
        status: response.status
      })
    }

    return res.status(200).json({
      success: true,
      status: response.status,
      data: responseData
    })
  } catch (error) {
    console.error("UploadThing Debug: Error:", error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    })
  }
}

export default handler
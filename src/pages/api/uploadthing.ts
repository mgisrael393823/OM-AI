import { createRouteHandler } from "uploadthing/next"
import { ourFileRouter } from "@/lib/uploadthing"
import type { NextApiRequest, NextApiResponse } from "next"

const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
  config: {
    token: process.env.UPLOADTHING_TOKEN,
  },
})

// Convert App Router handlers to Pages Router format
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    // Convert NextRequest to Request for UploadThing
    const url = new URL(req.url!, `http://${req.headers.host}`)
    const request = new Request(url, {
      method: req.method,
      headers: new Headers(req.headers as Record<string, string>),
    })
    
    const response = await GET(request)
    
    // Convert Response back to NextApiResponse
    const data = await response.text()
    res.status(response.status).json(JSON.parse(data))
  } else if (req.method === "POST") {
    // Convert NextRequest to Request for UploadThing
    const url = new URL(req.url!, `http://${req.headers.host}`)
    const request = new Request(url, {
      method: req.method,
      headers: new Headers(req.headers as Record<string, string>),
      body: JSON.stringify(req.body),
    })
    
    const response = await POST(request)
    
    // Convert Response back to NextApiResponse
    const data = await response.text()
    res.status(response.status).json(JSON.parse(data))
  } else {
    res.setHeader("Allow", ["GET", "POST"])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
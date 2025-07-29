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
const handler = createRouteHandler({
  router: ourFileRouter,
  config: {
    token: process.env.UPLOADTHING_TOKEN,
  },
})

export default handler
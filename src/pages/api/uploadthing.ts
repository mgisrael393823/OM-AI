import { createRouteHandler } from "uploadthing/next-legacy"
import { ourFileRouter } from "@/lib/uploadthing"
import type { NextApiHandler } from "next"

/**
 * Disable Next.js body parsing so UploadThing can handle the request stream.
 * This allows uploads larger than Vercel's 4.5MB limit.
 */
export const config = {
  api: {
    bodyParser: false,
  },
}

const handler: NextApiHandler = createRouteHandler({
  router: ourFileRouter,
  config: {
    token: process.env.UPLOADTHING_TOKEN,
  },
})

export default handler
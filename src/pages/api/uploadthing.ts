import { createNextPageApiHandler } from "uploadthing/next-legacy"
import { ourFileRouter } from "@/lib/uploadthing-simple"

/**
 * Disable Next.js body parsing so UploadThing can handle the request stream.
 * This allows uploads larger than Vercel's 4.5MB limit.
 */
export const config = {
  api: {
    bodyParser: false,
  },
}

// In v6, the handler should be used directly
const handler = createNextPageApiHandler({
  router: ourFileRouter,
})

export default handler
import type { NextApiHandler } from "next"
import { createRouteHandler } from "uploadthing/next-legacy"
import { testFileRouter } from "@/lib/uploadthing-test"

export const config = {
  api: {
    bodyParser: false,
  },
}

const handler: NextApiHandler = createRouteHandler({
  router: testFileRouter,
  config: {
    token: process.env.UPLOADTHING_TOKEN,
  },
})

export default handler
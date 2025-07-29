import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "@/lib/uploadthing";

const handlers = createRouteHandler({
  router: ourFileRouter,
  config: { token: process.env.UPLOADTHING_TOKEN! },
});

export const GET = handlers.GET;
export const POST = handlers.POST;
import { generateReactHelpers } from "@uploadthing/react/hooks"
import type { OurFileRouter } from "@/lib/uploadthing"

export const { useUploadThing, uploadFiles } = generateReactHelpers<OurFileRouter>()
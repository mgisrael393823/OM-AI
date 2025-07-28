import { createUploadthing, type FileRouter } from "uploadthing/next-legacy"

const f = createUploadthing()

// Minimal file router for testing
export const ourFileRouter = {
  pdfUploader: f({ pdf: { maxFileSize: "16MB" } })
    .middleware(() => {
      // Simple middleware that just returns metadata
      return { userId: "test-user" }
    })
    .onUploadComplete(({ metadata, file }) => {
      console.log("Upload complete:", file.name)
      // Return void for v6
    }),
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter
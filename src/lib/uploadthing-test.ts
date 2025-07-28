import { createUploadthing, type FileRouter } from "uploadthing/next-legacy"

const f = createUploadthing()

// Minimal test router to isolate issues
export const testFileRouter = {
  testUploader: f({ pdf: { maxFileSize: "16MB" } })
    .middleware(async ({ req }) => {
      console.log("TEST middleware: Called")
      // Always authorize for testing
      return { userId: "test-user-123" }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("TEST onUploadComplete: Called with file:", file.name)
      // Return minimal response
      return { 
        success: true,
        message: "Test upload completed"
      }
    }),
} satisfies FileRouter

export type TestFileRouter = typeof testFileRouter
# UploadThing Setup Guide

This guide explains how to set up UploadThing for handling PDF uploads in the OM-AI application.

## Why UploadThing?

We're using UploadThing to solve the Vercel 4.5MB request body size limitation. UploadThing allows:
- Direct browser-to-storage uploads (bypassing Vercel's limits)
- Support for files up to 16MB (configurable)
- Built-in progress tracking
- Automatic retry handling

## Setup Steps

### 1. Create UploadThing Account

1. Go to [uploadthing.com](https://uploadthing.com)
2. Sign up for a free account
3. Create a new app for your project

### 2. Get Your API Token

1. In the UploadThing dashboard, go to your app settings
2. Copy your `UPLOADTHING_TOKEN` (this is a base64-encoded token containing your API key and app ID)

### 3. Update Environment Variables

Add this to your `.env.local` file:

```env
# UploadThing Configuration
UPLOADTHING_TOKEN=your_base64_token_here
```

### 4. Deploy Configuration

For production deployment (Vercel, etc.), add the same environment variables to your deployment settings.

## How It Works

1. **Client uploads to UploadThing**: File goes directly from browser to UploadThing's storage
2. **UploadThing returns URL**: After upload, we get a URL to the file
3. **Server processes file**: Our server fetches the file from URL and processes it
4. **Store in Supabase**: Processed file and metadata are stored in our Supabase storage

## File Size Limits

- Current limit: 16MB per PDF file
- Can be increased by modifying `maxFileSize` in `src/lib/uploadthing.ts`
- UploadThing free tier supports up to 2GB per file

## Testing

1. Start the development server: `npm run dev`
2. Navigate to the document upload section
3. Try uploading PDFs of various sizes:
   - Small file (< 1MB)
   - Medium file (2-5MB)
   - Large file (10-16MB)
4. Verify that files upload successfully and appear in your document list

## Troubleshooting

### "Unauthorized" Error
- Check that your Supabase auth session is valid
- Verify environment variables are set correctly

### Upload Fails Immediately
- Check UploadThing API keys in `.env.local`
- Verify UploadThing app is active in dashboard

### Processing Errors
- Check server logs for PDF parsing errors
- Verify Supabase storage bucket exists and has proper permissions

## Migration from Old Upload

The old `/api/upload` endpoint is still available but should not be used for files > 4MB. 
Once UploadThing is fully tested, the old endpoint can be removed.
import { handleUpload } from '@vercel/blob/client'
import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  
  try {
    const body = req.body;
    
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({ 
        allowedContentTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], 
        maximumSizeInBytes: 25 * 1024 * 1024,
        addRandomSuffix: true
      }),
      onUploadCompleted: async ({ blob }) => { 
        console.log('[Blob Upload] Completed:', blob.pathname) 
      }
    });
    
    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('[Blob Upload] Error:', error);
    return res.status(400).json({ error: 'Upload failed' });
  }
}
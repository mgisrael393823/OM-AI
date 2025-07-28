module.exports = {
  createRouteHandler: jest.fn(() => {
    return async (req, res) => {
      if (req.method === 'POST' && req.query.actionType === 'upload' && req.query.slug === 'pdfUploader') {
        res.status(200).json({ success: true, documentId: 'mock-document-id' })
      } else {
        res.status(400).json({ success: false, error: 'Invalid request', documentId: null })
      }
    }
  })
}
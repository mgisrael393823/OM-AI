import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, AuthenticatedRequest, apiError } from '@/lib/auth-middleware'
import { PDFAnalyzer } from '@/lib/agents/pdf-parser'

async function analyzeHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    return apiError(res, 400, 'Document ID is required', 'MISSING_DOCUMENT_ID')
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Get document metadata
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single()

    if (docError || !document) {
      return apiError(res, 404, 'Document not found', 'DOCUMENT_NOT_FOUND')
    }

    // Get document chunks
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('*')
      .eq('document_id', id)
      .order('page_number', { ascending: true })

    if (chunksError) {
      console.error('Error fetching chunks:', chunksError)
      return apiError(res, 500, 'Failed to fetch document content', 'CHUNKS_ERROR')
    }

    // Get document tables
    const { data: tables, error: tablesError } = await supabase
      .from('document_tables')
      .select('*')
      .eq('document_id', id)
      .order('page_number', { ascending: true })

    if (tablesError) {
      console.error('Error fetching tables:', tablesError)
      return apiError(res, 500, 'Failed to fetch document tables', 'TABLES_ERROR')
    }

    // Analyze content for real estate metrics
    const fullText = chunks?.map(chunk => chunk.content).join('\n\n') || ''
    const realEstateMetrics = PDFAnalyzer.extractRealEstateMetrics(fullText)
    const financialData = PDFAnalyzer.extractFinancialData(fullText)

    // Create comprehensive analysis
    const analysis = {
      document: {
        id: document.id,
        name: document.name,
        status: document.status,
        pages: document.metadata?.parsing?.pages || 0,
        processingTime: document.metadata?.parsing?.processingTime || 0
      },
      content: {
        totalChunks: chunks?.length || 0,
        totalTables: tables?.length || 0,
        totalTokens: chunks?.reduce((sum, chunk) => sum + (chunk.tokens || 0), 0) || 0,
        fullTextLength: fullText.length
      },
      realEstate: {
        propertyType: realEstateMetrics.propertyType,
        squareFootage: realEstateMetrics.squareFootage,
        rentPSF: realEstateMetrics.rentPSF,
        capRate: realEstateMetrics.capRate,
        noi: realEstateMetrics.noi,
        keyTerms: realEstateMetrics.keyTerms
      },
      financial: {
        currencies: financialData.filter(item => item.type === 'currency'),
        percentages: financialData.filter(item => item.type === 'percentage'),
        numbers: financialData.filter(item => item.type === 'number')
      },
      structure: {
        chunks: chunks?.map(chunk => ({
          id: chunk.chunk_id,
          page: chunk.page_number,
          type: chunk.chunk_type,
          tokens: chunk.tokens,
          preview: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : '')
        })) || [],
        tables: tables?.map(table => ({
          id: table.id,
          page: table.page_number,
          rows: table.table_data?.length || 0,
          columns: table.headers?.length || 0,
          headers: table.headers,
          preview: table.table_data?.slice(0, 3) || []
        })) || []
      },
      validation: document.metadata?.validation || null
    }

    return res.status(200).json({
      success: true,
      analysis
    })

  } catch (error) {
    console.error('Analysis error:', error)
    return apiError(res, 500, 'Failed to analyze document', 'ANALYSIS_ERROR',
      error instanceof Error ? error.message : 'Unknown error')
  }
}

export default withAuth(analyzeHandler)
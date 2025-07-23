/**
 * Integration Test for MVP Demo Flow
 * 
 * Tests the complete flow: Upload → Extract → Chunk → Q&A
 * This validates that all our modernized services work together correctly.
 */

import { enhancedPDFParser } from './pdf/enhanced-parser';
import { openAIService } from './openai';
import { CRE_FUNCTIONS } from './openai/functions';
import { createClient } from '@supabase/supabase-js';

interface MVPTestResult {
  success: boolean;
  steps: {
    pdfParsing: { success: boolean; duration: number; chunksCreated?: number; error?: string };
    documentStorage: { success: boolean; duration: number; documentId?: string; error?: string };
    contextRetrieval: { success: boolean; duration: number; relevantChunks?: number; error?: string };
    aiAnalysis: { success: boolean; duration: number; response?: string; tokens?: number; error?: string };
    functionCalling: { success: boolean; duration: number; functionResults?: any; error?: string };
  };
  totalDuration: number;
  overallError?: string;
}

/**
 * Test the complete MVP flow with a sample PDF buffer
 */
export async function testMVPFlow(
  pdfBuffer: Buffer,
  testUserId: string = 'test-user-123',
  testQuery: string = 'What is the cap rate for this property?'
): Promise<MVPTestResult> {
  const startTime = Date.now();
  
  const result: MVPTestResult = {
    success: false,
    steps: {
      pdfParsing: { success: false, duration: 0 },
      documentStorage: { success: false, duration: 0 },
      contextRetrieval: { success: false, duration: 0 },
      aiAnalysis: { success: false, duration: 0 },
      functionCalling: { success: false, duration: 0 }
    },
    totalDuration: 0
  };

  try {
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Step 1: PDF Parsing
    console.log('🔄 Step 1: Parsing PDF...');
    const parseStart = Date.now();
    
    try {
      const parseResult = await enhancedPDFParser.parseBuffer(pdfBuffer, {
        extractTables: true,
        structuredExtraction: true,
        enablePerformanceMonitoring: true
      });

      result.steps.pdfParsing = {
        success: true,
        duration: Date.now() - parseStart,
        chunksCreated: parseResult.chunks.length
      };

      console.log(`✅ PDF parsed successfully: ${parseResult.chunks.length} chunks, ${parseResult.pages.length} pages`);

      // Step 2: Document Storage
      console.log('🔄 Step 2: Storing document and chunks...');
      const storageStart = Date.now();

      try {
        // Create document record
        const { data: document, error: docError } = await supabase
          .from('documents')
          .insert({
            user_id: testUserId,
            filename: 'test-document.pdf',
            original_filename: 'Test Commercial Property OM.pdf',
            file_type: 'application/pdf',
            file_size: pdfBuffer.length,
            processing_status: 'completed',
            metadata: parseResult.metadata
          })
          .select()
          .single();

        if (docError) throw docError;

        // Store document chunks
        const chunksToInsert = parseResult.chunks.map((chunk: any) => ({
          document_id: document.id,
          user_id: testUserId,
          content: chunk.content || chunk.text, // Handle both enhanced parser and original parser output
          page_number: chunk.page_number || chunk.page,
          chunk_index: chunk.chunk_index || 0,
          chunk_type: chunk.type,
          word_count: chunk.word_count || Math.ceil(chunk.text?.length / 5) || 0,
          char_count: chunk.char_count || chunk.text?.length || 0
        }));

        const { error: chunksError } = await supabase
          .from('document_chunks')
          .insert(chunksToInsert);

        if (chunksError) throw chunksError;

        result.steps.documentStorage = {
          success: true,
          duration: Date.now() - storageStart,
          documentId: document.id
        };

        console.log(`✅ Document stored with ID: ${document.id}`);

        // Step 3: Context Retrieval
        console.log('🔄 Step 3: Retrieving relevant context...');
        const retrievalStart = Date.now();

        try {
          const { data: relevantChunks, error: retrievalError } = await supabase
            .from('document_chunks')
            .select(`
              content,
              page_number,
              chunk_type,
              documents!inner(name, id)
            `)
            .eq('user_id', testUserId)
            .eq('document_id', document.id)
            .textSearch('content', testQuery)
            .limit(5);

          if (retrievalError) throw retrievalError;

          result.steps.contextRetrieval = {
            success: true,
            duration: Date.now() - retrievalStart,
            relevantChunks: relevantChunks?.length || 0
          };

          console.log(`✅ Retrieved ${relevantChunks?.length || 0} relevant chunks`);

          // Step 4: AI Analysis
          console.log('🔄 Step 4: Generating AI response...');
          const aiStart = Date.now();

          try {
            // Build context from retrieved chunks
            const contextualInformation = relevantChunks && relevantChunks.length > 0 ? `

DOCUMENT CONTEXT:
The following information is from the uploaded commercial real estate document:

${relevantChunks
  .map((chunk: any, index: number) => 
    `[${index + 1}] From "${chunk.documents?.name || 'Document'}" (Page ${chunk.page_number}):
${chunk.content.substring(0, 800)}${chunk.content.length > 800 ? '...' : ''}`
  )
  .join('\n')}

Please reference this document context in your response when relevant.` : '';

            const messages = [
              {
                role: "system" as const,
                content: `You are OM Intel, an advanced AI assistant specializing in commercial real estate analysis and document review. You provide professional, insightful analysis of CRE investments, financials, and market conditions.${contextualInformation}`
              },
              {
                role: "user" as const,
                content: testQuery
              }
            ];

            const aiResponse = await openAIService.createChatCompletion({
              messages,
              model: 'gpt-4o-mini', // Use cost-effective model for testing
              temperature: 0.7,
              maxTokens: 1000,
              userId: testUserId
            });

            result.steps.aiAnalysis = {
              success: true,
              duration: Date.now() - aiStart,
              response: aiResponse.content.substring(0, 200) + '...',
              tokens: aiResponse.usage.totalTokens
            };

            console.log(`✅ AI response generated: ${aiResponse.usage.totalTokens} tokens`);

            // Step 5: Function Calling Test
            console.log('🔄 Step 5: Testing CRE function calling...');
            const functionStart = Date.now();

            try {
              const functionMessages = [
                {
                  role: "system" as const,
                  content: `You are OM Intel, a CRE analysis expert. Use the analyze_property_financials function to extract structured data from the provided document context.${contextualInformation}`
                },
                {
                  role: "user" as const,
                  content: "Please analyze the property financials from this document and extract key metrics including cap rate, NOI, and any investment details."
                }
              ];

              const functionResponse = await openAIService.createChatCompletion({
                messages: functionMessages,
                model: 'gpt-4o-mini',
                functions: [CRE_FUNCTIONS.analyze_property_financials],
                userId: testUserId
              });

              result.steps.functionCalling = {
                success: true,
                duration: Date.now() - functionStart,
                functionResults: functionResponse.functionCalls
              };

              console.log(`✅ Function calling completed`);

            } catch (funcError) {
              result.steps.functionCalling = {
                success: false,
                duration: Date.now() - functionStart,
                error: funcError instanceof Error ? funcError.message : 'Unknown function calling error'
              };
              console.warn(`❌ Function calling failed:`, funcError);
            }

          } catch (aiError) {
            result.steps.aiAnalysis = {
              success: false,
              duration: Date.now() - aiStart,
              error: aiError instanceof Error ? aiError.message : 'Unknown AI error'
            };
            console.error(`❌ AI analysis failed:`, aiError);
          }

        } catch (retrievalError) {
          result.steps.contextRetrieval = {
            success: false,
            duration: Date.now() - retrievalStart,
            error: retrievalError instanceof Error ? retrievalError.message : 'Unknown retrieval error'
          };
          console.error(`❌ Context retrieval failed:`, retrievalError);
        }

      } catch (storageError) {
        result.steps.documentStorage = {
          success: false,
          duration: Date.now() - storageStart,
          error: storageError instanceof Error ? storageError.message : 'Unknown storage error'
        };
        console.error(`❌ Document storage failed:`, storageError);
      }

    } catch (parseError) {
      result.steps.pdfParsing = {
        success: false,
        duration: Date.now() - parseStart,
        error: parseError instanceof Error ? parseError.message : 'Unknown parsing error'
      };
      console.error(`❌ PDF parsing failed:`, parseError);
    }

    // Calculate overall success
    const allStepsSuccessful = Object.values(result.steps).every(step => step.success);
    result.success = allStepsSuccessful;
    result.totalDuration = Date.now() - startTime;

    if (result.success) {
      console.log(`🎉 MVP Flow completed successfully in ${result.totalDuration}ms`);
    } else {
      console.log(`❌ MVP Flow completed with errors in ${result.totalDuration}ms`);
    }

    return result;

  } catch (error) {
    result.overallError = error instanceof Error ? error.message : 'Unknown error';
    result.totalDuration = Date.now() - startTime;
    console.error(`💥 MVP Flow failed:`, error);
    return result;
  }
}

/**
 * Generate a comprehensive test report
 */
export function generateTestReport(result: MVPTestResult): string {
  const report = `
# MVP Demo Flow Test Report

## Overall Result: ${result.success ? '✅ SUCCESS' : '❌ FAILURE'}
**Total Duration:** ${result.totalDuration}ms

## Step-by-Step Results

### 1. PDF Parsing
- **Status:** ${result.steps.pdfParsing.success ? '✅ Success' : '❌ Failed'}
- **Duration:** ${result.steps.pdfParsing.duration}ms
- **Chunks Created:** ${result.steps.pdfParsing.chunksCreated || 'N/A'}
${result.steps.pdfParsing.error ? `- **Error:** ${result.steps.pdfParsing.error}` : ''}

### 2. Document Storage
- **Status:** ${result.steps.documentStorage.success ? '✅ Success' : '❌ Failed'}
- **Duration:** ${result.steps.documentStorage.duration}ms
- **Document ID:** ${result.steps.documentStorage.documentId || 'N/A'}
${result.steps.documentStorage.error ? `- **Error:** ${result.steps.documentStorage.error}` : ''}

### 3. Context Retrieval
- **Status:** ${result.steps.contextRetrieval.success ? '✅ Success' : '❌ Failed'}
- **Duration:** ${result.steps.contextRetrieval.duration}ms
- **Relevant Chunks:** ${result.steps.contextRetrieval.relevantChunks || 'N/A'}
${result.steps.contextRetrieval.error ? `- **Error:** ${result.steps.contextRetrieval.error}` : ''}

### 4. AI Analysis
- **Status:** ${result.steps.aiAnalysis.success ? '✅ Success' : '❌ Failed'}
- **Duration:** ${result.steps.aiAnalysis.duration}ms
- **Tokens Used:** ${result.steps.aiAnalysis.tokens || 'N/A'}
- **Response Preview:** ${result.steps.aiAnalysis.response || 'N/A'}
${result.steps.aiAnalysis.error ? `- **Error:** ${result.steps.aiAnalysis.error}` : ''}

### 5. Function Calling
- **Status:** ${result.steps.functionCalling.success ? '✅ Success' : '❌ Failed'}
- **Duration:** ${result.steps.functionCalling.duration}ms
- **Function Results:** ${result.steps.functionCalling.functionResults ? 'Available' : 'None'}
${result.steps.functionCalling.error ? `- **Error:** ${result.steps.functionCalling.error}` : ''}

## Performance Metrics
- **PDF Processing Rate:** ${result.steps.pdfParsing.chunksCreated && result.steps.pdfParsing.duration ? 
    Math.round((result.steps.pdfParsing.chunksCreated / result.steps.pdfParsing.duration) * 1000) : 'N/A'} chunks/second
- **End-to-End Latency:** ${result.totalDuration}ms
- **AI Response Time:** ${result.steps.aiAnalysis.duration}ms

## Recommendations
${result.success ? 
  '🎉 All systems working correctly! Ready for user testing.' : 
  '⚠️ Issues detected. Review failed steps before user testing.'}

${result.overallError ? `## Critical Error\n${result.overallError}` : ''}
`;

  return report;
}

/**
 * Quick health check for all MVP components
 */
export async function quickHealthCheck(): Promise<{
  pdfParser: boolean;
  openaiService: boolean;
  database: boolean;
  overall: boolean;
}> {
  const checks = {
    pdfParser: false,
    openaiService: false,
    database: false,
    overall: false
  };

  try {
    // Test PDF parser with minimal buffer
    const testBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000079 00000 n \n0000000173 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n237\n%%EOF');
    await enhancedPDFParser.parseBuffer(testBuffer);
    checks.pdfParser = true;
  } catch (error) {
    console.warn('PDF parser health check failed:', error);
  }

  try {
    // Test OpenAI service with minimal request
    await openAIService.createChatCompletion({
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'gpt-4o-mini',
      maxTokens: 5
    });
    checks.openaiService = true;
  } catch (error) {
    console.warn('OpenAI service health check failed:', error);
  }

  try {
    // Test database connection
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { error } = await supabase.from('users').select('count').limit(1);
    if (!error) {
      checks.database = true;
    }
  } catch (error) {
    console.warn('Database health check failed:', error);
  }

  checks.overall = checks.pdfParser && checks.openaiService && checks.database;
  return checks;
}
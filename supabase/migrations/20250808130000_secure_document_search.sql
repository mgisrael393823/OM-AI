-- Fix critical security vulnerability in document search function
-- This migration replaces the insecure function that allowed RLS bypass

-- Drop the old insecure function
DROP FUNCTION IF EXISTS search_document_chunks(UUID, UUID[], TEXT, INTEGER);

-- Create a secure version that uses auth.uid() instead of accepting user_id parameter
CREATE OR REPLACE FUNCTION search_document_chunks(
  p_document_ids UUID[],
  p_query TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  content TEXT,
  page_number INTEGER,
  chunk_type TEXT,
  documents JSONB
)
LANGUAGE plpgsql
SECURITY INVOKER -- Changed from DEFINER to INVOKER to respect RLS
AS $$
DECLARE
  v_expanded_query TEXT;
  v_user_id UUID;
BEGIN
  -- Get the current authenticated user's ID
  v_user_id := auth.uid();
  
  -- Ensure user is authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;
  
  -- Expand query to include financial terms when relevant
  v_expanded_query := p_query;
  
  -- If query mentions metrics, data, or key points, add financial keywords
  IF lower(p_query) ~ 'metric|data|key|point|financial|summary' THEN
    v_expanded_query := p_query || ' price noi cap rate irr return cash flow revenue income expense acquisition';
  END IF;
  
  RETURN QUERY
  SELECT 
    dc.content,
    dc.page_number,
    dc.chunk_type,
    jsonb_build_object('original_filename', d.original_filename) as documents
  FROM document_chunks dc
  INNER JOIN documents d ON d.id = dc.document_id
  WHERE 
    dc.user_id = v_user_id -- Use auth.uid() instead of parameter
    AND dc.document_id = ANY(p_document_ids)
    AND (
      to_tsvector('english', dc.content) @@ plainto_tsquery('english', v_expanded_query)
      OR dc.content ~* 'asking price|purchase price|acquisition|noi|net operating income|cap rate|capitalization rate|irr|internal rate|cash flow|pro forma|rent roll|square feet|sf|units|occupancy|gross income|effective income|operating expense|debt service|equity multiple|cash on cash|levered|unlevered|yield'
    )
  ORDER BY 
    CASE 
      WHEN dc.content ~* 'financial summary|executive summary|investment summary|key metrics' THEN 0
      ELSE 1
    END,
    ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', v_expanded_query)) DESC,
    dc.page_number
  LIMIT p_limit;
  
  -- If no results found with text search, return chunks prioritizing financial pages
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      dc.content,
      dc.page_number,
      dc.chunk_type,
      jsonb_build_object('original_filename', d.original_filename) as documents
    FROM document_chunks dc
    INNER JOIN documents d ON d.id = dc.document_id
    WHERE 
      dc.user_id = v_user_id -- Use auth.uid() instead of parameter
      AND dc.document_id = ANY(p_document_ids)
    ORDER BY 
      CASE 
        WHEN dc.content ~* 'price|noi|cap rate|return|revenue|income|expense|square feet|units' THEN 0
        ELSE 1
      END,
      dc.page_number
    LIMIT p_limit;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION search_document_chunks(UUID[], TEXT, INTEGER) TO authenticated;

-- Add comment explaining the security fix
COMMENT ON FUNCTION search_document_chunks(UUID[], TEXT, INTEGER) IS 
'Secure document search function that only returns chunks owned by the authenticated user. 
Fixed critical security vulnerability where users could access other users documents by passing arbitrary user_id.';
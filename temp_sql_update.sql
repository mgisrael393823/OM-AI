-- Create a function for safe document chunk searching with broader financial term matching
CREATE OR REPLACE FUNCTION search_document_chunks(
  p_user_id UUID,
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
SECURITY DEFINER
AS $$
DECLARE
  v_expanded_query TEXT;
BEGIN
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
    dc.user_id = p_user_id
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
      dc.user_id = p_user_id
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
GRANT EXECUTE ON FUNCTION search_document_chunks(UUID, UUID[], TEXT, INTEGER) TO authenticated;
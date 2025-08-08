-- Create processing jobs table for async PDF processing
CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL DEFAULT 'pdf_processing',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Add constraint to prevent duplicate jobs
  UNIQUE(document_id, job_type)
);

-- Create index for job processing
CREATE INDEX idx_processing_jobs_status_created ON processing_jobs(status, created_at);
CREATE INDEX idx_processing_jobs_document_id ON processing_jobs(document_id);

-- Add RLS policies
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own jobs
CREATE POLICY "Users can view own jobs" ON processing_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can manage jobs
CREATE POLICY "Service role manages jobs" ON processing_jobs
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Function to enqueue a processing job
CREATE OR REPLACE FUNCTION enqueue_processing_job(
  p_document_id UUID,
  p_user_id UUID,
  p_job_type TEXT DEFAULT 'pdf_processing'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  INSERT INTO processing_jobs (document_id, user_id, job_type)
  VALUES (p_document_id, p_user_id, p_job_type)
  ON CONFLICT (document_id, job_type) 
  DO UPDATE SET 
    status = 'pending',
    attempts = 0,
    error_message = NULL,
    created_at = NOW()
  RETURNING id INTO v_job_id;
  
  RETURN v_job_id;
END;
$$;

-- Function to get next pending job
CREATE OR REPLACE FUNCTION get_next_pending_job()
RETURNS TABLE (
  id UUID,
  document_id UUID,
  user_id UUID,
  job_type TEXT,
  attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Get and lock the next pending job
  UPDATE processing_jobs
  SET 
    status = 'running',
    started_at = NOW(),
    attempts = attempts + 1
  WHERE processing_jobs.id = (
    SELECT processing_jobs.id
    FROM processing_jobs
    WHERE status = 'pending' 
      AND attempts < max_attempts
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING processing_jobs.id, processing_jobs.document_id, processing_jobs.user_id, processing_jobs.job_type, processing_jobs.attempts
  INTO id, document_id, user_id, job_type, attempts;
  
  IF FOUND THEN
    RETURN NEXT;
  END IF;
END;
$$;

-- Function to mark job as completed
CREATE OR REPLACE FUNCTION complete_processing_job(
  p_job_id UUID,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE processing_jobs
  SET 
    status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    completed_at = NOW(),
    error_message = p_error_message
  WHERE id = p_job_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION enqueue_processing_job(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_pending_job() TO authenticated;
GRANT EXECUTE ON FUNCTION complete_processing_job(UUID, BOOLEAN, TEXT) TO authenticated;

COMMENT ON TABLE processing_jobs IS 'Job queue for async background processing of documents';
COMMENT ON FUNCTION enqueue_processing_job(UUID, UUID, TEXT) IS 'Enqueues a new processing job for a document';
COMMENT ON FUNCTION get_next_pending_job() IS 'Gets the next pending job and marks it as running';
COMMENT ON FUNCTION complete_processing_job(UUID, BOOLEAN, TEXT) IS 'Marks a job as completed or failed';
-- Rate limiting tables and functions
-- Drop existing objects if they exist
DROP TABLE IF EXISTS user_rate_limits CASCADE;
DROP FUNCTION IF EXISTS check_rate_limit(TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS record_api_usage(TEXT, TEXT);

-- Create rate limiting table
CREATE TABLE user_rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL, -- e.g., 'chat', 'upload', 'search'
  requests_count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, endpoint)
);

-- RLS policies
ALTER TABLE user_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rate limits"
  ON user_rate_limits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage rate limits"
  ON user_rate_limits FOR ALL
  USING (auth.role() = 'service_role');

-- Indexes for performance
CREATE INDEX idx_user_rate_limits_user_endpoint ON user_rate_limits(user_id, endpoint);
CREATE INDEX idx_user_rate_limits_window_start ON user_rate_limits(window_start);

-- Function to check and enforce rate limits
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_endpoint TEXT,
  p_max_requests INTEGER DEFAULT 100,
  p_window_minutes INTEGER DEFAULT 60
) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_current_time TIMESTAMPTZ := NOW();
  v_window_start TIMESTAMPTZ;
  v_requests_count INTEGER;
  v_reset_time TIMESTAMPTZ;
  v_remaining INTEGER;
BEGIN
  -- Check if user is authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Authentication required'
    );
  END IF;

  -- Calculate window start time
  v_window_start := v_current_time - (p_window_minutes * INTERVAL '1 minute');

  -- Get or create rate limit record
  INSERT INTO user_rate_limits (user_id, endpoint, requests_count, window_start)
  VALUES (v_user_id, p_endpoint, 1, v_current_time)
  ON CONFLICT (user_id, endpoint) 
  DO UPDATE SET
    requests_count = CASE 
      WHEN user_rate_limits.window_start < v_window_start THEN 1
      ELSE user_rate_limits.requests_count + 1
    END,
    window_start = CASE
      WHEN user_rate_limits.window_start < v_window_start THEN v_current_time
      ELSE user_rate_limits.window_start
    END,
    updated_at = v_current_time
  RETURNING requests_count, window_start INTO v_requests_count, v_reset_time;

  -- Calculate remaining requests
  v_remaining := GREATEST(0, p_max_requests - v_requests_count);

  -- Check if rate limit exceeded
  IF v_requests_count > p_max_requests THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Rate limit exceeded',
      'limit', p_max_requests,
      'remaining', 0,
      'reset_time', EXTRACT(EPOCH FROM (v_reset_time + (p_window_minutes * INTERVAL '1 minute'))),
      'window_minutes', p_window_minutes
    );
  END IF;

  -- Return success with rate limit info
  RETURN jsonb_build_object(
    'allowed', true,
    'limit', p_max_requests,
    'remaining', v_remaining,
    'reset_time', EXTRACT(EPOCH FROM (v_reset_time + (p_window_minutes * INTERVAL '1 minute'))),
    'window_minutes', p_window_minutes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record API usage (for monitoring)
CREATE OR REPLACE FUNCTION record_api_usage(
  p_endpoint TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  -- Only record if user is authenticated
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Insert usage record (you can create an api_usage table if needed)
  -- For MVP, we'll just ensure rate limit record exists
  INSERT INTO user_rate_limits (user_id, endpoint, requests_count, window_start)
  VALUES (v_user_id, p_endpoint, 0, NOW())
  ON CONFLICT (user_id, endpoint) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup function to remove old rate limit records
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits() RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete records older than 24 hours
  DELETE FROM user_rate_limits 
  WHERE window_start < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON user_rate_limits TO anon, authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_api_usage(TEXT, JSONB) TO anon, authenticated;
-- Create table to track OpenAI usage and costs per user
CREATE TABLE IF NOT EXISTS openai_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost DECIMAL(10, 4) NOT NULL DEFAULT 0,
  requests_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Create composite unique constraint for daily tracking
  UNIQUE(user_id, date, model)
);

-- Create index for fast lookups
CREATE INDEX idx_openai_usage_user_date ON openai_usage(user_id, date DESC);
CREATE INDEX idx_openai_usage_date ON openai_usage(date);

-- Add RLS policies
ALTER TABLE openai_usage ENABLE ROW LEVEL SECURITY;

-- Users can only read their own usage
CREATE POLICY "Users can view own usage" ON openai_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert/update usage
CREATE POLICY "Service role manages usage" ON openai_usage
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Create function to track usage (will be called from API)
CREATE OR REPLACE FUNCTION track_openai_usage(
  p_user_id UUID,
  p_model TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_estimated_cost DECIMAL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert or update daily usage
  INSERT INTO openai_usage (
    user_id,
    date,
    model,
    input_tokens,
    output_tokens,
    total_tokens,
    estimated_cost,
    requests_count
  ) VALUES (
    p_user_id,
    CURRENT_DATE,
    p_model,
    p_input_tokens,
    p_output_tokens,
    p_input_tokens + p_output_tokens,
    p_estimated_cost,
    1
  )
  ON CONFLICT (user_id, date, model)
  DO UPDATE SET
    input_tokens = openai_usage.input_tokens + p_input_tokens,
    output_tokens = openai_usage.output_tokens + p_output_tokens,
    total_tokens = openai_usage.total_tokens + p_input_tokens + p_output_tokens,
    estimated_cost = openai_usage.estimated_cost + p_estimated_cost,
    requests_count = openai_usage.requests_count + 1;
END;
$$;

-- Create function to check daily limits
CREATE OR REPLACE FUNCTION check_openai_limits(
  p_user_id UUID
)
RETURNS TABLE (
  daily_tokens INTEGER,
  daily_cost DECIMAL,
  is_within_limits BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_daily_tokens INTEGER;
  v_daily_cost DECIMAL;
  v_max_daily_tokens INTEGER := 50000;
  v_max_daily_cost DECIMAL := 10.00;
BEGIN
  -- Get today's usage
  SELECT 
    COALESCE(SUM(total_tokens), 0),
    COALESCE(SUM(estimated_cost), 0)
  INTO v_daily_tokens, v_daily_cost
  FROM openai_usage
  WHERE user_id = p_user_id
    AND date = CURRENT_DATE;
  
  RETURN QUERY
  SELECT 
    v_daily_tokens,
    v_daily_cost,
    (v_daily_tokens < v_max_daily_tokens AND v_daily_cost < v_max_daily_cost);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION track_openai_usage(UUID, TEXT, INTEGER, INTEGER, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION check_openai_limits(UUID) TO authenticated;

-- Add comment explaining the limits
COMMENT ON FUNCTION check_openai_limits(UUID) IS 
'Checks if user is within daily OpenAI usage limits. 
Default limits: 50,000 tokens per day, $10 cost per day.
These can be adjusted based on subscription tier.';
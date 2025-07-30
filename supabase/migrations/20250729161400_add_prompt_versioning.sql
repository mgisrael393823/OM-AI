-- Add Prompt Versioning System
-- This migration adds comprehensive prompt version tracking and message metadata

-- Create prompt_versions table for centralized prompt management
CREATE TABLE prompt_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_type VARCHAR(50) NOT NULL,
  version VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  changelog TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT false,
  UNIQUE(prompt_type, version)
);

-- Create indexes for efficient prompt lookups
CREATE INDEX idx_prompt_versions_type_version ON prompt_versions(prompt_type, version);
CREATE INDEX idx_prompt_versions_active ON prompt_versions(prompt_type, is_active) WHERE is_active = true;
CREATE INDEX idx_prompt_versions_created_at ON prompt_versions(created_at DESC);

-- Add prompt versioning columns to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(20);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS function_calls JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS token_usage JSONB;

-- Create indexes for message metadata queries
CREATE INDEX idx_messages_prompt_version ON messages(prompt_version);
CREATE INDEX idx_messages_function_calls ON messages USING GIN(function_calls) WHERE function_calls IS NOT NULL;
CREATE INDEX idx_messages_token_usage ON messages USING GIN(token_usage) WHERE token_usage IS NOT NULL;

-- Insert initial OM analyst prompt version
INSERT INTO prompt_versions (prompt_type, version, content, changelog, is_active)
VALUES (
  'om-analyst', 
  'v1.0.0', 
  'Elite OM Intel analyst system prompt with deterministic JSON output enforcement',
  'Initial production version with structured outputs and comprehensive schema validation',
  true
);

-- Create RLS policies for prompt_versions table
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read all prompt versions (for system functionality)
CREATE POLICY "prompt_versions_read_all" ON prompt_versions
  FOR SELECT USING (true);

-- Policy: Only authenticated users can insert new versions (admin functionality)
CREATE POLICY "prompt_versions_insert_authenticated" ON prompt_versions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Only the creator can update their prompt versions
CREATE POLICY "prompt_versions_update_creator" ON prompt_versions
  FOR UPDATE USING (created_by = auth.uid());

-- Add helpful comments
COMMENT ON TABLE prompt_versions IS 'Centralized storage for versioned AI prompts with change tracking';
COMMENT ON COLUMN prompt_versions.prompt_type IS 'Type of prompt (om-analyst, etc.)';
COMMENT ON COLUMN prompt_versions.version IS 'Semantic version (e.g., v1.0.0)';
COMMENT ON COLUMN prompt_versions.is_active IS 'Whether this version is currently active';
COMMENT ON COLUMN prompt_versions.changelog IS 'Description of changes from previous version';

COMMENT ON COLUMN messages.prompt_version IS 'Version of prompt used to generate this message';
COMMENT ON COLUMN messages.function_calls IS 'OpenAI function calls made during message generation';
COMMENT ON COLUMN messages.token_usage IS 'Token consumption data (input, output, total tokens)';

-- Create a view for active prompts (commonly used)
CREATE VIEW active_prompts AS
SELECT 
  prompt_type,
  version,
  content,
  created_at,
  created_by
FROM prompt_versions 
WHERE is_active = true;

COMMENT ON VIEW active_prompts IS 'Quick access to currently active prompt versions';

-- Create function to get the latest version of a prompt type
CREATE OR REPLACE FUNCTION get_latest_prompt_version(prompt_type_param TEXT)
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT version 
  FROM prompt_versions 
  WHERE prompt_type = prompt_type_param 
    AND is_active = true 
  LIMIT 1;
$$;

COMMENT ON FUNCTION get_latest_prompt_version IS 'Returns the active version for a given prompt type';

-- Create function to safely activate a new prompt version (deactivates others)
CREATE OR REPLACE FUNCTION activate_prompt_version(prompt_type_param TEXT, version_param TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Deactivate all versions of this prompt type
  UPDATE prompt_versions 
  SET is_active = false 
  WHERE prompt_type = prompt_type_param;
  
  -- Activate the specified version
  UPDATE prompt_versions 
  SET is_active = true 
  WHERE prompt_type = prompt_type_param 
    AND version = version_param;
  
  -- Return success if a row was updated
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION activate_prompt_version IS 'Safely switches active prompt version, deactivating others';

-- Add trigger to prevent multiple active versions of same prompt type
CREATE OR REPLACE FUNCTION check_single_active_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If trying to activate a version, deactivate others
  IF NEW.is_active = true THEN
    UPDATE prompt_versions 
    SET is_active = false 
    WHERE prompt_type = NEW.prompt_type 
      AND id != NEW.id 
      AND is_active = true;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_single_active_version
  BEFORE INSERT OR UPDATE ON prompt_versions
  FOR EACH ROW
  EXECUTE FUNCTION check_single_active_version();

COMMENT ON TRIGGER ensure_single_active_version ON prompt_versions IS 'Ensures only one version per prompt type can be active';

-- Create analytics view for prompt performance tracking
CREATE VIEW prompt_usage_analytics AS
SELECT 
  m.prompt_version,
  pv.prompt_type,
  COUNT(*) as message_count,
  AVG((m.token_usage->>'total_tokens')::INTEGER) as avg_tokens,
  COUNT(*) FILTER (WHERE m.function_calls IS NOT NULL) as function_call_count,
  DATE_TRUNC('day', m.created_at) as usage_date
FROM messages m
LEFT JOIN prompt_versions pv ON m.prompt_version = pv.version
WHERE m.prompt_version IS NOT NULL
  AND m.created_at >= NOW() - INTERVAL '30 days'
GROUP BY m.prompt_version, pv.prompt_type, DATE_TRUNC('day', m.created_at)
ORDER BY usage_date DESC, message_count DESC;

COMMENT ON VIEW prompt_usage_analytics IS 'Analytics view for tracking prompt performance and usage patterns';
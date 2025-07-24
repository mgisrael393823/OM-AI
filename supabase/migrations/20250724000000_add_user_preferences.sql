-- Add user preferences JSONB column
-- This migration is idempotent and can be run multiple times safely

DO $$ 
BEGIN
    -- Add preferences column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND table_schema = 'public'
        AND column_name = 'preferences'
    ) THEN
        ALTER TABLE public.users ADD COLUMN preferences JSONB DEFAULT '{}';
        
        -- Add index for efficient JSON queries
        CREATE INDEX IF NOT EXISTS idx_users_preferences_gin ON public.users USING GIN (preferences);
        
        -- Add comment for documentation
        COMMENT ON COLUMN public.users.preferences IS 'User preferences stored as JSON including AI settings, display options, and notifications';
    END IF;
END $$;

-- Example default preferences structure:
-- {
--   "ai": {
--     "preferredModel": "gpt-4-turbo-preview",
--     "temperature": 0.7,
--     "maxTokens": 4000
--   },
--   "display": {
--     "theme": "system",
--     "language": "en"
--   },
--   "notifications": {
--     "email": true,
--     "push": false
--   }
-- }
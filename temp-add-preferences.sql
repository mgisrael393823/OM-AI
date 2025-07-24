-- Add preferences column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND table_schema = 'public'
        AND column_name = 'preferences'
    ) THEN
        ALTER TABLE public.users ADD COLUMN preferences JSONB DEFAULT '{}';
        CREATE INDEX IF NOT EXISTS idx_users_preferences_gin ON public.users USING GIN (preferences);
    END IF;
END $$;
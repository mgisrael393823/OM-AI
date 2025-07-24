-- Rollback script for user preferences migration
-- This script safely removes the preferences column and associated indexes

DO $$ 
BEGIN
    -- Drop index if it exists
    DROP INDEX IF EXISTS public.idx_users_preferences_gin;
    
    -- Drop column if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND table_schema = 'public'
        AND column_name = 'preferences'
    ) THEN
        ALTER TABLE public.users DROP COLUMN preferences;
    END IF;
END $$;
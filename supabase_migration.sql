-- Migration: Add current_grid column to daily_progress table
-- This column stores the current board state (entered numbers) for daily sudoku puzzles

-- Step 1: Add the current_grid column as JSONB (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'daily_progress' 
        AND column_name = 'current_grid'
    ) THEN
        ALTER TABLE daily_progress 
        ADD COLUMN current_grid JSONB;
        
        COMMENT ON COLUMN daily_progress.current_grid IS 'Stores the current board state with entered numbers, initial cells, and notes';
    END IF;
END $$;

-- Step 2: Verify the column was added (optional check)
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'daily_progress' 
AND column_name = 'current_grid';


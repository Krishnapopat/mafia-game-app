-- Migration: Add phase column to game_actions table
-- Run this script on your production PostgreSQL database

-- Add the missing phase column to game_actions table
ALTER TABLE game_actions ADD COLUMN IF NOT EXISTS phase VARCHAR(20) NOT NULL DEFAULT 'night';

-- Update existing records to have a default phase
UPDATE game_actions SET phase = 'night' WHERE phase IS NULL;

-- Make the column NOT NULL (remove the default after updating)
ALTER TABLE game_actions ALTER COLUMN phase SET NOT NULL;

COMMIT;

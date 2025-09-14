-- Add support for private messages (like investigation results)
ALTER TABLE game_messages ADD COLUMN IF NOT EXISTS visible_to_player_id UUID REFERENCES players(id);

-- Update RLS policy for private messages
DROP POLICY IF EXISTS "Players can view messages in their games" ON game_messages;

CREATE POLICY "Players can view messages in their games" ON game_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM game_participants 
    WHERE game_participants.game_id = game_messages.game_id 
    AND game_participants.player_id = auth.uid()
  ) AND (
    is_visible_to_all = true OR 
    visible_to_player_id = auth.uid() OR
    player_id = auth.uid()
  )
);

-- Function to process night actions automatically
CREATE OR REPLACE FUNCTION process_night_actions(game_room_id UUID)
RETURNS void AS $$
DECLARE
  kill_target UUID;
  heal_target UUID;
  investigate_target UUID;
  investigate_player UUID;
  target_role TEXT;
  victim_name TEXT;
  investigator_name TEXT;
  target_name TEXT;
BEGIN
  -- Get night actions for current day
  SELECT target_id INTO kill_target 
  FROM game_actions 
  WHERE game_id = game_room_id 
    AND action_type = 'kill' 
    AND phase = 'night'
    AND day_number = (SELECT day_number FROM game_rooms WHERE id = game_room_id)
  LIMIT 1;

  SELECT target_id INTO heal_target 
  FROM game_actions 
  WHERE game_id = game_room_id 
    AND action_type = 'heal' 
    AND phase = 'night'
    AND day_number = (SELECT day_number FROM game_rooms WHERE id = game_room_id)
  LIMIT 1;

  SELECT target_id, player_id INTO investigate_target, investigate_player
  FROM game_actions 
  WHERE game_id = game_room_id 
    AND action_type = 'investigate' 
    AND phase = 'night'
    AND day_number = (SELECT day_number FROM game_rooms WHERE id = game_room_id)
  LIMIT 1;

  -- Process kill (if not healed)
  IF kill_target IS NOT NULL AND (heal_target IS NULL OR heal_target != kill_target) THEN
    UPDATE game_participants 
    SET is_alive = false 
    WHERE game_id = game_room_id AND player_id = kill_target;

    SELECT username INTO victim_name 
    FROM players 
    WHERE id = kill_target;

    INSERT INTO game_messages (game_id, message, message_type)
    VALUES (game_room_id, victim_name || ' was eliminated during the night.', 'death');
  END IF;

  -- Process investigation
  IF investigate_target IS NOT NULL AND investigate_player IS NOT NULL THEN
    SELECT role INTO target_role 
    FROM game_participants 
    WHERE game_id = game_room_id AND player_id = investigate_target;

    SELECT username INTO investigator_name 
    FROM players 
    WHERE id = investigate_player;

    SELECT username INTO target_name 
    FROM players 
    WHERE id = investigate_target;

    INSERT INTO game_messages (game_id, player_id, message, message_type, visible_to_player_id, is_visible_to_all)
    VALUES (
      game_room_id, 
      investigate_player,
      'Investigation result: ' || target_name || ' is a ' || target_role || '.', 
      'system',
      investigate_player,
      false
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

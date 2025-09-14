-- Function to check win conditions
CREATE OR REPLACE FUNCTION check_win_condition(game_room_id UUID)
RETURNS TEXT AS $$
DECLARE
  mafia_count INTEGER;
  villager_count INTEGER;
  total_alive INTEGER;
  jester_eliminated BOOLEAN := false;
  jester_player_id UUID;
BEGIN
  -- Count alive players by faction
  SELECT COUNT(*) INTO mafia_count
  FROM game_participants 
  WHERE game_id = game_room_id 
    AND is_alive = true 
    AND role = 'mafia';

  SELECT COUNT(*) INTO villager_count
  FROM game_participants 
  WHERE game_id = game_room_id 
    AND is_alive = true 
    AND role IN ('villager', 'doctor', 'detective');

  SELECT COUNT(*) INTO total_alive
  FROM game_participants 
  WHERE game_id = game_room_id 
    AND is_alive = true;

  -- Check if jester was eliminated (jester wins if voted out during day phase)
  SELECT player_id INTO jester_player_id
  FROM game_participants 
  WHERE game_id = game_room_id 
    AND role = 'jester' 
    AND is_alive = false;

  IF jester_player_id IS NOT NULL THEN
    -- Check if jester was eliminated by vote (not by mafia kill)
    IF EXISTS (
      SELECT 1 FROM game_actions 
      WHERE game_id = game_room_id 
        AND action_type = 'vote' 
        AND target_id = jester_player_id
    ) THEN
      RETURN 'jester';
    END IF;
  END IF;

  -- Mafia wins if they equal or outnumber villagers
  IF mafia_count >= villager_count THEN
    RETURN 'mafia';
  END IF;

  -- Villagers win if all mafia are eliminated
  IF mafia_count = 0 THEN
    RETURN 'villagers';
  END IF;

  -- Game continues
  RETURN 'ongoing';
END;
$$ LANGUAGE plpgsql;

-- Function to end game and update player stats
CREATE OR REPLACE FUNCTION end_game(game_room_id UUID, winner TEXT)
RETURNS void AS $$
DECLARE
  participant RECORD;
  is_winner BOOLEAN;
BEGIN
  -- Update game room status
  UPDATE game_rooms 
  SET status = 'finished', winner = winner
  WHERE id = game_room_id;

  -- Update player statistics
  FOR participant IN 
    SELECT gp.player_id, gp.role, p.games_played, p.games_won
    FROM game_participants gp
    JOIN players p ON gp.player_id = p.id
    WHERE gp.game_id = game_room_id
  LOOP
    -- Determine if this player won
    is_winner := false;
    
    IF winner = 'mafia' AND participant.role = 'mafia' THEN
      is_winner := true;
    ELSIF winner = 'villagers' AND participant.role IN ('villager', 'doctor', 'detective') THEN
      is_winner := true;
    ELSIF winner = 'jester' AND participant.role = 'jester' THEN
      is_winner := true;
    END IF;

    -- Update player stats
    UPDATE players 
    SET 
      games_played = games_played + 1,
      games_won = games_won + (CASE WHEN is_winner THEN 1 ELSE 0 END)
    WHERE id = participant.player_id;
  END LOOP;

  -- Add game end message
  INSERT INTO game_messages (game_id, message, message_type)
  VALUES (
    game_room_id, 
    'Game Over! ' || 
    CASE 
      WHEN winner = 'mafia' THEN 'The Mafia has taken control of the town!'
      WHEN winner = 'villagers' THEN 'The Villagers have eliminated all threats!'
      WHEN winner = 'jester' THEN 'The Jester has achieved chaos by being eliminated!'
      ELSE 'The game has ended.'
    END,
    'system'
  );
END;
$$ LANGUAGE plpgsql;

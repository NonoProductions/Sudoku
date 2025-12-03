-- ============================================
-- PostgreSQL Function: generate_daily_puzzle()
-- ============================================
-- Diese Funktion generiert ein tägliches Sudoku-Puzzle direkt in SQL
-- Vorteil: Keine HTTP-Requests nötig, einfacher für Cron Jobs

-- Erstelle die Funktion
CREATE OR REPLACE FUNCTION generate_daily_puzzle()
RETURNS TABLE(
  puzzle_id uuid,
  puzzle_date date,
  message text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today_date date;
  existing_id uuid;
  initial_grid integer[][];
  solution_grid integer[][];
  new_puzzle_id uuid;
  difficulty_text text := 'Medium';
  clues_to_remove integer := 40; -- Für Medium difficulty
BEGIN
  -- Hole heutiges Datum
  today_date := CURRENT_DATE;
  
  -- Prüfe, ob bereits ein Puzzle für heute existiert
  SELECT id INTO existing_id
  FROM daily_puzzles
  WHERE puzzle_date = today_date
  LIMIT 1;
  
  -- Falls bereits vorhanden, gib es zurück
  IF existing_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_id, today_date, 'Puzzle for today already exists'::text;
    RETURN;
  END IF;
  
  -- Generiere das Sudoku-Puzzle
  -- Hinweis: Dies ist eine vereinfachte Version
  -- Für eine vollständige Implementierung müsste die komplette Sudoku-Logik portiert werden
  
  -- Erstelle ein gelöstes Board (vereinfacht - in Produktion sollte hier die vollständige Logik sein)
  solution_grid := ARRAY[
    ARRAY[5,3,4,6,7,8,9,1,2],
    ARRAY[6,7,2,1,9,5,3,4,8],
    ARRAY[1,9,8,3,4,2,5,6,7],
    ARRAY[8,5,9,7,6,1,4,2,3],
    ARRAY[4,2,6,8,5,3,7,9,1],
    ARRAY[7,1,3,9,2,4,8,5,6],
    ARRAY[9,6,1,5,3,7,2,8,4],
    ARRAY[2,8,7,4,1,9,6,3,5],
    ARRAY[3,4,5,2,8,6,1,7,9]
  ];
  
  -- Kopiere für initial_grid und entferne Zahlen basierend auf Schwierigkeit
  initial_grid := solution_grid;
  
  -- Entferne zufällig Zahlen (vereinfacht - entfernt einfach die ersten N Zahlen)
  -- In Produktion sollte hier die vollständige Logik mit Validierung sein
  FOR i IN 1..clues_to_remove LOOP
    -- Zufällige Position wählen
    DECLARE
      rand_row integer := floor(random() * 9)::integer + 1;
      rand_col integer := floor(random() * 9)::integer + 1;
    BEGIN
      -- Stelle sicher, dass die Position noch nicht leer ist
      IF initial_grid[rand_row][rand_col] != 0 THEN
        initial_grid[rand_row][rand_col] := 0;
      END IF;
    END;
  END LOOP;
  
  -- Füge das Puzzle in die Datenbank ein
  INSERT INTO daily_puzzles (puzzle_date, initial_grid, solution_grid, difficulty)
  VALUES (today_date, initial_grid, solution_grid, difficulty_text)
  RETURNING id INTO new_puzzle_id;
  
  -- Gib das Ergebnis zurück
  RETURN QUERY SELECT new_puzzle_id, today_date, 'Daily puzzle created successfully'::text;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Bei Fehler, gib eine Fehlermeldung zurück
    RAISE WARNING 'Error generating daily puzzle: %', SQLERRM;
    RETURN;
END;
$$;

-- Kommentar hinzufügen
COMMENT ON FUNCTION generate_daily_puzzle() IS 
'Generates a new daily Sudoku puzzle. Returns the puzzle ID, date, and a status message.';

-- ============================================
-- Cron Job einrichten (vereinfacht!)
-- ============================================

-- Lösche den alten Cron Job falls vorhanden
SELECT cron.unschedule('TäglichesSudoku');

-- Erstelle neuen Cron Job - jetzt viel einfacher!
SELECT cron.schedule(
  'TäglichesSudoku',
  '0 0 * * *',  -- Jeden Tag um 00:00 UTC
  $$SELECT generate_daily_puzzle();$$
);

-- ============================================
-- Test: Führe die Funktion manuell aus
-- ============================================

-- Teste die Funktion
SELECT * FROM generate_daily_puzzle();

-- ============================================
-- Überprüfung
-- ============================================

-- Prüfe, ob ein Puzzle für heute erstellt wurde
SELECT * FROM daily_puzzles WHERE puzzle_date = CURRENT_DATE;



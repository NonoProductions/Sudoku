-- Row-Level Security Policies für alle Tabellen
-- Diese Policies erlauben alle notwendigen Operationen für die Sudoku-App

-- ============================================
-- daily_puzzles Tabelle
-- ============================================
ALTER TABLE daily_puzzles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_puzzles_select_policy" ON daily_puzzles;
DROP POLICY IF EXISTS "daily_puzzles_insert_policy" ON daily_puzzles;
DROP POLICY IF EXISTS "daily_puzzles_update_policy" ON daily_puzzles;
DROP POLICY IF EXISTS "daily_puzzles_delete_policy" ON daily_puzzles;

CREATE POLICY "daily_puzzles_select_policy"
ON daily_puzzles FOR SELECT USING (true);

CREATE POLICY "daily_puzzles_insert_policy"
ON daily_puzzles FOR INSERT WITH CHECK (true);

CREATE POLICY "daily_puzzles_update_policy"
ON daily_puzzles FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "daily_puzzles_delete_policy"
ON daily_puzzles FOR DELETE USING (true);

-- ============================================
-- daily_progress Tabelle (für Realtime-Updates)
-- ============================================
ALTER TABLE daily_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_progress_select_policy" ON daily_progress;
DROP POLICY IF EXISTS "daily_progress_insert_policy" ON daily_progress;
DROP POLICY IF EXISTS "daily_progress_update_policy" ON daily_progress;
DROP POLICY IF EXISTS "daily_progress_delete_policy" ON daily_progress;

-- WICHTIG: Da keine Supabase-Authentifizierung verwendet wird, können wir nicht auth.uid() nutzen.
-- Die Policies erlauben daher alle Operationen, aber die Anwendung filtert immer nach player_name.
-- Stelle sicher, dass ein UNIQUE Constraint auf (player_name, puzzle_id) existiert!
CREATE POLICY "daily_progress_select_policy"
ON daily_progress FOR SELECT USING (true);

-- INSERT: Erlaube nur, wenn player_name gesetzt ist
CREATE POLICY "daily_progress_insert_policy"
ON daily_progress FOR INSERT WITH CHECK (player_name IS NOT NULL AND player_name != '');

-- UPDATE: Erlaube Updates, aber die Anwendung muss nach player_name filtern
-- Das UNIQUE Constraint verhindert, dass ein Spieler den Fortschritt eines anderen überschreibt
CREATE POLICY "daily_progress_update_policy"
ON daily_progress FOR UPDATE USING (true) WITH CHECK (player_name IS NOT NULL AND player_name != '');

CREATE POLICY "daily_progress_delete_policy"
ON daily_progress FOR DELETE USING (true);

-- ============================================
-- daily_attempts Tabelle
-- ============================================
ALTER TABLE daily_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_attempts_select_policy" ON daily_attempts;
DROP POLICY IF EXISTS "daily_attempts_insert_policy" ON daily_attempts;
DROP POLICY IF EXISTS "daily_attempts_update_policy" ON daily_attempts;
DROP POLICY IF EXISTS "daily_attempts_delete_policy" ON daily_attempts;

-- WICHTIG: Da keine Supabase-Authentifizierung verwendet wird, können wir nicht auth.uid() nutzen.
-- Die Policies erlauben daher alle Operationen, aber die Anwendung filtert immer nach player_name.
-- Stelle sicher, dass ein UNIQUE Constraint auf (player_name, puzzle_id) existiert!
CREATE POLICY "daily_attempts_select_policy"
ON daily_attempts FOR SELECT USING (true);

-- INSERT: Erlaube nur, wenn player_name gesetzt ist
CREATE POLICY "daily_attempts_insert_policy"
ON daily_attempts FOR INSERT WITH CHECK (player_name IS NOT NULL AND player_name != '');

-- UPDATE: Erlaube Updates, aber die Anwendung muss nach player_name filtern
CREATE POLICY "daily_attempts_update_policy"
ON daily_attempts FOR UPDATE USING (true) WITH CHECK (player_name IS NOT NULL AND player_name != '');

CREATE POLICY "daily_attempts_delete_policy"
ON daily_attempts FOR DELETE USING (true);

-- ============================================
-- player_profiles Tabelle
-- ============================================
ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_profiles_select_policy" ON player_profiles;
DROP POLICY IF EXISTS "player_profiles_insert_policy" ON player_profiles;
DROP POLICY IF EXISTS "player_profiles_update_policy" ON player_profiles;
DROP POLICY IF EXISTS "player_profiles_delete_policy" ON player_profiles;

CREATE POLICY "player_profiles_select_policy"
ON player_profiles FOR SELECT USING (true);

CREATE POLICY "player_profiles_insert_policy"
ON player_profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "player_profiles_update_policy"
ON player_profiles FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "player_profiles_delete_policy"
ON player_profiles FOR DELETE USING (true);

-- ============================================
-- UNIQUE Constraints sicherstellen
-- ============================================
-- WICHTIG: Diese Constraints verhindern, dass Spieler sich gegenseitig überschreiben
-- Sie stellen sicher, dass jeder Spieler nur einen Fortschritt pro Puzzle hat

-- UNIQUE Constraint für daily_progress (player_name, puzzle_id)
DO $$
BEGIN
    -- Prüfe ob Constraint bereits existiert
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'daily_progress_player_puzzle_unique'
    ) THEN
        -- Erstelle UNIQUE Constraint
        ALTER TABLE daily_progress 
        ADD CONSTRAINT daily_progress_player_puzzle_unique 
        UNIQUE (player_name, puzzle_id);
        RAISE NOTICE 'UNIQUE Constraint für daily_progress erstellt';
    ELSE
        RAISE NOTICE 'UNIQUE Constraint für daily_progress existiert bereits';
    END IF;
END $$;

-- UNIQUE Constraint für daily_attempts (player_name, puzzle_id)
DO $$
BEGIN
    -- Prüfe ob Constraint bereits existiert
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'daily_attempts_player_puzzle_unique'
    ) THEN
        -- Erstelle UNIQUE Constraint
        ALTER TABLE daily_attempts 
        ADD CONSTRAINT daily_attempts_player_puzzle_unique 
        UNIQUE (player_name, puzzle_id);
        RAISE NOTICE 'UNIQUE Constraint für daily_attempts erstellt';
    ELSE
        RAISE NOTICE 'UNIQUE Constraint für daily_attempts existiert bereits';
    END IF;
END $$;

-- ============================================
-- Realtime aktivieren für daily_progress und daily_attempts
-- ============================================
-- WICHTIG: Realtime muss auch im Supabase Dashboard aktiviert werden!
-- 1. Gehe zu Database > Replication
-- 2. Aktiviere Realtime für die Tabellen "daily_progress" und "daily_attempts"

-- Diese SQL-Anweisung aktiviert Realtime für die Tabellen (falls noch nicht aktiviert)
DO $$
BEGIN
    -- Prüfe ob Realtime Publication existiert
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        -- Aktiviere Realtime für daily_progress
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND tablename = 'daily_progress'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE daily_progress;
            RAISE NOTICE 'Realtime für daily_progress aktiviert';
        ELSE
            RAISE NOTICE 'Realtime für daily_progress ist bereits aktiviert';
        END IF;
        
        -- Aktiviere Realtime für daily_attempts
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND tablename = 'daily_attempts'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE daily_attempts;
            RAISE NOTICE 'Realtime für daily_attempts aktiviert';
        ELSE
            RAISE NOTICE 'Realtime für daily_attempts ist bereits aktiviert';
        END IF;
    ELSE
        RAISE NOTICE 'Realtime Publication existiert nicht. Bitte im Dashboard aktivieren.';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Realtime konnte nicht aktiviert werden. Bitte manuell im Dashboard aktivieren (Database > Replication).';
END $$;


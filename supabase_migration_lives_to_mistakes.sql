-- ============================================
-- Migration: Leben zu Fehler (Lives to Mistakes)
-- ============================================
-- Diese Migration entfernt das Leben-System und ersetzt es durch
-- ein unbegrenztes Fehler-System
-- 
-- WICHTIG: Führe diese Migration in Supabase SQL Editor aus
-- ============================================

-- ============================================
-- 1. Prüfe ob die Spalte 'mistakes' bereits existiert
-- ============================================
DO $$ 
BEGIN
    -- Prüfe ob die Spalte bereits existiert
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'daily_progress' 
        AND column_name = 'mistakes'
    ) THEN
        -- Füge die Spalte hinzu
        ALTER TABLE daily_progress 
        ADD COLUMN mistakes INTEGER DEFAULT 0;
        
        COMMENT ON COLUMN daily_progress.mistakes IS 'Anzahl der Fehler (unbegrenzt)';
        
        RAISE NOTICE 'Spalte mistakes wurde zur Tabelle daily_progress hinzugefügt';
    ELSE
        RAISE NOTICE 'Spalte mistakes existiert bereits in daily_progress';
    END IF;
END $$;

-- ============================================
-- 2. Migriere vorhandene Daten (falls vorhanden)
-- ============================================
-- Konvertiere lives_remaining zu mistakes
-- Da wir von Leben zu Fehlern wechseln, setzen wir mistakes auf 0
-- (da wir keine historischen Fehler-Daten haben)
UPDATE daily_progress
SET mistakes = 0
WHERE mistakes IS NULL;

-- ============================================
-- 3. Entferne die Spalte 'lives_remaining' (optional)
-- ============================================
-- WICHTIG: Entferne diese Spalte nur, wenn du sicher bist, dass
-- du die alten Daten nicht mehr brauchst!
-- 
-- Wenn du die Spalte behalten möchtest (für Backup/Historie),
-- kommentiere den folgenden Block aus:

/*
DO $$ 
BEGIN
    -- Prüfe ob die Spalte existiert
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'daily_progress' 
        AND column_name = 'lives_remaining'
    ) THEN
        -- Entferne die Spalte
        ALTER TABLE daily_progress 
        DROP COLUMN lives_remaining;
        
        RAISE NOTICE 'Spalte lives_remaining wurde aus daily_progress entfernt';
    ELSE
        RAISE NOTICE 'Spalte lives_remaining existiert nicht in daily_progress';
    END IF;
END $$;
*/

-- ============================================
-- 4. Stelle sicher, dass mistakes NOT NULL ist
-- ============================================
ALTER TABLE daily_progress
ALTER COLUMN mistakes SET DEFAULT 0;

ALTER TABLE daily_progress
ALTER COLUMN mistakes SET NOT NULL;

-- ============================================
-- 5. Verifizierung
-- ============================================
-- Prüfe die Struktur der Tabelle
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'daily_progress' 
AND column_name IN ('mistakes', 'lives_remaining')
ORDER BY column_name;

-- ============================================
-- 6. Prüfe ob es Einträge gibt, die noch lives_remaining verwenden
-- ============================================
-- Diese Abfrage zeigt, ob noch Daten in lives_remaining vorhanden sind
-- (nur wenn die Spalte noch existiert)
SELECT 
    COUNT(*) as total_entries,
    COUNT(lives_remaining) as entries_with_lives
FROM daily_progress;

-- ============================================
-- HINWEISE:
-- ============================================
-- 1. Die Spalte 'mistakes' wird jetzt in der App verwendet
-- 2. Die Spalte 'lives_remaining' kann optional entfernt werden
-- 3. Alle neuen Einträge verwenden automatisch mistakes = 0 als Standard
-- 4. Die App aktualisiert jetzt 'mistakes' statt 'lives_remaining'
-- ============================================


-- ============================================
-- Script zum Zurücksetzen aller Statistiken und Punkte
-- ============================================
-- Dieses Script löscht:
-- - Alle Versuche (daily_attempts) - enthält Punkte, Siege, Zeiten, Fehler
-- - Alle Fortschritte (daily_progress) - enthält aktuellen Spielstatus
--
-- Es werden NICHT gelöscht:
-- - Spielerprofile (player_profiles) - bleiben erhalten
-- - Tägliche Puzzles (daily_puzzles) - bleiben erhalten
--
-- ============================================

-- Lösche alle Versuche (enthält alle Punkte und Statistiken)
DELETE FROM daily_attempts;

-- Lösche alle Fortschritte (enthält aktuellen Spielstatus)
DELETE FROM daily_progress;

-- ============================================
-- Überprüfung: Zeige Anzahl der verbleibenden Einträge
-- ============================================
SELECT 
    'daily_attempts' as tabelle, COUNT(*) as anzahl FROM daily_attempts
UNION ALL
SELECT 
    'daily_progress' as tabelle, COUNT(*) as anzahl FROM daily_progress;

-- Beide Tabellen sollten jetzt 0 Einträge haben.
-- Spielerprofile und Puzzles bleiben unverändert.


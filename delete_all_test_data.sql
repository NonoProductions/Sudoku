-- ============================================
-- Script zum Löschen aller Testdaten
-- ============================================
-- WICHTIG: Dieses Script löscht ALLE Daten aus allen Tabellen!
-- Führe es nur aus, wenn du wirklich alle Daten löschen möchtest.
--
-- Anleitung:
-- 1. Gehe zu deinem Supabase Dashboard
-- 2. Öffne den SQL Editor
-- 3. Kopiere und füge dieses Script ein
-- 4. Führe es aus
--
-- ============================================

-- Lösche alle Daten aus den Tabellen (in der richtigen Reihenfolge)
-- Zuerst die abhängigen Tabellen:

-- 1. Lösche alle Fortschritte
DELETE FROM daily_progress;

-- 2. Lösche alle Versuche
DELETE FROM daily_attempts;

-- 3. Lösche alle täglichen Puzzles
DELETE FROM daily_puzzles;

-- 4. Lösche alle Spielerprofile
DELETE FROM player_profiles;

-- ============================================
-- Optional: Zurücksetzen der Sequenzen (falls vorhanden)
-- ============================================
-- Wenn deine IDs auto-increment sind, kannst du auch die Sequenzen zurücksetzen:
-- ALTER SEQUENCE daily_puzzles_id_seq RESTART WITH 1;
-- ALTER SEQUENCE player_profiles_id_seq RESTART WITH 1;
-- (Anpassen je nach deiner tatsächlichen Sequenz-Struktur)

-- ============================================
-- Überprüfung: Zeige Anzahl der verbleibenden Einträge
-- ============================================
SELECT 
    'daily_progress' as tabelle, COUNT(*) as anzahl FROM daily_progress
UNION ALL
SELECT 
    'daily_attempts' as tabelle, COUNT(*) as anzahl FROM daily_attempts
UNION ALL
SELECT 
    'daily_puzzles' as tabelle, COUNT(*) as anzahl FROM daily_puzzles
UNION ALL
SELECT 
    'player_profiles' as tabelle, COUNT(*) as anzahl FROM player_profiles;

-- Alle Tabellen sollten jetzt 0 Einträge haben.


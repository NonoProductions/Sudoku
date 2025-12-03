-- ============================================
-- Cron Job Fix für generate-daily-puzzle
-- ============================================
-- WICHTIG: Der Cron Job heißt "TäglichesSudoku"
-- Die Edge Function heißt "generate-daily-puzzle"
-- Dieses Script hilft beim Debuggen und Einrichten des Cron Jobs

-- 1. Überprüfe, ob pg_cron aktiviert ist
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Falls nicht aktiviert, aktiviere es:
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Überprüfe, ob net.http aktiviert ist (für HTTP Requests)
SELECT * FROM pg_extension WHERE extname = 'http';

-- Falls nicht aktiviert, aktiviere es:
-- CREATE EXTENSION IF NOT EXISTS http;

-- 3. Lösche den alten Cron Job falls vorhanden
-- WICHTIG: Der Cron Job Name ist "TäglichesSudoku" (nicht generate-daily-puzzle!)
SELECT cron.unschedule('TäglichesSudoku');

-- 4. WICHTIG: Hole deine Credentials
-- Gehe zu: Supabase Dashboard > Settings > API
-- Kopiere:
-- - Project URL (z.B. https://abcdefghijklmnop.supabase.co)
-- - service_role Key (NICHT der anon key!)

-- 5. Erstelle den Cron Job mit korrekten Headers
-- ERSETZE DIE PLATZHALTER:
-- [DEIN-PROJECT-REF] = Dein Project Reference (aus der URL)
-- [DEIN-SERVICE-ROLE-KEY] = Dein service_role Key

-- WICHTIG: Der Cron Job Name ist "TäglichesSudoku"
-- Die Edge Function URL ist "generate-daily-puzzle"
SELECT cron.schedule(
  'TäglichesSudoku',  -- Cron Job Name
  '0 0 * * *',  -- Jeden Tag um 00:00 UTC (Mitternacht)
  $$
  SELECT
    net.http_post(
      url := 'https://[DEIN-PROJECT-REF].supabase.co/functions/v1/generate-daily-puzzle',  -- Edge Function Name
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer [DEIN-SERVICE-ROLE-KEY]',
        'apikey', '[DEIN-SERVICE-ROLE-KEY]'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ============================================
-- ALTERNATIVE: Mit pg_net (falls net.http nicht funktioniert)
-- ============================================

-- Überprüfe, ob pg_net aktiviert ist
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- Falls net.http nicht funktioniert, verwende diese Variante:
/*
SELECT cron.schedule(
  'generate-daily-puzzle',
  '0 0 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://[DEIN-PROJECT-REF].supabase.co/functions/v1/generate-daily-puzzle',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer [DEIN-SERVICE-ROLE-KEY]',
        'apikey', '[DEIN-SERVICE-ROLE-KEY]'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
*/

-- ============================================
-- DIAGNOSE: Überprüfe den Cron Job Status
-- ============================================

-- Zeige alle Cron Jobs (mit dem richtigen Namen)
SELECT * FROM cron.job WHERE jobname = 'TäglichesSudoku';

-- Zeige die Cron Job Details
SELECT 
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job 
WHERE jobname = 'TäglichesSudoku';

-- Zeige Cron Job Ausführungs-Historie
SELECT 
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'TäglichesSudoku')
ORDER BY start_time DESC
LIMIT 10;

-- ============================================
-- TEST: Führe den Cron Job manuell aus
-- ============================================

-- Teste den Cron Job sofort (mit dem richtigen Namen)
-- Hinweis: pg_cron hat keine cron.run() Funktion
-- Führe einfach den Command direkt aus:
SELECT generate_daily_puzzle_via_edge_function();

-- Warte ein paar Sekunden, dann überprüfe die Logs:
-- 1. Gehe zu Supabase Dashboard > Edge Functions > generate-daily-puzzle > Logs
-- 2. Oder führe diese Query aus, um die Cron Job Ausführung zu sehen:
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'TäglichesSudoku')
ORDER BY start_time DESC
LIMIT 1;

-- ============================================
-- ÜBERPRÜFUNG: Hat es funktioniert?
-- ============================================

-- Prüfe, ob ein Puzzle für heute erstellt wurde
SELECT * FROM daily_puzzles 
WHERE puzzle_date = CURRENT_DATE;

-- ============================================
-- HÄUFIGE PROBLEME UND LÖSUNGEN
-- ============================================

-- Problem 1: "function net.http_post does not exist"
-- Lösung: Aktiviere die http Extension:
-- CREATE EXTENSION IF NOT EXISTS http;

-- Problem 2: Cron Job läuft, aber Function wird nicht aufgerufen
-- Lösung: 
-- 1. Überprüfe die Logs in Edge Functions > generate-daily-puzzle > Logs
-- 2. Stelle sicher, dass der service_role Key korrekt ist
-- 3. Überprüfe, ob die URL korrekt ist

-- Problem 3: "new row violates row-level security policy"
-- Lösung: 
-- 1. Stelle sicher, dass du den service_role Key verwendest (nicht anon key)
-- 2. Überprüfe die RLS Policies (siehe supabase_rls_policies.sql)

-- Problem 4: Cron Job wird nicht ausgeführt
-- Lösung:
-- 1. Überprüfe, ob pg_cron aktiviert ist
-- 2. Überprüfe den Cron Job Status mit den Queries oben
-- 3. Teste manuell mit: SELECT generate_daily_puzzle_via_edge_function();

-- WICHTIGER HINWEIS:
-- Der Cron Job Name ist "TäglichesSudoku" (ohne Leerzeichen)
-- Die Edge Function heißt "generate-daily-puzzle"
-- Stelle sicher, dass der Cron Job die richtige Edge Function URL aufruft!


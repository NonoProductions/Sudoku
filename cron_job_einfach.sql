-- ============================================
-- EINFACHE LÖSUNG: SQL-Funktion für Cron Job
-- ============================================
-- Der Cron Job ruft einfach eine SQL-Funktion auf
-- Die Funktion ruft die Edge Function auf

-- Schritt 1: Erstelle eine SQL-Funktion, die die Edge Function aufruft
CREATE OR REPLACE FUNCTION generate_daily_puzzle_via_edge_function()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  project_ref text;
  service_role_key text;
  response jsonb;
BEGIN
  -- WICHTIG: Setze diese Werte auf deine Supabase-Credentials!
  -- Du findest sie in: Supabase Dashboard > Settings > API
  project_ref := 'mhbnbovcqxtpllstccjn';  -- ERSETZEN! z.B. 'abcdefghijklmnop'
  service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oYm5ib3ZjcXh0cGxsc3RjY2puIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE3Nzc5MCwiZXhwIjoyMDc5NzUzNzkwfQ.6tq3qCA38jqXUXC_FVaQ8Ac-bKM2G3S6W7Vfb-2D_ZQ';  -- ERSETZEN! Der lange Key
  
  -- Rufe die Edge Function über HTTP auf
  SELECT content INTO response
  FROM http((
    'POST',
    'https://' || project_ref || '.supabase.co/functions/v1/generate-daily-puzzle',
    ARRAY[
      http_header('Content-Type', 'application/json'),
      http_header('Authorization', 'Bearer ' || service_role_key),
      http_header('apikey', service_role_key)
    ],
    'application/json',
    '{}'
  )::http_request);
  
  -- Log das Ergebnis (optional)
  RAISE NOTICE 'Edge Function Response: %', response;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error calling Edge Function: %', SQLERRM;
    RAISE;
END;
$$;

-- Schritt 2: Aktiviere die http Extension (falls nicht bereits aktiviert)
CREATE EXTENSION IF NOT EXISTS http;

-- Schritt 3: Lösche den alten Cron Job
SELECT cron.unschedule('TäglichesSudoku');

-- Schritt 4: Erstelle den Cron Job - jetzt super einfach!
SELECT cron.schedule(
  'TäglichesSudoku',
  '0 22,23 * * *',  -- 22:00 und 23:00 UTC (deckt DE Winter- & Sommerzeit ab)
  $$SELECT generate_daily_puzzle_via_edge_function();$$
);

-- ============================================
-- ALTERNATIVE: Mit net.http_post (falls http Extension nicht funktioniert)
-- ============================================

-- Falls die obige Lösung nicht funktioniert, verwende diese Variante:

/*
CREATE OR REPLACE FUNCTION generate_daily_puzzle_via_edge_function()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  project_ref text := '[DEIN-PROJECT-REF]';
  service_role_key text := '[DEIN-SERVICE-ROLE-KEY]';
  request_id bigint;
BEGIN
  -- Rufe die Edge Function über net.http_post auf
  SELECT net.http_post(
    url := 'https://' || project_ref || '.supabase.co/functions/v1/generate-daily-puzzle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key,
      'apikey', service_role_key
    ),
    body := '{}'::jsonb
  ) INTO request_id;
  
  RAISE NOTICE 'Edge Function called, request_id: %', request_id;
END;
$$;

-- Aktiviere pg_net Extension
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Cron Job
SELECT cron.schedule(
  'TäglichesSudoku',
  '0 0 * * *',
  $$SELECT generate_daily_puzzle_via_edge_function();$$
);
*/

-- ============================================
-- Test: Führe die Funktion manuell aus
-- ============================================

-- Teste die Funktion
SELECT generate_daily_puzzle_via_edge_function();

-- ============================================
-- Überprüfung
-- ============================================

-- Prüfe, ob ein Puzzle für heute erstellt wurde
SELECT * FROM daily_puzzles WHERE puzzle_date = CURRENT_DATE;

-- Prüfe Cron Job Status
SELECT * FROM cron.job WHERE jobname = 'TäglichesSudoku';

-- Prüfe Cron Job Ausführungs-Historie
SELECT 
  runid,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'TäglichesSudoku')
ORDER BY start_time DESC
LIMIT 5;




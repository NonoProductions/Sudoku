-- ============================================
-- Einfache Lösung: SQL-Funktion die Edge Function aufruft
-- ============================================
-- Vorteil: Cron Job wird viel einfacher, aber nutzt immer noch die Edge Function

-- 1. Erstelle eine SQL-Funktion, die die Edge Function aufruft
CREATE OR REPLACE FUNCTION call_generate_daily_puzzle()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  project_ref text;
  service_role_key text;
  function_url text;
  response_status integer;
BEGIN
  -- Hole die Credentials aus Umgebungsvariablen oder einer Config-Tabelle
  -- Für Supabase: Diese Werte müssen manuell gesetzt werden
  
  -- OPTION 1: Verwende die Edge Function URL direkt (einfachste Lösung)
  -- Ersetze [DEIN-PROJECT-REF] und [DEIN-SERVICE-ROLE-KEY] mit deinen Werten
  
  -- Diese Funktion ruft die Edge Function über HTTP auf
  -- Aber das ist immer noch kompliziert...
  
  -- BESSERE LÖSUNG: Rufe die Edge Function direkt auf
  -- Aber dafür brauchen wir die http Extension...
  
  -- EIGENTLICH: Die einfachste Lösung ist, den HTTP-Call direkt im Cron Job zu haben
  -- aber in einer SQL-Funktion zu wrappen, damit es sauberer ist
  
  RAISE NOTICE 'This function should call the Edge Function. For now, use the direct approach.';
  
END;
$$;

-- ============================================
-- BESSERE LÖSUNG: Direkt im Cron Job, aber vereinfacht
-- ============================================

-- Lösche den alten Cron Job
SELECT cron.unschedule('TäglichesSudoku');

-- Erstelle neuen Cron Job - jetzt mit einer einfachen SQL-Funktion
-- Die Funktion ruft die Edge Function auf
CREATE OR REPLACE FUNCTION trigger_daily_puzzle()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  project_url text := '[DEIN-PROJECT-REF].supabase.co';  -- ERSETZEN!
  service_key text := '[DEIN-SERVICE-ROLE-KEY]';  -- ERSETZEN!
  result jsonb;
BEGIN
  -- Rufe die Edge Function über HTTP auf
  SELECT content INTO result
  FROM http((
    'POST',
    'https://' || project_url || '/functions/v1/generate-daily-puzzle',
    ARRAY[
      http_header('Content-Type', 'application/json'),
      http_header('Authorization', 'Bearer ' || service_key),
      http_header('apikey', service_key)
    ],
    'application/json',
    '{}'
  )::http_request);
  
  RAISE NOTICE 'Edge Function called: %', result;
END;
$$;

-- Cron Job - jetzt super einfach!
SELECT cron.schedule(
  'TäglichesSudoku',
  '0 22,23 * * *',
  $$SELECT trigger_daily_puzzle();$$
);

-- ============================================
-- NOCH EINFACHER: Direkt im Cron Job (ohne Funktion)
-- ============================================

-- Falls die obige Lösung nicht funktioniert, verwende diese:
/*
SELECT cron.schedule(
  'TäglichesSudoku',
  '0 22,23 * * *',
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




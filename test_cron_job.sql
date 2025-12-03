-- ============================================
-- Test und Überprüfung des Cron Jobs
-- ============================================

-- 1. Teste die Funktion manuell
SELECT generate_daily_puzzle_via_edge_function();

-- 2. Warte ein paar Sekunden, dann überprüfe:
-- Prüfe, ob ein Puzzle für heute erstellt wurde
SELECT 
  id,
  puzzle_date,
  difficulty,
  created_at
FROM daily_puzzles 
WHERE puzzle_date = CURRENT_DATE;

-- 3. Überprüfe die Cron Job Ausführungs-Historie
SELECT 
  runid,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'TäglichesSudoku')
ORDER BY start_time DESC
LIMIT 10;

-- 4. Überprüfe die Edge Function Logs
-- Gehe zu: Supabase Dashboard > Edge Functions > generate-daily-puzzle > Logs
-- Du solltest dort die Logs der Edge Function sehen

-- 5. Teste den Cron Job manuell (ohne auf den Schedule zu warten)
-- Hinweis: pg_cron hat keine cron.run() Funktion
-- Führe einfach den Command direkt aus:
SELECT generate_daily_puzzle_via_edge_function();

-- 6. Warte 5-10 Sekunden, dann überprüfe erneut:
SELECT * FROM daily_puzzles WHERE puzzle_date = CURRENT_DATE;


# Cron Job Problem lösen: Function funktioniert manuell, aber nicht scheduled

## Problem
Die Edge Function `generate-daily-puzzle` funktioniert, wenn du sie manuell aufrufst, aber nicht wenn sie vom Cron Job aufgerufen wird.

## Schritt-für-Schritt Lösung

### Schritt 1: Überprüfe die Logs

1. Gehe zu **Supabase Dashboard** > **Edge Functions** > **generate-daily-puzzle** > **Logs**
2. Schaue nach Einträgen, die zur Zeit des Cron Job Aufrufs erstellt wurden
3. Falls keine Logs vorhanden sind → Der Cron Job ruft die Function nicht auf
4. Falls Logs vorhanden sind → Schaue nach Fehlermeldungen

### Schritt 2: Überprüfe den Cron Job Status

**WICHTIG:** Der Cron Job heißt `TäglichesSudoku` (nicht `generate-daily-puzzle`)!

Führe diese SQL-Query im **SQL Editor** aus:

```sql
-- Zeige Cron Job Status
SELECT 
  jobid,
  schedule,
  command,
  active
FROM cron.job 
WHERE jobname = 'TäglichesSudoku';
```

**Was zu prüfen ist:**
- Ist `active = true`? Falls nein, ist der Job deaktiviert
- Ist der `command` korrekt? (sollte die richtige URL und den service_role Key enthalten)

### Schritt 3: Überprüfe die Cron Job Ausführungs-Historie

```sql
-- Zeige die letzten 10 Ausführungen
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
```

**Was zu prüfen ist:**
- `status`: Sollte "succeeded" sein
- `return_message`: Sollte keine Fehler enthalten
- Falls `status = "failed"`, schaue in `return_message` nach dem Fehler

### Schritt 4: Teste den Cron Job manuell

```sql
-- Führe den Cron Job sofort aus
-- Hinweis: pg_cron hat keine cron.run() Funktion
-- Führe einfach den Command direkt aus:
SELECT generate_daily_puzzle_via_edge_function();
```

**Dann:**
1. Warte 5-10 Sekunden
2. Gehe zu **Edge Functions** > **generate-daily-puzzle** > **Logs**
3. Schaue, ob neue Logs erstellt wurden
4. Falls ja → Der Cron Job funktioniert, aber der Schedule ist falsch
5. Falls nein → Der Cron Job hat ein Problem

### Schritt 5: Überprüfe die Extensions

```sql
-- Überprüfe, ob pg_cron aktiviert ist
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Überprüfe, ob http aktiviert ist
SELECT * FROM pg_extension WHERE extname = 'http';
```

**Falls nicht aktiviert:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;
```

### Schritt 6: Erstelle den Cron Job neu mit korrekten Headers

**WICHTIG:** Der Cron Job muss den **service_role Key** im Authorization Header senden!

1. Gehe zu **Settings** > **API**
2. Kopiere deinen **service_role** Key (nicht den anon key!)
3. Kopiere deine **Project URL**

Führe dann dieses SQL aus (ersetze die Platzhalter!):

```sql
-- Lösche den alten Cron Job (mit dem richtigen Namen!)
-- WICHTIG: Der Cron Job Name ist "TäglichesSudoku"
-- Die Edge Function URL ist "generate-daily-puzzle"

-- Sichere Variante: Prüft ob der Job existiert
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'TäglichesSudoku') THEN
    PERFORM cron.unschedule('TäglichesSudoku');
    RAISE NOTICE 'Cron Job gelöscht';
  END IF;
END $$;

-- Erstelle neuen Cron Job
SELECT cron.schedule(
  'TäglichesSudoku',  -- Cron Job Name
  '0 0 * * *',  -- Jeden Tag um 00:00 UTC
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
```

**Beispiel:**
```sql
SELECT cron.schedule(
  'generate-daily-puzzle',
  '0 0 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://abcdefghijklmnop.supabase.co/functions/v1/generate-daily-puzzle',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjQwMDAwMDAwLCJleHAiOjE5NTU1NzYwMDB9.xyz...',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjQwMDAwMDAwLCJleHAiOjE5NTU1NzYwMDB9.xyz...'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

### Schritt 7: Teste erneut

```sql
-- Teste sofort
-- Hinweis: pg_cron hat keine cron.run() Funktion
-- Führe einfach den Command direkt aus:
SELECT generate_daily_puzzle_via_edge_function();
```

**Dann:**
1. Warte 10 Sekunden
2. Überprüfe die Logs in **Edge Functions** > **generate-daily-puzzle** > **Logs**
3. Überprüfe die Datenbank:
   ```sql
   SELECT * FROM daily_puzzles WHERE puzzle_date = CURRENT_DATE;
   ```

## Alternative Lösung: Verwende pg_net statt net.http

Falls `net.http_post` nicht funktioniert, versuche diese Variante:

```sql
-- Aktiviere pg_net Extension
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Lösche alten Cron Job
SELECT cron.unschedule('TäglichesSudoku');

-- Erstelle neuen Cron Job mit pg_net
SELECT cron.schedule(
  'TäglichesSudoku',
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
```

## Häufige Fehler und Lösungen

### Fehler 1: "function net.http_post does not exist"
**Lösung:**
```sql
CREATE EXTENSION IF NOT EXISTS http;
```

### Fehler 2: "new row violates row-level security policy"
**Lösung:**
- Stelle sicher, dass du den **service_role** Key verwendest (nicht anon key)
- Überprüfe die RLS Policies (siehe `supabase_rls_policies.sql`)

### Fehler 3: Cron Job läuft, aber keine Logs in Edge Function
**Mögliche Ursachen:**
1. Die URL ist falsch → Überprüfe die URL im Cron Job
2. Der Authorization Header fehlt → Füge ihn hinzu
3. Die Edge Function wird nicht erreicht → Überprüfe die Logs im Cron Job

**Lösung:**
```sql
-- Überprüfe die Cron Job Ausführung (mit dem richtigen Namen!)
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'TäglichesSudoku')
ORDER BY start_time DESC
LIMIT 1;
```

### Fehler 4: Cron Job wird nicht ausgeführt
**Lösung:**
1. Überprüfe, ob `pg_cron` aktiviert ist
2. Überprüfe den Schedule: `SELECT schedule FROM cron.job WHERE jobname = 'TäglichesSudoku';`
3. Teste manuell: `SELECT generate_daily_puzzle_via_edge_function();`

### Fehler 5: "could not find valid entry for job"
**Lösung:** Der Cron Job Name ist falsch! 
- Der Cron Job heißt: `TäglichesSudoku` (ohne Leerzeichen)
- Die Edge Function heißt: `generate-daily-puzzle`
- Verwende immer `TäglichesSudoku` wenn du den Cron Job aufrufst oder löscht

## Debugging: Detaillierte Logs aktivieren

Die Edge Function hat jetzt besseres Logging. Nach jedem Aufruf solltest du in den Logs sehen:
- `=== Edge Function started ===`
- `Timestamp: ...`
- `SUPABASE_URL exists: true/false`
- `SUPABASE_SERVICE_ROLE_KEY exists: true/false`
- `Today date: ...`
- `Checking for existing puzzle...`
- `Puzzle created successfully: ...`
- `=== Edge Function completed ===`

**Falls diese Logs fehlen:**
- Die Function wird nicht aufgerufen
- Überprüfe den Cron Job Status
- Überprüfe die URL im Cron Job

## Checkliste

- [ ] Edge Function funktioniert manuell
- [ ] Environment Variables sind gesetzt (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- [ ] pg_cron Extension ist aktiviert
- [ ] http Extension ist aktiviert
- [ ] Cron Job ist erstellt und aktiv
- [ ] Cron Job verwendet den service_role Key (nicht anon key)
- [ ] Cron Job URL ist korrekt
- [ ] Logs zeigen, dass die Function aufgerufen wird
- [ ] Puzzle wird in der Datenbank erstellt

## Nächste Schritte

1. Führe `cron_job_fix.sql` aus (ersetze die Platzhalter!)
2. Teste mit `SELECT generate_daily_puzzle_via_edge_function();`
3. Überprüfe die Logs
4. Falls es immer noch nicht funktioniert, schaue in die Cron Job Ausführungs-Historie

## Hilfe

Falls nichts funktioniert:
1. Überprüfe alle Logs (Edge Function + Cron Job)
2. Stelle sicher, dass der service_role Key korrekt ist
3. Teste die Function manuell im Dashboard
4. Überprüfe, ob die URL im Cron Job korrekt ist


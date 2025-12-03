# Einfache Lösung: SQL-Funktion für Cron Job

## Das Problem
Der Cron Job mit HTTP-Requests ist kompliziert und fehleranfällig.

## Die Lösung
Eine SQL-Funktion, die die Edge Function aufruft. Der Cron Job ruft einfach diese Funktion auf.

## Vorteile
✅ **Viel einfacher:** Cron Job ist nur eine Zeile: `SELECT generate_daily_puzzle_via_edge_function();`
✅ **Sauberer Code:** Die HTTP-Logik ist in einer Funktion gekapselt
✅ **Einfacher zu warten:** Credentials werden an einer Stelle gesetzt
✅ **Bessere Fehlerbehandlung:** Fehler werden in der Funktion behandelt

## Schritt-für-Schritt Anleitung

### Schritt 1: Öffne `cron_job_einfach.sql`

### Schritt 2: Ersetze die Platzhalter

In der Funktion `generate_daily_puzzle_via_edge_function()` findest du:

```sql
project_ref := '[DEIN-PROJECT-REF]';  -- ERSETZEN!
service_role_key := '[DEIN-SERVICE-ROLE-KEY]';  -- ERSETZEN!
```

**Wo finde ich diese Werte?**
1. Gehe zu **Supabase Dashboard** > **Settings** > **API**
2. **Project URL:** `https://abcdefghijklmnop.supabase.co`
   - Der `project_ref` ist: `abcdefghijklmnop`
3. **service_role Key:** Klicke auf "Reveal" und kopiere den langen Key

**Beispiel:**
```sql
project_ref := 'abcdefghijklmnop';
service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### Schritt 3: Führe das SQL-Script aus

1. Gehe zu **Supabase Dashboard** > **SQL Editor**
2. Öffne die Datei `cron_job_einfach.sql`
3. Ersetze die Platzhalter (siehe Schritt 2)
4. Führe das gesamte Script aus

### Schritt 4: Teste die Funktion

```sql
-- Teste die Funktion manuell
SELECT generate_daily_puzzle_via_edge_function();
```

**Was passiert:**
- Die Funktion ruft die Edge Function auf
- Die Edge Function generiert das Puzzle
- Das Puzzle wird in der Datenbank gespeichert

### Schritt 5: Überprüfe das Ergebnis

```sql
-- Prüfe, ob ein Puzzle erstellt wurde
SELECT * FROM daily_puzzles WHERE puzzle_date = CURRENT_DATE;
```

## Der Cron Job

Nach dem Ausführen des Scripts ist der Cron Job automatisch eingerichtet:

```sql
SELECT cron.schedule(
  'TäglichesSudoku',
  '0 0 * * *',  -- Jeden Tag um 00:00 UTC
  $$SELECT generate_daily_puzzle_via_edge_function();$$
);
```

**Das ist alles!** Der Cron Job ruft einfach die SQL-Funktion auf.

## Cron Job manuell testen

**Hinweis:** pg_cron hat keine `cron.run()` Funktion. Um den Cron Job zu testen, führe einfach den Command direkt aus:

```sql
-- Führe die Funktion direkt aus (das macht der Cron Job auch)
SELECT generate_daily_puzzle_via_edge_function();
```

## Überprüfe den Cron Job Status

```sql
-- Zeige Cron Job Details
SELECT * FROM cron.job WHERE jobname = 'TäglichesSudoku';

-- Zeige Ausführungs-Historie
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
```

## Häufige Probleme

### Problem 1: "function http does not exist"
**Lösung:** Aktiviere die http Extension:
```sql
CREATE EXTENSION IF NOT EXISTS http;
```

### Problem 2: "function net.http_post does not exist"
**Lösung:** Verwende die Alternative in `cron_job_einfach.sql` (mit pg_net)

### Problem 3: Funktion gibt Fehler zurück
**Lösung:**
1. Überprüfe, ob die Credentials korrekt sind
2. Überprüfe die Logs in **Edge Functions** > **generate-daily-puzzle** > **Logs**
3. Teste die Edge Function manuell im Dashboard

## Zusammenfassung

**Vorher (kompliziert):**
```sql
SELECT cron.schedule(
  'TäglichesSudoku',
  '0 0 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://...',
      headers := jsonb_build_object(...),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

**Nachher (einfach):**
```sql
SELECT cron.schedule(
  'TäglichesSudoku',
  '0 0 * * *',
  $$SELECT generate_daily_puzzle_via_edge_function();$$
);
```

**Viel einfacher!** 🎉


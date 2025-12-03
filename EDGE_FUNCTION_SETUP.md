# Edge Function Setup für tägliches Puzzle

## Problem
Die Edge Function wird vom Cron-Job aufgerufen, aber der Code wird nicht ausgeführt. Wenn manuell getriggert, funktioniert es.

## Lösung

### 1. Edge Function deployen

1. Gehe zu deinem Supabase Dashboard
2. Navigiere zu **Edge Functions**
3. Klicke auf **Create a new function**
4. Name: `generate-daily-puzzle`
5. Kopiere den Code aus `supabase/functions/generate-daily-puzzle/index.ts`

**ODER** verwende die Supabase CLI:

```bash
# Installiere Supabase CLI (falls noch nicht installiert)
npm install -g supabase

# Login
supabase login

# Link zu deinem Projekt
supabase link --project-ref dein-project-ref

# Deploy die Function
supabase functions deploy generate-daily-puzzle
```

### 2. WICHTIG: Service Role Key als Environment Variable setzen

**Das ist der kritische Schritt!** Die Edge Function benötigt den Service Role Key, um RLS zu umgehen.

1. Gehe zu deinem Supabase Dashboard
2. Navigiere zu **Edge Functions** > **generate-daily-puzzle**
3. Klicke auf **Settings** oder **Manage secrets**
4. Füge folgende Secrets hinzu:
   - `SUPABASE_URL`: Deine Supabase URL (findest du in Project Settings > API)
   - `SUPABASE_SERVICE_ROLE_KEY`: Dein Service Role Key (findest du in Project Settings > API, **NICHT** der anon key!)

**WICHTIG:** 
- Verwende den **Service Role Key**, nicht den Anon Key!
- Der Service Role Key umgeht Row-Level Security (RLS), was für Cron-Jobs notwendig ist
- Der Anon Key würde durch RLS blockiert werden

### 3. Cron Job einrichten

1. Gehe zu deinem Supabase Dashboard
2. Navigiere zu **Database** > **Extensions**
3. Stelle sicher, dass die `pg_cron` Extension installiert ist
4. Gehe zum **SQL Editor** und führe aus:

```sql
-- Lösche den alten Cron Job falls vorhanden
SELECT cron.unschedule('generate-daily-puzzle');

-- Erstelle neuen Cron Job (läuft jeden Tag um Mitternacht UTC)
SELECT cron.schedule(
  'generate-daily-puzzle',
  '0 0 * * *',  -- Jeden Tag um 00:00 UTC (Mitternacht)
  $$
  SELECT
    net.http_post(
      url := 'https://[DEIN-PROJECT-REF].supabase.co/functions/v1/generate-daily-puzzle',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer [DEIN-SERVICE-ROLE-KEY]'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

**WICHTIG:** Ersetze:
- `[DEIN-PROJECT-REF]` mit deinem Supabase Project Reference (findest du in der URL)
- `[DEIN-SERVICE-ROLE-KEY]` mit deinem Service Role Key

### 4. Alternative: Cron Job mit Supabase HTTP Request

Falls die obige Methode nicht funktioniert, verwende diese Variante:

```sql
SELECT cron.schedule(
  'generate-daily-puzzle',
  '0 0 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://[DEIN-PROJECT-REF].supabase.co/functions/v1/generate-daily-puzzle',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', '[DEIN-SERVICE-ROLE-KEY]',
        'Authorization', 'Bearer [DEIN-SERVICE-ROLE-KEY]'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

### 5. Cron Job testen

Um den Cron Job manuell zu testen:

```sql
-- Führe den Cron Job sofort aus
SELECT cron.run('generate-daily-puzzle');
```

### 6. Logs überprüfen

1. Gehe zu **Edge Functions** > **generate-daily-puzzle** > **Logs**
2. Überprüfe die Logs nach der Ausführung
3. Suche nach Fehlermeldungen

## Häufige Probleme

### Problem: "Missing Supabase configuration"
**Lösung:** Die Environment Variables `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` sind nicht gesetzt. Füge sie in den Edge Function Settings hinzu.

### Problem: "new row violates row-level security policy"
**Lösung:** Die Edge Function verwendet nicht den Service Role Key. Stelle sicher, dass:
1. Der Service Role Key als Environment Variable gesetzt ist
2. Die Edge Function den Service Role Key verwendet (nicht den Anon Key)

### Problem: Cron Job wird ausgeführt, aber die Function macht nichts
**Lösung:** 
1. Überprüfe die Logs der Edge Function
2. Stelle sicher, dass der Service Role Key im Cron Job verwendet wird
3. Überprüfe, ob die Function die Environment Variables korrekt liest

### Problem: Function funktioniert manuell, aber nicht per Cron
**Lösung:** Das ist genau das Problem, das wir lösen. Die Lösung ist:
1. Service Role Key als Environment Variable in der Edge Function
2. Service Role Key im Cron Job HTTP Request Header

## Überprüfung

Nach dem Setup kannst du überprüfen, ob es funktioniert:

```sql
-- Prüfe, ob ein Puzzle für heute existiert
SELECT * FROM daily_puzzles 
WHERE puzzle_date = CURRENT_DATE;

-- Prüfe Cron Job Status
SELECT * FROM cron.job WHERE jobname = 'generate-daily-puzzle';
```

## Zeitzone beachten

Der Cron Job läuft um **00:00 UTC**. Wenn du eine andere Zeitzone benötigst, passe den Cron Schedule an:

- `0 0 * * *` = 00:00 UTC (Mitternacht UTC)
- `0 1 * * *` = 01:00 UTC (1 Uhr UTC, entspricht 02:00 MEZ im Winter)
- `0 23 * * *` = 23:00 UTC (23 Uhr UTC, entspricht 00:00 MEZ am nächsten Tag im Winter)

Für mitternacht MEZ (UTC+1) im Winter:
```sql
SELECT cron.schedule(
  'generate-daily-puzzle',
  '0 23 * * *',  -- 23:00 UTC = 00:00 MEZ (Winter)
  ...
);
```


# WICHTIG: Cron Job Name vs. Edge Function Name

## Der Unterschied

- **Cron Job Name:** `TäglichesSudoku` (der Name des Cron Jobs in der Datenbank)
- **Edge Function Name:** `generate-daily-puzzle` (der Name der Edge Function)

## Warum ist das wichtig?

Der Cron Job Name (`TäglichesSudoku`) ist der Name, den du verwendest, wenn du:
- Den Cron Job aufrufst: `SELECT cron.run('TäglichesSudoku');`
- Den Cron Job löschst: `SELECT cron.unschedule('TäglichesSudoku');`
- Den Cron Job Status überprüfst: `SELECT * FROM cron.job WHERE jobname = 'TäglichesSudoku';`

Die Edge Function URL (`generate-daily-puzzle`) ist die URL, die im Cron Job verwendet wird:
```
https://[PROJECT-REF].supabase.co/functions/v1/generate-daily-puzzle
```

## Beispiel: Cron Job erstellen

```sql
SELECT cron.schedule(
  'TäglichesSudoku',  -- ← Cron Job Name (kannst du frei wählen)
  '0 0 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://[PROJECT-REF].supabase.co/functions/v1/generate-daily-puzzle',  -- ← Edge Function URL (muss mit dem Function Namen übereinstimmen)
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer [SERVICE-ROLE-KEY]',
        'apikey', '[SERVICE-ROLE-KEY]'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

## Zusammenfassung

- **Cron Job Name** = `TäglichesSudoku` → Verwende diesen Namen für alle Cron Job Operationen
- **Edge Function URL** = `generate-daily-puzzle` → Diese URL muss im Cron Job Command verwendet werden

## Häufiger Fehler

❌ **Falsch:**
```sql
SELECT cron.run('generate-daily-puzzle');  -- Fehler! Das ist nicht der Cron Job Name
```

✅ **Richtig:**
```sql
SELECT cron.run('TäglichesSudoku');  -- Richtig! Das ist der Cron Job Name
```



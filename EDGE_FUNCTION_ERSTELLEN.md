# Detaillierte Anleitung: Edge Function erstellen

Diese Anleitung erklärt Schritt für Schritt, wie du die `generate-daily-puzzle` Edge Function in Supabase erstellst.

## Methode 1: Über das Supabase Dashboard (Empfohlen für Anfänger)

### Schritt 1: Öffne das Supabase Dashboard

1. Gehe zu [https://supabase.com](https://supabase.com)
2. Logge dich ein
3. Wähle dein Projekt aus

### Schritt 2: Navigiere zu Edge Functions

1. Im linken Menü findest du **Edge Functions**
2. Klicke darauf
3. Du siehst eine Liste aller Edge Functions (wahrscheinlich noch leer)

### Schritt 3: Erstelle eine neue Edge Function

1. Klicke auf den Button **"Create a new function"** oder **"New Function"**
2. Es öffnet sich ein Dialog oder eine neue Seite

### Schritt 4: Benenne die Function

1. Im Feld **"Function name"** oder **"Name"** gib ein: `generate-daily-puzzle`
   - **WICHTIG:** Der Name muss genau so sein: `generate-daily-puzzle` (mit Bindestrich, keine Leerzeichen)
2. Klicke auf **"Create"** oder **"Next"**

### Schritt 5: Kopiere den Code

1. Öffne die Datei `supabase/functions/generate-daily-puzzle/index.ts` in deinem Code-Editor
2. Markiere den gesamten Code (Strg+A / Cmd+A)
3. Kopiere ihn (Strg+C / Cmd+C)
4. Gehe zurück zum Supabase Dashboard
5. Im Code-Editor der Edge Function füge den Code ein (Strg+V / Cmd+V)

### Schritt 6: Speichere die Function

1. Klicke auf **"Deploy"** oder **"Save"**
2. Warte, bis die Function deployed wurde (kann ein paar Sekunden dauern)
3. Du solltest eine Erfolgsmeldung sehen

---

## Methode 2: Über die Supabase CLI (Für Entwickler)

### Schritt 1: Installiere die Supabase CLI

**Windows (PowerShell):**
```powershell
# Mit npm (falls Node.js installiert ist)
npm install -g supabase

# Oder mit Scoop
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Alternative:**
Lade die CLI von [https://github.com/supabase/cli/releases](https://github.com/supabase/cli/releases) herunter

### Schritt 2: Logge dich ein

Öffne PowerShell oder Terminal und führe aus:

```powershell
supabase login
```

1. Es öffnet sich ein Browser-Fenster
2. Logge dich mit deinem Supabase-Account ein
3. Bestätige die Anmeldung

### Schritt 3: Linke dein Projekt

```powershell
supabase link --project-ref DEIN-PROJECT-REF
```

**Wie finde ich meinen Project Ref?**
1. Gehe zu deinem Supabase Dashboard
2. Klicke auf **Settings** (Zahnrad-Symbol)
3. Klicke auf **General**
4. Unter **Reference ID** findest du deinen Project Ref (z.B. `abcdefghijklmnop`)

**Beispiel:**
```powershell
supabase link --project-ref abcdefghijklmnop
```

### Schritt 4: Deploye die Function

```powershell
cd C:\Users\noela\Documents\Sandy\sodoku
supabase functions deploy generate-daily-puzzle
```

Die CLI:
- Liest die Datei `supabase/functions/generate-daily-puzzle/index.ts`
- Kompiliert sie
- Deployed sie zu Supabase

---

## Schritt 7: Environment Variables setzen (WICHTIG!)

**Diese Schritte sind für BEIDE Methoden gleich!**

### 7.1: Finde deine Supabase-Credentials

1. Gehe zu deinem Supabase Dashboard
2. Klicke auf **Settings** (Zahnrad-Symbol)
3. Klicke auf **API** (im linken Menü)
4. Du findest hier:
   - **Project URL** (z.B. `https://abcdefghijklmnop.supabase.co`)
   - **anon public** Key (den brauchen wir NICHT)
   - **service_role** Key (den brauchen wir! - klicke auf "Reveal" um ihn zu sehen)

### 7.2: Setze die Environment Variables

1. Gehe zu **Edge Functions** im Dashboard
2. Klicke auf deine Function `generate-daily-puzzle`
3. Klicke auf den Tab **"Settings"** oder **"Secrets"** oder **"Environment Variables"**
4. Klicke auf **"Add new secret"** oder **"New variable"**

**Füge diese beiden Secrets hinzu:**

**Secret 1:**
- **Name:** `SUPABASE_URL`
- **Value:** Deine Project URL (z.B. `https://abcdefghijklmnop.supabase.co`)

**Secret 2:**
- **Name:** `SUPABASE_SERVICE_ROLE_KEY`
- **Value:** Dein service_role Key (der lange String, den du unter API > service_role siehst)

5. Klicke für jedes Secret auf **"Save"** oder **"Add"**

**⚠️ WICHTIG:**
- Verwende den **service_role** Key, NICHT den **anon** Key!
- Der service_role Key umgeht Row-Level Security (RLS)
- Der anon Key würde nicht funktionieren

---

## Schritt 8: Teste die Function

### 8.1: Manuell testen

1. Gehe zu **Edge Functions** > **generate-daily-puzzle**
2. Klicke auf den Tab **"Invoke"** oder **"Test"**
3. Klicke auf **"Invoke function"** oder **"Run"**
4. Du solltest eine Antwort sehen, z.B.:
   ```json
   {
     "message": "Daily puzzle created successfully",
     "puzzle_id": "...",
     "date": "2024-01-15",
     "difficulty": "Medium"
   }
   ```

### 8.2: Überprüfe die Logs

1. Klicke auf den Tab **"Logs"**
2. Du solltest die Ausführung sehen
3. Falls Fehler auftreten, siehst du sie hier

### 8.3: Überprüfe die Datenbank

1. Gehe zu **Table Editor** > **daily_puzzles**
2. Du solltest einen neuen Eintrag für heute sehen
3. Die Spalten sollten gefüllt sein:
   - `puzzle_date`: Heutiges Datum
   - `initial_grid`: Das Puzzle (als JSON)
   - `solution_grid`: Die Lösung (als JSON)
   - `difficulty`: "Medium"

---

## Schritt 9: Cron Job einrichten (Optional, für automatische Ausführung)

Der Cron Job führt die Function automatisch jeden Tag um Mitternacht aus.

### 9.1: Aktiviere die pg_cron Extension

1. Gehe zu **Database** > **Extensions**
2. Suche nach `pg_cron`
3. Falls nicht aktiviert, klicke auf **"Enable"**

### 9.2: Erstelle den Cron Job

1. Gehe zu **SQL Editor**
2. Kopiere und füge diesen Code ein (ersetze die Platzhalter!):

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

**Ersetze:**
- `[DEIN-PROJECT-REF]` mit deinem Project Ref (z.B. `abcdefghijklmnop`)
- `[DEIN-SERVICE-ROLE-KEY]` mit deinem service_role Key

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
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

3. Klicke auf **"Run"** oder **"Execute"**

### 9.3: Teste den Cron Job manuell

```sql
-- Führe den Cron Job sofort aus (zum Testen)
SELECT cron.run('generate-daily-puzzle');
```

---

## Häufige Probleme und Lösungen

### Problem: "Missing Supabase configuration"
**Lösung:** Die Environment Variables sind nicht gesetzt. Gehe zu Schritt 7.

### Problem: "new row violates row-level security policy"
**Lösung:** 
1. Überprüfe, ob du den **service_role** Key verwendest (nicht den anon Key)
2. Überprüfe, ob die RLS-Policies korrekt eingerichtet sind (siehe `supabase_rls_policies.sql`)

### Problem: Function funktioniert nicht
**Lösung:**
1. Überprüfe die Logs in **Edge Functions** > **generate-daily-puzzle** > **Logs**
2. Stelle sicher, dass der Code korrekt kopiert wurde
3. Überprüfe, ob die Environment Variables korrekt gesetzt sind

### Problem: Cron Job wird nicht ausgeführt
**Lösung:**
1. Überprüfe, ob `pg_cron` aktiviert ist
2. Überprüfe den Cron Job Status:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'generate-daily-puzzle';
   ```
3. Überprüfe die Logs der Edge Function

---

## Überprüfung: Funktioniert alles?

Führe diese SQL-Abfrage aus, um zu prüfen, ob ein Puzzle für heute existiert:

```sql
SELECT * FROM daily_puzzles 
WHERE puzzle_date = CURRENT_DATE;
```

Falls ein Eintrag zurückkommt, funktioniert alles! 🎉

---

## Zusammenfassung der wichtigsten Schritte

1. ✅ Edge Function erstellen (Dashboard oder CLI)
2. ✅ Code aus `supabase/functions/generate-daily-puzzle/index.ts` einfügen
3. ✅ Environment Variables setzen (`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY`)
4. ✅ Function testen
5. ✅ (Optional) Cron Job einrichten

Falls du bei einem Schritt hängen bleibst, schaue in die Logs oder frage nach Hilfe!


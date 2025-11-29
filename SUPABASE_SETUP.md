# Supabase Setup für tägliches Sudoku

## Fehlende Spalte hinzufügen

Die Tabelle `daily_progress` benötigt eine neue Spalte `current_grid`, um den Board-Zustand (eingegebene Zahlen) zu speichern.

### Option 1: SQL Editor in Supabase (Empfohlen)

1. Gehe zu deinem Supabase Dashboard
2. Öffne den **SQL Editor**
3. Führe folgendes SQL-Script aus:

```sql
-- Füge die current_grid Spalte hinzu (wenn sie noch nicht existiert)
ALTER TABLE daily_progress 
ADD COLUMN IF NOT EXISTS current_grid JSONB;

-- Optional: Kommentar hinzufügen
COMMENT ON COLUMN daily_progress.current_grid IS 'Stores the current board state with entered numbers, initial cells, and notes';
```

### Option 2: Table Editor in Supabase

1. Gehe zu deinem Supabase Dashboard
2. Öffne **Table Editor**
3. Wähle die Tabelle `daily_progress`
4. Klicke auf **Add Column**
5. Fülle aus:
   - **Name**: `current_grid`
   - **Type**: `jsonb`
   - **Is Nullable**: ✅ (kann leer sein)
6. Klicke auf **Save**

### Überprüfung

Nach dem Hinzufügen kannst du überprüfen, ob die Spalte existiert:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'daily_progress' 
AND column_name = 'current_grid';
```

## Was wird gespeichert?

Die `current_grid` Spalte speichert:
- **value**: Die eingegebene Zahl (0 = leer)
- **isInitial**: Ob die Zelle initial war (vom Puzzle vorgegeben)
- **notes**: Array von Notizen (kleine Zahlen in den Zellen)

## Wichtige Hinweise

- Die Spalte muss vom Typ `JSONB` sein (nicht `JSON` oder `TEXT`)
- Die Spalte kann `NULL` sein (für neue Einträge ohne Fortschritt)
- Der Code speichert automatisch alle 1 Sekunde und beim Moduswechsel

## Row-Level Security (RLS) Policies einrichten

**WICHTIG:** Wenn du den Fehler "new row violates row-level security policy" erhältst oder die automatische Aktualisierung im Menü nicht funktioniert, musst du RLS-Policies für alle Tabellen einrichten.

### Lösung: RLS-Policies für alle Tabellen hinzufügen

1. Gehe zu deinem Supabase Dashboard
2. Öffne den **SQL Editor**
3. Führe das komplette Script aus der Datei `supabase_rls_policies.sql` aus

Das Script richtet Policies für folgende Tabellen ein:
- `daily_puzzles` - für tägliche Puzzles
- `daily_progress` - für Fortschritt und Realtime-Updates (wichtig für automatische Aktualisierung!)
- `daily_attempts` - für Versuche
- `player_profiles` - für Spielerprofile

### Realtime für automatische Updates aktivieren

Zusätzlich musst du Realtime für die Tabellen `daily_progress` und `daily_attempts` aktivieren:

1. Gehe zu deinem Supabase Dashboard
2. Navigiere zu **Database** > **Replication**
3. Aktiviere Realtime für die Tabellen:
   - `daily_progress` (für Team-Fortschritt Updates)
   - `daily_attempts` (für automatische Updates der heutigen Ergebnisse)

Oder führe im SQL Editor aus:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE daily_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_attempts;
```

**Hinweis**: Die automatische Aktualisierung im Menü funktioniert nur, wenn:
1. RLS-Policies für `daily_progress` und `daily_attempts` eingerichtet sind
2. Realtime für beide Tabellen aktiviert ist
3. UNIQUE Constraints auf `(player_name, puzzle_id)` für beide Tabellen existieren (werden automatisch vom RLS-Script erstellt)


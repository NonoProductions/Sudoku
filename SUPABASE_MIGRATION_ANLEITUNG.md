# Supabase Migration: Leben zu Fehler

## Übersicht
Diese Migration entfernt das Leben-System (3 Leben) und ersetzt es durch ein unbegrenztes Fehler-System. Spieler können jetzt unendlich viele Fehler machen, ohne das Spiel zu verlieren.

## Was wurde geändert?

### Code-Änderungen (bereits durchgeführt)
- ✅ `lives` State wurde entfernt
- ✅ `livesRef` wurde entfernt  
- ✅ Game-Over-Logik bei `lives <= 0` wurde entfernt
- ✅ UI zeigt jetzt Fehler statt Leben an
- ✅ Alle Supabase-Abfragen verwenden jetzt `mistakes` statt `lives_remaining`
- ✅ TypeScript-Typen wurden aktualisiert

### Supabase-Änderungen (müssen noch durchgeführt werden)

## Schritt-für-Schritt Anleitung

### Schritt 1: Öffne Supabase SQL Editor
1. Gehe zu deinem Supabase Dashboard
2. Navigiere zu **SQL Editor** (im linken Menü)
3. Klicke auf **New Query**

### Schritt 2: Führe die Migration aus
1. Öffne die Datei `supabase_migration_lives_to_mistakes.sql`
2. Kopiere den gesamten Inhalt
3. Füge ihn in den SQL Editor ein
4. Klicke auf **Run** (oder drücke `Ctrl+Enter` / `Cmd+Enter`)

### Schritt 3: Verifiziere die Änderungen
Nach dem Ausführen der Migration solltest du sehen:
- ✅ Eine Spalte `mistakes` in der Tabelle `daily_progress`
- ✅ Die Spalte `mistakes` hat den Standardwert `0`
- ✅ Die Spalte `mistakes` ist `NOT NULL`

### Schritt 4: Optional - Entferne alte Spalte
Die Spalte `lives_remaining` kann optional entfernt werden:
- **Option A**: Behalte sie (für Backup/Historie) - **EMPFOHLEN**
- **Option B**: Entferne sie (kommentiere den entsprechenden Block in der SQL-Datei aus)

## Wichtige Hinweise

### Für tägliche Spiele
- Alle neuen Spiele verwenden automatisch `mistakes = 0` als Startwert
- Fehler werden unbegrenzt gezählt
- Das Spiel endet nicht mehr durch zu viele Fehler
- Das Spiel endet nur noch durch:
  - ✅ Vollständiges Lösen des Sudokus (Gewinn)
  - ✅ Manuelles Aufgeben (Status: "Aufgegeben")

### Für Free Play Spiele
- Free Play Spiele speichern jetzt `mistakes` statt `lives` im localStorage
- Alte gespeicherte Free Play Spiele mit `lives` werden automatisch migriert

### Daten-Migration
- Bestehende Einträge in `daily_progress` werden auf `mistakes = 0` gesetzt
- Historische `lives_remaining` Werte gehen verloren (falls die Spalte entfernt wird)
- **Empfehlung**: Behalte `lives_remaining` für die ersten Wochen als Backup

## Troubleshooting

### Fehler: "Column does not exist"
- Stelle sicher, dass die Tabelle `daily_progress` existiert
- Prüfe die Schreibweise: `daily_progress` (nicht `daily_progess`)

### Fehler: "Column already exists"
- Die Spalte `mistakes` existiert bereits - das ist OK
- Die Migration wird die Spalte nicht erneut erstellen

### Fehler: "Cannot drop column because it is referenced"
- Wenn `lives_remaining` nicht gelöscht werden kann, lasse sie einfach bestehen
- Die App verwendet sie nicht mehr, sie stört nicht

## Verifikation

Nach der Migration kannst du prüfen:

```sql
-- Prüfe ob mistakes Spalte existiert
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'daily_progress' 
AND column_name = 'mistakes';

-- Prüfe Beispiel-Daten
SELECT player_name, timer_seconds, mistakes, completion_percent, status
FROM daily_progress
LIMIT 5;
```

## Rollback (Falls nötig)

Falls du zurückrollen musst:

```sql
-- Füge lives_remaining wieder hinzu (falls entfernt)
ALTER TABLE daily_progress 
ADD COLUMN lives_remaining INTEGER DEFAULT 3;

-- Setze Standardwerte
UPDATE daily_progress
SET lives_remaining = 3
WHERE lives_remaining IS NULL;
```

**WICHTIG**: Nach einem Rollback musst du auch den Code zurücksetzen!

## Support

Bei Problemen:
1. Prüfe die Supabase Logs im Dashboard
2. Prüfe die Browser-Konsole auf Fehler
3. Stelle sicher, dass alle SQL-Befehle erfolgreich ausgeführt wurden


# Fehlerbehebung: Fortschritt wird nicht berechnet/aktualisiert

## Problem 1: Fortschritt wird nicht berechnet

### Überprüfungen:

1. **Browser-Konsole öffnen (F12)**
   - Suche nach "Progress calculation:" Logs
   - Prüfe ob `correct` und `total` Werte > 0 sind
   - Prüfe ob `completion_percent` berechnet wird

2. **Prüfe ob Daten gespeichert werden:**
   - Suche nach "Progress saved successfully:" in der Konsole
   - Prüfe ob Fehler beim Speichern auftreten

3. **Prüfe die Berechnung:**
   - `completion_percent` = (correctPlacements / totalPlacements) * 100
   - Nur nicht-initiale Zellen werden gezählt
   - Nur korrekte Werte werden als "correct" gezählt

## Problem 2: Fortschritt des anderen Nutzers wird nicht aktualisiert

### Überprüfungen:

1. **Realtime-Subscription Status:**
   - Öffne Browser-Konsole (F12)
   - Suche nach "Realtime subscription status:"
   - Sollte "SUBSCRIBED" anzeigen
   - Falls "CHANNEL_ERROR" → Realtime ist nicht aktiviert

2. **Supabase Realtime aktivieren:**
   - Gehe zu Supabase Dashboard
   - Navigiere zu **Database** > **Replication**
   - Aktiviere Realtime für die Tabelle `daily_progress`
   - Oder führe das SQL-Script `supabase_rls_policies.sql` aus

3. **RLS-Policies prüfen:**
   - Führe das komplette Script `supabase_rls_policies.sql` aus
   - Stelle sicher, dass alle Policies für `daily_progress` erstellt wurden:
     - `daily_progress_select_policy`
     - `daily_progress_insert_policy`
     - `daily_progress_update_policy`

4. **Polling-Fallback:**
   - Die App lädt den Fortschritt alle 2 Sekunden neu (Polling)
   - Falls Realtime nicht funktioniert, sollte Polling trotzdem funktionieren
   - Prüfe ob "Error loading team progress:" Fehler in der Konsole erscheinen

## Lösungsschritte:

### Schritt 1: RLS-Policies einrichten
```sql
-- Führe das komplette Script aus: supabase_rls_policies.sql
```

### Schritt 2: Realtime aktivieren
1. Supabase Dashboard → Database → Replication
2. Aktiviere Realtime für `daily_progress`
3. Oder führe den Realtime-Teil des SQL-Scripts aus

### Schritt 3: Browser-Konsole prüfen
- Öffne F12 → Console Tab
- Prüfe auf Fehler
- Prüfe auf "Realtime subscription status: SUBSCRIBED"
- Prüfe auf "Progress calculation:" Logs

### Schritt 4: Testen
1. Starte das tägliche Sudoku
2. Fülle ein paar Felder aus
3. Gehe ins Menü
4. Prüfe ob der Fortschritt angezeigt wird
5. Öffne die App in einem zweiten Browser/Fenster mit anderem Spieler
6. Prüfe ob Updates in Echtzeit ankommen

## Häufige Fehler:

### "new row violates row-level security policy"
→ RLS-Policies fehlen → Führe `supabase_rls_policies.sql` aus

### "Realtime subscription status: CHANNEL_ERROR"
→ Realtime nicht aktiviert → Aktiviere im Dashboard unter Database > Replication

### Fortschritt bleibt bei 0%
→ Prüfe ob `completion_percent` gespeichert wird → Siehe Browser-Konsole

### Updates kommen nicht an
→ Prüfe Realtime-Status → Aktiviere Realtime im Dashboard


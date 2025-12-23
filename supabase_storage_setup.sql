-- ============================================
-- Supabase Storage Setup für Profilfotos
-- ============================================
-- Diese Datei konfiguriert den Storage Bucket und die Policies für Profilfotos

-- ============================================
-- 1. Storage Bucket erstellen (falls nicht vorhanden)
-- ============================================
-- HINWEIS: Storage Buckets können nicht direkt per SQL erstellt werden.
-- Du musst dies im Supabase Dashboard machen:
-- 1. Gehe zu Storage > Buckets
-- 2. Klicke auf "New bucket"
-- 3. Name: "player-photos"
-- 4. Public bucket: ✅ AN (muss öffentlich sein, damit die Bilder angezeigt werden können)
-- 5. File size limit: z.B. 5 MB
-- 6. Allowed MIME types: image/*

-- ============================================
-- 2. Storage Policies für den Bucket
-- ============================================
-- Diese Policies erlauben:
-- - Öffentliches Lesen (damit die Bilder angezeigt werden können)
-- - Upload für alle (da keine Supabase Auth verwendet wird)

-- WICHTIG: Storage Policies müssen auf storage.objects erstellt werden
-- Zuerst alte Policies entfernen (falls vorhanden)
DROP POLICY IF EXISTS "player-photos-public-read" ON storage.objects;
DROP POLICY IF EXISTS "player-photos-public-upload" ON storage.objects;
DROP POLICY IF EXISTS "player-photos-public-update" ON storage.objects;
DROP POLICY IF EXISTS "player-photos-public-delete" ON storage.objects;

-- Policy für SELECT (Lesen) - Öffentlich
CREATE POLICY "player-photos-public-read"
ON storage.objects FOR SELECT
USING (bucket_id = 'player-photos');

-- Policy für INSERT (Upload) - Erlaube allen
CREATE POLICY "player-photos-public-upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'player-photos');

-- Policy für UPDATE (Überschreiben) - Erlaube allen
CREATE POLICY "player-photos-public-update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'player-photos')
WITH CHECK (bucket_id = 'player-photos');

-- Policy für DELETE (Löschen) - Erlaube allen
CREATE POLICY "player-photos-public-delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'player-photos');

-- ============================================
-- 3. Sicherstellen, dass photo_url Spalte existiert
-- ============================================
DO $$ 
BEGIN
    -- Prüfe ob die Spalte bereits existiert
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'player_profiles' 
        AND column_name = 'photo_url'
    ) THEN
        -- Füge die Spalte hinzu
        ALTER TABLE player_profiles 
        ADD COLUMN photo_url TEXT;
        
        COMMENT ON COLUMN player_profiles.photo_url IS 'URL zum Profilfoto des Spielers (gespeichert in Supabase Storage)';
        
        RAISE NOTICE 'Spalte photo_url wurde zur Tabelle player_profiles hinzugefügt';
    ELSE
        RAISE NOTICE 'Spalte photo_url existiert bereits in player_profiles';
    END IF;
END $$;

-- ============================================
-- 4. Verifizierung
-- ============================================
-- Prüfe ob die Spalte existiert
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'player_profiles' 
AND column_name = 'photo_url';


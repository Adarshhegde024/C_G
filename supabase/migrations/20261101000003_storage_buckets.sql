-- CloudGuard Supabase Migration 003: Storage Buckets & Policies
-- Description: Sets up private buckets for vault documents, evidence files, and biometric recordings.

-- Create private storage buckets if they do not exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('vault-documents', 'vault-documents', false, 52428800, NULL),
    ('evidence-files', 'evidence-files', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png']),
    ('biometrics', 'biometrics', false, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- STORAGE RLS POLICIES FOR storage.objects
-- ============================================================================

-- 1. Vault Documents Bucket Policies
-- Owners can read their own documents in storage
CREATE POLICY "Owners can access their vault storage files"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'vault-documents'
        AND (
            (storage.foldername(name))[1] = public.current_profile_id()::text
            OR EXISTS (
                -- Or trusted recipient when the document is released
                SELECT 1 FROM public.documents d
                JOIN public.recipients r ON d.assigned_recipient_id = r.id
                WHERE d.storage_path = name
                  AND d.release_status = 'RELEASED'
                  AND r.linked_user_id = public.current_profile_id()
            )
        )
    );

-- Owners can upload to their own folder in vault-documents
CREATE POLICY "Owners can upload vault storage files"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'vault-documents'
        AND (storage.foldername(name))[1] = public.current_profile_id()::text
    );

-- Owners can delete their own files
CREATE POLICY "Owners can delete their vault storage files"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'vault-documents'
        AND (storage.foldername(name))[1] = public.current_profile_id()::text
    );

-- 2. Evidence Files Bucket Policies
-- Nominees can upload evidence files for their cases
CREATE POLICY "Nominees can upload evidence files"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'evidence-files'
        AND auth.uid() IS NOT NULL
    );

-- Nominees and reviewers can read evidence files
CREATE POLICY "Nominees and reviewers can read evidence files"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'evidence-files'
        AND (
            public.is_reviewer()
            OR EXISTS (
                SELECT 1 FROM public.case_evidence e
                JOIN public.legacy_cases c ON e.case_id = c.id
                JOIN public.nominees n ON c.nominee_id = n.id
                WHERE e.storage_path = name
                  AND n.linked_user_id = public.current_profile_id()
            )
        )
    );

-- 3. Biometrics Bucket Policies
-- Users can upload check-in recordings to their own biometric folder
CREATE POLICY "Users can upload their biometric recordings"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'biometrics'
        AND (storage.foldername(name))[1] = public.current_profile_id()::text
    );

-- Users can read their own biometric recordings; reviewers can inspect during review
CREATE POLICY "Authorized access to biometric recordings"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'biometrics'
        AND (
            (storage.foldername(name))[1] = public.current_profile_id()::text
            OR public.is_reviewer()
        )
    );

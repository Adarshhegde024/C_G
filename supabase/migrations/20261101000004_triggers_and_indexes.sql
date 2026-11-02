-- CloudGuard Supabase Migration 004: Triggers, Performance Indexes & Auth Hook
-- Description: Automates updated_at timestamps, syncs auth.users to profiles, and creates performance indexes.

-- ============================================================================
-- 1. UPDATED_AT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS tr_profiles_updated_at ON public.profiles;
CREATE TRIGGER tr_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_documents_updated_at ON public.documents;
CREATE TRIGGER tr_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_recipients_updated_at ON public.recipients;
CREATE TRIGGER tr_recipients_updated_at
    BEFORE UPDATE ON public.recipients
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_nominees_updated_at ON public.nominees;
CREATE TRIGGER tr_nominees_updated_at
    BEFORE UPDATE ON public.nominees
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_legacy_cases_updated_at ON public.legacy_cases;
CREATE TRIGGER tr_legacy_cases_updated_at
    BEFORE UPDATE ON public.legacy_cases
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 2. AUTH USER SIGNUP HOOK
-- Automatically initializes a public.profiles record when a user signs up via Supabase Auth
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_full_name TEXT;
    user_role TEXT;
    user_dob DATE;
    user_phone TEXT;
    freq JSONB;
    grace JSONB;
BEGIN
    user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'owner');
    user_phone := NEW.raw_user_meta_data->>'phone';
    
    IF (NEW.raw_user_meta_data->>'date_of_birth') IS NOT NULL THEN
        BEGIN
            user_dob := (NEW.raw_user_meta_data->>'date_of_birth')::DATE;
        EXCEPTION WHEN OTHERS THEN
            user_dob := NULL;
        END;
    END IF;

    IF (NEW.raw_user_meta_data->'check_in_frequency') IS NOT NULL THEN
        freq := NEW.raw_user_meta_data->'check_in_frequency';
    ELSE
        freq := '{"value": 30, "unit": "days"}'::jsonb;
    END IF;

    IF (NEW.raw_user_meta_data->'grace_period') IS NOT NULL THEN
        grace := NEW.raw_user_meta_data->'grace_period';
    ELSE
        grace := '{"value": 72, "unit": "hours"}'::jsonb;
    END IF;

    INSERT INTO public.profiles (
        auth_user_id,
        email,
        full_name,
        phone,
        date_of_birth,
        role,
        check_in_frequency,
        grace_period,
        last_check_in_at,
        next_check_in_deadline
    ) VALUES (
        NEW.id,
        NEW.email,
        user_full_name,
        user_phone,
        user_dob,
        user_role,
        freq,
        grace,
        now(),
        now() + interval '30 days'
    )
    ON CONFLICT (email) DO UPDATE SET
        auth_user_id = EXCLUDED.auth_user_id,
        full_name = CASE WHEN profiles.full_name IS NULL OR profiles.full_name = '' THEN EXCLUDED.full_name ELSE profiles.full_name END,
        updated_at = now();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================================
-- 3. PERFORMANCE INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user_id ON public.profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_deadline ON public.profiles(next_check_in_deadline);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(account_status);

CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON public.documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_assigned_recipient ON public.documents(assigned_recipient_id);
CREATE INDEX IF NOT EXISTS idx_documents_release_status ON public.documents(release_status);

CREATE INDEX IF NOT EXISTS idx_recipients_owner ON public.recipients(owner_id);
CREATE INDEX IF NOT EXISTS idx_recipients_linked_user ON public.recipients(linked_user_id);
CREATE INDEX IF NOT EXISTS idx_recipients_token ON public.recipients(invitation_token);

CREATE INDEX IF NOT EXISTS idx_nominees_owner ON public.nominees(owner_id);
CREATE INDEX IF NOT EXISTS idx_nominees_linked_user ON public.nominees(linked_user_id);
CREATE INDEX IF NOT EXISTS idx_nominees_token ON public.nominees(invitation_token);

CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON public.check_in_records(user_id, check_in_time DESC);

CREATE INDEX IF NOT EXISTS idx_cases_owner ON public.legacy_cases(owner_id);
CREATE INDEX IF NOT EXISTS idx_cases_nominee ON public.legacy_cases(nominee_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.legacy_cases(status);

CREATE INDEX IF NOT EXISTS idx_case_evidence_case ON public.case_evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_case_reviews_case ON public.case_reviews(case_id);

CREATE INDEX IF NOT EXISTS idx_audit_user_time ON public.audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read, created_at DESC);

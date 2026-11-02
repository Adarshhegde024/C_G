-- ============================================================================
-- CloudGuard: Unified Supabase PostgreSQL Database Schema
-- Complete DDL, Row Level Security (RLS) Policies, Storage Buckets, and Triggers
-- ============================================================================

BEGIN;

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. CORE TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    date_of_birth DATE,
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'recipient', 'nominee', 'reviewer')),
    account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'GRACE_PERIOD', 'NOMINEE_CASE_ELIGIBLE', 'MEDICAL_HOLD', 'AWAITING_REVIEW', 'RELEASE_READY')),
    status_message TEXT,
    check_in_frequency JSONB NOT NULL DEFAULT '{"value": 30, "unit": "days"}'::jsonb,
    grace_period JSONB NOT NULL DEFAULT '{"value": 72, "unit": "hours"}'::jsonb,
    last_check_in_at TIMESTAMPTZ,
    next_check_in_deadline TIMESTAMPTZ,
    medical_hold JSONB DEFAULT '{"active": false, "start_date": null, "end_date": null}'::jsonb,
    face_encodings JSONB,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    linked_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
    invitation_token TEXT UNIQUE,
    invitation_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_owner_recipient_email UNIQUE (owner_id, email)
);

CREATE TABLE IF NOT EXISTS public.nominees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    linked_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
    invitation_token TEXT UNIQUE,
    invitation_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_recipient_id UUID REFERENCES public.recipients(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    size_bytes BIGINT DEFAULT 0,
    storage_path TEXT NOT NULL,
    encryption_status TEXT NOT NULL DEFAULT 'ENCRYPTED' CHECK (encryption_status IN ('PENDING', 'ENCRYPTED')),
    release_status TEXT NOT NULL DEFAULT 'NOT_RELEASED' CHECK (release_status IN ('NOT_RELEASED', 'RELEASED', 'PENDING', 'REVOKED')),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.check_in_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    result TEXT NOT NULL CHECK (result IN ('SUCCESS', 'FAILED')),
    face_match BOOLEAN,
    liveness BOOLEAN,
    voice_verified BOOLEAN,
    ip_address TEXT,
    device TEXT,
    reason TEXT,
    video_storage_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legacy_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    nominee_id UUID NOT NULL REFERENCES public.nominees(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ELIGIBLE' CHECK (status IN ('ELIGIBLE', 'EVIDENCE_SUBMITTED', 'AWAITING_REVIEW', 'MORE_INFO_REQUESTED', 'APPROVED', 'REJECTED')),
    note TEXT,
    ocr_result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.case_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.legacy_cases(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    size_bytes BIGINT DEFAULT 0,
    storage_path TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.case_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.legacy_cases(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('APPROVED', 'REJECTED', 'MORE_INFO_REQUESTED')),
    decision_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    description TEXT,
    result TEXT,
    ip_address TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_reviewer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid() AND role = 'reviewer'
    );
$$;

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nominees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth_user_id = auth.uid() OR public.is_reviewer());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth_user_id = auth.uid())
    WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Enable insert for authenticated users or service role" ON public.profiles;
CREATE POLICY "Enable insert for authenticated users or service role"
    ON public.profiles FOR INSERT
    WITH CHECK (auth_user_id = auth.uid() OR auth.uid() IS NULL);

-- Recipients Policies
DROP POLICY IF EXISTS "Owners can manage their recipients" ON public.recipients;
CREATE POLICY "Owners can manage their recipients"
    ON public.recipients FOR ALL
    USING (owner_id = public.current_profile_id());

DROP POLICY IF EXISTS "Linked recipients can view their recipient status" ON public.recipients;
CREATE POLICY "Linked recipients can view their recipient status"
    ON public.recipients FOR SELECT
    USING (linked_user_id = public.current_profile_id());

-- Nominees Policies
DROP POLICY IF EXISTS "Owners can manage their nominee" ON public.nominees;
CREATE POLICY "Owners can manage their nominee"
    ON public.nominees FOR ALL
    USING (owner_id = public.current_profile_id());

DROP POLICY IF EXISTS "Linked nominees can view their status" ON public.nominees;
CREATE POLICY "Linked nominees can view their status"
    ON public.nominees FOR SELECT
    USING (linked_user_id = public.current_profile_id());

-- Documents Policies
DROP POLICY IF EXISTS "Owners can manage their documents" ON public.documents;
CREATE POLICY "Owners can manage their documents"
    ON public.documents FOR ALL
    USING (owner_id = public.current_profile_id());

DROP POLICY IF EXISTS "Recipients can view released documents" ON public.documents;
CREATE POLICY "Recipients can view released documents"
    ON public.documents FOR SELECT
    USING (
        release_status = 'RELEASED'
        AND assigned_recipient_id IN (
            SELECT id FROM public.recipients
            WHERE linked_user_id = public.current_profile_id()
        )
    );

-- Check-in Records Policies
DROP POLICY IF EXISTS "Users can view their check-in records" ON public.check_in_records;
CREATE POLICY "Users can view their check-in records"
    ON public.check_in_records FOR SELECT
    USING (user_id = public.current_profile_id());

DROP POLICY IF EXISTS "Users can create check-in records" ON public.check_in_records;
CREATE POLICY "Users can create check-in records"
    ON public.check_in_records FOR INSERT
    WITH CHECK (user_id = public.current_profile_id());

-- Legacy Cases Policies
DROP POLICY IF EXISTS "Owners can view their legacy cases" ON public.legacy_cases;
CREATE POLICY "Owners can view their legacy cases"
    ON public.legacy_cases FOR SELECT
    USING (owner_id = public.current_profile_id());

DROP POLICY IF EXISTS "Nominees can view their assigned cases" ON public.legacy_cases;
CREATE POLICY "Nominees can view their assigned cases"
    ON public.legacy_cases FOR SELECT
    USING (
        nominee_id IN (
            SELECT id FROM public.nominees
            WHERE linked_user_id = public.current_profile_id()
        )
    );

DROP POLICY IF EXISTS "Nominees can update eligible cases" ON public.legacy_cases;
CREATE POLICY "Nominees can update eligible cases"
    ON public.legacy_cases FOR UPDATE
    USING (
        nominee_id IN (
            SELECT id FROM public.nominees
            WHERE linked_user_id = public.current_profile_id()
        )
        AND status IN ('ELIGIBLE', 'MORE_INFO_REQUESTED')
    );

DROP POLICY IF EXISTS "Reviewers can view all legacy cases" ON public.legacy_cases;
CREATE POLICY "Reviewers can view all legacy cases"
    ON public.legacy_cases FOR SELECT
    USING (public.is_reviewer());

DROP POLICY IF EXISTS "Reviewers can update legacy cases" ON public.legacy_cases;
CREATE POLICY "Reviewers can update legacy cases"
    ON public.legacy_cases FOR UPDATE
    USING (public.is_reviewer());

-- Case Evidence Policies
DROP POLICY IF EXISTS "Nominees can view evidence for their cases" ON public.case_evidence;
CREATE POLICY "Nominees can view evidence for their cases"
    ON public.case_evidence FOR SELECT
    USING (
        case_id IN (
            SELECT c.id FROM public.legacy_cases c
            JOIN public.nominees n ON c.nominee_id = n.id
            WHERE n.linked_user_id = public.current_profile_id()
        )
        OR public.is_reviewer()
    );

DROP POLICY IF EXISTS "Nominees can upload evidence for active cases" ON public.case_evidence;
CREATE POLICY "Nominees can upload evidence for active cases"
    ON public.case_evidence FOR INSERT
    WITH CHECK (
        case_id IN (
            SELECT c.id FROM public.legacy_cases c
            JOIN public.nominees n ON c.nominee_id = n.id
            WHERE n.linked_user_id = public.current_profile_id()
              AND c.status IN ('ELIGIBLE', 'MORE_INFO_REQUESTED')
        )
    );

-- Case Reviews Policies
DROP POLICY IF EXISTS "Reviewers can view and create reviews" ON public.case_reviews;
CREATE POLICY "Reviewers can view and create reviews"
    ON public.case_reviews FOR ALL
    USING (public.is_reviewer());

-- Audit Logs Policies
DROP POLICY IF EXISTS "Users can view their audit logs" ON public.audit_logs;
CREATE POLICY "Users can view their audit logs"
    ON public.audit_logs FOR SELECT
    USING (user_id = public.current_profile_id() OR public.is_reviewer());

DROP POLICY IF EXISTS "Users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert audit logs"
    ON public.audit_logs FOR INSERT
    WITH CHECK (user_id = public.current_profile_id() OR auth.uid() IS NULL);

-- Notifications Policies
DROP POLICY IF EXISTS "Users can view and update their notifications" ON public.notifications;
CREATE POLICY "Users can view and update their notifications"
    ON public.notifications FOR ALL
    USING (user_id = public.current_profile_id());

-- ============================================================================
-- 4. STORAGE BUCKETS
-- ============================================================================

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
-- 5. TRIGGERS & HOOKS
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

DROP TRIGGER IF EXISTS tr_profiles_updated_at ON public.profiles;
CREATE TRIGGER tr_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_documents_updated_at ON public.documents;
CREATE TRIGGER tr_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_recipients_updated_at ON public.recipients;
CREATE TRIGGER tr_recipients_updated_at BEFORE UPDATE ON public.recipients FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_nominees_updated_at ON public.nominees;
CREATE TRIGGER tr_nominees_updated_at BEFORE UPDATE ON public.nominees FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_legacy_cases_updated_at ON public.legacy_cases;
CREATE TRIGGER tr_legacy_cases_updated_at BEFORE UPDATE ON public.legacy_cases FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-sync auth.users to public.profiles
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
-- 6. PERFORMANCE INDEXES
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

COMMIT;

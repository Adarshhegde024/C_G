-- CloudGuard Supabase Migration 001: Initial Schema
-- Description: Core tables for profiles, documents, recipients, nominees, check-ins, cases, evidence, audit logs, and notifications.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES TABLE
-- Extends auth.users to store CloudGuard vault user information, settings, and status.
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
    face_encodings JSONB, -- Stores reference face embeddings/templates securely
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. RECIPIENTS TABLE
-- Trusted individuals assigned to receive specific documents upon vault release.
-- ============================================================================
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

-- ============================================================================
-- 3. NOMINEES TABLE
-- The single trusted person configured by a vault owner to participate in legacy verification.
-- ============================================================================
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

-- ============================================================================
-- 4. DOCUMENTS TABLE
-- Encrypted vault documents uploaded by owners, optionally assigned to trusted recipients.
-- ============================================================================
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

-- ============================================================================
-- 5. CHECK_IN_RECORDS TABLE
-- Verification history of biometric check-in attempts.
-- ============================================================================
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

-- ============================================================================
-- 6. LEGACY_CASES TABLE
-- Verification case opened when a vault owner has missed check-ins beyond the grace period.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.legacy_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    nominee_id UUID NOT NULL REFERENCES public.nominees(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ELIGIBLE' CHECK (status IN ('ELIGIBLE', 'EVIDENCE_SUBMITTED', 'AWAITING_REVIEW', 'MORE_INFO_REQUESTED', 'APPROVED', 'REJECTED')),
    note TEXT,
    ocr_result JSONB, -- Stores { name_match, dob_match, confidence, discrepancies }
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 7. CASE_EVIDENCE TABLE
-- Document evidence (e.g. death certificate, court order) uploaded by nominees.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.case_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.legacy_cases(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    size_bytes BIGINT DEFAULT 0,
    storage_path TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 8. CASE_REVIEWS TABLE
-- Auditable record of human reviewer decisions and notes.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.case_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.legacy_cases(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('APPROVED', 'REJECTED', 'MORE_INFO_REQUESTED')),
    decision_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 9. AUDIT_LOGS TABLE
-- Append-only system security and user activity trail.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    description TEXT,
    result TEXT,
    ip_address TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 10. NOTIFICATIONS TABLE
-- In-app notifications delivered to users.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CloudGuard Supabase Migration 002: Row Level Security (RLS) & Access Policies
-- Description: Enables RLS on all tables and enforces strict role-based data isolation.

-- ============================================================================
-- HELPER FUNCTIONS FOR RLS EVALUATION
-- ============================================================================

-- Returns the profile id of the currently authenticated Supabase user
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Returns true if current user has the 'reviewer' role
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
-- ENABLE RLS ON ALL TABLES
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

-- ============================================================================
-- 1. PROFILES POLICIES
-- ============================================================================
-- Users can view their own profile
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth_user_id = auth.uid() OR public.is_reviewer());

-- Users can update specific mutable fields on their own profile
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth_user_id = auth.uid())
    WITH CHECK (auth_user_id = auth.uid());

-- Service role or trigger can insert profiles upon signup
CREATE POLICY "Enable insert for authenticated users or service role"
    ON public.profiles FOR INSERT
    WITH CHECK (auth_user_id = auth.uid() OR auth.uid() IS NULL);

-- ============================================================================
-- 2. RECIPIENTS POLICIES
-- ============================================================================
-- Vault owners can manage (select, insert, update, delete) their recipients
CREATE POLICY "Owners can manage their recipients"
    ON public.recipients FOR ALL
    USING (owner_id = public.current_profile_id());

-- Linked recipients can view recipient entries assigned to their email/profile
CREATE POLICY "Linked recipients can view their recipient status"
    ON public.recipients FOR SELECT
    USING (linked_user_id = public.current_profile_id());

-- ============================================================================
-- 3. NOMINEES POLICIES
-- ============================================================================
-- Vault owners can manage their nominee
CREATE POLICY "Owners can manage their nominee"
    ON public.nominees FOR ALL
    USING (owner_id = public.current_profile_id());

-- Linked nominee can view their nominee record
CREATE POLICY "Linked nominees can view their status"
    ON public.nominees FOR SELECT
    USING (linked_user_id = public.current_profile_id());

-- ============================================================================
-- 4. DOCUMENTS POLICIES
-- ============================================================================
-- Owners have full access to their uploaded documents
CREATE POLICY "Owners can manage their documents"
    ON public.documents FOR ALL
    USING (owner_id = public.current_profile_id());

-- Recipients can ONLY read documents that:
-- 1. Have release_status = 'RELEASED'
-- 2. Are assigned to their linked recipient record
CREATE POLICY "Recipients can view released documents"
    ON public.documents FOR SELECT
    USING (
        release_status = 'RELEASED'
        AND assigned_recipient_id IN (
            SELECT id FROM public.recipients
            WHERE linked_user_id = public.current_profile_id()
        )
    );

-- ============================================================================
-- 5. CHECK_IN_RECORDS POLICIES
-- ============================================================================
-- Users can view their own check-in records
CREATE POLICY "Users can view their check-in records"
    ON public.check_in_records FOR SELECT
    USING (user_id = public.current_profile_id());

-- Users can insert check-in records for themselves
CREATE POLICY "Users can create check-in records"
    ON public.check_in_records FOR INSERT
    WITH CHECK (user_id = public.current_profile_id());

-- ============================================================================
-- 6. LEGACY_CASES POLICIES
-- ============================================================================
-- Vault owners can view legacy cases concerning their vault
CREATE POLICY "Owners can view their legacy cases"
    ON public.legacy_cases FOR SELECT
    USING (owner_id = public.current_profile_id());

-- Nominees can view cases they are nominated for
CREATE POLICY "Nominees can view their assigned cases"
    ON public.legacy_cases FOR SELECT
    USING (
        nominee_id IN (
            SELECT id FROM public.nominees
            WHERE linked_user_id = public.current_profile_id()
        )
    );

-- Nominees can update case notes/evidence status when case is ELIGIBLE or MORE_INFO_REQUESTED
CREATE POLICY "Nominees can update eligible cases"
    ON public.legacy_cases FOR UPDATE
    USING (
        nominee_id IN (
            SELECT id FROM public.nominees
            WHERE linked_user_id = public.current_profile_id()
        )
        AND status IN ('ELIGIBLE', 'MORE_INFO_REQUESTED')
    );

-- Reviewers have full read and update access to cases
CREATE POLICY "Reviewers can view all legacy cases"
    ON public.legacy_cases FOR SELECT
    USING (public.is_reviewer());

CREATE POLICY "Reviewers can update legacy cases"
    ON public.legacy_cases FOR UPDATE
    USING (public.is_reviewer());

-- ============================================================================
-- 7. CASE_EVIDENCE POLICIES
-- ============================================================================
-- Nominees can view and upload evidence for their cases
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

-- ============================================================================
-- 8. CASE_REVIEWS POLICIES
-- ============================================================================
CREATE POLICY "Reviewers can view and create reviews"
    ON public.case_reviews FOR ALL
    USING (public.is_reviewer());

-- ============================================================================
-- 9. AUDIT_LOGS POLICIES
-- ============================================================================
-- Users can view their own audit logs
CREATE POLICY "Users can view their audit logs"
    ON public.audit_logs FOR SELECT
    USING (user_id = public.current_profile_id() OR public.is_reviewer());

-- Inserts are allowed for the user or system triggers
CREATE POLICY "Users can insert audit logs"
    ON public.audit_logs FOR INSERT
    WITH CHECK (user_id = public.current_profile_id() OR auth.uid() IS NULL);

-- ============================================================================
-- 10. NOTIFICATIONS POLICIES
-- ============================================================================
-- Users can view and update their notifications
CREATE POLICY "Users can view and update their notifications"
    ON public.notifications FOR ALL
    USING (user_id = public.current_profile_id());

// CloudGuard shared types. These describe the REST contract the FastAPI
// backend is expected to expose; the API layer keeps integration isolated so
// endpoint changes never ripple into UI components.

export type Role = "owner" | "recipient" | "nominee" | "reviewer";

export type AccountStatus =
  | "ACTIVE"
  | "GRACE_PERIOD"
  | "NOMINEE_CASE_ELIGIBLE"
  | "MEDICAL_HOLD"
  | "AWAITING_REVIEW"
  | "RELEASE_READY"
  | (string & {});

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  account_status?: AccountStatus;
  avatar_url?: string | null;
}

export interface DurationValue {
  value: number;
  unit: "seconds" | "minutes" | "hours" | "days";
}

export interface DashboardSummary {
  full_name?: string;
  account_status: AccountStatus;
  status_message?: string;
  last_check_in_at?: string | null;
  next_check_in_deadline?: string | null;
  check_in_frequency?: DurationValue;
  grace_period?: DurationValue;
  time_remaining?: string | null;
  documents_stored?: number;
  recipients_count?: number;
  nominee_status?: string | null;
  medical_hold?: {
    active: boolean;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
}

export interface VaultDocument {
  id: string;
  name: string;
  file_type: string;
  size_bytes?: number;
  uploaded_at: string;
  encryption_status?: "ENCRYPTED" | "PENDING" | (string & {});
  assigned_recipient?: { id: string; name: string } | null;
  release_status?: "NOT_RELEASED" | "RELEASED" | "PENDING" | "REVOKED" | (string & {});
}

export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED" | (string & {});

export interface Recipient {
  id: string;
  name: string;
  email: string;
  status: InvitationStatus;
  assigned_documents?: number;
  invitation_status?: InvitationStatus;
}

export interface Nominee {
  id?: string;
  name: string;
  email: string;
  status: InvitationStatus | (string & {});
}

export interface CheckInRecord {
  id: string;
  date: string;
  time: string;
  result: "SUCCESS" | "FAILED" | (string & {});
  face_match?: boolean | null;
  liveness?: boolean | null;
  voice_verified?: boolean | null;
  ip_address?: string | null;
  device?: string | null;
  reason?: string | null;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  event: string;
  description?: string;
  result?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body?: string;
  created_at: string;
  read?: boolean;
}

export interface OcrResult {
  name_match?: boolean | null;
  dob_match?: boolean | null;
  confidence?: number | null;
  discrepancies?: string[];
}

export interface NomineeCase {
  id: string;
  status: string;
  created_at?: string;
  owner_name?: string;
  nominee_name?: string;
  note?: string | null;
  evidence?: Array<{
    id: string;
    file_name: string;
    file_type: string;
    uploaded_at: string;
  }>;
  ocr?: OcrResult | null;
  audit_history?: Array<{ timestamp: string; event: string; description?: string }>;
}

export interface ReviewerCase {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "MORE_INFO_REQUESTED" | (string & {});
  created_at?: string;
  owner_name?: string;
  owner_email?: string;
  owner_dob?: string | null;
  nominee_name?: string;
  nominee_email?: string;
  note?: string | null;
  evidence?: NomineeCase["evidence"];
  ocr?: OcrResult | null;
  audit_history?: NomineeCase["audit_history"];
}

export interface InvitationDetails {
  email?: string;
  inviter_name?: string;
  role?: Role;
  vault_owner?: string;
  status?: InvitationStatus;
  expires_at?: string | null;
}

export interface RegisterPayload {
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  password: string;
  check_in_frequency: DurationValue;
  grace_period: DurationValue;
  face_samples: string[];
}

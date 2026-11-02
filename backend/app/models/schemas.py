"""
CloudGuard Pydantic Models & Schemas
Directly maps to the REST contract defined in frontend src/types/index.ts.
"""

from typing import List, Optional, Literal, Union, Dict, Any
from pydantic import BaseModel, EmailStr, Field

# Common Types
Role = Literal["owner", "recipient", "nominee", "reviewer"]

AccountStatus = Literal[
    "ACTIVE",
    "GRACE_PERIOD",
    "NOMINEE_CASE_ELIGIBLE",
    "MEDICAL_HOLD",
    "AWAITING_REVIEW",
    "RELEASE_READY",
]

InvitationStatus = Literal["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]

DurationUnit = Literal["seconds", "minutes", "hours", "days"]


class DurationValue(BaseModel):
    value: int = Field(ge=1, default=30)
    unit: DurationUnit = "days"


class AuthUser(BaseModel):
    id: str
    name: str
    email: str
    role: Role
    account_status: Optional[str] = "ACTIVE"
    avatar_url: Optional[str] = None


class AuthResponse(BaseModel):
    token: Optional[str] = None
    access_token: Optional[str] = None
    user: Optional[AuthUser] = None


class RegisterPayload(BaseModel):
    full_name: str
    email: str
    phone: str
    date_of_birth: str
    password: str
    check_in_frequency: DurationValue
    grace_period: DurationValue
    face_samples: List[str] = []


class LoginPayload(BaseModel):
    email: str
    password: str


class GoogleAuthPayload(BaseModel):
    code: str


class ForgotPasswordPayload(BaseModel):
    email: str


class ResetPasswordPayload(BaseModel):
    token: str
    password: str


class MedicalHold(BaseModel):
    active: bool = False
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    note: Optional[str] = None


class MedicalHoldTogglePayload(BaseModel):
    active: bool
    note: Optional[str] = None


class MedicalHoldResponse(BaseModel):
    active: bool
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    note: Optional[str] = None
    account_status: str
    message: str


class DashboardSummary(BaseModel):
    full_name: Optional[str] = None
    account_status: str = "ACTIVE"
    status_message: Optional[str] = None
    last_check_in_at: Optional[str] = None
    next_check_in_deadline: Optional[str] = None
    check_in_frequency: Optional[DurationValue] = None
    grace_period: Optional[DurationValue] = None
    time_remaining: Optional[str] = None
    documents_stored: Optional[int] = 0
    recipients_count: Optional[int] = 0
    nominee_status: Optional[str] = None
    medical_hold: Optional[MedicalHold] = None


class RecipientRef(BaseModel):
    id: str
    name: str


class VaultDocument(BaseModel):
    id: str
    name: str
    file_type: str
    size_bytes: Optional[int] = 0
    uploaded_at: str
    encryption_status: Optional[str] = "ENCRYPTED"
    assigned_recipient: Optional[RecipientRef] = None
    release_status: Optional[str] = "NOT_RELEASED"


class AssignRecipientPayload(BaseModel):
    recipient_id: Optional[str] = None


class Recipient(BaseModel):
    id: str
    name: str
    email: str
    status: str = "PENDING"
    assigned_documents: Optional[int] = 0
    invitation_status: Optional[str] = None


class AddRecipientPayload(BaseModel):
    name: str
    email: str


class UpdateRecipientPayload(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None


class Nominee(BaseModel):
    id: Optional[str] = None
    name: str
    email: str
    status: str = "PENDING"


class SaveNomineePayload(BaseModel):
    name: str
    email: str


class CheckInRecord(BaseModel):
    id: str
    date: str
    time: str
    result: str
    face_match: Optional[bool] = None
    liveness: Optional[bool] = None
    voice_verified: Optional[bool] = None
    ip_address: Optional[str] = None
    device: Optional[str] = None
    reason: Optional[str] = None


class SubmitCheckInResult(BaseModel):
    result: str
    reason: Optional[str] = None
    message: Optional[str] = None


class AuditEvent(BaseModel):
    id: str
    timestamp: str
    event: str
    description: Optional[str] = None
    result: Optional[str] = None


class AppNotification(BaseModel):
    id: str
    title: str
    body: Optional[str] = None
    created_at: str
    read: Optional[bool] = False


class OcrResult(BaseModel):
    name_match: Optional[bool] = None
    dob_match: Optional[bool] = None
    confidence: Optional[float] = None
    discrepancies: Optional[List[str]] = []


class EvidenceItem(BaseModel):
    id: str
    file_name: str
    file_type: str
    category: Optional[str] = "DEATH_CERTIFICATE"
    document_number: Optional[str] = None
    issuing_authority: Optional[str] = None
    uploaded_at: str
    size_bytes: Optional[int] = None
    download_url: Optional[str] = None


class InitiateClaimPayload(BaseModel):
    claim_reason: str
    incident_date: Optional[str] = None
    jurisdiction: Optional[str] = None
    note: Optional[str] = None
    declaration_confirmed: bool = True


class NomineeCase(BaseModel):
    id: str
    status: str
    created_at: Optional[str] = None
    owner_name: Optional[str] = None
    nominee_name: Optional[str] = None
    claim_reason: Optional[str] = None
    incident_date: Optional[str] = None
    jurisdiction: Optional[str] = None
    declaration_confirmed: Optional[bool] = False
    note: Optional[str] = None
    evidence: Optional[List[EvidenceItem]] = []
    ocr: Optional[OcrResult] = None
    audit_history: Optional[List[Dict[str, Any]]] = []


class ReviewerCase(BaseModel):
    id: str
    status: str
    created_at: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    owner_dob: Optional[str] = None
    nominee_name: Optional[str] = None
    nominee_email: Optional[str] = None
    claim_reason: Optional[str] = None
    incident_date: Optional[str] = None
    jurisdiction: Optional[str] = None
    declaration_confirmed: Optional[bool] = False
    note: Optional[str] = None
    evidence: Optional[List[EvidenceItem]] = []
    ocr: Optional[OcrResult] = None
    audit_history: Optional[List[Dict[str, Any]]] = []


class ReviewActionPayload(BaseModel):
    note: Optional[str] = None


class ProfileDetails(BaseModel):
    full_name: str
    email: str
    phone: str
    date_of_birth: str
    created_at: str
    account_status: str


class UpdateProfilePayload(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None


class UpdateSecuritySettingsPayload(BaseModel):
    check_in_frequency: Optional[DurationValue] = None
    grace_period: Optional[DurationValue] = None


class SecuritySettingsResponse(BaseModel):
    check_in_frequency: DurationValue
    grace_period: DurationValue


class InvitationDetails(BaseModel):
    email: Optional[str] = None
    inviter_name: Optional[str] = None
    role: Optional[str] = None
    vault_owner: Optional[str] = None
    status: Optional[str] = None
    expires_at: Optional[str] = None


class AcceptInvitationPayload(BaseModel):
    password: Optional[str] = None

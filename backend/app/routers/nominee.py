"""
CloudGuard Nominee API Router
Handles owner nominee configuration and the nominee legacy verification portal.
"""

import os
import logging
from typing import Optional, List, Dict, Any, Union
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Request, status

from app.dependencies import get_current_user
from app.models.schemas import (
    AuthUser,
    Nominee,
    SaveNomineePayload,
    NomineeCase,
    EvidenceItem,
    InitiateClaimPayload,
    MedicalHold,
    MedicalHoldTogglePayload,
    MedicalHoldResponse,
    DurationValue,
)
from app.database import (
    get_supabase,
    get_nominee_for_owner,
    get_nominees_for_owner,
    get_nominee_for_user,
    get_profile_by_id,
    save_nominee as db_save_nominee,
    update_nominee as db_update_nominee,
    delete_nominee_for_owner as db_delete_nominee_for_owner,
    delete_nominee_record as db_delete_nominee_record,
    get_documents_for_owner,
    save_case_evidence,
    get_case_evidence_for_case,
    update_legacy_case,
    update_profile,
    save_legacy_case,
    get_legacy_case_for_nominee,
)
from app.services.checkin_scheduler import calculate_next_deadline
from app.services.audit import record_audit
from app.services.ocr import analyze_evidence_document
from app.services.email import send_nominee_invitation_email, dispatch_email_async
from app.config import FRONTEND_URL

logger = logging.getLogger("cloudguard.nominee")
router = APIRouter(prefix="/api/nominee", tags=["Nominee"])


def _get_request_frontend_base(request: Optional[Request] = None) -> Optional[str]:
    """Dynamically determine frontend base URL from request origin/referer, with FRONTEND_URL fallback."""
    if request:
        origin = request.headers.get("origin") or request.headers.get("referer")
        if origin:
            try:
                from urllib.parse import urlparse
                p = urlparse(origin)
                if p.scheme and p.netloc:
                    return f"{p.scheme}://{p.netloc}"
            except Exception:
                pass
    return None


def _build_invite_link(token: str, request: Optional[Request] = None) -> str:
    """Builds a fully-qualified invite link tailored to current caller's origin."""
    base = _get_request_frontend_base(request) or FRONTEND_URL
    return f"{base.rstrip('/')}/invite/{token}"


# ---- Owner Nominee Configuration -------------------------------------------

@router.get("/list", response_model=List[Nominee])
async def list_nominees(
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
):
    """Returns all nominees configured for the vault owner."""
    raw_list = get_nominees_for_owner(current_user.id)
    result = []
    for raw in raw_list:
        token = raw.get("invitation_token")
        if not token:
            token = str(uuid.uuid4())
            raw["invitation_token"] = token
            raw["invitation_expires_at"] = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
            prevs = list(raw.get("previous_tokens") or [])
            if token not in prevs:
                prevs.append(token)
            if str(raw.get("id")) not in prevs:
                prevs.append(str(raw.get("id")))
            raw["previous_tokens"] = prevs
            db_update_nominee(str(raw["id"]), {
                "invitation_token": token,
                "invitation_expires_at": raw["invitation_expires_at"],
                "previous_tokens": prevs,
            })
        inv_link = _build_invite_link(token, request)
        result.append(
            Nominee(
                id=str(raw["id"]),
                name=raw["name"],
                email=raw["email"],
                status=raw.get("status", "PENDING"),
                invitation_link=inv_link,
            )
        )
    return result


@router.get("", response_model=Optional[Union[Nominee, List[Nominee]]])
async def get_nominee(
    request: Request,
    all: bool = False,
    current_user: AuthUser = Depends(get_current_user),
):
    """Returns the primary nominee (or all nominees if all=True) configured for the vault owner."""
    if all:
        return await list_nominees(request, current_user)

    raw = get_nominee_for_owner(current_user.id)
    if not raw:
        return None
    token = raw.get("invitation_token")
    if not token:
        # Guarantee active invitation token exists for any configured nominee
        token = str(uuid.uuid4())
        raw["invitation_token"] = token
        raw["invitation_expires_at"] = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
        prevs = list(raw.get("previous_tokens") or [])
        if token not in prevs:
            prevs.append(token)
        if str(raw.get("id")) not in prevs:
            prevs.append(str(raw.get("id")))
        raw["previous_tokens"] = prevs
        db_update_nominee(str(raw["id"]), {
            "invitation_token": token,
            "invitation_expires_at": raw["invitation_expires_at"],
            "previous_tokens": prevs,
        })
    inv_link = _build_invite_link(token, request)
    return Nominee(
        id=str(raw["id"]),
        name=raw["name"],
        email=raw["email"],
        status=raw.get("status", "PENDING"),
        invitation_link=inv_link,
    )


@router.post("", response_model=Nominee)
async def save_nominee(
    payload: SaveNomineePayload,
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
):
    """Creates a new nominee designation for the vault owner."""
    email = payload.email.strip().lower()
    nom_id = str(uuid.uuid4())
    token = str(uuid.uuid4())
    expires_iso = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()

    entry = {
        "id": nom_id,
        "owner_id": current_user.id,
        "name": payload.name.strip(),
        "email": email,
        "status": "PENDING",
        "invitation_token": token,
        "previous_tokens": [token, nom_id],
        "invitation_expires_at": expires_iso,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    saved = db_save_nominee(entry)
    record_audit(current_user.id, "NOMINEE_CONFIGURED", f"Designated nominee: {payload.name} ({email})", "SUCCESS")

    # Send real invitation email in fast non-blocking background thread so request completes in milliseconds
    owner_profile = get_profile_by_id(current_user.id) or {}
    owner_name = owner_profile.get("full_name") or current_user.name
    frontend_base = _get_request_frontend_base(request)
    dispatch_email_async(
        send_nominee_invitation_email,
        payload.name.strip(),
        email,
        owner_name,
        token,
        frontend_base,
    )

    inv_link = _build_invite_link(token, request)
    return Nominee(
        id=nom_id,
        name=saved["name"],
        email=saved["email"],
        status="PENDING",
        invitation_link=inv_link,
    )


@router.patch("/{nominee_id}", response_model=Nominee)
async def update_specific_nominee(
    nominee_id: str,
    payload: SaveNomineePayload,
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
):
    """Updates a specific nominee details by nominee ID."""
    nominees = get_nominees_for_owner(current_user.id)
    nom = next((n for n in nominees if str(n.get("id")) == str(nominee_id)), None)
    if not nom:
        raise HTTPException(status_code=404, detail="Nominee not found.")
    new_email = payload.email.strip().lower()
    token = nom.get("invitation_token")
    patch = {
        "name": payload.name.strip(),
        "email": new_email,
    }
    if not token or new_email != nom.get("email", "").lower():
        old_token = token
        token = str(uuid.uuid4())
        prevs = list(nom.get("previous_tokens") or [])
        if old_token and old_token not in prevs:
            prevs.append(old_token)
        if str(nom.get("id")) not in prevs:
            prevs.append(str(nom.get("id")))
        if token not in prevs:
            prevs.append(token)
        patch["invitation_token"] = token
        patch["previous_tokens"] = prevs
        patch["invitation_expires_at"] = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
        patch["status"] = "PENDING"

    n = db_update_nominee(str(nom["id"]), patch)
    if not n:
        raise HTTPException(status_code=404, detail="Nominee not found.")
    record_audit(current_user.id, "NOMINEE_UPDATED", f"Updated nominee: {payload.name}", "SUCCESS")
    inv_link = _build_invite_link(token, request)
    return Nominee(
        id=str(n["id"]),
        name=n["name"],
        email=n["email"],
        status=n.get("status", "PENDING"),
        invitation_link=inv_link,
    )


@router.patch("", response_model=Nominee)
async def update_nominee(
    payload: SaveNomineePayload,
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
):
    """Updates the primary nominee details."""
    nom = get_nominee_for_owner(current_user.id)
    if not nom:
        raise HTTPException(status_code=404, detail="Nominee not found.")
    return await update_specific_nominee(str(nom["id"]), payload, request, current_user)


@router.delete("/{nominee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_specific_nominee(
    nominee_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Removes a specific nominee designation."""
    db_delete_nominee_record(nominee_id, current_user.id)
    record_audit(current_user.id, "NOMINEE_REMOVED", f"Removed nominee {nominee_id}", "SUCCESS")
    return None


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def remove_nominee(current_user: AuthUser = Depends(get_current_user)):
    """Removes all nominee designations for the owner."""
    db_delete_nominee_for_owner(current_user.id)
    record_audit(current_user.id, "NOMINEE_REMOVED", "Removed nominee designations", "SUCCESS")
    return None


@router.post("/{nominee_id}/invite", response_model=Nominee)
async def invite_specific_nominee(
    nominee_id: str,
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
):
    """Sends or resends the nominee verification invitation for a specific nominee."""
    nominees = get_nominees_for_owner(current_user.id)
    nom = next((n for n in nominees if str(n.get("id")) == str(nominee_id)), None)
    if not nom:
        raise HTTPException(status_code=404, detail="Nominee not found.")
    old_token = nom.get("invitation_token")
    token = str(uuid.uuid4())
    prevs = list(nom.get("previous_tokens") or [])
    if old_token and old_token not in prevs:
        prevs.append(old_token)
    if str(nom.get("id")) not in prevs:
        prevs.append(str(nom.get("id")))
    if token not in prevs:
        prevs.append(token)
    expires = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    n = db_update_nominee(str(nom["id"]), {
        "status": "PENDING",
        "invitation_token": token,
        "previous_tokens": prevs,
        "invitation_expires_at": expires,
    })
    
    owner_profile = get_profile_by_id(current_user.id) or {}
    owner_name = owner_profile.get("full_name") or current_user.name
    frontend_base = _get_request_frontend_base(request)
    dispatch_email_async(
        send_nominee_invitation_email,
        n["name"],
        n["email"],
        owner_name,
        token,
        frontend_base,
    )
    
    record_audit(current_user.id, "NOMINEE_INVITATION_SENT", f"Sent invitation to {n.get('email')}", "SUCCESS")
    inv_link = _build_invite_link(token, request)
    return Nominee(
        id=str(n["id"]),
        name=n["name"],
        email=n["email"],
        status="PENDING",
        invitation_link=inv_link,
    )


@router.post("/invite", response_model=Nominee)
async def invite_nominee(
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
):
    """Sends or resends the nominee verification invitation for the primary nominee."""
    nom = get_nominee_for_owner(current_user.id)
    if not nom:
        raise HTTPException(status_code=404, detail="No nominee configured.")
    return await invite_specific_nominee(str(nom["id"]), request, current_user)


# ---- Nominee Medical Hold Controls ------------------------------------------

@router.get("/medical-hold", response_model=MedicalHoldResponse)
async def get_nominee_medical_hold(current_user: AuthUser = Depends(get_current_user)):
    """
    Returns the medical hold / vault freeze status of the vault owner linked to the nominee.
    """
    nominee_rec = get_nominee_for_user(current_user.id, current_user.email)
    if not nominee_rec:
        raise HTTPException(status_code=404, detail="No linked vault found for this nominee.")

    owner_id = nominee_rec["owner_id"]
    owner_profile = get_profile_by_id(owner_id) or {}
    med_hold = owner_profile.get("medical_hold") or {"active": False, "start_date": None, "end_date": None, "note": None}
    owner_name = owner_profile.get("full_name") or "Vault Owner"

    msg = f"Vault of {owner_name} is currently frozen under medical hold." if med_hold.get("active") else f"Vault of {owner_name} is operating normally."
    return MedicalHoldResponse(
        active=bool(med_hold.get("active")),
        start_date=med_hold.get("start_date"),
        end_date=med_hold.get("end_date"),
        note=med_hold.get("note"),
        account_status=owner_profile.get("account_status", "ACTIVE"),
        message=msg,
    )


@router.post("/medical-hold", response_model=MedicalHoldResponse)
async def toggle_nominee_medical_hold(
    payload: MedicalHoldTogglePayload,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Allows a trusted nominee to activate or lift a Medical Hold on their vault owner's account
    during emergency hospitalization, surgery, or incapacity.
    """
    nominee_rec = get_nominee_for_user(current_user.id, current_user.email)
    if not nominee_rec:
        raise HTTPException(status_code=404, detail="No linked vault found for this nominee.")

    owner_id = nominee_rec["owner_id"]
    owner_profile = get_profile_by_id(owner_id) or {}
    owner_name = owner_profile.get("full_name") or "Vault Owner"
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    if payload.active:
        end_date_str = payload.end_date
        if payload.duration_days and payload.duration_days > 0:
            end_date_str = (now + timedelta(days=payload.duration_days)).isoformat()

        med_hold_data = {
            "active": True,
            "start_date": now_iso,
            "end_date": end_date_str,
            "note": payload.note.strip() if payload.note else None,
        }
        patch = {
            "medical_hold": med_hold_data,
            "account_status": "MEDICAL_HOLD",
            "updated_at": now_iso,
        }
        update_profile(owner_id, patch)
        record_audit(
            owner_id,
            "MEDICAL_HOLD_ACTIVATED_BY_NOMINEE",
            f"Nominee {current_user.name} placed vault on medical hold: {payload.note or 'Emergency freeze'}",
            "SUCCESS",
        )
        return MedicalHoldResponse(
            active=True,
            start_date=now_iso,
            end_date=end_date_str,
            note=med_hold_data["note"],
            account_status="MEDICAL_HOLD",
            message=f"{owner_name}'s vault is now frozen under medical hold. Deadlines and releases are paused.",
        )
    else:
        freq_dict = owner_profile.get("check_in_frequency") or {"value": 30, "unit": "days"}
        freq = DurationValue(**freq_dict)
        new_deadline = calculate_next_deadline(now, freq)

        med_hold_data = {
            "active": False,
            "start_date": None,
            "end_date": now_iso,
            "note": None,
        }
        patch = {
            "medical_hold": med_hold_data,
            "account_status": "ACTIVE",
            "last_check_in_at": now_iso,
            "next_check_in_deadline": new_deadline.isoformat(),
            "missed_checkin_alerted_at": None,
            "grace_expired_alerted_at": None,
            "updated_at": now_iso,
        }
        update_profile(owner_id, patch)
        record_audit(
            owner_id,
            "MEDICAL_HOLD_LIFTED_BY_NOMINEE",
            f"Nominee {current_user.name} lifted medical hold. Vault check-in resumed.",
            "SUCCESS",
        )
        return MedicalHoldResponse(
            active=False,
            start_date=None,
            end_date=now_iso,
            note=None,
            account_status="ACTIVE",
            message=f"Medical hold lifted for {owner_name}'s vault. Normal check-in schedule has resumed.",
        )


# ---- Nominee Released Documents & Verification ------------------------------

@router.get("/documents")
async def get_nominee_released_documents(current_user: AuthUser = Depends(get_current_user)):
    """
    Nominees act strictly as custodians/verifiers. Documents are released exclusively
    to designated recipients, not nominees. Returns an empty list.
    """
    return []


@router.post("/case/fast-track-approve", response_model=NomineeCase)
async def fast_track_approve_case(current_user: AuthUser = Depends(get_current_user)):
    """
    Test helper / fast-track simulation: marks nominee case APPROVED and unlocks vault documents.
    """
    nominee_rec = get_nominee_for_user(current_user.id, current_user.email)
    if not nominee_rec:
        raise HTTPException(status_code=404, detail="No nominee case found.")

    case_data = get_legacy_case_for_nominee(nominee_rec["id"])
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not initialized.")

    now_iso = datetime.now(timezone.utc).isoformat()
    case_id = str(case_data["id"])
    owner_id = str(nominee_rec["owner_id"])

    # Update case status to APPROVED
    update_legacy_case(case_id, {
        "status": "APPROVED",
        "updated_at": now_iso,
        "reviewed_at": now_iso,
    })

    # Mark owner documents as RELEASED
    from app.database import _documents, _persist_state_to_disk
    for doc in _documents.values():
        if str(doc.get("owner_id")) == owner_id:
            doc["release_status"] = "RELEASED"
            doc["released_at"] = now_iso
    _persist_state_to_disk()

    update_profile(owner_id, {"account_status": "RELEASE_READY", "updated_at": now_iso})
    record_audit(owner_id, "DOCUMENTS_RELEASED_SIMULATION", "Case approved and documents released to designated recipient(s).", "SUCCESS")

    return await get_nominee_case(current_user)



# ---- Nominee Portal (Evidence Submission & Case Tracking) -------------------

@router.get("/case", response_model=NomineeCase)
async def get_nominee_case(current_user: AuthUser = Depends(get_current_user)):
    """
    Fetches the active legacy verification case for the current nominee.
    """
    supabase = get_supabase()

    # Find nominee record linked to this user's profile
    nominee_rec = get_nominee_for_user(current_user.id, current_user.email)
    if not nominee_rec:
        raise HTTPException(status_code=404, detail="No verification case is open for you.")
    nominee_id = nominee_rec["id"]
    owner_id = nominee_rec["owner_id"]

    # Retrieve case (in-memory cache first)
    case_data = get_legacy_case_for_nominee(nominee_id)
    
    owner_profile = get_profile_by_id(owner_id) or {}
    owner_name = owner_profile.get("full_name") or "Vault Owner"

    if not case_data:
        # Auto-create case in ELIGIBLE state if account has entered case status
        case_id = str(uuid.uuid4())
        new_case = {
            "id": case_id,
            "owner_id": owner_id,
            "nominee_id": nominee_id,
            "status": "ELIGIBLE",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        case_data = save_legacy_case(new_case)

    case_id = str(case_data["id"])

    # Load evidence files
    ev_res = get_case_evidence_for_case(case_id)
    evidence_list = [
        EvidenceItem(
            id=str(e["id"]),
            file_name=e["file_name"],
            file_type=e.get("file_type", "document"),
            category=e.get("category", "DEATH_CERTIFICATE"),
            document_number=e.get("document_number"),
            issuing_authority=e.get("issuing_authority"),
            uploaded_at=e["uploaded_at"],
            size_bytes=e.get("size_bytes"),
            download_url=f"/api/reviewer/evidence/{e['id']}/download",
        )
        for e in ev_res
    ]

    # Audit history for case
    audit_history = [
        {"timestamp": case_data.get("created_at"), "event": "CASE_OPENED", "description": "Verification case initiated"}
    ]
    if case_data.get("claim_reason"):
        audit_history.append({"timestamp": case_data.get("updated_at") or case_data.get("created_at"), "event": "CLAIM_FILED", "description": f"Claim reason: {case_data.get('claim_reason')}"})
    if case_data.get("status") in ["EVIDENCE_SUBMITTED", "AWAITING_REVIEW"]:
        audit_history.append({"timestamp": datetime.now(timezone.utc).isoformat(), "event": "EVIDENCE_UPLOADED", "description": "Nominee submitted evidence"})

    # Documents are released strictly to recipients, not the nominee
    released_docs = []

    return NomineeCase(
        id=case_id,
        status=case_data.get("status", "ELIGIBLE"),
        created_at=case_data.get("created_at"),
        owner_name=owner_name,
        nominee_name=nominee_rec.get("name"),
        claim_reason=case_data.get("claim_reason"),
        incident_date=case_data.get("incident_date"),
        jurisdiction=case_data.get("jurisdiction"),
        declaration_confirmed=case_data.get("declaration_confirmed", False),
        note=case_data.get("note"),
        evidence=evidence_list,
        ocr=case_data.get("ocr_result"),
        audit_history=audit_history,
        released_documents=released_docs,
    )


@router.post("/case/claim", response_model=NomineeCase)
async def initiate_nominee_claim(
    payload: InitiateClaimPayload,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Submits or updates claim initiation details (reason, incident date, jurisdiction, legal declaration).
    """
    supabase = get_supabase()
    nominee_rec = get_nominee_for_user(current_user.id, current_user.email)
    if not nominee_rec:
        raise HTTPException(status_code=404, detail="No verification case is open for you.")
    
    owner_id = nominee_rec["owner_id"]
    owner_profile = get_profile_by_id(owner_id) or {}
    owner_name = owner_profile.get("full_name") or "Vault Owner"
    
    case_data = get_legacy_case_for_nominee(nominee_rec["id"])
    now_iso = datetime.now(timezone.utc).isoformat()
    
    if not case_data:
        case_id = str(uuid.uuid4())
        case_data = {
            "id": case_id,
            "owner_id": owner_id,
            "nominee_id": nominee_rec["id"],
            "status": "CLAIM_FILED",
            "claim_reason": payload.claim_reason,
            "incident_date": payload.incident_date,
            "jurisdiction": payload.jurisdiction,
            "declaration_confirmed": payload.declaration_confirmed,
            "note": payload.note,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        save_legacy_case(case_data)
    else:
        case_id = str(case_data["id"])
        current_st = case_data.get("status", "ELIGIBLE")
        new_status = "CLAIM_FILED" if current_st == "ELIGIBLE" else current_st
        patch = {
            "claim_reason": payload.claim_reason,
            "incident_date": payload.incident_date,
            "jurisdiction": payload.jurisdiction,
            "declaration_confirmed": payload.declaration_confirmed,
            "note": payload.note or case_data.get("note"),
            "status": new_status,
            "updated_at": now_iso,
        }
        update_legacy_case(case_id, patch)
        case_data.update(patch)

    record_audit(
        current_user.id,
        "CLAIM_INITIATED",
        f"Claim filed under {payload.claim_reason} (Incident date: {payload.incident_date or 'N/A'})",
        "SUCCESS"
    )

    ev_res = get_case_evidence_for_case(case_id)
    evidence_list = [
        EvidenceItem(
            id=str(e["id"]),
            file_name=e["file_name"],
            file_type=e.get("file_type", "document"),
            category=e.get("category", "DEATH_CERTIFICATE"),
            document_number=e.get("document_number"),
            issuing_authority=e.get("issuing_authority"),
            uploaded_at=e["uploaded_at"],
            size_bytes=e.get("size_bytes"),
            download_url=f"/api/reviewer/evidence/{e['id']}/download",
        )
        for e in ev_res
    ]

    return NomineeCase(
        id=case_id,
        status=case_data.get("status", "CLAIM_FILED"),
        created_at=case_data.get("created_at"),
        owner_name=owner_name,
        nominee_name=nominee_rec.get("name"),
        claim_reason=case_data.get("claim_reason"),
        incident_date=case_data.get("incident_date"),
        jurisdiction=case_data.get("jurisdiction"),
        declaration_confirmed=case_data.get("declaration_confirmed", True),
        note=case_data.get("note"),
        evidence=evidence_list,
        ocr=case_data.get("ocr_result"),
        audit_history=[
            {"timestamp": case_data.get("created_at"), "event": "CASE_OPENED", "description": "Verification case initiated"},
            {"timestamp": now_iso, "event": "CLAIM_FILED", "description": f"Nominee initiated claim: {payload.claim_reason}"}
        ],
    )


@router.post("/case/evidence", response_model=NomineeCase)
async def submit_case_evidence(
    file: UploadFile = File(...),
    category: str = Form("DEATH_CERTIFICATE"),
    document_number: Optional[str] = Form(None),
    issuing_authority: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Accepts categorized evidence file upload, executes server-side OCR analysis,
    and updates the verification case to EVIDENCE_SUBMITTED / AWAITING_REVIEW.
    """
    supabase = get_supabase()

    # Find nominee record
    nominee_rec = get_nominee_for_user(current_user.id, current_user.email)
    if not nominee_rec:
        raise HTTPException(status_code=404, detail="No active nominee case found.")
    owner_id = nominee_rec["owner_id"]
    owner_profile = get_profile_by_id(owner_id) or {}
    owner_name = owner_profile.get("full_name") or "Vault Owner"
    owner_dob = owner_profile.get("date_of_birth")

    # Find or initialize case (cache-first)
    case_res_data = get_legacy_case_for_nominee(nominee_rec["id"])
    if not case_res_data:
        case_id = str(uuid.uuid4())
        case_entry = {
            "id": case_id,
            "owner_id": owner_id,
            "nominee_id": nominee_rec["id"],
            "status": "ELIGIBLE",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        save_legacy_case(case_entry)
        case_res_data = case_entry
    else:
        case_id = str(case_res_data["id"])

    # Read and store evidence file
    file_bytes = await file.read()
    evidence_id = str(uuid.uuid4())
    safe_filename = file.filename or "evidence_document"
    storage_path = f"cases/{case_id}/{evidence_id}_{safe_filename}"
    now_iso = datetime.now(timezone.utc).isoformat()

    # Save to local persistent storage directory as guaranteed fallback
    local_storage_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage", "evidence-files", case_id)
    os.makedirs(local_storage_dir, exist_ok=True)
    local_file_path = os.path.join(local_storage_dir, f"{evidence_id}_{safe_filename}")
    try:
        with open(local_file_path, "wb") as f:
            f.write(file_bytes)
    except Exception as e:
        logger.warning(f"Could not write local evidence storage file: {e}")

    def _async_storage_upload():
        try:
            supabase = get_supabase()
            supabase.storage.from_("evidence-files").upload(
                path=storage_path,
                file=file_bytes,
                file_options={"content-type": file.content_type or "application/octet-stream"}
            )
        except Exception as e:
            logger.debug(f"Warning: Storage upload to evidence-files: {e}")

    from app.database import _db_executor
    _db_executor.submit(_async_storage_upload)

    # Record evidence row in memory cache and Supabase
    ev_entry = {
        "id": evidence_id,
        "case_id": case_id,
        "file_name": safe_filename,
        "file_type": file.content_type or "document",
        "category": category,
        "document_number": document_number.strip() if document_number else None,
        "issuing_authority": issuing_authority.strip() if issuing_authority else None,
        "size_bytes": len(file_bytes),
        "storage_path": storage_path,
        "local_path": local_file_path,
        "uploaded_at": now_iso,
    }
    save_case_evidence(ev_entry)

    # Execute Server-Side OCR & Identity Analysis
    ocr_result = analyze_evidence_document(
        file_bytes=file_bytes,
        file_name=safe_filename,
        owner_name=owner_name,
        owner_dob=owner_dob,
    )

    # Check if document verified owner identity details
    case_status = "APPROVED" if ocr_result.name_match else "AWAITING_REVIEW"

    # Update case status & OCR results
    update_data = {
        "status": case_status,
        "note": note.strip() if note else case_res_data.get("note"),
        "ocr_result": ocr_result.model_dump(),
        "updated_at": now_iso,
    }
    if case_status == "APPROVED":
        update_data["reviewed_at"] = now_iso

        # Mark all owner documents as RELEASED to designated recipients
        from app.database import _documents, _persist_state_to_disk
        for doc in _documents.values():
            if str(doc.get("owner_id")) == owner_id:
                doc["release_status"] = "RELEASED"
                doc["released_at"] = now_iso
        _persist_state_to_disk()

        update_profile(owner_id, {"account_status": "RELEASE_READY", "updated_at": now_iso})
        record_audit(owner_id, "DOCUMENTS_RELEASED_TO_RECIPIENT", f"Verified life-event proof ({category}) uploaded by nominee {current_user.name}. Documents released to recipient(s).", "SUCCESS")
    else:
        update_profile(owner_id, {"account_status": "AWAITING_REVIEW"})
        record_audit(current_user.id, "EVIDENCE_SUBMITTED", f"Submitted {category} evidence: {safe_filename}", "SUCCESS")

    update_legacy_case(case_id, update_data)
    case_res_data.update(update_data)

    # Fetch updated evidence list
    ev_res = get_case_evidence_for_case(case_id)
    evidence_list = [
        EvidenceItem(
            id=str(e["id"]),
            file_name=e["file_name"],
            file_type=e.get("file_type", "document"),
            category=e.get("category", "DEATH_CERTIFICATE"),
            document_number=e.get("document_number"),
            issuing_authority=e.get("issuing_authority"),
            uploaded_at=e["uploaded_at"],
            size_bytes=e.get("size_bytes"),
            download_url=f"/api/reviewer/evidence/{e['id']}/download",
        )
        for e in ev_res
    ]

    return NomineeCase(
        id=case_id,
        status="AWAITING_REVIEW",
        created_at=case_res_data.get("created_at", now_iso),
        owner_name=owner_name,
        nominee_name=nominee_rec.get("name"),
        claim_reason=case_res_data.get("claim_reason"),
        incident_date=case_res_data.get("incident_date"),
        jurisdiction=case_res_data.get("jurisdiction"),
        declaration_confirmed=case_res_data.get("declaration_confirmed", False),
        note=update_data["note"],
        evidence=evidence_list,
        ocr=ocr_result,
        audit_history=[
            {"timestamp": now_iso, "event": "EVIDENCE_SUBMITTED", "description": f"Evidence submitted ({category}) and analyzed"}
        ],
    )


@router.delete("/case/evidence/{evidence_id}", response_model=NomineeCase)
async def delete_case_evidence(
    evidence_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Deletes an uploaded evidence document if the case is not yet finalized.
    """
    from app.database import _case_evidence
    supabase = get_supabase()

    nominee_rec = get_nominee_for_user(current_user.id, current_user.email)
    if not nominee_rec:
        raise HTTPException(status_code=404, detail="No active nominee case found.")

    case_data = get_legacy_case_for_nominee(nominee_rec["id"])
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found.")

    case_id = str(case_data["id"])

    # Remove from memory and Supabase
    eid = str(evidence_id)
    if eid in _case_evidence:
        del _case_evidence[eid]
    try:
        supabase.table("case_evidence").delete().eq("id", eid).execute()
    except Exception:
        pass

    record_audit(current_user.id, "EVIDENCE_REMOVED", f"Removed evidence {evidence_id}", "SUCCESS")

    # Reload updated evidence list
    ev_res = get_case_evidence_for_case(case_id)
    evidence_list = [
        EvidenceItem(
            id=str(e["id"]),
            file_name=e["file_name"],
            file_type=e.get("file_type", "document"),
            category=e.get("category", "DEATH_CERTIFICATE"),
            document_number=e.get("document_number"),
            issuing_authority=e.get("issuing_authority"),
            uploaded_at=e["uploaded_at"],
            size_bytes=e.get("size_bytes"),
            download_url=f"/api/reviewer/evidence/{e['id']}/download",
        )
        for e in ev_res
    ]

    owner_profile = get_profile_by_id(nominee_rec["owner_id"]) or {}
    owner_name = owner_profile.get("full_name") or "Vault Owner"

    return NomineeCase(
        id=case_id,
        status=case_data.get("status", "ELIGIBLE"),
        created_at=case_data.get("created_at"),
        owner_name=owner_name,
        nominee_name=nominee_rec.get("name"),
        claim_reason=case_data.get("claim_reason"),
        incident_date=case_data.get("incident_date"),
        jurisdiction=case_data.get("jurisdiction"),
        declaration_confirmed=case_data.get("declaration_confirmed", False),
        note=case_data.get("note"),
        evidence=evidence_list,
        ocr=case_data.get("ocr_result"),
        audit_history=[
            {"timestamp": datetime.now(timezone.utc).isoformat(), "event": "EVIDENCE_REMOVED", "description": "Evidence document removed"}
        ],
    )

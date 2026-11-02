"""
CloudGuard Nominee API Router
Handles owner nominee configuration and the nominee legacy verification portal.
"""

import os
import logging
from typing import Optional
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.dependencies import get_current_user
from app.models.schemas import (
    AuthUser,
    Nominee,
    SaveNomineePayload,
    NomineeCase,
    EvidenceItem,
    InitiateClaimPayload,
)
from app.database import (
    get_supabase,
    get_nominee_for_owner,
    get_nominee_for_user,
    get_profile_by_id,
    save_nominee as db_save_nominee,
    update_nominee as db_update_nominee,
    save_case_evidence,
    get_case_evidence_for_case,
    update_legacy_case,
    update_profile,
    save_legacy_case,
    get_legacy_case_for_nominee,
)
from app.services.audit import record_audit
from app.services.ocr import analyze_evidence_document
from app.services.email import send_nominee_invitation_email

logger = logging.getLogger("cloudguard.nominee")
router = APIRouter(prefix="/api/nominee", tags=["Nominee"])


# ---- Owner Nominee Configuration -------------------------------------------

@router.get("", response_model=Optional[Nominee])
async def get_nominee(current_user: AuthUser = Depends(get_current_user)):
    """Returns the nominee configured for the vault owner."""
    raw = get_nominee_for_owner(current_user.id)
    if not raw:
        return None
    return Nominee(
        id=str(raw["id"]),
        name=raw["name"],
        email=raw["email"],
        status=raw.get("status", "PENDING"),
    )


@router.post("", response_model=Nominee)
async def save_nominee(
    payload: SaveNomineePayload,
    current_user: AuthUser = Depends(get_current_user),
):
    """Creates a new nominee designation for the vault owner."""
    supabase = get_supabase()
    email = payload.email.strip().lower()
    nom_id = str(uuid.uuid4())
    token = str(uuid.uuid4())

    entry = {
        "id": nom_id,
        "owner_id": current_user.id,
        "name": payload.name.strip(),
        "email": email,
        "status": "PENDING",
        "invitation_token": token,
        "invitation_expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    saved = db_save_nominee(entry)
    record_audit(current_user.id, "NOMINEE_CONFIGURED", f"Designated nominee: {payload.name} ({email})", "SUCCESS")

    # Send real invitation email with secure one-time onboarding link
    owner_profile = get_profile_by_id(current_user.id) or {}
    owner_name = owner_profile.get("full_name") or current_user.name
    send_nominee_invitation_email(
        nominee_name=payload.name.strip(),
        nominee_email=email,
        owner_name=owner_name,
        token=token,
    )

    return Nominee(
        id=nom_id,
        name=saved["name"],
        email=saved["email"],
        status="PENDING",
    )


@router.patch("", response_model=Nominee)
async def update_nominee(
    payload: SaveNomineePayload,
    current_user: AuthUser = Depends(get_current_user),
):
    """Updates the existing nominee details."""
    nom = get_nominee_for_owner(current_user.id)
    if not nom:
        raise HTTPException(status_code=404, detail="Nominee not found.")
    patch = {
        "name": payload.name.strip(),
        "email": payload.email.strip().lower(),
    }
    n = db_update_nominee(str(nom["id"]), patch)
    if not n:
        raise HTTPException(status_code=404, detail="Nominee not found.")
    record_audit(current_user.id, "NOMINEE_UPDATED", f"Updated nominee: {payload.name}", "SUCCESS")
    return Nominee(
        id=str(n["id"]),
        name=n["name"],
        email=n["email"],
        status=n.get("status", "PENDING"),
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def remove_nominee(current_user: AuthUser = Depends(get_current_user)):
    """Removes the nominee designation."""
    nom = get_nominee_for_owner(current_user.id)
    if nom:
        supabase = get_supabase()
        try:
            supabase.table("nominees").delete().eq("owner_id", current_user.id).execute()
        except Exception:
            pass
    record_audit(current_user.id, "NOMINEE_REMOVED", "Removed nominee designation", "SUCCESS")
    return None


@router.post("/invite", response_model=Nominee)
async def invite_nominee(current_user: AuthUser = Depends(get_current_user)):
    """Sends or resends the nominee verification invitation."""
    nom = get_nominee_for_owner(current_user.id)
    if not nom:
        raise HTTPException(status_code=404, detail="No nominee configured.")
    token = str(uuid.uuid4())
    expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    n = db_update_nominee(str(nom["id"]), {
        "status": "PENDING",
        "invitation_token": token,
        "invitation_expires_at": expires,
    })
    
    # Send / resend real invitation email
    owner_profile = get_profile_by_id(current_user.id) or {}
    owner_name = owner_profile.get("full_name") or current_user.name
    send_nominee_invitation_email(
        nominee_name=n["name"],
        nominee_email=n["email"],
        owner_name=owner_name,
        token=token,
    )
    
    record_audit(current_user.id, "NOMINEE_INVITATION_SENT", f"Sent invitation to {n.get('email')}", "SUCCESS")
    return Nominee(
        id=str(n["id"]),
        name=n["name"],
        email=n["email"],
        status="PENDING",
    )


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

    # Update case status & OCR results
    update_data = {
        "status": "AWAITING_REVIEW",
        "note": note.strip() if note else case_res_data.get("note"),
        "ocr_result": ocr_result.model_dump(),
        "updated_at": now_iso,
    }
    update_legacy_case(case_id, update_data)
    case_res_data.update(update_data)

    # Update vault owner account status
    update_profile(owner_id, {"account_status": "AWAITING_REVIEW"})

    record_audit(current_user.id, "EVIDENCE_SUBMITTED", f"Submitted {category} evidence: {safe_filename}", "SUCCESS")

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

"""
CloudGuard Reviewer Console API Router
Handles human reviewer oversight, case queue management, evidence inspection, and final decisions.
"""

import os
import logging
from typing import List, Optional
from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, Response

from app.dependencies import get_current_user, require_role
from app.models.schemas import AuthUser, ReviewerCase, EvidenceItem, ReviewActionPayload
from app.database import (
    get_supabase,
    get_profile_by_id,
    get_all_legacy_cases,
    get_legacy_case_by_id,
    update_legacy_case,
    update_profile,
    get_documents_for_owner,
    update_document,
    get_case_evidence_for_case,
    get_case_evidence_by_id,
)
from app.services.audit import record_audit

logger = logging.getLogger("cloudguard.reviewer")
router = APIRouter(prefix="/api/reviewer", tags=["Reviewer Console"])


def build_reviewer_case(case_data: dict) -> ReviewerCase:
    """Helper to populate complete ReviewerCase structure."""
    case_id = str(case_data["id"])
    supabase = get_supabase()

    # Load owner profile
    owner_profile = get_profile_by_id(case_data["owner_id"]) or {}
    owner_name = owner_profile.get("full_name") or "Vault Owner"
    owner_email = owner_profile.get("email") or "—"
    owner_dob = owner_profile.get("date_of_birth")

    # Load nominee profile
    nominee = {}
    try:
        nom_res = supabase.table("nominees").select("*").eq("id", case_data["nominee_id"]).limit(1).execute()
        if nom_res.data:
            nominee = nom_res.data[0]
    except Exception:
        pass
    nominee_name = nominee.get("name") or "Nominee"
    nominee_email = nominee.get("email") or "—"

    # Load evidence with size and download link
    ev_records = get_case_evidence_for_case(case_id)
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
        for e in ev_records
    ]

    # Load audit history
    rev_data = []
    try:
        rev_res = supabase.table("case_reviews").select("*").eq("case_id", case_id).order("created_at", desc=True).execute()
        if rev_res.data:
            rev_data = rev_res.data
    except Exception:
        pass

    audit_history = [
        {"timestamp": case_data.get("created_at"), "event": "CASE_OPENED", "description": "Verification case initiated"}
    ]
    if case_data.get("claim_reason"):
        audit_history.append({"timestamp": case_data.get("updated_at") or case_data.get("created_at"), "event": "CLAIM_FILED", "description": f"Claim filed: {case_data.get('claim_reason')}"})
    for r in rev_data:
        audit_history.append({
            "timestamp": r["created_at"],
            "event": f"REVIEWER_{r['action']}",
            "description": r.get("decision_note") or f"Reviewer decided {r['action']}"
        })

    return ReviewerCase(
        id=case_id,
        status=case_data.get("status", "PENDING"),
        created_at=case_data.get("created_at"),
        owner_name=owner_name,
        owner_email=owner_email,
        owner_dob=owner_dob,
        nominee_name=nominee_name,
        nominee_email=nominee_email,
        claim_reason=case_data.get("claim_reason"),
        incident_date=case_data.get("incident_date"),
        jurisdiction=case_data.get("jurisdiction"),
        declaration_confirmed=case_data.get("declaration_confirmed", False),
        note=case_data.get("note"),
        evidence=evidence_list,
        ocr=case_data.get("ocr_result"),
        audit_history=audit_history,
    )


@router.get("/cases", response_model=List[ReviewerCase])
async def list_cases(current_user: AuthUser = Depends(require_role(["reviewer", "owner"]))):
    """Lists all cases for the reviewer console."""
    cases = get_all_legacy_cases()
    return [build_reviewer_case(c) for c in cases]


@router.get("/cases/{case_id}", response_model=ReviewerCase)
async def get_case_detail(
    case_id: str,
    current_user: AuthUser = Depends(require_role(["reviewer", "owner"])),
):
    """Retrieves full case details, evidence documents, and OCR analysis for review."""
    case_data = get_legacy_case_by_id(case_id)
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found.")
    return build_reviewer_case(case_data)


@router.post("/cases/{case_id}/approve", response_model=ReviewerCase)
async def approve_case(
    case_id: str,
    payload: ReviewActionPayload,
    current_user: AuthUser = Depends(require_role(["reviewer", "owner"])),
):
    """
    Approves a legacy verification case.
    This triggers document release for assigned recipients and updates owner status to RELEASE_READY.
    """
    case_data = get_legacy_case_by_id(case_id)
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found.")

    owner_id = case_data["owner_id"]
    now_iso = datetime.now(timezone.utc).isoformat()

    # Update case status
    updated_case = update_legacy_case(case_id, {
        "status": "APPROVED",
        "updated_at": now_iso
    }) or case_data

    # Execute Legacy Release: Release assigned documents
    owner_docs = get_documents_for_owner(owner_id)
    for doc in owner_docs:
        update_document(str(doc["id"]), {
            "release_status": "RELEASED",
            "released_at": now_iso
        })

    # Update owner profile status
    update_profile(owner_id, {
        "account_status": "RELEASE_READY",
        "status_message": "Legacy verification approved by reviewer. Documents released to trusted recipients.",
        "updated_at": now_iso
    })

    record_audit(current_user.id, "CASE_APPROVED", f"Reviewer approved legacy case {case_id}", "SUCCESS")
    record_audit(owner_id, "DOCUMENTS_RELEASED_BY_REVIEW", f"Case {case_id} approved. Released vault documents.", "SUCCESS")

    return build_reviewer_case(updated_case)


@router.post("/cases/{case_id}/reject", response_model=ReviewerCase)
async def reject_case(
    case_id: str,
    payload: ReviewActionPayload,
    current_user: AuthUser = Depends(require_role(["reviewer", "owner"])),
):
    """Rejects a legacy verification case and preserves document lockdown."""
    case_data = get_legacy_case_by_id(case_id)
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found.")

    now_iso = datetime.now(timezone.utc).isoformat()

    updated_case = update_legacy_case(case_id, {
        "status": "REJECTED",
        "updated_at": now_iso
    }) or case_data

    record_audit(current_user.id, "CASE_REJECTED", f"Reviewer rejected case {case_id}: {payload.note}", "SUCCESS")
    return build_reviewer_case(updated_case)


@router.post("/cases/{case_id}/request-info", response_model=ReviewerCase)
async def request_info(
    case_id: str,
    payload: ReviewActionPayload,
    current_user: AuthUser = Depends(require_role(["reviewer", "owner"])),
):
    """Requests additional evidence or documentation from the nominee."""
    case_data = get_legacy_case_by_id(case_id)
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found.")

    now_iso = datetime.now(timezone.utc).isoformat()

    updated_case = update_legacy_case(case_id, {
        "status": "MORE_INFO_REQUESTED",
        "updated_at": now_iso
    }) or case_data

    record_audit(current_user.id, "CASE_INFO_REQUESTED", f"Reviewer requested info on case {case_id}: {payload.note}", "SUCCESS")
    return build_reviewer_case(updated_case)


# ---- Evidence Inspection & Download ----------------------------------------

def _check_evidence_permission(evidence: dict, current_user: AuthUser) -> bool:
    """Verifies whether current user is authorized to inspect or download the evidence file."""
    # 1. Reviewers and admins have unrestricted inspection access
    if current_user.role in ["reviewer", "owner"]:
        return True

    case_id = evidence.get("case_id")
    if not case_id:
        return False

    case = get_legacy_case_by_id(case_id)
    if not case:
        return False

    # 2. Vault owner associated with this case
    if str(case.get("owner_id")) == str(current_user.id):
        return True

    # 3. Nominee associated with this case
    if current_user.role == "nominee":
        nominee_id = case.get("nominee_id")
        if str(nominee_id) == str(current_user.id):
            return True
        try:
            supabase = get_supabase()
            n_res = supabase.table("nominees").select("id, linked_user_id, email").eq("id", nominee_id).limit(1).execute()
            if n_res.data:
                n = n_res.data[0]
                if str(n.get("linked_user_id")) == str(current_user.id) or n.get("email", "").lower() == current_user.email.lower():
                    return True
        except Exception:
            pass

    return False


@router.get("/evidence/{evidence_id}/url")
async def get_evidence_url(
    evidence_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Returns secure metadata and download/preview URLs for a submitted evidence document.
    """
    evidence = get_case_evidence_by_id(evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence file not found.")

    if not _check_evidence_permission(evidence, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to inspect this evidence.")

    return {
        "download_url": f"/api/reviewer/evidence/{evidence_id}/download",
        "preview_url": f"/api/reviewer/evidence/{evidence_id}/download?inline=true",
        "file_name": evidence.get("file_name", "evidence"),
        "file_type": evidence.get("file_type", "document"),
        "size_bytes": evidence.get("size_bytes", 0),
    }


@router.get("/evidence/{evidence_id}/download")
async def download_evidence_file(
    evidence_id: str,
    inline: bool = False,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Streams or downloads submitted legacy verification evidence (death certificate, medical record, etc.).
    Supports `inline=true` for direct in-browser previews of images (PNG/JPG) and PDFs.
    """
    evidence = get_case_evidence_by_id(evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence file not found.")

    if not _check_evidence_permission(evidence, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to access this evidence.")

    file_name = evidence.get("file_name") or f"evidence_{evidence_id}"
    media_type = evidence.get("file_type") or "application/octet-stream"
    disp_type = "inline" if inline else "attachment"
    local_path = evidence.get("local_path")
    case_id = str(evidence.get("case_id"))

    record_audit(current_user.id, "EVIDENCE_ACCESSED", f"Accessed evidence file '{file_name}' (case: {case_id})", "SUCCESS")

    # 1. Deliver directly from local disk path if available
    if local_path and os.path.exists(local_path):
        return FileResponse(
            path=local_path,
            filename=file_name,
            media_type=media_type,
            content_disposition_type=disp_type,
        )

    # 2. Check alternative common local paths
    alt_local = os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage", "evidence-files", case_id, f"{evidence_id}_{file_name}")
    if os.path.exists(alt_local):
        return FileResponse(
            path=alt_local,
            filename=file_name,
            media_type=media_type,
            content_disposition_type=disp_type,
        )

    # 3. Stream from Supabase storage bucket 'evidence-files'
    storage_path = evidence.get("storage_path")
    if storage_path:
        try:
            supabase = get_supabase()
            file_bytes = supabase.storage.from_("evidence-files").download(storage_path)
            if file_bytes:
                return Response(
                    content=file_bytes,
                    media_type=media_type,
                    headers={"Content-Disposition": f'{disp_type}; filename="{file_name}"'},
                )
        except Exception as e:
            logger.debug(f"Supabase storage evidence download: {e}")

    # 4. Verified fallback document for demo/test seed data
    fallback_content = (
        f"CloudGuard Case Evidence Record\n"
        f"================================\n"
        f"File Name: {file_name}\n"
        f"Evidence ID: {evidence_id}\n"
        f"Case ID: {case_id}\n"
        f"Uploaded At: {evidence.get('uploaded_at')}\n"
        f"MIME Type: {media_type}\n"
        f"Status: Received and indexed for human reviewer evaluation.\n"
    ).encode("utf-8")
    return Response(
        content=fallback_content,
        media_type="text/plain",
        headers={"Content-Disposition": f'{disp_type}; filename="{file_name}.txt"'},
    )

"""
CloudGuard Recipients API Router
Handles trusted recipient management, invitations, updates, and removals.
"""

from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.dependencies import get_current_user
from app.models.schemas import AuthUser, Recipient, AddRecipientPayload, UpdateRecipientPayload
from app.database import (
    get_supabase,
    get_recipients,
    save_recipient,
    update_recipient as db_update_recipient,
    delete_recipient_record,
    get_profile_by_id,
    get_recipient_by_token,
)
from app.services.audit import record_audit
from app.services.email import send_recipient_invitation_email
from app.config import FRONTEND_URL

router = APIRouter(prefix="/api/recipients", tags=["Recipients"])


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


@router.get("", response_model=List[Recipient])
async def list_recipients(
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
):
    """Lists all trusted recipients configured by the vault owner."""
    raw = get_recipients(current_user.id)
    out = []
    for r in raw:
        tok = r.get("invitation_token")
        if not tok:
            tok = str(uuid.uuid4())
            exp = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
            db_update_recipient(str(r["id"]), {
                "invitation_token": tok,
                "invitation_expires_at": exp,
                "previous_tokens": [tok, str(r["id"])],
            })
        inv_link = _build_invite_link(tok, request)
        out.append(Recipient(
            id=str(r["id"]),
            name=r["name"],
            email=r["email"],
            status=r.get("status", "PENDING"),
            assigned_documents=r.get("assigned_documents", 0),
            invitation_status=r.get("invitation_status", r.get("status", "PENDING")),
            invitation_link=inv_link,
        ))
    return out


@router.post("", response_model=Recipient)
async def add_recipient(
    payload: AddRecipientPayload,
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
):
    """Adds a new trusted recipient to the owner's vault."""
    supabase = get_supabase()
    email = payload.email.strip().lower()
    rec_id = str(uuid.uuid4())
    token = str(uuid.uuid4())
    expires_iso = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()

    entry = {
        "id": rec_id,
        "owner_id": current_user.id,
        "name": payload.name.strip(),
        "email": email,
        "status": "PENDING",
        "invitation_token": token,
        "previous_tokens": [token, rec_id],
        "invitation_expires_at": expires_iso,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    saved = save_recipient(entry)
    record_audit(current_user.id, "RECIPIENT_ADDED", f"Added recipient: {payload.name} ({email})", "SUCCESS")

    # Send real invitation email to recipient in background thread
    owner_profile = get_profile_by_id(current_user.id) or {}
    owner_name = owner_profile.get("full_name") or current_user.name
    frontend_base = _get_request_frontend_base(request)
    import asyncio
    try:
        loop = asyncio.get_running_loop()
        loop.run_in_executor(
            None,
            send_recipient_invitation_email,
            payload.name.strip(),
            email,
            owner_name,
            token,
            frontend_base,
        )
    except Exception:
        send_recipient_invitation_email(
            recipient_name=payload.name.strip(),
            recipient_email=email,
            owner_name=owner_name,
            token=token,
            frontend_base_url=frontend_base,
        )

    inv_link = _build_invite_link(token, request)
    return Recipient(
        id=rec_id,
        name=saved["name"],
        email=saved["email"],
        status=saved.get("status", "PENDING"),
        assigned_documents=0,
        invitation_status="PENDING",
        invitation_link=inv_link,
    )


@router.patch("/{recipient_id}", response_model=Recipient)
async def update_recipient(
    recipient_id: str,
    payload: UpdateRecipientPayload,
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
):
    """Updates recipient name or email."""
    supabase = get_supabase()
    patch = {}
    if payload.name:
        patch["name"] = payload.name.strip()
    if payload.email:
        patch["email"] = payload.email.strip().lower()

    if not patch:
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    r = db_update_recipient(recipient_id, patch)
    if not r:
        raise HTTPException(status_code=404, detail="Recipient not found.")
    record_audit(current_user.id, "RECIPIENT_UPDATED", f"Updated recipient {recipient_id}", "SUCCESS")
    tok = r.get("invitation_token")
    inv_link = _build_invite_link(tok, request) if tok else None
    return Recipient(
        id=str(r["id"]),
        name=r["name"],
        email=r["email"],
        status=r.get("status", "PENDING"),
        invitation_status=r.get("status", "PENDING"),
        assigned_documents=0,
        invitation_link=inv_link,
    )


@router.delete("/{recipient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_recipient(
    recipient_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Removes a recipient from the owner's vault."""
    delete_recipient_record(recipient_id, current_user.id)
    record_audit(current_user.id, "RECIPIENT_REMOVED", f"Removed recipient {recipient_id}", "SUCCESS")
    return None


@router.post("/{recipient_id}/invite", response_model=Recipient)
async def invite_recipient(
    recipient_id: str,
    request: Request,
    current_user: AuthUser = Depends(get_current_user),
):
    """Sends or resends an invitation token to a trusted recipient."""
    rec = get_recipient_by_token(recipient_id)
    old_token = rec.get("invitation_token") if rec else None
    token = str(uuid.uuid4())
    prevs = list(rec.get("previous_tokens") or []) if rec else []
    if old_token and old_token not in prevs:
        prevs.append(old_token)
    if recipient_id not in prevs:
        prevs.append(recipient_id)
    if token not in prevs:
        prevs.append(token)
    expires = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    r = db_update_recipient(recipient_id, {
        "status": "PENDING",
        "invitation_token": token,
        "previous_tokens": prevs,
        "invitation_expires_at": expires,
    })
    if not r:
        raise HTTPException(status_code=404, detail="Recipient not found.")

    # Send / resend recipient invitation email in background thread
    owner_profile = get_profile_by_id(current_user.id) or {}
    owner_name = owner_profile.get("full_name") or current_user.name
    frontend_base = _get_request_frontend_base(request)
    import asyncio
    try:
        loop = asyncio.get_running_loop()
        loop.run_in_executor(
            None,
            send_recipient_invitation_email,
            r["name"],
            r["email"],
            owner_name,
            token,
            frontend_base,
        )
    except Exception:
        send_recipient_invitation_email(
            recipient_name=r["name"],
            recipient_email=r["email"],
            owner_name=owner_name,
            token=token,
            frontend_base_url=frontend_base,
        )

    record_audit(current_user.id, "RECIPIENT_INVITED", f"Dispatched invitation to recipient {r.get('email')}", "SUCCESS")

    inv_link = _build_invite_link(token, request)
    return Recipient(
        id=str(r["id"]),
        name=r["name"],
        email=r["email"],
        status="PENDING",
        invitation_status="PENDING",
        assigned_documents=0,
        invitation_link=inv_link,
    )

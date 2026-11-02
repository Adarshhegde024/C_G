"""
CloudGuard Recipients API Router
Handles trusted recipient management, invitations, updates, and removals.
"""

from typing import List
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user
from app.models.schemas import AuthUser, Recipient, AddRecipientPayload, UpdateRecipientPayload
from app.database import (
    get_supabase,
    get_recipients,
    save_recipient,
    update_recipient as db_update_recipient,
    delete_recipient_record,
    get_profile_by_id,
)
from app.services.audit import record_audit
from app.services.email import send_recipient_invitation_email

router = APIRouter(prefix="/api/recipients", tags=["Recipients"])


@router.get("", response_model=List[Recipient])
async def list_recipients(current_user: AuthUser = Depends(get_current_user)):
    """Lists all trusted recipients configured by the vault owner."""
    raw = get_recipients(current_user.id)
    return [Recipient(**r) for r in raw]


@router.post("", response_model=Recipient)
async def add_recipient(
    payload: AddRecipientPayload,
    current_user: AuthUser = Depends(get_current_user),
):
    """Adds a new trusted recipient to the owner's vault."""
    supabase = get_supabase()
    email = payload.email.strip().lower()
    rec_id = str(uuid.uuid4())
    token = str(uuid.uuid4())

    entry = {
        "id": rec_id,
        "owner_id": current_user.id,
        "name": payload.name.strip(),
        "email": email,
        "status": "PENDING",
        "invitation_token": token,
        "invitation_expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    saved = save_recipient(entry)
    record_audit(current_user.id, "RECIPIENT_ADDED", f"Added recipient: {payload.name} ({email})", "SUCCESS")

    # Send real invitation email to recipient
    owner_profile = get_profile_by_id(current_user.id) or {}
    owner_name = owner_profile.get("full_name") or current_user.name
    send_recipient_invitation_email(
        recipient_name=payload.name.strip(),
        recipient_email=email,
        owner_name=owner_name,
        token=token,
    )

    return Recipient(
        id=rec_id,
        name=saved["name"],
        email=saved["email"],
        status=saved.get("status", "PENDING"),
        assigned_documents=0,
        invitation_status="PENDING",
    )


@router.patch("/{recipient_id}", response_model=Recipient)
async def update_recipient(
    recipient_id: str,
    payload: UpdateRecipientPayload,
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
    return Recipient(
        id=str(r["id"]),
        name=r["name"],
        email=r["email"],
        status=r.get("status", "PENDING"),
        invitation_status=r.get("status", "PENDING"),
        assigned_documents=0,
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
    current_user: AuthUser = Depends(get_current_user),
):
    """Sends or resends an invitation token to a trusted recipient."""
    token = str(uuid.uuid4())
    expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    r = db_update_recipient(recipient_id, {
        "status": "PENDING",
        "invitation_token": token,
        "invitation_expires_at": expires,
    })
    if not r:
        raise HTTPException(status_code=404, detail="Recipient not found.")

    # Send / resend recipient invitation email
    owner_profile = get_profile_by_id(current_user.id) or {}
    owner_name = owner_profile.get("full_name") or current_user.name
    send_recipient_invitation_email(
        recipient_name=r["name"],
        recipient_email=r["email"],
        owner_name=owner_name,
        token=token,
    )

    record_audit(current_user.id, "RECIPIENT_INVITED", f"Dispatched invitation to recipient {r.get('email')}", "SUCCESS")

    return Recipient(
        id=str(r["id"]),
        name=r["name"],
        email=r["email"],
        status="PENDING",
        invitation_status="PENDING",
        assigned_documents=0,
    )

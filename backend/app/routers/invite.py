"""
CloudGuard Invitation Acceptance API Router
Enables trusted recipients and nominees to view and accept invitations.
"""

from datetime import datetime, timezone, timedelta
import uuid
import bcrypt
from fastapi import APIRouter, HTTPException, status

from app.config import ACCESS_TOKEN_EXPIRE_MINUTES
from app.database import get_supabase, get_profile_by_email, get_profile_by_id
from app.dependencies import create_access_token
from app.models.schemas import (
    InvitationDetails,
    AcceptInvitationPayload,
    AuthUser,
    AuthResponse,
)
from app.services.audit import record_audit

router = APIRouter(prefix="/api/invite", tags=["Invitations"])


@router.get("/{token}", response_model=InvitationDetails)
async def get_invitation(token: str):
    """Fetches details for an invitation token (recipient or nominee)."""
    supabase = get_supabase()

    # 1. Check Recipients table
    rec_res = supabase.table("recipients").select("*, profiles!recipients_owner_id_fkey(full_name)").eq("invitation_token", token).limit(1).execute()
    if rec_res.data:
        r = rec_res.data[0]
        owner_name = r.get("profiles", {}).get("full_name") if isinstance(r.get("profiles"), dict) else "Vault Owner"
        return InvitationDetails(
            email=r["email"],
            inviter_name=owner_name,
            vault_owner=owner_name,
            role="recipient",
            status=r.get("status", "PENDING"),
            expires_at=r.get("invitation_expires_at"),
        )

    # 2. Check Nominees table
    nom_res = supabase.table("nominees").select("*, profiles!nominees_owner_id_fkey(full_name)").eq("invitation_token", token).limit(1).execute()
    if nom_res.data:
        n = nom_res.data[0]
        owner_name = n.get("profiles", {}).get("full_name") if isinstance(n.get("profiles"), dict) else "Vault Owner"
        return InvitationDetails(
            email=n["email"],
            inviter_name=owner_name,
            vault_owner=owner_name,
            role="nominee",
            status=n.get("status", "PENDING"),
            expires_at=n.get("invitation_expires_at"),
        )

    raise HTTPException(status_code=404, detail="Invitation link is invalid or has expired.")


@router.post("/{token}/accept", response_model=AuthResponse)
async def accept_invitation(token: str, payload: AcceptInvitationPayload):
    """
    Accepts invitation, creates or links authenticated profile,
    and returns a signed session token routed to their role home.
    """
    supabase = get_supabase()
    target_role = None
    target_email = None
    target_name = None
    record_table = None
    record_id = None
    now_iso = datetime.now(timezone.utc).isoformat()

    # Search in recipients
    rec_res = supabase.table("recipients").select("*").eq("invitation_token", token).limit(1).execute()
    if rec_res.data:
        target_role = "recipient"
        target_email = rec_res.data[0]["email"].strip().lower()
        target_name = rec_res.data[0]["name"]
        record_table = "recipients"
        record_id = rec_res.data[0]["id"]
    else:
        # Search in nominees
        nom_res = supabase.table("nominees").select("*").eq("invitation_token", token).limit(1).execute()
        if nom_res.data:
            target_role = "nominee"
            target_email = nom_res.data[0]["email"].strip().lower()
            target_name = nom_res.data[0]["name"]
            record_table = "nominees"
            record_id = nom_res.data[0]["id"]

    if not target_role:
        raise HTTPException(status_code=404, detail="Invitation token not recognized.")

    # Find or create profile for this user
    existing_profile = get_profile_by_email(target_email)
    if existing_profile:
        profile_id = str(existing_profile["id"])
        # Update linked profile
        supabase.table(record_table).update({
            "status": "ACCEPTED",
            "linked_user_id": profile_id,
            "accepted_at": now_iso,
        }).eq("id", record_id).execute()
    else:
        profile_id = str(uuid.uuid4())
        hashed_pwd = None
        if payload.password:
            hashed_pwd = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

        new_profile = {
            "id": profile_id,
            "email": target_email,
            "full_name": target_name,
            "role": target_role,
            "password_hash": hashed_pwd,
            "account_status": "ACTIVE",
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        try:
            supabase.table("profiles").insert(new_profile).execute()
        except Exception:
            pass

        # Update recipient/nominee record
        supabase.table(record_table).update({
            "status": "ACCEPTED",
            "linked_user_id": profile_id,
            "accepted_at": now_iso,
        }).eq("id", record_id).execute()

    auth_user = AuthUser(
        id=profile_id,
        name=target_name,
        email=target_email,
        role=target_role,
        account_status="ACTIVE",
    )

    token = create_access_token({
        "sub": profile_id,
        "email": auth_user.email,
        "role": auth_user.role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    })

    record_audit(profile_id, "INVITATION_ACCEPTED", f"Accepted invitation as {target_role}", "SUCCESS")

    return AuthResponse(token=token, access_token=token, user=auth_user)

"""
CloudGuard Invitation Acceptance API Router
Enables trusted recipients and nominees to view and accept invitations.
"""

from datetime import datetime, timezone, timedelta
import uuid
import logging
import bcrypt
from fastapi import APIRouter, HTTPException, status

from app.config import ACCESS_TOKEN_EXPIRE_MINUTES
from app.database import (
    get_supabase,
    get_profile_by_email,
    get_profile_by_id,
    get_nominee_by_token,
    get_recipient_by_token,
    update_nominee,
    update_recipient,
    create_profile,
)
from app.dependencies import create_access_token
from app.models.schemas import (
    InvitationDetails,
    AcceptInvitationPayload,
    AuthUser,
    AuthResponse,
)
from app.services.audit import record_audit

logger = logging.getLogger("cloudguard.invite")
router = APIRouter(prefix="/api/invite", tags=["Invitations"])


@router.get("/{token}", response_model=InvitationDetails)
async def get_invitation(token: str):
    """Fetches details for an invitation token (recipient or nominee)."""
    # 1. Check in database repository (memory & persistent disk cache)
    nom = get_nominee_by_token(token)
    if nom:
        owner_name = "Vault Owner"
        if nom.get("owner_id"):
            prof = get_profile_by_id(str(nom["owner_id"])) or {}
            owner_name = prof.get("full_name") or "Vault Owner"
        return InvitationDetails(
            email=nom["email"],
            inviter_name=owner_name,
            vault_owner=owner_name,
            role="nominee",
            status=nom.get("status", "PENDING"),
            expires_at=nom.get("invitation_expires_at"),
        )

    rec = get_recipient_by_token(token)
    if rec:
        owner_name = "Vault Owner"
        if rec.get("owner_id"):
            prof = get_profile_by_id(str(rec["owner_id"])) or {}
            owner_name = prof.get("full_name") or "Vault Owner"
        return InvitationDetails(
            email=rec["email"],
            inviter_name=owner_name,
            vault_owner=owner_name,
            role="recipient",
            status=rec.get("status", "PENDING"),
            expires_at=rec.get("invitation_expires_at"),
        )

    # 2. Plain Supabase query without fragile foreign key join syntax
    supabase = get_supabase()
    try:
        rec_res = supabase.table("recipients").select("*").eq("invitation_token", token).limit(1).execute()
        if rec_res.data:
            r = rec_res.data[0]
            owner_name = "Vault Owner"
            if r.get("owner_id"):
                prof = get_profile_by_id(str(r["owner_id"])) or {}
                owner_name = prof.get("full_name") or "Vault Owner"
            return InvitationDetails(
                email=r["email"],
                inviter_name=owner_name,
                vault_owner=owner_name,
                role="recipient",
                status=r.get("status", "PENDING"),
                expires_at=r.get("invitation_expires_at"),
            )
    except Exception as e:
        logger.debug(f"Invite recipient Supabase lookup: {e}")

    try:
        nom_res = supabase.table("nominees").select("*").eq("invitation_token", token).limit(1).execute()
        if nom_res.data:
            n = nom_res.data[0]
            owner_name = "Vault Owner"
            if n.get("owner_id"):
                prof = get_profile_by_id(str(n["owner_id"])) or {}
                owner_name = prof.get("full_name") or "Vault Owner"
            return InvitationDetails(
                email=n["email"],
                inviter_name=owner_name,
                vault_owner=owner_name,
                role="nominee",
                status=n.get("status", "PENDING"),
                expires_at=n.get("invitation_expires_at"),
            )
    except Exception as e:
        logger.debug(f"Invite nominee Supabase lookup: {e}")

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

    # Search in memory repository first
    rec = get_recipient_by_token(token)
    nom = get_nominee_by_token(token)

    if rec:
        target_role = "recipient"
        target_email = rec["email"].strip().lower()
        target_name = rec["name"]
        record_table = "recipients"
        record_id = rec["id"]
    elif nom:
        target_role = "nominee"
        target_email = nom["email"].strip().lower()
        target_name = nom["name"]
        record_table = "nominees"
        record_id = nom["id"]
    else:
        # Fallback to Supabase
        try:
            rec_res = supabase.table("recipients").select("*").eq("invitation_token", token).limit(1).execute()
            if rec_res.data:
                target_role = "recipient"
                target_email = rec_res.data[0]["email"].strip().lower()
                target_name = rec_res.data[0]["name"]
                record_table = "recipients"
                record_id = rec_res.data[0]["id"]
        except Exception:
            pass

        if not target_role:
            try:
                nom_res = supabase.table("nominees").select("*").eq("invitation_token", token).limit(1).execute()
                if nom_res.data:
                    target_role = "nominee"
                    target_email = nom_res.data[0]["email"].strip().lower()
                    target_name = nom_res.data[0]["name"]
                    record_table = "nominees"
                    record_id = nom_res.data[0]["id"]
            except Exception:
                pass

    if not target_role:
        raise HTTPException(status_code=404, detail="Invitation token not recognized.")

    # Update recipient / nominee status in local cache & Supabase
    if record_table == "nominees":
        update_nominee(str(record_id), {"status": "ACCEPTED", "accepted_at": now_iso})
    elif record_table == "recipients":
        update_recipient(str(record_id), {"status": "ACCEPTED", "accepted_at": now_iso})

    # Find or create profile for this user
    existing_profile = get_profile_by_email(target_email)
    if existing_profile:
        profile_id = str(existing_profile["id"])
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
        create_profile(new_profile)

    auth_user = AuthUser(
        id=profile_id,
        name=target_name,
        email=target_email,
        role=target_role,
        account_status="ACTIVE",
    )

    session_jwt = create_access_token({
        "sub": profile_id,
        "email": auth_user.email,
        "role": auth_user.role,
        "name": auth_user.name,
    })

    record_audit(profile_id, "INVITATION_ACCEPTED", f"{target_name} accepted {target_role} invitation", "SUCCESS")
    return AuthResponse(token=session_jwt, access_token=session_jwt, user=auth_user)

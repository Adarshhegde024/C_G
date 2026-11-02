"""
CloudGuard User Profile & Security Settings API Router
Handles profile viewing, details updating, check-in security configurations,
and medical hold / vault freeze controls.
"""

from typing import Dict, Any, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.models.schemas import (
    AuthUser,
    ProfileDetails,
    UpdateProfilePayload,
    UpdateSecuritySettingsPayload,
    DurationValue,
    MedicalHold,
    MedicalHoldTogglePayload,
    MedicalHoldResponse,
)
from app.database import get_profile_by_id, update_profile
from app.services.audit import record_audit
from app.services.checkin_scheduler import calculate_next_deadline

router = APIRouter(prefix="/api/profile", tags=["Profile & Settings"])


@router.get("", response_model=Dict[str, Any])
async def get_profile(current_user: AuthUser = Depends(get_current_user)):
    """Returns profile details including check-in parameters and medical hold status."""
    profile = get_profile_by_id(current_user.id) or {}
    med_hold = profile.get("medical_hold") or {"active": False, "start_date": None, "end_date": None, "note": None}
    return {
        "full_name": profile.get("full_name") or current_user.name,
        "email": profile.get("email") or current_user.email,
        "phone": profile.get("phone") or "",
        "date_of_birth": str(profile.get("date_of_birth") or "1990-01-01"),
        "created_at": profile.get("created_at") or datetime.now(timezone.utc).isoformat(),
        "account_status": profile.get("account_status", "ACTIVE"),
        "check_in_frequency": profile.get("check_in_frequency") or {"value": 30, "unit": "days"},
        "grace_period": profile.get("grace_period") or {"value": 72, "unit": "hours"},
        "medical_hold": med_hold,
    }


@router.patch("", response_model=ProfileDetails)
async def update_profile_details(
    payload: UpdateProfilePayload,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Updates mutable personal profile fields (full name, phone).
    Sensitive fields (email, DOB) are immutable.
    """
    patch = {}
    if payload.full_name is not None:
        patch["full_name"] = payload.full_name.strip()
    if payload.phone is not None:
        patch["phone"] = payload.phone.strip()

    if patch:
        patch["updated_at"] = datetime.now(timezone.utc).isoformat()
        update_profile(current_user.id, patch)
        record_audit(current_user.id, "PROFILE_UPDATED", "Updated personal details", "SUCCESS")

    profile = get_profile_by_id(current_user.id) or {}
    return ProfileDetails(
        full_name=profile.get("full_name") or current_user.name,
        email=profile.get("email") or current_user.email,
        phone=profile.get("phone") or "",
        date_of_birth=str(profile.get("date_of_birth") or "1990-01-01"),
        created_at=profile.get("created_at") or datetime.now(timezone.utc).isoformat(),
        account_status=profile.get("account_status", "ACTIVE"),
    )


@router.patch("/security-settings")
async def update_security_settings(
    payload: UpdateSecuritySettingsPayload,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Updates vault check-in frequency and grace period durations.
    Re-calculates the next check-in deadline accordingly.
    """
    profile = get_profile_by_id(current_user.id) or {}
    now = datetime.now(timezone.utc)

    patch = {"updated_at": now.isoformat()}
    
    current_freq = DurationValue(**(profile.get("check_in_frequency") or {"value": 30, "unit": "days"}))
    current_grace = DurationValue(**(profile.get("grace_period") or {"value": 72, "unit": "hours"}))

    if payload.check_in_frequency:
        current_freq = payload.check_in_frequency
        patch["check_in_frequency"] = current_freq.model_dump()
        # Recalculate deadline
        last_checkin_str = profile.get("last_check_in_at")
        last_dt = datetime.fromisoformat(last_checkin_str.replace("Z", "+00:00")) if last_checkin_str else now
        new_deadline = calculate_next_deadline(last_dt, current_freq)
        patch["next_check_in_deadline"] = new_deadline.isoformat()

    if payload.grace_period:
        current_grace = payload.grace_period
        patch["grace_period"] = current_grace.model_dump()

    update_profile(current_user.id, patch)
    record_audit(current_user.id, "SECURITY_SETTINGS_UPDATED", "Updated check-in frequency / grace period", "SUCCESS")

    return {
        "check_in_frequency": current_freq.model_dump(),
        "grace_period": current_grace.model_dump(),
    }


# ---- Medical Hold / Vault Freeze -------------------------------------------

@router.get("/medical-hold", response_model=MedicalHold)
async def get_medical_hold_status(current_user: AuthUser = Depends(get_current_user)):
    """Returns the current medical hold / vault freeze status for the owner."""
    profile = get_profile_by_id(current_user.id) or {}
    med_hold = profile.get("medical_hold") or {"active": False, "start_date": None, "end_date": None, "note": None}
    return MedicalHold(**med_hold)


@router.post("/medical-hold", response_model=MedicalHoldResponse)
async def toggle_medical_hold(
    payload: MedicalHoldTogglePayload,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Activates or deactivates Medical Hold / Vault Freeze for the owner.
    When active:
      - Vault check-in countdown is frozen.
      - Grace period and nominee case escalation are paused.
      - Document releases are completely frozen.
    When deactivated:
      - Normal check-in countdown is resumed from now.
      - Account status returns to ACTIVE.
    """
    profile = get_profile_by_id(current_user.id) or {}
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    if payload.active:
        med_hold_data = {
            "active": True,
            "start_date": now_iso,
            "end_date": None,
            "note": payload.note.strip() if payload.note else None,
        }
        patch = {
            "medical_hold": med_hold_data,
            "account_status": "MEDICAL_HOLD",
            "updated_at": now_iso,
        }
        update_profile(current_user.id, patch)
        record_audit(current_user.id, "MEDICAL_HOLD_ACTIVATED", f"Activated medical hold / vault freeze: {payload.note or 'No note provided'}", "SUCCESS")
        return MedicalHoldResponse(
            active=True,
            start_date=now_iso,
            end_date=None,
            note=med_hold_data["note"],
            account_status="MEDICAL_HOLD",
            message="Vault is now frozen under medical hold. Check-in deadlines and document releases are paused.",
        )
    else:
        # Deactivating hold: recalculate deadline fresh from now
        freq_dict = profile.get("check_in_frequency") or {"value": 30, "unit": "days"}
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
            "updated_at": now_iso,
        }
        update_profile(current_user.id, patch)
        record_audit(current_user.id, "MEDICAL_HOLD_DEACTIVATED", "Deactivated medical hold. Vault check-in deadlines resumed.", "SUCCESS")
        return MedicalHoldResponse(
            active=False,
            start_date=None,
            end_date=now_iso,
            note=None,
            account_status="ACTIVE",
            message="Medical hold deactivated. Vault resumed with a fresh check-in deadline.",
        )

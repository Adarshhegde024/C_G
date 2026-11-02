"""
CloudGuard Check-in Scheduler Service
Handles check-in interval calculations, grace periods, and account status transitions.
Automatically enforces deadlines and triggers dual-notification emails to Owner & Nominee.
"""

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple, List

from app.models.schemas import DurationValue
from app.database import (
    get_profile_by_id,
    get_all_owner_profiles,
    get_nominee_for_owner,
    update_profile,
    save_notification,
    save_legacy_case,
    get_supabase,
)
from app.services.audit import record_audit
from app.services.email import (
    send_missed_checkin_dual_alert,
    send_grace_expired_dual_alert,
)

logger = logging.getLogger("cloudguard.scheduler")


def duration_to_timedelta(duration: DurationValue) -> timedelta:
    """Converts a DurationValue (value + unit) to a Python timedelta object."""
    unit = duration.unit
    val = duration.value
    if unit == "seconds":
        return timedelta(seconds=val)
    elif unit == "minutes":
        return timedelta(minutes=val)
    elif unit == "hours":
        return timedelta(hours=val)
    else:  # days
        return timedelta(days=val)


def calculate_next_deadline(last_checkin: Optional[datetime], frequency: DurationValue) -> datetime:
    """Calculates next deadline based on last successful checkin time or now."""
    base = last_checkin if last_checkin else datetime.now(timezone.utc)
    return base + duration_to_timedelta(frequency)


def evaluate_account_status(
    profile: Dict[str, Any]
) -> Tuple[str, Optional[str], Optional[str]]:
    """
    Evaluates account status based on checkin frequency, grace period, and medical hold.
    Returns: (account_status, status_message, time_remaining)
    """
    # Check medical hold first
    med_hold = profile.get("medical_hold") or {}
    if med_hold.get("active"):
        return (
            "MEDICAL_HOLD",
            "Document releases are temporarily frozen due to an active medical hold.",
            None,
        )

    # Check deadlines
    next_deadline_str = profile.get("next_check_in_deadline")
    if not next_deadline_str:
        return ("ACTIVE", "Your vault is active and secured.", None)

    try:
        deadline = datetime.fromisoformat(next_deadline_str.replace("Z", "+00:00"))
    except Exception:
        return ("ACTIVE", "Your vault is active and secured.", None)

    now = datetime.now(timezone.utc)
    diff = deadline - now

    freq_dict = profile.get("check_in_frequency") or {"value": 30, "unit": "days"}
    grace_dict = profile.get("grace_period") or {"value": 72, "unit": "hours"}
    grace_delta = duration_to_timedelta(DurationValue(**grace_dict))

    # Calculate readable time remaining
    if diff.total_seconds() > 0:
        days = diff.days
        hours = int(diff.seconds // 3600)
        minutes = int((diff.seconds % 3600) // 60)
        if days > 0:
            time_remaining = f"{days}d {hours}h remaining"
        elif hours > 0:
            time_remaining = f"{hours}h {minutes}m remaining"
        else:
            time_remaining = f"{minutes}m remaining"
        return ("ACTIVE", "Your vault is active and secured.", time_remaining)

    # Missed deadline -> check grace period
    missed_by = now - deadline
    if missed_by <= grace_delta:
        # Inside grace period
        grace_remaining = grace_delta - missed_by
        g_hours = int(grace_remaining.total_seconds() // 3600)
        g_mins = int((grace_remaining.total_seconds() % 3600) // 60)
        return (
            "GRACE_PERIOD",
            f"Check-in missed. You have {g_hours}h {g_mins}m left in your grace period to check in.",
            "Due now",
        )

    # Beyond grace period -> nominee case eligible
    return (
        "NOMINEE_CASE_ELIGIBLE",
        "Check-in and grace period have expired. Verification case is now eligible for opening.",
        "Due now",
    )


def process_owner_deadline(owner_id: str) -> Optional[Dict[str, Any]]:
    """
    Evaluates and processes deadlines for a specific vault owner.
    Transitions states and immediately delivers dual email notifications.
    """
    owner = get_profile_by_id(owner_id)
    if not owner or owner.get("role") != "owner":
        return None

    # Skip if under medical hold
    med_hold = owner.get("medical_hold") or {}
    if med_hold.get("active"):
        return {"action": "skipped_medical_hold", "owner_id": owner_id}

    deadline_str = owner.get("next_check_in_deadline")
    if not deadline_str:
        return {"action": "no_deadline", "owner_id": owner_id}

    try:
        deadline = datetime.fromisoformat(deadline_str.replace("Z", "+00:00"))
    except Exception:
        return {"action": "invalid_deadline_format", "owner_id": owner_id}

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    # If deadline not yet reached, remain active
    if now <= deadline:
        return {"action": "active_on_track", "owner_id": owner_id, "deadline": deadline_str}

    grace_dict = owner.get("grace_period") or {"value": 72, "unit": "hours"}
    grace_delta = duration_to_timedelta(DurationValue(**grace_dict))
    grace_hours = int(grace_delta.total_seconds() // 3600)

    # Look up nominee if assigned
    nominee = get_nominee_for_owner(owner_id)
    nominee_name = nominee.get("name") if nominee else None
    nominee_email = nominee.get("email") if nominee else None

    # Check which deadline bracket we are in:
    if now <= deadline + grace_delta:
        # --------------------------------------------------------------------
        # STAGE 1: MISSED CHECK-IN -> ENTERED GRACE PERIOD
        # --------------------------------------------------------------------
        already_alerted = bool(owner.get("missed_checkin_alerted_at"))
        current_status = owner.get("account_status", "ACTIVE")

        if not already_alerted or current_status == "ACTIVE":
            logger.info(f"Triggering Missed Check-in Dual Alert for owner {owner.get('email')} and nominee {nominee_email}")

            # Send immediate dual email alert to Owner AND Nominee
            send_missed_checkin_dual_alert(
                owner_name=owner.get("full_name") or "Vault Owner",
                owner_email=owner.get("email"),
                grace_hours=grace_hours,
                nominee_name=nominee_name,
                nominee_email=nominee_email,
            )

            # Update account status and tracking timestamp
            update_profile(owner_id, {
                "account_status": "GRACE_PERIOD",
                "status_message": f"Check-in missed. Your {grace_hours}-hour grace period is active.",
                "missed_checkin_alerted_at": now_iso,
            })

            # Record security audit log
            record_audit(
                owner_id,
                "CHECKIN_MISSED_GRACE_STARTED",
                f"Missed check-in deadline {deadline_str}. Grace period initiated ({grace_hours}h). Dual email alerts dispatched.",
                "WARNING",
            )

            # In-app notifications
            save_notification({
                "id": str(uuid.uuid4()),
                "user_id": owner_id,
                "title": "Check-in Missed – Grace Period Active",
                "body": f"Your scheduled check-in was missed. You have {grace_hours} hours to check in and restore your vault.",
                "read": False,
                "created_at": now_iso,
            })

            return {"action": "transitioned_to_grace_period", "owner_id": owner_id}

    else:
        # --------------------------------------------------------------------
        # STAGE 2: GRACE PERIOD EXPIRED -> NOMINEE CASE ELIGIBLE
        # --------------------------------------------------------------------
        already_alerted = bool(owner.get("grace_expired_alerted_at"))
        current_status = owner.get("account_status")

        if not already_alerted or current_status != "NOMINEE_CASE_ELIGIBLE":
            logger.info(f"Triggering Grace Period Expired Dual Alert for owner {owner.get('email')} and nominee {nominee_email}")

            # Send immediate dual email notice to Owner AND Nominee
            send_grace_expired_dual_alert(
                owner_name=owner.get("full_name") or "Vault Owner",
                owner_email=owner.get("email"),
                nominee_name=nominee_name,
                nominee_email=nominee_email,
            )

            # Ensure a legacy case record exists for this owner/nominee
            supabase = get_supabase()
            if nominee:
                nominee_id = str(nominee["id"])
                case_res = None
                try:
                    case_res = supabase.table("legacy_cases").select("id").eq("owner_id", owner_id).limit(1).execute()
                except Exception:
                    pass

                if not case_res or not case_res.data:
                    case_id = str(uuid.uuid4())
                    save_legacy_case({
                        "id": case_id,
                        "owner_id": owner_id,
                        "nominee_id": nominee_id,
                        "status": "ELIGIBLE",
                        "created_at": now_iso,
                    })

            # Update profile status
            update_profile(owner_id, {
                "account_status": "NOMINEE_CASE_ELIGIBLE",
                "status_message": "Check-in and grace period expired. Nominee legacy verification case is now open.",
                "grace_expired_alerted_at": now_iso,
            })

            # Record security audit log
            record_audit(
                owner_id,
                "GRACE_PERIOD_EXPIRED_CASE_ELIGIBLE",
                "Both check-in deadline and grace period expired without contact. Dual emails dispatched and legacy case opened.",
                "CRITICAL",
            )

            # In-app notifications
            save_notification({
                "id": str(uuid.uuid4()),
                "user_id": owner_id,
                "title": "Critical Alert: Grace Period Expired",
                "body": "Your grace period has expired without check-in. Your nominee has been authorized to request legacy review.",
                "read": False,
                "created_at": now_iso,
            })

            return {"action": "transitioned_to_nominee_case_eligible", "owner_id": owner_id}

    return {"action": "no_change_needed", "owner_id": owner_id}


def check_and_process_deadlines(owner_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Evaluates deadlines for either a specific owner or all active owners in the system.
    Returns list of evaluated action summaries.
    """
    if owner_id:
        res = process_owner_deadline(owner_id)
        return [res] if res else []

    all_owners = get_all_owner_profiles()
    results = []
    for owner in all_owners:
        oid = str(owner.get("id"))
        r = process_owner_deadline(oid)
        if r:
            results.append(r)
    return results

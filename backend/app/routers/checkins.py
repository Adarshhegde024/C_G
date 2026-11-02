"""
CloudGuard Check-ins & Audit API Router
Handles live biometric verification submission, check-in history, and audit log access.
"""

from typing import List
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, UploadFile, Request

from app.dependencies import get_current_user
from app.models.schemas import AuthUser, CheckInRecord, SubmitCheckInResult, AuditEvent, DurationValue
from app.database import (
    get_supabase,
    get_check_ins,
    get_audit_logs,
    get_profile_by_id,
    save_check_in,
    update_profile,
)
from app.services.biometrics import verify_checkin_video
from app.services.audit import record_audit
from app.services.checkin_scheduler import (
    calculate_next_deadline,
    process_owner_deadline,
    check_and_process_deadlines,
    duration_to_timedelta,
)
from datetime import timedelta

router = APIRouter(prefix="/api", tags=["Check-ins & Audit"])


@router.get("/checkins", response_model=List[CheckInRecord])
async def list_checkins(current_user: AuthUser = Depends(get_current_user)):
    """Returns chronological check-in history for the user."""
    raw = get_check_ins(current_user.id)
    records = []
    for r in raw:
        dt = None
        if r.get("check_in_time"):
            try:
                dt = datetime.fromisoformat(r["check_in_time"].replace("Z", "+00:00"))
            except Exception:
                pass
        
        date_str = dt.strftime("%b %d, %Y") if dt else "—"
        time_str = dt.strftime("%I:%M %p") if dt else "—"

        records.append(
            CheckInRecord(
                id=str(r["id"]),
                date=date_str,
                time=time_str,
                result=r.get("result", "SUCCESS"),
                face_match=r.get("face_match"),
                liveness=r.get("liveness"),
                voice_verified=r.get("voice_verified"),
                ip_address=r.get("ip_address"),
                device=r.get("device"),
                reason=r.get("reason"),
            )
        )
    return records


@router.post("/checkins", response_model=SubmitCheckInResult)
async def submit_checkin(
    request: Request,
    video: UploadFile = File(...),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Receives live biometric video recording, performs liveness detection,
    face matching against enrolled template, and voice activity verification.
    """
    video_bytes = await video.read()
    supabase = get_supabase()
    profile = get_profile_by_id(current_user.id) or {}
    enrolled_data = profile.get("face_encodings")

    # Run Server-Side Computer Vision & Biometric Pipeline
    verification = verify_checkin_video(video_bytes, enrolled_data)

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    client_ip = request.client.host if request.client else "127.0.0.1"
    user_agent = request.headers.get("user-agent", "Browser Client")[:60]

    record_id = str(uuid.uuid4())
    storage_path = f"{current_user.id}/checkin_{record_id}.webm"

    # Save video to private 'biometrics' bucket asynchronously
    try:
        supabase.storage.from_("biometrics").upload(
            path=storage_path,
            file=video_bytes,
            file_options={"content-type": "video/webm"}
        )
    except Exception:
        pass

    # Save check-in record
    checkin_row = {
        "id": record_id,
        "user_id": current_user.id,
        "check_in_time": now_iso,
        "result": verification["result"],
        "face_match": verification["face_match"],
        "liveness": verification["liveness"],
        "voice_verified": verification["voice_verified"],
        "ip_address": client_ip,
        "device": user_agent,
        "reason": verification["reason"],
        "video_storage_path": storage_path,
        "created_at": now_iso,
    }

    save_check_in(checkin_row)

    # If verification was successful, reset deadline and maintain active status
    if verification["result"] == "SUCCESS":
        freq_dict = profile.get("check_in_frequency") or {"value": 30, "unit": "days"}
        frequency = DurationValue(**freq_dict)
        next_deadline = calculate_next_deadline(now, frequency)

        update_patch = {
            "last_check_in_at": now_iso,
            "next_check_in_deadline": next_deadline.isoformat(),
            "account_status": "ACTIVE",
            "status_message": "Vault confirmed active through verified check-in.",
            "missed_checkin_alerted_at": None,
            "grace_expired_alerted_at": None,
        }
        update_profile(current_user.id, update_patch)
        record_audit(current_user.id, "CHECK_IN_SUCCESSFUL", "Live biometric check-in verified", "SUCCESS", client_ip)
    else:
        # Note: A single failed check-in never changes account status on its own!
        record_audit(current_user.id, "CHECK_IN_FAILED", verification.get("reason"), "FAILED", client_ip)

    return SubmitCheckInResult(
        result=verification["result"],
        reason=verification["reason"],
        message=verification["message"],
    )


@router.post("/checkins/evaluate-deadlines")
async def manual_evaluate_deadlines(current_user: AuthUser = Depends(get_current_user)):
    """Manually evaluates deadlines and triggers dual email alerts if due."""
    results = check_and_process_deadlines(current_user.id if current_user.role == "owner" else None)
    return {"status": "completed", "evaluations": results}


@router.post("/checkins/simulate-missed")
async def simulate_missed_checkin(current_user: AuthUser = Depends(get_current_user)):
    """
    Simulation / Test endpoint:
    Sets deadline to 2 hours ago (inside grace period), clears alert flag,
    and immediately evaluates deadlines — dispatching dual alert emails to owner & nominee!
    """
    now = datetime.now(timezone.utc)
    two_hours_ago = (now - timedelta(hours=2)).isoformat()
    update_profile(current_user.id, {
        "next_check_in_deadline": two_hours_ago,
        "missed_checkin_alerted_at": None,
        "grace_expired_alerted_at": None,
        "account_status": "ACTIVE",
    })
    result = process_owner_deadline(current_user.id)
    return {
        "status": "simulated_missed_checkin",
        "new_deadline": two_hours_ago,
        "action_result": result,
    }


@router.post("/checkins/simulate-grace-expired")
async def simulate_grace_expired(current_user: AuthUser = Depends(get_current_user)):
    """
    Simulation / Test endpoint:
    Sets deadline to 10 days ago (past grace period), clears alert flag,
    and immediately evaluates deadlines — dispatching dual critical emails to owner & nominee
    and opening the legacy case portal!
    """
    now = datetime.now(timezone.utc)
    ten_days_ago = (now - timedelta(days=10)).isoformat()
    update_profile(current_user.id, {
        "next_check_in_deadline": ten_days_ago,
        "missed_checkin_alerted_at": (now - timedelta(days=8)).isoformat(),
        "grace_expired_alerted_at": None,
        "account_status": "GRACE_PERIOD",
    })
    result = process_owner_deadline(current_user.id)
    return {
        "status": "simulated_grace_expired",
        "new_deadline": ten_days_ago,
        "action_result": result,
    }


@router.get("/audit", response_model=List[AuditEvent])
async def list_audit_events(current_user: AuthUser = Depends(get_current_user)):
    """Returns immutable security audit history for the account."""
    raw = get_audit_logs(current_user.id)
    return [
        AuditEvent(
            id=str(a["id"]),
            timestamp=a.get("timestamp", datetime.now(timezone.utc).isoformat()),
            event=a.get("event", "SECURITY_EVENT"),
            description=a.get("description"),
            result=a.get("result"),
        )
        for a in raw
    ]

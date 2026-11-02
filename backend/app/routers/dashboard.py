"""
CloudGuard Dashboard API Router
Returns full summary of vault status, countdown deadlines, documents, and nominee status.
Optimized for instant sub-millisecond response from memory cache.
"""

from fastapi import APIRouter, Depends
from app.dependencies import get_current_user
from app.models.schemas import AuthUser, DashboardSummary, DurationValue, MedicalHold
from app.database import (
    get_profile_by_id,
    get_nominee_for_owner,
    get_documents_for_owner,
    get_recipients,
)
from app.services.checkin_scheduler import evaluate_account_status, process_owner_deadline

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("", response_model=DashboardSummary)
async def get_dashboard(current_user: AuthUser = Depends(get_current_user)):
    """Computes and returns the dashboard summary for the current user in milliseconds."""
    # Process strict deadlines & trigger notifications if due
    if current_user.role == "owner":
        process_owner_deadline(current_user.id)

    profile = get_profile_by_id(current_user.id) or {}

    # Dynamic status calculation
    account_status, status_message, time_remaining = evaluate_account_status(profile)

    # Fast in-memory counts from cached repositories
    docs_count = len(get_documents_for_owner(current_user.id))
    recips_count = len(get_recipients(current_user.id))

    # Nominee status
    nominee = get_nominee_for_owner(current_user.id)
    nominee_status = None
    if nominee:
        status_label = nominee.get("status", "PENDING").capitalize()
        nominee_status = f"{nominee.get('name')} ({status_label})"
    else:
        nominee_status = "Not configured yet."

    # Frequencies
    freq_data = profile.get("check_in_frequency") or {"value": 30, "unit": "days"}
    grace_data = profile.get("grace_period") or {"value": 72, "unit": "hours"}
    med_hold_data = profile.get("medical_hold") or {"active": False, "start_date": None, "end_date": None}

    return DashboardSummary(
        full_name=current_user.name,
        account_status=account_status,
        status_message=status_message,
        last_check_in_at=profile.get("last_check_in_at"),
        next_check_in_deadline=profile.get("next_check_in_deadline"),
        check_in_frequency=DurationValue(**freq_data),
        grace_period=DurationValue(**grace_data),
        time_remaining=time_remaining,
        documents_stored=docs_count,
        recipients_count=recips_count,
        nominee_status=nominee_status,
        medical_hold=MedicalHold(**med_hold_data),
    )

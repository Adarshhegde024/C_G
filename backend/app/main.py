"""
CloudGuard FastAPI Main Application
Integrates all API routers, CORS configuration, error handling, and startup lifecycle.
"""

import asyncio
from typing import Optional
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.config import ALLOWED_ORIGINS
from app.database import prewarm_cache
from app.services.checkin_scheduler import check_and_process_deadlines
from app.routers import (
    auth,
    dashboard,
    documents,
    recipients,
    nominee,
    checkins,
    reviewer,
    profile,
    notifications,
    invite,
)

app = FastAPI(
    title="CloudGuard Secure Digital Legacy API",
    description="Backend API for CloudGuard digital-legacy management platform.",
    version="1.0.0",
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$|^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Formats validation errors into friendly messages expected by the frontend client."""
    errors = exc.errors()
    first_msg = errors[0].get("msg") if errors else "Invalid request data."
    loc = errors[0].get("loc") if errors else []
    field_name = loc[-1] if loc else "field"
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": f"Validation error on {field_name}: {first_msg}"},
    )


# Register all API Routers
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(documents.router)
app.include_router(recipients.router)
app.include_router(nominee.router)
app.include_router(checkins.router)
app.include_router(reviewer.router)
app.include_router(profile.router)
app.include_router(notifications.router)
app.include_router(invite.router)


@app.on_event("startup")
async def start_strict_deadline_monitor():
    """
    Option B Strict Timer & In-Memory Prewarm:
    Loads records into memory for sub-millisecond response times,
    and continuously monitors check-in deadlines in background.
    """
    prewarm_cache()
    async def _deadline_monitor_loop():
        while True:
            try:
                check_and_process_deadlines()
            except Exception as e:
                pass
            # Check every 60 seconds
            await asyncio.sleep(60)

    asyncio.create_task(_deadline_monitor_loop())


@app.get("/health", tags=["Health"])
@app.get("/", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "online",
        "service": "CloudGuard API",
        "version": "1.0.0",
        "database": "Supabase PostgreSQL",
    }


@app.get("/api/system/email-diagnostics", tags=["System"])
async def email_diagnostics(to: Optional[str] = None):
    """Diagnoses email provider status and sends a real test message."""
    from app.config import (
        BREVO_API_KEY,
        RESEND_API_KEY,
        SMTP_HOST,
        SMTP_PORT,
        SMTP_USER,
        SMTP_FROM_EMAIL,
        SMTP_FROM_NAME,
    )
    from app.services.email import _send_via_brevo, _send_via_smtp, _send_via_resend

    target = to or SMTP_FROM_EMAIL or "test@example.com"
    status_report = {
        "configured_providers": {
            "brevo": bool(BREVO_API_KEY),
            "resend": bool(RESEND_API_KEY),
            "smtp": bool(SMTP_HOST),
        },
        "from_email": SMTP_FROM_EMAIL,
        "from_name": SMTP_FROM_NAME,
        "test_recipient": target,
        "results": {},
        "errors": {},
    }

    if BREVO_API_KEY:
        try:
            ok = _send_via_brevo(target, "CloudGuard Brevo Test", "<p>Test email via Brevo API</p>", "Test email via Brevo API")
            status_report["results"]["brevo"] = "DELIVERED" if ok else "FAILED"
        except Exception as e:
            status_report["errors"]["brevo"] = str(e)

    if RESEND_API_KEY:
        try:
            ok = _send_via_resend(target, "CloudGuard Resend Test", "<p>Test email via Resend API</p>", "Test email via Resend API")
            status_report["results"]["resend"] = "DELIVERED" if ok else "FAILED"
        except Exception as e:
            status_report["errors"]["resend"] = str(e)

    return status_report

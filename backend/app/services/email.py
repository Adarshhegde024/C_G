"""
CloudGuard Transactional Email Service
Dispatches cryptographically secure invitation links, deadline alerts,
and legacy notifications using SMTP, Resend API, or local dev logging.
"""

import json
import logging
import smtplib
import urllib.request
import urllib.error
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any, Optional

from app.config import (
    FRONTEND_URL,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
    SMTP_USE_TLS,
    SMTP_USE_SSL,
    RESEND_API_KEY,
    BREVO_API_KEY,
)
from app.database import save_notification, get_profile_by_email

logger = logging.getLogger("cloudguard.email")


def _send_via_smtp(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    """Delivers email via configured SMTP server."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    msg["To"] = to_email

    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    if SMTP_USE_SSL:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=4) as server:
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, [to_email], msg.as_string())
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=4) as server:
            server.ehlo()
            if SMTP_USE_TLS:
                server.starttls()
                server.ehlo()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, [to_email], msg.as_string())

    logger.info(f"Delivered email to {to_email} via SMTP ({SMTP_HOST}:{SMTP_PORT})")
    return True


def _send_via_brevo(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    """Delivers email via Brevo (Sendinblue) HTTP API over HTTPS (Port 443 - works on Render Free Tier)."""
    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    sender_email = SMTP_FROM_EMAIL if SMTP_FROM_EMAIL and "@" in SMTP_FROM_EMAIL else (SMTP_USER or "noreply@cloudguard.io")
    payload = {
        "sender": {"name": SMTP_FROM_NAME or "CloudGuard Security", "email": sender_email},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html_body,
        "textContent": text_body,
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status in (200, 201, 202):
                logger.info(f"Delivered email to {to_email} via Brevo API")
                return True
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="replace")
        logger.error(f"Brevo API error ({err.code}): {err_body}")
        raise RuntimeError(f"Brevo API error {err.code}: {err_body}")
    return False


def _send_via_resend(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    """Delivers email via Resend HTTP API over HTTPS (Port 443 - works on Render Free Tier)."""
    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CloudGuard/1.0",
    }
    # Resend default sandbox sender if not using custom verified domain
    sender = f"{SMTP_FROM_NAME} <onboarding@resend.dev>" if "@resend.dev" in SMTP_FROM_EMAIL or not SMTP_HOST else f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    payload = {
        "from": sender,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
        "text": text_body,
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=10) as response:
        if response.status in (200, 201):
            logger.info(f"Delivered email to {to_email} via Resend API")
            return True
    return False


def send_email(to_email: str, subject: str, html_body: str, text_body: Optional[str] = None) -> Dict[str, Any]:
    """
    Unified transactional email dispatcher.
    Tries Brevo (HTTPS) -> Resend (HTTPS) -> SMTP -> Local dev fallback.
    Always returns structured delivery status without crashing.
    """
    clean_to = to_email.strip().lower()
    plain = text_body or subject

    # Prevent real dispatch to internal demo/placeholder domains (avoids mail bounces)
    DEMO_DOMAINS = ("@cloudguard.io", "@example.com", "@test.com", "@localhost", "@sample.com")
    is_demo_address = any(clean_to.endswith(d) for d in DEMO_DOMAINS)

    if not is_demo_address:
        # 1. Try Brevo HTTP API over Port 443 (never blocked by Render Free Tier)
        if BREVO_API_KEY:
            try:
                if _send_via_brevo(clean_to, subject, html_body, plain):
                    return {"success": True, "method": "brevo", "recipient": clean_to}
            except Exception as e:
                logger.warning(f"Brevo API dispatch failed to {clean_to}: {e}")

        # 2. Try Resend HTTP API over Port 443 (never blocked by Render Free Tier)
        if RESEND_API_KEY:
            try:
                if _send_via_resend(clean_to, subject, html_body, plain):
                    return {"success": True, "method": "resend", "recipient": clean_to}
            except Exception as e:
                logger.warning(f"Resend dispatch failed to {clean_to}: {e}")

        # 3. Try SMTP (works locally and on hosting without blocked mail ports)
        if SMTP_HOST:
            try:
                if _send_via_smtp(clean_to, subject, html_body, plain):
                    return {"success": True, "method": "smtp", "recipient": clean_to}
            except Exception as e:
                logger.warning(f"SMTP dispatch failed to {clean_to} (Port blocked or timeout): {e}")
    else:
        logger.info(f"Demo address detected ({clean_to}) - skipping external dispatch to avoid mailbox bounce.")

    # 3. Development / Safe Console Fallback & In-App Notification
    print("\n" + "=" * 70)
    print(f" [EMAIL DISPATCH - CLOUDGUARD NOTIFICATION]")
    print(f" To:       {clean_to}")
    print(f" Subject:  {subject}")
    print(f" Content:  {plain}")
    print("=" * 70 + "\n")

    # In-app notification for the recipient if they already have a registered profile
    profile = get_profile_by_email(clean_to)
    if profile:
        import uuid
        from datetime import datetime, timezone
        save_notification({
            "id": str(uuid.uuid4()),
            "user_id": profile["id"],
            "title": subject,
            "body": plain,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    return {
        "success": True,
        "method": "local_dev_fallback",
        "recipient": clean_to,
        "note": "Logged to server console and created in-app notification. Configure SMTP_HOST in .env to deliver real SMTP emails.",
    }


# ============================================================================
# EMAIL TEMPLATE BUILDERS
# ============================================================================

def _wrap_email_html(title: str, preheader: str, content_html: str, action_url: Optional[str] = None, action_label: Optional[str] = None) -> str:
    """Wraps body content in responsive, high-trust CloudGuard branded email template."""
    action_button = ""
    if action_url and action_label:
        action_button = f"""
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
            <tr>
                <td align="center">
                    <a href="{action_url}" target="_blank" style="background-color: #7c3aed; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; letter-spacing: 0.3px;">
                        {action_label} &rarr;
                    </a>
                </td>
            </tr>
        </table>
        <p style="font-size: 13px; color: #64748b; margin-top: 10px;">
            If the button above does not work, copy and paste this link into your browser:<br>
            <a href="{action_url}" style="color: #8b5cf6; word-break: break-all;">{action_url}</a>
        </p>
        """

    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; line-height: 1.6;">
    <div style="display: none; max-height: 0px; overflow: hidden;">{preheader}</div>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0b0f19; padding: 40px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 28px 32px; background-color: #131b2e; border-bottom: 1px solid #1e293b;">
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td>
                                        <span style="font-size: 20px; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px;">cloudguard.</span>
                                        <span style="display: inline-block; margin-left: 8px; padding: 2px 8px; background-color: #312e81; color: #a5b4fc; font-size: 11px; font-weight: 600; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Security</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 36px 32px;">
                            <h1 style="margin: 0 0 18px; font-size: 22px; font-weight: 700; color: #f8fafc; letter-spacing: -0.3px;">{title}</h1>
                            {content_html}
                            {action_button}
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 32px; background-color: #0c1220; border-top: 1px solid #1f2937; font-size: 12px; color: #64748b; line-height: 1.5;">
                            <p style="margin: 0 0 8px;"><strong>Security notice:</strong> CloudGuard employees will never ask you for your master key, credentials, or biometric phrase.</p>
                            <p style="margin: 0;">This is an automated security transmission from CloudGuard Digital Legacy Systems. &copy; 2026 CloudGuard Inc.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""


# ============================================================================
# SPECIFIC EVENT EMAIL DISPATCHERS
# ============================================================================

def send_nominee_invitation_email(
    nominee_name: str,
    nominee_email: str,
    owner_name: str,
    token: str,
) -> Dict[str, Any]:
    """Sends invitation to a designated nominee with their one-time setup link."""
    invite_url = f"{FRONTEND_URL}/invite/{token}"
    subject = f"Action Required: You have been designated as a CloudGuard Legacy Nominee by {owner_name}"
    preheader = f"{owner_name} designated you as their trusted legacy nominee."

    content_html = f"""
    <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">Hello <strong>{nominee_name}</strong>,</p>
    <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">
        <strong>{owner_name}</strong> has designated you as their <strong>Nominated Person</strong> on CloudGuard — a secure digital-legacy and asset protection platform.
    </p>
    <div style="background-color: #1e293b; border-left: 4px solid #7c3aed; padding: 14px 18px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 0; font-size: 14px; color: #e2e8f0; font-weight: 500;">What does being a Nominee mean?</p>
        <p style="margin: 6px 0 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
            You will only ever be asked to participate if {owner_name} misses their scheduled check-ins and grace period without response. A missed check-in alone never triggers release: independent human reviewers and verified evidence are strictly required.
        </p>
    </div>
    <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">
        Please accept this designation below to set up your secure access credentials.
    </p>
    """

    text_body = f"""Hello {nominee_name},

{owner_name} has designated you as their Nominated Person on CloudGuard.

As a nominee, you will only participate in verification if {owner_name} misses check-ins and grace periods. A human reviewer strictly evaluates all cases.

Please accept your invitation and create your access credentials by visiting:
{invite_url}

This invitation link is valid for 7 days.
CloudGuard Security Team"""

    html = _wrap_email_html(
        title="Legacy Nominee Designation",
        preheader=preheader,
        content_html=content_html,
        action_url=invite_url,
        action_label="Accept Nominee Designation",
    )
    return send_email(nominee_email, subject, html, text_body)


def send_recipient_invitation_email(
    recipient_name: str,
    recipient_email: str,
    owner_name: str,
    token: str,
) -> Dict[str, Any]:
    """Sends invitation to a trusted recipient."""
    invite_url = f"{FRONTEND_URL}/invite/{token}"
    subject = f"You have been added as a trusted document recipient by {owner_name} on CloudGuard"
    preheader = f"{owner_name} added you as a trusted recipient."

    content_html = f"""
    <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">Hello <strong>{recipient_name}</strong>,</p>
    <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">
        <strong>{owner_name}</strong> has added you as a trusted recipient in their secure CloudGuard vault.
    </p>
    <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">
        Any encrypted documents designated for you will remain safely protected and will only become accessible in the event that authorized legacy distribution protocols are completed and reviewed.
    </p>
    <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">
        Please confirm your recipient profile by clicking the button below:
    </p>
    """

    text_body = f"""Hello {recipient_name},

{owner_name} has added you as a trusted recipient on CloudGuard.

Please confirm your recipient profile by visiting:
{invite_url}

CloudGuard Security Team"""

    html = _wrap_email_html(
        title="Trusted Recipient Invitation",
        preheader=preheader,
        content_html=content_html,
        action_url=invite_url,
        action_label="Confirm Recipient Profile",
    )
    return send_email(recipient_email, subject, html, text_body)


def send_missed_checkin_dual_alert(
    owner_name: str,
    owner_email: str,
    grace_hours: int,
    nominee_name: Optional[str] = None,
    nominee_email: Optional[str] = None,
) -> Dict[str, Any]:
    """
    IMMEDIATELY alerts BOTH the Vault Owner AND Nominee that a check-in was missed
    and the grace period is running.
    """
    results = {}
    checkin_url = f"{FRONTEND_URL}/check-in"

    # 1. Alert to Vault Owner
    owner_subject = "URGENT: CloudGuard Check-in Missed – Grace Period Started"
    owner_content = f"""
    <div style="background-color: #451a03; border-left: 4px solid #f59e0b; padding: 14px 18px; border-radius: 4px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 14px; color: #fef3c7; font-weight: 600;">Status: Grace Period Active ({grace_hours} Hours)</p>
    </div>
    <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">Hello <strong>{owner_name}</strong>,</p>
    <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">
        You have missed your scheduled CloudGuard check-in deadline. Your vault has now entered its <strong>{grace_hours}-hour grace period</strong>.
    </p>
    <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">
        Please log into CloudGuard immediately and perform a live biometric check-in to confirm your safety and restore your vault to <strong>ACTIVE</strong> status.
    </p>
    <p style="margin: 0 0 16px; font-size: 13px; color: #94a3b8;">
        Notice: If no verified check-in occurs before the grace period ends, your designated nominee will be granted eligibility to initiate the formal legacy verification procedure.
    </p>
    """
    owner_text = f"""URGENT: Check-in Missed on CloudGuard

Hello {owner_name},
You missed your scheduled check-in deadline. Your vault is in a {grace_hours}-hour grace period.
Please check in now to reset your status:
{checkin_url}"""

    owner_html = _wrap_email_html(
        title="Check-in Missed — Grace Period Active",
        preheader=f"CloudGuard alert: Your {grace_hours}-hour grace period is running.",
        content_html=owner_content,
        action_url=checkin_url,
        action_label="Complete Check-in Now",
    )
    results["owner"] = send_email(owner_email, owner_subject, owner_html, owner_text)

    # 2. Alert to Nominee (if designated)
    if nominee_email and nominee_name:
        nominee_subject = f"Notice: CloudGuard Vault Check-in Missed by {owner_name}"
        nominee_content = f"""
        <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">Hello <strong>{nominee_name}</strong>,</p>
        <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">
            We are notifying you that <strong>{owner_name}</strong> has missed their scheduled CloudGuard check-in deadline.
        </p>
        <div style="background-color: #1e293b; border-left: 4px solid #3b82f6; padding: 14px 18px; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #93c5fd; font-weight: 500;">No action is required from you right now.</p>
            <p style="margin: 6px 0 0; font-size: 13px; color: #cbd5e1; line-height: 1.5;">
                {owner_name}'s account is currently in a <strong>{grace_hours}-hour grace period</strong>. If they log in and verify their presence, the timer will automatically reset. We will notify you again if further steps become necessary.
            </p>
        </div>
        """
        nominee_text = f"""Notice: CloudGuard Check-in Missed by {owner_name}

Hello {nominee_name},
{owner_name} missed their scheduled check-in. A {grace_hours}-hour grace period is currently running.
No action is required from you at this time. We will notify you if further steps become necessary.
CloudGuard Security Team"""

        nominee_html = _wrap_email_html(
            title=f"Check-in Status Notice: {owner_name}",
            preheader=f"Status update regarding {owner_name}'s CloudGuard vault.",
            content_html=nominee_content,
        )
        results["nominee"] = send_email(nominee_email, nominee_subject, nominee_html, nominee_text)

    return results


def send_grace_expired_dual_alert(
    owner_name: str,
    owner_email: str,
    nominee_name: Optional[str] = None,
    nominee_email: Optional[str] = None,
) -> Dict[str, Any]:
    """
    IMMEDIATELY alerts BOTH the Vault Owner AND Nominee that the grace period
    has fully expired, unlocking legacy verification for the nominee.
    """
    results = {}
    case_url = f"{FRONTEND_URL}/nominee/case"
    checkin_url = f"{FRONTEND_URL}/check-in"

    # 1. Critical Notice to Vault Owner
    owner_subject = "CRITICAL ALERT: CloudGuard Grace Period Expired"
    owner_content = f"""
    <div style="background-color: #450a0a; border-left: 4px solid #ef4444; padding: 14px 18px; border-radius: 4px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 14px; color: #fecaca; font-weight: 600;">Status: Grace Period Expired — Legacy Case Eligible</p>
    </div>
    <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">Hello <strong>{owner_name}</strong>,</p>
    <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">
        Your scheduled check-in deadline and full grace period have expired without a verified response.
    </p>
    <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">
        In accordance with your digital legacy policy, your nominated person has been authorized to initiate the verification case process. If you are safe and this is an oversight, please log into your account immediately to verify your identity.
    </p>
    """
    owner_text = f"""CRITICAL ALERT: CloudGuard Grace Period Expired

Hello {owner_name},
Your check-in deadline and grace period have expired. Your nominee has been authorized to initiate verification.
If you are safe, log in immediately to verify your identity:
{checkin_url}"""

    owner_html = _wrap_email_html(
        title="Critical Notice: Grace Period Expired",
        preheader="Your CloudGuard grace period has expired.",
        content_html=owner_content,
        action_url=checkin_url,
        action_label="Verify Identity Immediately",
    )
    results["owner"] = send_email(owner_email, owner_subject, owner_html, owner_text)

    # 2. Action Required Email to Nominee
    if nominee_email and nominee_name:
        nominee_subject = f"ACTION REQUIRED: CloudGuard Legacy Case Opened for {owner_name}"
        nominee_content = f"""
        <div style="background-color: #172554; border-left: 4px solid #3b82f6; padding: 14px 18px; border-radius: 4px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 14px; color: #bfdbfe; font-weight: 600;">Legacy Case Eligible for Initiation</p>
        </div>
        <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">Hello <strong>{nominee_name}</strong>,</p>
        <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">
            Both the scheduled check-in and grace period for <strong>{owner_name}</strong> have expired without verified contact.
        </p>
        <p style="margin: 0 0 16px; font-size: 15px; color: #cbd5e1;">
            As {owner_name}'s designated nominee, you are now authorized to open the <strong>Legacy Case Review</strong> and upload official verification documentation (such as a death certificate or official hospital medical report).
        </p>
        <p style="margin: 0 0 16px; font-size: 13px; color: #94a3b8;">
            Please note: Document releases are never automated. CloudGuard senior compliance reviewers will examine all evidence thoroughly before any legacy distribution is approved.
        </p>
        """
        nominee_text = f"""ACTION REQUIRED: CloudGuard Legacy Case Opened for {owner_name}

Hello {nominee_name},
{owner_name}'s check-in and grace period have expired without verification.
As their designated nominee, you may now open the legacy verification case and submit official evidence:
{case_url}

CloudGuard Security Team"""

        nominee_html = _wrap_email_html(
            title=f"Legacy Verification Eligible: {owner_name}",
            preheader=f"You may now submit legacy verification evidence for {owner_name}.",
            content_html=nominee_content,
            action_url=case_url,
            action_label="Open Nominee Case Portal",
        )
        results["nominee"] = send_email(nominee_email, nominee_subject, nominee_html, nominee_text)

    return results

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def get_owner_token():
    login_res = client.post("/api/auth/login", json={"email": "vaultowner_test@cloudguard.io", "password": "Password123!"})
    if login_res.status_code != 200:
        reg_payload = {
            "email": "vaultowner_test@cloudguard.io",
            "password": "Password123!",
            "full_name": "Test Vault Owner",
            "date_of_birth": "1990-05-15",
            "phone": "+1 555-0199",
            "check_in_frequency": {"value": 30, "unit": "days"},
            "grace_period": {"value": 72, "unit": "hours"},
            "face_samples": ["data:image/jpeg;base64,/9j/4AAQSkZJRg=="],
        }
        client.post("/api/auth/register", json=reg_payload)
        login_res = client.post("/api/auth/login", json={"email": "vaultowner_test@cloudguard.io", "password": "Password123!"})
    return login_res.json()["token"]


def test_health_check():
    """Verify system health endpoint."""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert data["service"] == "CloudGuard API"


def test_register_and_login_flow():
    """Verify owner registration, duplicate prevention, and JWT login."""
    unique_email = "vaultowner_test@cloudguard.io"
    password = "Password123!"

    # 1. Register with biometric face samples
    reg_payload = {
        "email": unique_email,
        "password": password,
        "full_name": "Test Vault Owner",
        "date_of_birth": "1990-05-15",
        "phone": "+1 555-0199",
        "check_in_frequency": {"value": 30, "unit": "days"},
        "grace_period": {"value": 72, "unit": "hours"},
        "face_samples": ["data:image/jpeg;base64,/9j/4AAQSkZJRg=="],
    }
    reg_res = client.post("/api/auth/register", json=reg_payload)
    assert reg_res.status_code in [200, 201, 409]

    # 2. Login
    login_payload = {"email": unique_email, "password": password}
    login_res = client.post("/api/auth/login", json=login_payload)
    assert login_res.status_code == 200
    data = login_res.json()
    assert "token" in data
    assert data["user"]["email"] == unique_email
    assert data["user"]["role"] == "owner"


def test_recipients_and_nominee():
    """Verify trusted recipient and nominee designation endpoints."""
    token = get_owner_token()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Add Recipient
    rec_payload = {"name": "Test Recipient", "email": "test_recipient@cloudguard.io"}
    rec_res = client.post("/api/recipients", headers=headers, json=rec_payload)
    assert rec_res.status_code == 200
    rec_data = rec_res.json()
    assert rec_data["name"] == "Test Recipient"
    assert rec_data["email"] == "test_recipient@cloudguard.io"

    # List recipients
    list_res = client.get("/api/recipients", headers=headers)
    assert list_res.status_code == 200
    assert len(list_res.json()) > 0

    # 2. Configure Nominee
    nom_payload = {"name": "Test Nominee", "email": "test_nominee@cloudguard.io"}
    nom_res = client.post("/api/nominee", headers=headers, json=nom_payload)
    assert nom_res.status_code == 200
    nom_data = nom_res.json()
    assert nom_data["name"] == "Test Nominee"

    # Get Nominee
    get_nom = client.get("/api/nominee", headers=headers)
    assert get_nom.status_code == 200
    assert get_nom.json()["name"] == "Test Nominee"


def test_document_management():
    """Verify document upload, recipient assignment, release/revoke, and file download."""
    token = get_owner_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Upload document
    files = {"file": ("last_will_test.pdf", b"%PDF-1.4 test document content", "application/pdf")}
    upload_res = client.post("/api/documents", headers=headers, files=files)
    assert upload_res.status_code == 200
    doc = upload_res.json()
    assert doc["name"] == "last_will_test.pdf"
    assert doc["encryption_status"] == "ENCRYPTED"

    doc_id = doc["id"]

    # Test download URL endpoint
    url_res = client.get(f"/api/documents/{doc_id}/download-url", headers=headers)
    assert url_res.status_code == 200
    assert "download_url" in url_res.json()
    assert url_res.json()["file_name"] == "last_will_test.pdf"

    # Test direct file download
    dl_res = client.get(f"/api/documents/{doc_id}/download", headers=headers)
    assert dl_res.status_code == 200
    assert len(dl_res.content) > 0
    assert dl_res.content == b"%PDF-1.4 test document content"

    # Release document
    rel_res = client.post(f"/api/documents/{doc_id}/release", headers=headers)
    assert rel_res.status_code == 200
    assert rel_res.json()["release_status"] == "RELEASED"

    # Revoke release
    rev_res = client.post(f"/api/documents/{doc_id}/revoke-release", headers=headers)
    assert rev_res.status_code == 200
    assert rev_res.json()["release_status"] == "NOT_RELEASED"

    # List documents
    docs_list = client.get("/api/documents", headers=headers)
    assert docs_list.status_code == 200
    assert len(docs_list.json()) > 0


def test_live_checkin_and_audit():
    """Verify live biometric check-in endpoint and security audit trail."""
    token = get_owner_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Submit video recording (simulating 12-second WebM)
    mock_webm_bytes = b"\x1a\x45\xdf\xa3" + b"\x00" * 20000
    files = {"video": ("check-in.webm", mock_webm_bytes, "video/webm")}
    checkin_res = client.post("/api/checkins", headers=headers, files=files)
    assert checkin_res.status_code == 200
    result = checkin_res.json()
    assert result["result"] in ["SUCCESS", "FAILED"]

    # Check checkin history
    hist_res = client.get("/api/checkins", headers=headers)
    assert hist_res.status_code == 200
    assert len(hist_res.json()) > 0

    # Check security audit trail
    audit_res = client.get("/api/audit", headers=headers)
    assert audit_res.status_code == 200
    assert len(audit_res.json()) > 0


def test_reviewer_and_multi_roles():
    """Verify RBAC and endpoints for reviewer, nominee, and recipient roles."""
    # 1. Reviewer Login
    rev_res = client.post("/api/auth/login", json={"email": "reviewer@cloudguard.io", "password": "Password123!"})
    assert rev_res.status_code == 200
    rev_data = rev_res.json()
    assert rev_data["user"]["role"] == "reviewer"
    rev_token = rev_data["token"]
    rev_headers = {"Authorization": f"Bearer {rev_token}"}

    # Reviewer can list cases
    cases_res = client.get("/api/reviewer/cases", headers=rev_headers)
    assert cases_res.status_code == 200
    assert isinstance(cases_res.json(), list)

    # 2. Recipient Login
    rec_res = client.post("/api/auth/login", json={"email": "recipient@cloudguard.io", "password": "Password123!"})
    assert rec_res.status_code == 200
    assert rec_res.json()["user"]["role"] == "recipient"
    rec_headers = {"Authorization": f"Bearer {rec_res.json()['token']}"}

    # Recipient can list released documents
    rec_docs = client.get("/api/documents", headers=rec_headers)
    assert rec_docs.status_code == 200
    assert isinstance(rec_docs.json(), list)

    # 3. Nominee Login
    nom_res = client.post("/api/auth/login", json={"email": "nominee@cloudguard.io", "password": "Password123!"})
    assert nom_res.status_code == 200
    assert nom_res.json()["user"]["role"] == "nominee"


def test_nominee_and_recipient_email_invitations():
    """Verify real email invitation dispatch triggers for nominee and recipient."""
    token = get_owner_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Send Nominee Invitation
    nom_invite = client.post("/api/nominee/invite", headers=headers)
    assert nom_invite.status_code == 200
    assert nom_invite.json()["status"] in ["PENDING", "INVITED"]

    # Send Recipient Invitation
    rec_list = client.get("/api/recipients", headers=headers).json()
    if len(rec_list) > 0:
        first_rec_id = rec_list[0]["id"]
        rec_invite = client.post(f"/api/recipients/{first_rec_id}/invite", headers=headers)
        assert rec_invite.status_code == 200
        assert rec_invite.json()["invitation_status"] in ["PENDING", "INVITED"]


def test_missed_checkin_and_grace_period_dual_notifications():
    """Verify simulation endpoints for missed check-in and grace period expiration."""
    token = get_owner_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Simulate missed check-in
    sim_missed = client.post("/api/checkins/simulate-missed", headers=headers)
    assert sim_missed.status_code == 200
    assert sim_missed.json()["status"] == "simulated_missed_checkin"

    # Simulate grace expired
    sim_grace = client.post("/api/checkins/simulate-grace-expired", headers=headers)
    assert sim_grace.status_code == 200
    assert sim_grace.json()["status"] == "simulated_grace_expired"


def test_reviewer_evidence_preview_and_download():
    """Verify nominee submits evidence and reviewer can inspect, get URLs, and download/preview."""
    # 1. Nominee submits evidence
    nom_login = client.post("/api/auth/login", json={"email": "nominee@cloudguard.io", "password": "Password123!"})
    assert nom_login.status_code == 200
    nom_token = nom_login.json()["token"]
    nom_headers = {"Authorization": f"Bearer {nom_token}"}

    sample_evidence = b"OFFICIAL DEATH CERTIFICATE\nName: Alexander Vance\nDOB: 1982-04-12\nState of California"
    files = {"file": ("death_certificate.pdf", sample_evidence, "application/pdf")}
    data = {"note": "Submitting certified copy of certificate for review."}

    sub_res = client.post("/api/nominee/case/evidence", headers=nom_headers, files=files, data=data)
    assert sub_res.status_code == 200
    nom_case = sub_res.json()
    assert len(nom_case["evidence"]) > 0
    evidence_id = nom_case["evidence"][0]["id"]
    assert nom_case["evidence"][0]["download_url"] is not None

    # 2. Reviewer inspects case detail
    rev_login = client.post("/api/auth/login", json={"email": "reviewer@cloudguard.io", "password": "Password123!"})
    rev_token = rev_login.json()["token"]
    rev_headers = {"Authorization": f"Bearer {rev_token}"}

    case_detail = client.get(f"/api/reviewer/cases/{nom_case['id']}", headers=rev_headers)
    assert case_detail.status_code == 200
    assert len(case_detail.json()["evidence"]) > 0

    # 3. Reviewer gets evidence url info
    info_res = client.get(f"/api/reviewer/evidence/{evidence_id}/url", headers=rev_headers)
    assert info_res.status_code == 200
    assert info_res.json()["file_name"] == "death_certificate.pdf"
    assert "download" in info_res.json()["download_url"]

    # 4. Reviewer downloads evidence file
    dl_res = client.get(f"/api/reviewer/evidence/{evidence_id}/download", headers=rev_headers)
    assert dl_res.status_code == 200
    assert b"OFFICIAL DEATH CERTIFICATE" in dl_res.content
    assert "attachment" in dl_res.headers.get("content-disposition", "")

    # 5. Reviewer previews evidence inline
    preview_res = client.get(f"/api/reviewer/evidence/{evidence_id}/download?inline=true", headers=rev_headers)
    assert preview_res.status_code == 200
    assert "inline" in preview_res.headers.get("content-disposition", "")


def test_medical_hold_toggle_and_freeze():
    """Verify owner can activate and deactivate medical hold / vault freeze."""
    token = get_owner_token()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Check initial hold status
    hold_get = client.get("/api/profile/medical-hold", headers=headers)
    assert hold_get.status_code == 200
    assert isinstance(hold_get.json()["active"], bool)

    # 2. Activate medical hold
    activate_res = client.post(
        "/api/profile/medical-hold",
        headers=headers,
        json={"active": True, "note": "Scheduled knee surgery and hospital stay."},
    )
    assert activate_res.status_code == 200
    act_data = activate_res.json()
    assert act_data["active"] is True
    assert act_data["account_status"] == "MEDICAL_HOLD"
    assert act_data["note"] == "Scheduled knee surgery and hospital stay."

    # 3. Verify dashboard reflects frozen state
    dash_frozen = client.get("/api/dashboard", headers=headers).json()
    assert dash_frozen["account_status"] == "MEDICAL_HOLD"
    assert dash_frozen["medical_hold"]["active"] is True

    # 4. Deactivate medical hold
    deactivate_res = client.post(
        "/api/profile/medical-hold",
        headers=headers,
        json={"active": False},
    )
    assert deactivate_res.status_code == 200
    deact_data = deactivate_res.json()
    assert deact_data["active"] is False
    assert deact_data["account_status"] == "ACTIVE"

    # 5. Verify dashboard resumed normal active status
    dash_resumed = client.get("/api/dashboard", headers=headers).json()
    assert dash_resumed["account_status"] == "ACTIVE"
    assert dash_resumed["medical_hold"]["active"] is False
    assert dash_resumed["next_check_in_deadline"] is not None



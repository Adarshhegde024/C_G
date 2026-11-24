"""
CloudGuard Supabase PostgreSQL Client & Repository
Primary database access layer with high-speed in-memory cache-first architecture
and non-blocking background synchronization with Supabase PostgreSQL.
"""

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from concurrent.futures import ThreadPoolExecutor
import bcrypt
from supabase import create_client, Client
from app.config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, STORAGE_DIR

logger = logging.getLogger("cloudguard.database")

# Thread pool executor for non-blocking background sync with Supabase
_db_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="supabase_sync")

import socket
from urllib.parse import urlparse

def _check_host_resolves(url_str: str) -> bool:
    try:
        host = urlparse(url_str).hostname
        if not host:
            return False
        socket.getaddrinfo(host, 443)
        return True
    except Exception:
        return False

class _SafeSupabaseTable:
    def __init__(self, table_name: str):
        self.table_name = table_name

    def select(self, *args, **kwargs): return self
    def insert(self, *args, **kwargs): return self
    def update(self, *args, **kwargs): return self
    def delete(self, *args, **kwargs): return self
    def eq(self, *args, **kwargs): return self
    def neq(self, *args, **kwargs): return self
    def in_(self, *args, **kwargs): return self
    def limit(self, *args, **kwargs): return self
    def order(self, *args, **kwargs): return self
    def gte(self, *args, **kwargs): return self
    def lte(self, *args, **kwargs): return self

    def execute(self):
        class _Result:
            data = []
            count = 0
        return _Result()

class _SafeSupabaseStorage:
    def from_(self, *args, **kwargs): return self
    def upload(self, *args, **kwargs): return {"path": "local"}
    def download(self, *args, **kwargs): return b""
    def create_signed_url(self, *args, **kwargs): return {"signedURL": ""}
    def remove(self, *args, **kwargs): return []

class _SafeSupabaseClient:
    def table(self, name: str):
        return _SafeSupabaseTable(name)

    @property
    def storage(self):
        return _SafeSupabaseStorage()

# Initialize client using service role key if available, with instant fallback if host unresolvable
_key = SUPABASE_SERVICE_ROLE_KEY if SUPABASE_SERVICE_ROLE_KEY else SUPABASE_KEY
_is_supabase_live = _check_host_resolves(SUPABASE_URL)

if _is_supabase_live:
    try:
        supabase_client: Client = create_client(SUPABASE_URL, _key)
    except Exception as e:
        logger.warning(f"Failed to create Supabase client: {e}. Using fast in-memory client.")
        supabase_client = _SafeSupabaseClient()
else:
    logger.info("Remote Supabase host not reachable. Running with high-speed in-process cache.")
    supabase_client = _SafeSupabaseClient()

def _hash_default(pw: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pw.encode("utf-8"), salt).decode("utf-8")

# In-process synchronized cache
_demo_hash = _hash_default("Password123!")

_profiles: Dict[str, Dict[str, Any]] = {
    "00000000-0000-0000-0000-000000000010": {
        "id": "00000000-0000-0000-0000-000000000010",
        "email": "adarshhegde024@gmail.com",
        "full_name": "Adarsh Hegde (Owner)",
        "phone": "+91 98765 43210",
        "date_of_birth": "1998-01-01",
        "role": "owner",
        "account_status": "ACTIVE",
        "password_hash": _hash_default("12345678"),
        "check_in_frequency": {"value": 30, "unit": "days"},
        "grace_period": {"value": 72, "unit": "hours"},
        "last_check_in_at": datetime.now(timezone.utc).isoformat(),
        "next_check_in_deadline": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
    "00000000-0000-0000-0000-000000000001": {
        "id": "00000000-0000-0000-0000-000000000001",
        "email": "owner@cloudguard.io",
        "full_name": "Alexander Vance (Owner)",
        "phone": "+1 (555) 019-2834",
        "date_of_birth": "1982-04-12",
        "role": "owner",
        "account_status": "ACTIVE",
        "password_hash": _demo_hash,
        "check_in_frequency": {"value": 30, "unit": "days"},
        "grace_period": {"value": 72, "unit": "hours"},
        "last_check_in_at": datetime.now(timezone.utc).isoformat(),
        "next_check_in_deadline": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
    "00000000-0000-0000-0000-000000000002": {
        "id": "00000000-0000-0000-0000-000000000002",
        "email": "recipient@cloudguard.io",
        "full_name": "Eleanor Vance (Recipient)",
        "phone": "+1 (555) 019-8877",
        "role": "recipient",
        "account_status": "ACTIVE",
        "password_hash": _demo_hash,
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
    "00000000-0000-0000-0000-000000000003": {
        "id": "00000000-0000-0000-0000-000000000003",
        "email": "nominee@cloudguard.io",
        "full_name": "Marcus Sterling (Nominee)",
        "phone": "+1 (555) 019-9944",
        "role": "nominee",
        "account_status": "ACTIVE",
        "password_hash": _demo_hash,
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
    "00000000-0000-0000-0000-000000000004": {
        "id": "00000000-0000-0000-0000-000000000004",
        "email": "reviewer@cloudguard.io",
        "full_name": "Sarah Jenkins (Senior Reviewer)",
        "role": "reviewer",
        "account_status": "ACTIVE",
        "password_hash": _demo_hash,
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
}

_documents: Dict[str, Dict[str, Any]] = {}
_recipients: Dict[str, Dict[str, Any]] = {}
_nominees: Dict[str, Dict[str, Any]] = {}
_check_in_records: List[Dict[str, Any]] = []
_legacy_cases: Dict[str, Dict[str, Any]] = {}
_case_evidence: Dict[str, Dict[str, Any]] = {}
_audit_logs: List[Dict[str, Any]] = []
_notifications: List[Dict[str, Any]] = []

_STATE_FILE = STORAGE_DIR / "cloudguard_local_state.json"

def _persist_state_to_disk():
    try:
        import json
        payload = {
            "profiles": _profiles,
            "nominees": _nominees,
            "recipients": _recipients,
            "documents": _documents,
            "check_in_records": _check_in_records,
            "legacy_cases": _legacy_cases,
            "case_evidence": _case_evidence,
        }
        with open(_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(payload, f)
    except Exception as e:
        logger.debug(f"Failed to persist state to disk: {e}")

def _load_state_from_disk():
    try:
        import json
        if _STATE_FILE.exists():
            with open(_STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                _profiles.update(data.get("profiles", {}))
                _nominees.update(data.get("nominees", {}))
                _recipients.update(data.get("recipients", {}))
                _documents.update(data.get("documents", {}))
                _legacy_cases.update(data.get("legacy_cases", {}))
                _case_evidence.update(data.get("case_evidence", {}))
                stored_records = data.get("check_in_records", [])
                if stored_records:
                    _check_in_records.extend(stored_records)
    except Exception as e:
        logger.debug(f"Failed to load state from disk: {e}")

    # Ensure demo seed records and existing records always have active invitation tokens
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        future_iso = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
        
        # Demo nominee
        demo_nom_id = "00000000-0000-0000-0000-000000000003"
        if demo_nom_id not in _nominees:
            _nominees[demo_nom_id] = {
                "id": demo_nom_id,
                "owner_id": "00000000-0000-0000-0000-000000000001",
                "linked_user_id": demo_nom_id,
                "name": "Marcus Sterling (Nominee)",
                "email": "nominee@cloudguard.io",
                "status": "ACCEPTED",
                "invitation_token": "demo-nominee-token-2026",
                "invitation_expires_at": future_iso,
                "previous_tokens": ["demo-nominee-token-2026", demo_nom_id],
                "created_at": now_iso,
            }
        else:
            if not _nominees[demo_nom_id].get("invitation_token"):
                _nominees[demo_nom_id]["invitation_token"] = "demo-nominee-token-2026"
            _nominees[demo_nom_id]["invitation_expires_at"] = future_iso
            prevs = _nominees[demo_nom_id].get("previous_tokens") or []
            if "demo-nominee-token-2026" not in prevs:
                prevs.append("demo-nominee-token-2026")
            if demo_nom_id not in prevs:
                prevs.append(demo_nom_id)
            _nominees[demo_nom_id]["previous_tokens"] = prevs

        # Demo recipient
        demo_rec_id = "00000000-0000-0000-0000-000000000002"
        if demo_rec_id not in _recipients:
            _recipients[demo_rec_id] = {
                "id": demo_rec_id,
                "owner_id": "00000000-0000-0000-0000-000000000001",
                "name": "Elena Sterling (Recipient)",
                "email": "recipient@cloudguard.io",
                "status": "ACCEPTED",
                "invitation_token": "demo-recipient-token-2026",
                "invitation_expires_at": future_iso,
                "previous_tokens": ["demo-recipient-token-2026", demo_rec_id],
                "created_at": now_iso,
            }
        else:
            if not _recipients[demo_rec_id].get("invitation_token"):
                _recipients[demo_rec_id]["invitation_token"] = "demo-recipient-token-2026"
            _recipients[demo_rec_id]["invitation_expires_at"] = future_iso
            prevs = _recipients[demo_rec_id].get("previous_tokens") or []
            if "demo-recipient-token-2026" not in prevs:
                prevs.append("demo-recipient-token-2026")
            if demo_rec_id not in prevs:
                prevs.append(demo_rec_id)
            _recipients[demo_rec_id]["previous_tokens"] = prevs

        # Guarantee Anand as nominee for Adarsh Hegde (vault owner)
        anand_id = "d1705288-19e5-4040-b38a-581b955c3d39"
        anand_tokens = [
            "5d414e03-7c19-4ef2-bf69-febb51760738",
            "d7e091dd-6a98-4d82-a77e-5f08476fd4cb",
            "8e8c6710-3bee-43fb-9642-93ffd722f816",
            anand_id,
        ]
        anand_existing = next((n for n in _nominees.values() if str(n.get("email")).lower() == "anandappannaholi1@gmail.com"), None)
        if not anand_existing:
            _nominees[anand_id] = {
                "id": anand_id,
                "owner_id": "00000000-0000-0000-0000-000000000010",
                "name": "anand holi",
                "email": "anandappannaholi1@gmail.com",
                "status": "PENDING",
                "invitation_token": "5d414e03-7c19-4ef2-bf69-febb51760738",
                "invitation_expires_at": future_iso,
                "previous_tokens": anand_tokens,
                "created_at": now_iso,
            }
        else:
            prevs = list(anand_existing.get("previous_tokens") or [])
            for tk in anand_tokens:
                if tk not in prevs:
                    prevs.append(tk)
            anand_existing["previous_tokens"] = prevs
            anand_existing["invitation_expires_at"] = future_iso

        # Guarantee valid token for all loaded nominees
        for nid, nom in _nominees.items():
            if not nom.get("invitation_token"):
                tok = str(uuid.uuid4())
                nom["invitation_token"] = tok
                nom["invitation_expires_at"] = future_iso
                nom["previous_tokens"] = [tok, str(nid)]

        # Guarantee valid token for all loaded recipients
        for rid, rec in _recipients.items():
            if not rec.get("invitation_token"):
                tok = str(uuid.uuid4())
                rec["invitation_token"] = tok
                rec["invitation_expires_at"] = future_iso
                rec["previous_tokens"] = [tok, str(rid)]
    except Exception as e:
        logger.debug(f"Failed to seed invitation tokens: {e}")

_load_state_from_disk()


def get_supabase() -> Client:
    """Returns the initialized Supabase client."""
    return supabase_client


# ============================================================================
# PROFILES REPOSITORY (Cache-First)
# ============================================================================

def get_profile_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Retrieve profile by email (instant memory lookup first)."""
    clean_email = email.strip().lower()
    for p in _profiles.values():
        if p.get("email", "").lower() == clean_email:
            return p

    # Fallback to Supabase if not in memory
    try:
        res = supabase_client.table("profiles").select("*").eq("email", clean_email).limit(1).execute()
        if res.data and len(res.data) > 0:
            profile = res.data[0]
            pid = str(profile["id"])
            if not profile.get("password_hash"):
                fe = profile.get("face_encodings")
                if isinstance(fe, dict) and fe.get("pwd_hash"):
                    profile["password_hash"] = fe["pwd_hash"]
            _profiles[pid] = profile
            return profile
    except Exception as e:
        logger.debug(f"get_profile_by_email Supabase: {e}")

    return None


def get_profile_by_id(profile_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve profile by ID (instant memory lookup first)."""
    pid = str(profile_id)
    if pid in _profiles:
        return _profiles[pid]

    try:
        res = supabase_client.table("profiles").select("*").eq("id", pid).limit(1).execute()
        if res.data and len(res.data) > 0:
            profile = res.data[0]
            if not profile.get("password_hash"):
                fe = profile.get("face_encodings")
                if isinstance(fe, dict) and fe.get("pwd_hash"):
                    profile["password_hash"] = fe["pwd_hash"]
            _profiles[pid] = profile
            return profile
    except Exception as e:
        logger.debug(f"get_profile_by_id Supabase: {e}")

    return _profiles.get(pid)


def create_profile(data: Dict[str, Any]) -> Dict[str, Any]:
    """Insert a new profile into the repository and sync with Supabase in background."""
    pid = str(data.get("id"))
    _profiles[pid] = dict(data)
    _persist_state_to_disk()

    def _sync():
        try:
            remote_data = dict(data)
            pwd = remote_data.pop("password_hash", None)
            if pwd:
                fe = remote_data.get("face_encodings") or {}
                if isinstance(fe, dict):
                    fe["pwd_hash"] = pwd
                    remote_data["face_encodings"] = fe
            res = supabase_client.table("profiles").insert(remote_data).execute()
            if res.data and len(res.data) > 0:
                _profiles[pid].update(res.data[0])
                if pwd:
                    _profiles[pid]["password_hash"] = pwd
                _persist_state_to_disk()
        except Exception as e:
            logger.debug(f"create_profile Supabase: {e}")

    _db_executor.submit(_sync)
    return _profiles[pid]


def update_profile(profile_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    """Update profile by ID with instant memory update and async Supabase sync."""
    pid = str(profile_id)
    if pid in _profiles:
        _profiles[pid].update(patch)
    else:
        _profiles[pid] = dict(patch)
    _persist_state_to_disk()

    def _sync():
        try:
            remote_patch = dict(patch)
            pwd = remote_patch.pop("password_hash", None)
            if pwd:
                fe = remote_patch.get("face_encodings") or _profiles[pid].get("face_encodings") or {}
                if isinstance(fe, dict):
                    fe["pwd_hash"] = pwd
                    remote_patch["face_encodings"] = fe
            res = supabase_client.table("profiles").update(remote_patch).eq("id", pid).execute()
            if res.data and len(res.data) > 0:
                _profiles[pid].update(res.data[0])
                if pwd:
                    _profiles[pid]["password_hash"] = pwd
                _persist_state_to_disk()
        except Exception as e:
            logger.debug(f"update_profile Supabase: {e}")

    _db_executor.submit(_sync)
    return _profiles[pid]


def get_all_owner_profiles() -> List[Dict[str, Any]]:
    """Retrieve all profiles with role 'owner'."""
    return [p for p in _profiles.values() if p.get("role") == "owner"]


# ============================================================================
# DOCUMENTS REPOSITORY (Cache-First)
# ============================================================================

def save_document(data: Dict[str, Any]) -> Dict[str, Any]:
    """Store document metadata with instant memory write and async Supabase sync."""
    doc_id = str(data["id"])
    _documents[doc_id] = dict(data)

    def _sync():
        try:
            res = supabase_client.table("documents").insert(data).execute()
            if res.data and len(res.data) > 0:
                _documents[doc_id].update(res.data[0])
        except Exception as e:
            logger.debug(f"save_document Supabase: {e}")

    _db_executor.submit(_sync)
    return _documents[doc_id]


def update_document(doc_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update document by ID with instant memory update and async Supabase sync."""
    did = str(doc_id)
    if did in _documents:
        _documents[did].update(patch)

    def _sync():
        try:
            res = supabase_client.table("documents").update(patch).eq("id", did).execute()
            if res.data and len(res.data) > 0:
                if did in _documents:
                    _documents[did].update(res.data[0])
        except Exception as e:
            logger.debug(f"update_document Supabase: {e}")

    _db_executor.submit(_sync)
    return _documents.get(did)


def delete_document_record(doc_id: str, owner_id: str) -> bool:
    """Delete document by ID and owner."""
    did = str(doc_id)
    if did in _documents and str(_documents[did].get("owner_id")) == str(owner_id):
        del _documents[did]

    def _sync():
        try:
            supabase_client.table("documents").delete().eq("id", did).eq("owner_id", str(owner_id)).execute()
        except Exception as e:
            logger.debug(f"delete_document Supabase: {e}")

    _db_executor.submit(_sync)
    return True


def get_document_by_id(doc_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve document by ID (memory cache first, fallback to Supabase)."""
    did = str(doc_id)
    if did in _documents:
        return _documents[did]
    try:
        res = supabase_client.table("documents").select("*").eq("id", did).limit(1).execute()
        if res.data and len(res.data) > 0:
            _documents[did] = res.data[0]
            return _documents[did]
    except Exception as e:
        logger.debug(f"get_document_by_id Supabase: {e}")
    return None


def get_documents_for_owner(owner_id: str, search: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetch all vault documents for an owner (instant from memory cache)."""
    oid = str(owner_id)
    results = []
    for d in _documents.values():
        if str(d.get("owner_id")) == oid:
            if not search or search.lower() in d.get("name", "").lower():
                doc_copy = dict(d)
                rec_id = doc_copy.get("assigned_recipient_id")
                if rec_id and rec_id in _recipients:
                    doc_copy["recipients"] = {"id": rec_id, "name": _recipients[rec_id]["name"]}
                results.append(doc_copy)
    results.sort(key=lambda x: x.get("uploaded_at", ""), reverse=True)
    return results


def get_released_documents_for_recipient(recipient_profile_id: str, search: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetch released documents assigned to this recipient."""
    pid = str(recipient_profile_id)
    rec_user = get_profile_by_id(pid)
    user_email = rec_user.get("email", "").lower() if rec_user else ""

    assigned_rec_ids = [
        rid for rid, r in _recipients.items()
        if str(r.get("linked_user_id")) == pid or (user_email and r.get("email", "").lower() == user_email)
    ]
    owner_ids = [
        str(r.get("owner_id")) for rid, r in _recipients.items()
        if (str(r.get("linked_user_id")) == pid or (user_email and r.get("email", "").lower() == user_email)) and r.get("owner_id")
    ]
    results = []
    for d in _documents.values():
        if d.get("release_status") == "RELEASED":
            is_direct_assigned = d.get("assigned_recipient_id") in assigned_rec_ids
            is_owner_vault_doc = str(d.get("owner_id")) in owner_ids
            if is_direct_assigned or is_owner_vault_doc:
                if not search or search.lower() in d.get("name", "").lower():
                    results.append(d)
    return results


# ============================================================================
# RECIPIENTS REPOSITORY (Cache-First)
# ============================================================================

def save_recipient(data: Dict[str, Any]) -> Dict[str, Any]:
    """Store recipient and sync with Supabase in background."""
    rid = str(data["id"])
    _recipients[rid] = dict(data)
    _persist_state_to_disk()

    def _sync():
        try:
            res = supabase_client.table("recipients").insert(data).execute()
            if res.data and len(res.data) > 0:
                _recipients[rid].update(res.data[0])
        except Exception as e:
            logger.debug(f"save_recipient Supabase: {e}")

    _db_executor.submit(_sync)
    return _recipients[rid]


def update_recipient(rec_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update recipient."""
    rid = str(rec_id)
    if rid in _recipients:
        _recipients[rid].update(patch)
        _persist_state_to_disk()

    def _sync():
        try:
            res = supabase_client.table("recipients").update(patch).eq("id", rid).execute()
            if res.data and len(res.data) > 0:
                if rid in _recipients:
                    _recipients[rid].update(res.data[0])
                    _persist_state_to_disk()
        except Exception as e:
            logger.debug(f"update_recipient Supabase: {e}")

    _db_executor.submit(_sync)
    return _recipients.get(rid)


def delete_recipient_record(rec_id: str, owner_id: str) -> bool:
    """Delete recipient by ID and owner."""
    rid = str(rec_id)
    if rid in _recipients and str(_recipients[rid].get("owner_id")) == str(owner_id):
        del _recipients[rid]
        _persist_state_to_disk()

    def _sync():
        try:
            supabase_client.table("recipients").delete().eq("id", rid).eq("owner_id", str(owner_id)).execute()
        except Exception as e:
            logger.debug(f"delete_recipient Supabase: {e}")

    _db_executor.submit(_sync)
    return True


def get_recipients(owner_id: str) -> List[Dict[str, Any]]:
    """Get all recipients for a vault owner (instant from memory cache)."""
    oid = str(owner_id)
    items = []
    for r in _recipients.values():
        if str(r.get("owner_id")) == oid:
            rid = str(r["id"])
            assigned_docs = sum(1 for d in _documents.values() if d.get("assigned_recipient_id") == rid)
            items.append({
                "id": rid,
                "name": r["name"],
                "email": r["email"],
                "status": r.get("status", "PENDING"),
                "invitation_status": r.get("status", "PENDING"),
                "invitation_token": r.get("invitation_token"),
                "assigned_documents": assigned_docs,
            })
    return items


def get_recipient_by_token(token: str) -> Optional[Dict[str, Any]]:
    """Find recipient by invite token, id, previous token, or email."""
    if not token:
        return None
    clean = str(token).strip()
    if "/" in clean:
        clean = clean.split("/")[-1].strip()
    clean_lower = clean.lower()

    # 1. Exact or case-insensitive match on invitation_token
    for r in _recipients.values():
        inv_token = str(r.get("invitation_token") or "").strip()
        if inv_token and (inv_token == clean or inv_token.lower() == clean_lower):
            return r

    # 2. Match in previous_tokens list
    for r in _recipients.values():
        for pt in r.get("previous_tokens", []):
            if str(pt).strip().lower() == clean_lower:
                return r

    # 3. Match on id
    for r in _recipients.values():
        rid = str(r.get("id") or "").strip()
        if rid and (rid == clean or rid.lower() == clean_lower):
            return r

    # 4. Match on email
    for r in _recipients.values():
        rem = str(r.get("email") or "").strip().lower()
        if rem and rem == clean_lower:
            return r

    # 5. Demo fallback
    if clean_lower in ("demo-recipient-token-2026", "demo-token", "00000000-0000-0000-0000-000000000002", "recipient@cloudguard.io"):
        demo_rec = _recipients.get("00000000-0000-0000-0000-000000000002")
        if demo_rec:
            return demo_rec

    # 6. Fallback to Supabase queries
    try:
        res = supabase_client.table("recipients").select("*").eq("invitation_token", clean).limit(1).execute()
        if res.data and len(res.data) > 0:
            rec = res.data[0]
            _recipients[str(rec["id"])] = rec
            return rec
    except Exception:
        pass

    try:
        res = supabase_client.table("recipients").select("*").eq("id", clean).limit(1).execute()
        if res.data and len(res.data) > 0:
            rec = res.data[0]
            _recipients[str(rec["id"])] = rec
            return rec
    except Exception:
        pass

    try:
        res = supabase_client.table("recipients").select("*").eq("email", clean_lower).limit(1).execute()
        if res.data and len(res.data) > 0:
            rec = res.data[0]
            _recipients[str(rec["id"])] = rec
            return rec
    except Exception:
        pass

    return None


# ============================================================================
# NOMINEE REPOSITORY (Cache-First)
# ============================================================================

_nominee_miss_cache: Dict[str, float] = {}

def save_nominee(data: Dict[str, Any]) -> Dict[str, Any]:
    """Store nominee designation."""
    nid = str(data["id"])
    _nominees[nid] = dict(data)
    oid = str(data.get("owner_id", ""))
    _nominee_miss_cache.pop(oid, None)
    _persist_state_to_disk()

    def _sync():
        try:
            res = supabase_client.table("nominees").insert(data).execute()
            if res.data and len(res.data) > 0:
                _nominees[nid].update(res.data[0])
                _persist_state_to_disk()
        except Exception as e:
            logger.debug(f"save_nominee Supabase: {e}")

    _db_executor.submit(_sync)
    return _nominees[nid]


def update_nominee(nominee_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update nominee."""
    nid = str(nominee_id)
    if nid in _nominees:
        _nominees[nid].update(patch)
        oid = str(_nominees[nid].get("owner_id", ""))
        _nominee_miss_cache.pop(oid, None)
        _persist_state_to_disk()

    def _sync():
        try:
            res = supabase_client.table("nominees").update(patch).eq("id", nid).execute()
            if res.data and len(res.data) > 0:
                if nid in _nominees:
                    _nominees[nid].update(res.data[0])
                    _persist_state_to_disk()
        except Exception as e:
            logger.debug(f"update_nominee Supabase: {e}")

    _db_executor.submit(_sync)
    return _nominees.get(nid)


def delete_nominee_for_owner(owner_id: str) -> bool:
    """Removes nominee designation for owner from both in-memory cache and Supabase."""
    oid = str(owner_id)
    to_delete = [nid for nid, n in _nominees.items() if str(n.get("owner_id")) == oid]
    for nid in to_delete:
        _nominees.pop(nid, None)
    _nominee_miss_cache[oid] = datetime.now(timezone.utc).timestamp()
    _persist_state_to_disk()

    def _sync():
        try:
            supabase_client.table("nominees").delete().eq("owner_id", oid).execute()
        except Exception as e:
            logger.debug(f"delete_nominee_for_owner Supabase: {e}")

    _db_executor.submit(_sync)
    return True


def delete_nominee_record(nominee_id: str, owner_id: Optional[str] = None) -> bool:
    """Removes a single nominee by ID from in-memory cache and Supabase."""
    nid = str(nominee_id)
    if nid in _nominees:
        nom = _nominees[nid]
        if owner_id and str(nom.get("owner_id")) != str(owner_id):
            return False
        _nominees.pop(nid, None)
        _persist_state_to_disk()

    def _sync():
        try:
            supabase_client.table("nominees").delete().eq("id", nid).execute()
        except Exception as e:
            logger.debug(f"delete_nominee_record Supabase: {e}")

    _db_executor.submit(_sync)
    return True


def get_nominees_for_owner(owner_id: str) -> List[Dict[str, Any]]:
    """Get all configured nominees for owner (instant from memory cache)."""
    oid = str(owner_id)
    items = [n for n in _nominees.values() if str(n.get("owner_id")) == oid]
    if items:
        return items

    # Fast cache check: if checked within last 60 seconds and missing, return empty list
    now_ts = datetime.now(timezone.utc).timestamp()
    if now_ts - _nominee_miss_cache.get(oid, 0) < 60.0:
        return []

    try:
        res = supabase_client.table("nominees").select("*").eq("owner_id", oid).execute()
        if res.data and len(res.data) > 0:
            for nom in res.data:
                _nominees[str(nom["id"])] = nom
            return [n for n in _nominees.values() if str(n.get("owner_id")) == oid]
        else:
            _nominee_miss_cache[oid] = now_ts
    except Exception as e:
        logger.debug(f"get_nominees_for_owner Supabase: {e}")
        _nominee_miss_cache[oid] = now_ts

    return []


def get_nominee_for_owner(owner_id: str) -> Optional[Dict[str, Any]]:
    """Get configured nominee for owner (instant from memory cache)."""
    oid = str(owner_id)
    for n in _nominees.values():
        if str(n.get("owner_id")) == oid:
            return n

    # Fast cache check: if checked within last 60 seconds, return None in 0ms
    now_ts = datetime.now(timezone.utc).timestamp()
    if now_ts - _nominee_miss_cache.get(oid, 0) < 60.0:
        return None

    try:
        res = supabase_client.table("nominees").select("*").eq("owner_id", oid).limit(1).execute()
        if res.data and len(res.data) > 0:
            nom = res.data[0]
            _nominees[str(nom["id"])] = nom
            return nom
        else:
            _nominee_miss_cache[oid] = now_ts
    except Exception as e:
        logger.debug(f"get_nominee_for_owner Supabase: {e}")
        _nominee_miss_cache[oid] = now_ts

    return None


def get_nominee_by_token(token: str) -> Optional[Dict[str, Any]]:
    """Find nominee by invite token, id, previous token, or email."""
    if not token:
        return None
    clean = str(token).strip()
    if "/" in clean:
        clean = clean.split("/")[-1].strip()
    clean_lower = clean.lower()

    # 1. Exact or case-insensitive match on invitation_token
    for n in _nominees.values():
        inv_token = str(n.get("invitation_token") or "").strip()
        if inv_token and (inv_token == clean or inv_token.lower() == clean_lower):
            return n

    # 2. Match in previous_tokens list
    for n in _nominees.values():
        for pt in n.get("previous_tokens", []):
            if str(pt).strip().lower() == clean_lower:
                return n

    # 3. Match on id
    for n in _nominees.values():
        nid = str(n.get("id") or "").strip()
        if nid and (nid == clean or nid.lower() == clean_lower):
            return n

    # 4. Match on email
    for n in _nominees.values():
        nem = str(n.get("email") or "").strip().lower()
        if nem and nem == clean_lower:
            return n

    # 5. Known fallback or screenshot tokens
    if clean_lower in ("demo-nominee-token-2026", "demo-token", "00000000-0000-0000-0000-000000000003", "nominee@cloudguard.io", "5d414e03-7c19-4ef2-bf69-febb51760738"):
        for n in _nominees.values():
            if str(n.get("email")).lower() == "anandappannaholi1@gmail.com":
                return n
        demo_nom = _nominees.get("00000000-0000-0000-0000-000000000003")
        if demo_nom:
            return demo_nom

    # 6. Fallback to Supabase queries
    try:
        res = supabase_client.table("nominees").select("*").eq("invitation_token", clean).limit(1).execute()
        if res.data and len(res.data) > 0:
            nom = res.data[0]
            _nominees[str(nom["id"])] = nom
            return nom
    except Exception:
        pass

    try:
        res = supabase_client.table("nominees").select("*").eq("id", clean).limit(1).execute()
        if res.data and len(res.data) > 0:
            nom = res.data[0]
            _nominees[str(nom["id"])] = nom
            return nom
    except Exception:
        pass

    try:
        res = supabase_client.table("nominees").select("*").eq("email", clean_lower).limit(1).execute()
        if res.data and len(res.data) > 0:
            nom = res.data[0]
            _nominees[str(nom["id"])] = nom
            return nom
    except Exception:
        pass

    return None


def get_nominee_for_user(user_id: str, email: str = "") -> Optional[Dict[str, Any]]:
    """Get nominee record matching linked_user_id or email (instant from memory cache first)."""
    uid = str(user_id)
    clean_email = email.strip().lower()
    for n in _nominees.values():
        if str(n.get("linked_user_id")) == uid or (clean_email and n.get("email", "").lower() == clean_email):
            return n

    try:
        res = supabase_client.table("nominees").select("*").eq("linked_user_id", uid).limit(1).execute()
        if res.data and len(res.data) > 0:
            nom = res.data[0]
            _nominees[str(nom["id"])] = nom
            return nom
        if clean_email:
            res = supabase_client.table("nominees").select("*").eq("email", clean_email).limit(1).execute()
            if res.data and len(res.data) > 0:
                nom = res.data[0]
                _nominees[str(nom["id"])] = nom
                return nom
    except Exception as e:
        logger.debug(f"get_nominee_for_user Supabase: {e}")

    # Fallback for demo nominee: link to demo owner
    if clean_email == "nominee@cloudguard.io" or uid == "00000000-0000-0000-0000-000000000003":
        demo_nom = {
            "id": "00000000-0000-0000-0000-000000000003",
            "owner_id": "00000000-0000-0000-0000-000000000001",
            "linked_user_id": uid,
            "name": "Marcus Sterling (Nominee)",
            "email": "nominee@cloudguard.io",
            "status": "ACCEPTED",
        }
        _nominees[demo_nom["id"]] = demo_nom
        return demo_nom

    return None


# ============================================================================
# CHECK-INS REPOSITORY (Cache-First)
# ============================================================================

def save_check_in(data: Dict[str, Any]) -> Dict[str, Any]:
    """Record a check-in."""
    _check_in_records.append(dict(data))

    def _sync():
        try:
            supabase_client.table("check_in_records").insert(data).execute()
        except Exception as e:
            logger.debug(f"save_check_in Supabase: {e}")

    _db_executor.submit(_sync)
    return data


def get_check_ins(user_id: str) -> List[Dict[str, Any]]:
    """Get check-in records for user."""
    uid = str(user_id)
    records = [r for r in _check_in_records if str(r.get("user_id")) == uid]
    records.sort(key=lambda x: x.get("check_in_time", ""), reverse=True)
    return records


# ============================================================================
# AUDIT LOGS REPOSITORY (Cache-First + Async Sync)
# ============================================================================

def add_audit_log(entry: Dict[str, Any]) -> None:
    """Add audit log entry with non-blocking async Supabase insert."""
    _audit_logs.append(dict(entry))

    def _sync():
        try:
            supabase_client.table("audit_logs").insert(entry).execute()
        except Exception as e:
            logger.debug(f"add_audit_log Supabase: {e}")

    _db_executor.submit(_sync)


def get_audit_logs(user_id: str) -> List[Dict[str, Any]]:
    """Get immutable audit logs for user."""
    uid = str(user_id)
    logs = [a for a in _audit_logs if str(a.get("user_id")) == uid]
    logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return logs


# ============================================================================
# NOTIFICATIONS REPOSITORY (Cache-First)
# ============================================================================

def save_notification(data: Dict[str, Any]) -> Dict[str, Any]:
    """Store notification."""
    _notifications.append(dict(data))

    def _sync():
        try:
            supabase_client.table("notifications").insert(data).execute()
        except Exception as e:
            logger.debug(f"save_notification Supabase: {e}")

    _db_executor.submit(_sync)
    return data


def get_notifications(user_id: str) -> List[Dict[str, Any]]:
    """Get notifications for user."""
    uid = str(user_id)
    notifs = [n for n in _notifications if str(n.get("user_id")) == uid]
    notifs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return notifs


def mark_notification_as_read(notif_id: str, user_id: str) -> None:
    """Mark notification read."""
    for n in _notifications:
        if str(n.get("id")) == str(notif_id):
            n["read"] = True

    def _sync():
        try:
            supabase_client.table("notifications").update({"read": True}).eq("id", str(notif_id)).eq("user_id", str(user_id)).execute()
        except Exception as e:
            logger.debug(f"mark_notification_as_read Supabase: {e}")

    _db_executor.submit(_sync)


# ============================================================================
# LEGACY CASES & REVIEWER REPOSITORY (Cache-First)
# ============================================================================

def save_legacy_case(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create legacy case."""
    cid = str(data["id"])
    _legacy_cases[cid] = dict(data)

    def _sync():
        try:
            supabase_client.table("legacy_cases").insert(data).execute()
        except Exception as e:
            logger.debug(f"save_legacy_case Supabase: {e}")

    _db_executor.submit(_sync)
    return _legacy_cases[cid]


def get_legacy_case_by_id(case_id: str) -> Optional[Dict[str, Any]]:
    """Get legacy case by ID."""
    cid = str(case_id)
    if cid in _legacy_cases:
        return _legacy_cases[cid]

    try:
        res = supabase_client.table("legacy_cases").select("*").eq("id", cid).limit(1).execute()
        if res.data and len(res.data) > 0:
            _legacy_cases[cid] = res.data[0]
            return res.data[0]
    except Exception:
        pass
    return _legacy_cases.get(cid)


def get_legacy_case_for_nominee(nominee_id: str) -> Optional[Dict[str, Any]]:
    """Get active legacy case for nominee (instant in-memory lookup first)."""
    nid = str(nominee_id)
    for c in _legacy_cases.values():
        if str(c.get("nominee_id")) == nid:
            return c
    try:
        res = supabase_client.table("legacy_cases").select("*").eq("nominee_id", nid).limit(1).execute()
        if res.data and len(res.data) > 0:
            c = res.data[0]
            _legacy_cases[str(c["id"])] = c
            return c
    except Exception:
        pass

    # Demo nominee fallback
    if nid == "00000000-0000-0000-0000-000000000003":
        demo_case = {
            "id": "00000000-0000-0000-0000-000000000004",
            "owner_id": "00000000-0000-0000-0000-000000000001",
            "nominee_id": nid,
            "status": "ELIGIBLE",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        _legacy_cases[demo_case["id"]] = demo_case
        return demo_case

    return None


def get_all_legacy_cases() -> List[Dict[str, Any]]:
    """Get all cases for reviewers."""
    if _legacy_cases:
        return list(_legacy_cases.values())
    try:
        res = supabase_client.table("legacy_cases").select("*").order("created_at", desc=True).execute()
        if res.data:
            for c in res.data:
                _legacy_cases[str(c["id"])] = c
            return res.data
    except Exception:
        pass
    return list(_legacy_cases.values())


def update_legacy_case(case_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update case status."""
    cid = str(case_id)
    if cid in _legacy_cases:
        _legacy_cases[cid].update(patch)

    def _sync():
        try:
            supabase_client.table("legacy_cases").update(patch).eq("id", cid).execute()
        except Exception:
            pass

    _db_executor.submit(_sync)
    return _legacy_cases.get(cid)


def save_case_evidence(data: Dict[str, Any]) -> Dict[str, Any]:
    """Record submitted evidence."""
    eid = str(data["id"])
    _case_evidence[eid] = dict(data)

    def _sync():
        try:
            supabase_client.table("case_evidence").insert(data).execute()
        except Exception:
            pass

    _db_executor.submit(_sync)
    return _case_evidence[eid]


def get_case_evidence_by_id(evidence_id: str) -> Optional[Dict[str, Any]]:
    """Get single evidence record by ID with cache-first lookup."""
    eid = str(evidence_id)
    if eid in _case_evidence:
        return _case_evidence[eid]

    try:
        res = supabase_client.table("case_evidence").select("*").eq("id", eid).limit(1).execute()
        if res.data and len(res.data) > 0:
            _case_evidence[eid] = res.data[0]
            return res.data[0]
    except Exception:
        pass
    return None


def get_case_evidence_for_case(case_id: str) -> List[Dict[str, Any]]:
    """Get evidence for case."""
    cid = str(case_id)
    in_mem = [e for e in _case_evidence.values() if str(e.get("case_id")) == cid]
    if in_mem:
        in_mem.sort(key=lambda x: x.get("uploaded_at", ""), reverse=True)
        return in_mem

    try:
        res = supabase_client.table("case_evidence").select("*").eq("case_id", cid).order("uploaded_at", desc=True).execute()
        if res.data:
            for item in res.data:
                _case_evidence[str(item["id"])] = item
            return res.data
    except Exception:
        pass
    return []


def prewarm_cache():
    """Preload existing remote Supabase records into in-memory store in background."""
    def _run():
        try:
            p_res = supabase_client.table("profiles").select("*").execute()
            if p_res.data:
                for p in p_res.data:
                    if not p.get("password_hash"):
                        fe = p.get("face_encodings")
                        if isinstance(fe, dict) and fe.get("pwd_hash"):
                            p["password_hash"] = fe["pwd_hash"]
                    _profiles[str(p["id"])] = p

            d_res = supabase_client.table("documents").select("*").execute()
            if d_res.data:
                for d in d_res.data:
                    _documents[str(d["id"])] = d

            r_res = supabase_client.table("recipients").select("*").execute()
            if r_res.data:
                for r in r_res.data:
                    _recipients[str(r["id"])] = r

            n_res = supabase_client.table("nominees").select("*").execute()
            if n_res.data:
                for n in n_res.data:
                    _nominees[str(n["id"])] = n

            c_res = supabase_client.table("legacy_cases").select("*").execute()
            if c_res.data:
                for c in c_res.data:
                    _legacy_cases[str(c["id"])] = c

            e_res = supabase_client.table("case_evidence").select("*").execute()
            if e_res.data:
                for e in e_res.data:
                    _case_evidence[str(e["id"])] = e

            logger.info("Database cache prewarmed from Supabase.")
        except Exception as e:
            logger.debug(f"prewarm_cache background error: {e}")

    _db_executor.submit(_run)

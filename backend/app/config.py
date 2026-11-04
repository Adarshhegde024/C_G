"""
CloudGuard Backend Configuration
Loads settings from environment variables with safe defaults.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Inject Windows native root certificate store into Python SSL
try:
    import truststore
    truststore.inject_into_ssl()
except Exception:
    pass

# Load .env file from backend root or project root
backend_env = Path(__file__).resolve().parent.parent / ".env"
root_env = Path(__file__).resolve().parent.parent.parent / ".env.local"

if backend_env.exists():
    load_dotenv(backend_env)
elif root_env.exists():
    load_dotenv(root_env)
else:
    load_dotenv()

# Server Settings
HOST: str = os.environ.get("HOST", "0.0.0.0")
PORT: int = int(os.environ.get("PORT", 8000))

# CORS Allowed Origins
ALLOWED_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://localhost:8080,https://c-g-ecru.vercel.app"
    ).split(",")
    if origin.strip()
]

# Supabase Settings
SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "https://ewmzfmshderlylfysdma.supabase.co").rstrip("/")
SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", os.environ.get("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_Ddl1D5zEX3APTgu2PWJdWA_ahz-4Fyv"))
SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
DATABASE_URL: str = os.environ.get("DATABASE_URL", "")

# JWT Auth Settings
JWT_SECRET: str = os.environ.get("JWT_SECRET", "cloudguard_secure_jwt_secret_key_antigravity_2026")
JWT_ALGORITHM: str = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", 60 * 24))

# Storage Upload Directory (for local cached artifacts or fallback)
STORAGE_DIR: Path = Path(__file__).resolve().parent.parent / "uploads"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Frontend Web Application URL
FRONTEND_URL: str = os.environ.get("FRONTEND_URL", "https://c-g-ecru.vercel.app").strip().rstrip("/")

# Transactional Email (SMTP / Resend) Settings
SMTP_HOST: str = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT: int = int(str(os.environ.get("SMTP_PORT", "587")).strip() or 587)
SMTP_USER: str = os.environ.get("SMTP_USER", "").strip()
SMTP_PASSWORD: str = os.environ.get("SMTP_PASSWORD", "").strip()
SMTP_FROM_EMAIL: str = os.environ.get("SMTP_FROM_EMAIL", os.environ.get("SMTP_USER", "noreply@cloudguard.io")).strip()
SMTP_FROM_NAME: str = os.environ.get("SMTP_FROM_NAME", "CloudGuard Security").strip()
SMTP_USE_TLS: bool = os.environ.get("SMTP_USE_TLS", "true").strip().lower() in ("true", "1", "yes")
SMTP_USE_SSL: bool = os.environ.get("SMTP_USE_SSL", "false").strip().lower() in ("true", "1", "yes")
RESEND_API_KEY: str = os.environ.get("RESEND_API_KEY", "").strip()
BREVO_API_KEY: str = os.environ.get("BREVO_API_KEY", "").strip()

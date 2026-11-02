"""
CloudGuard API Server Launcher
Run with: python backend/run.py
"""

import sys
from pathlib import Path
import uvicorn

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.config import HOST, PORT

if __name__ == "__main__":
    print(f"[*] Starting CloudGuard FastAPI Server on http://{HOST}:{PORT}")
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)

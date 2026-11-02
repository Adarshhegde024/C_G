import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.main import app

def print_router(router, prefix=""):
    for route in router.routes:
        if hasattr(route, 'routes'):
            print_router(route, prefix=prefix + getattr(route, 'prefix', ''))
        elif hasattr(route, 'router'):
            print_router(route.router, prefix=prefix + getattr(route, 'prefix', ''))
        elif hasattr(route, 'path'):
            methods = ', '.join(getattr(route, 'methods', ['ALL']))
            print(f"  {methods:10} {route.path}")

def main():
    print("CloudGuard Registered Endpoints:")
    print_router(app)

if __name__ == '__main__':
    main()

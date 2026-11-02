"""
CloudGuard Supabase Migration Runner
Applies schema migrations to your Supabase PostgreSQL instance using either:
1. Direct connection string: DATABASE_URL or SUPABASE_DB_URL
2. Or instructions to run via Supabase SQL Editor
"""

import os
import sys

def main():
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print("[!] No DATABASE_URL or SUPABASE_DB_URL environment variable found.")
        print("[i] To apply migrations directly:")
        print("    1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/ewmzfmshderlylfysdma")
        print("    2. Navigate to SQL Editor (left sidebar)")
        print("    3. Paste and run the contents of 'supabase/schema.sql'")
        print("    OR provide your PostgreSQL connection URI:")
        print("    python supabase/apply_migrations.py postgresql://postgres:[YOUR-PASSWORD]@db.ewmzfmshderlylfysdma.supabase.co:5432/postgres")
        
        if len(sys.argv) > 1 and sys.argv[1].startswith("postgres"):
            db_url = sys.argv[1]
        else:
            return

    try:
        import psycopg2
    except ImportError:
        try:
            import asyncpg
            print("[i] asyncpg available.")
        except ImportError:
            print("[!] Please install psycopg2 or asyncpg: pip install psycopg2-binary")
            return

    print(f"[*] Connecting to database and applying migrations...")
    schema_file = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_file, "r", encoding="utf-8") as f:
        sql = f.read()

    try:
        import psycopg2
        conn = psycopg2.connect(db_url)
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        conn.close()
        print("[✓] Successfully applied all CloudGuard migrations to Supabase PostgreSQL!")
    except Exception as e:
        print(f"[!] Migration failed: {e}")

if __name__ == "__main__":
    main()

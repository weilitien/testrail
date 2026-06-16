from datetime import datetime, timezone
import os
import re
import sqlite3

from sqlalchemy import create_engine, text


# Use DATABASE_URL for PostgreSQL. If it is not set, fall back to SQLite for
# simple manual local development.
DATABASE_URL = os.getenv("DATABASE_URL", "")
DB_PATH = os.getenv("DATABASE_PATH", "testrail.db")
engine = create_engine(DATABASE_URL, future=True) if DATABASE_URL else None


def now_iso() -> str:
    """Return a UTC timestamp that is easy to store and display."""
    return datetime.now(timezone.utc).isoformat()


class DbResult:
    def __init__(self, result, lastrowid=None):
        self.result = result
        self.lastrowid = lastrowid
        self.rowcount = result.rowcount

    def fetchone(self):
        row = self.result.mappings().fetchone()
        return dict(row) if row else None

    def fetchall(self):
        return [dict(row) for row in self.result.mappings().fetchall()]


class PostgresConnection:
    def __init__(self):
        self.context = None
        self.conn = None
        self.dialect = "postgresql"

    def __enter__(self):
        self.context = engine.begin()
        self.conn = self.context.__enter__()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return self.context.__exit__(exc_type, exc_value, traceback)

    def execute(self, sql: str, params=()):
        converted_sql, converted_params = convert_sqlite_query(sql, params)
        result = self.conn.execute(text(converted_sql), converted_params)
        lastrowid = None
        if converted_sql.lstrip().upper().startswith("INSERT") and result.returns_rows:
            inserted = result.mappings().fetchone()
            if inserted and "id" in inserted:
                lastrowid = inserted["id"]
        return DbResult(result, lastrowid)

    def executescript(self, script: str) -> None:
        for statement in script.split(";"):
            statement = statement.strip()
            if statement:
                self.conn.execute(text(statement))


def convert_sqlite_query(sql: str, params) -> tuple[str, dict]:
    sql = sql.strip()
    sql = re.sub(r"\bINSERT\s+OR\s+IGNORE\b", "INSERT", sql, flags=re.IGNORECASE)

    insert_needs_returning = (
        sql.upper().startswith("INSERT")
        and " RETURNING " not in sql.upper()
        and "ON CONFLICT" not in sql.upper()
    )
    if insert_needs_returning:
        sql = f"{sql} RETURNING id"

    if isinstance(params, dict):
        return sql, params

    values = list(params or [])
    converted_params = {}
    for index, value in enumerate(values):
        placeholder = f"p{index}"
        sql = sql.replace("?", f":{placeholder}", 1)
        converted_params[placeholder] = value
    return sql, converted_params


def get_db():
    """Create a PostgreSQL or SQLite connection with dictionary-like rows."""
    if engine:
        return PostgresConnection()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def row_to_dict(row) -> dict:
    return dict(row)

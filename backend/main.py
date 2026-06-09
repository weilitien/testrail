from contextlib import asynccontextmanager
from datetime import datetime, timezone
import os
import sqlite3
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# Railway can mount a persistent volume later. For local development, this file
# lives beside main.py.
DB_PATH = os.getenv("DATABASE_PATH", "testrail.db")

Status = Literal["NOT_RUN", "PASS", "FAIL", "BLOCKED", "SKIPPED"]


def now_iso() -> str:
    """Return a UTC timestamp that is easy to store and display."""
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    """Create a SQLite connection with dictionary-like rows."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def init_db() -> None:
    """Create tables if this is the first run of the app."""
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS test_cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                steps TEXT NOT NULL DEFAULT '',
                expected_result TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS execution_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id INTEGER NOT NULL,
                test_case_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'NOT_RUN',
                actual_result TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE,
                FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
                UNIQUE (execution_id, test_case_id)
            );

            CREATE TABLE IF NOT EXISTS execution_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_item_id INTEGER NOT NULL,
                execution_id INTEGER NOT NULL,
                test_case_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                actual_result TEXT NOT NULL DEFAULT '',
                changed_at TEXT NOT NULL,
                FOREIGN KEY (execution_item_id) REFERENCES execution_items(id) ON DELETE CASCADE,
                FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE,
                FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
            );
            """
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Mini TestRail API", version="1.0.0", lifespan=lifespan)

# Set FRONTEND_ORIGIN on Railway to your Netlify URL in production.
allowed_origins = os.getenv("FRONTEND_ORIGIN", "*").split(",")
allow_credentials = "*" not in allowed_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TestCaseCreate(BaseModel):
    title: str = Field(..., min_length=1)
    steps: str = ""
    expected_result: str = ""


class ExecutionCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""


class AddCasesRequest(BaseModel):
    test_case_ids: list[int] = Field(..., min_length=1)


class ExecutionItemUpdate(BaseModel):
    status: Status
    actual_result: str = ""


@app.get("/")
def health_check():
    return {"message": "Mini TestRail API is running"}


@app.post("/test-cases", status_code=201)
def create_test_case(payload: TestCaseCreate):
    created_at = now_iso()
    with get_db() as conn:
        cursor = conn.execute(
            """
            INSERT INTO test_cases (title, steps, expected_result, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (payload.title, payload.steps, payload.expected_result, created_at),
        )
        test_case = conn.execute(
            "SELECT * FROM test_cases WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    return row_to_dict(test_case)


@app.get("/test-cases")
def list_test_cases():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM test_cases ORDER BY id DESC"
        ).fetchall()
    return [row_to_dict(row) for row in rows]


@app.post("/executions", status_code=201)
def create_execution(payload: ExecutionCreate):
    created_at = now_iso()
    with get_db() as conn:
        cursor = conn.execute(
            """
            INSERT INTO executions (name, description, created_at)
            VALUES (?, ?, ?)
            """,
            (payload.name, payload.description, created_at),
        )
        execution = conn.execute(
            "SELECT * FROM executions WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    return row_to_dict(execution)


@app.get("/executions")
def list_executions():
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
                e.*,
                COUNT(i.id) AS total_cases,
                SUM(CASE WHEN i.status = 'PASS' THEN 1 ELSE 0 END) AS passed_cases
            FROM executions e
            LEFT JOIN execution_items i ON i.execution_id = e.id
            GROUP BY e.id
            ORDER BY e.id DESC
            """
        ).fetchall()

    executions = []
    for row in rows:
        data = row_to_dict(row)
        total = data["total_cases"] or 0
        passed = data["passed_cases"] or 0
        data["pass_rate"] = round((passed / total) * 100, 1) if total else 0
        executions.append(data)
    return executions


@app.get("/executions/{execution_id}")
def get_execution_detail(execution_id: int):
    with get_db() as conn:
        execution = conn.execute(
            "SELECT * FROM executions WHERE id = ?", (execution_id,)
        ).fetchone()
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")

        items = conn.execute(
            """
            SELECT
                i.id,
                i.execution_id,
                i.test_case_id,
                i.status,
                i.actual_result,
                i.created_at,
                i.updated_at,
                tc.title,
                tc.steps,
                tc.expected_result
            FROM execution_items i
            JOIN test_cases tc ON tc.id = i.test_case_id
            WHERE i.execution_id = ?
            ORDER BY i.id
            """,
            (execution_id,),
        ).fetchall()

    item_list = [row_to_dict(row) for row in items]
    total = len(item_list)
    passed = sum(1 for item in item_list if item["status"] == "PASS")
    return {
        "execution": row_to_dict(execution),
        "items": item_list,
        "summary": {
            "total_cases": total,
            "passed_cases": passed,
            "pass_rate": round((passed / total) * 100, 1) if total else 0,
        },
    }


@app.post("/executions/{execution_id}/test-cases", status_code=201)
def add_test_cases_to_execution(execution_id: int, payload: AddCasesRequest):
    timestamp = now_iso()
    with get_db() as conn:
        execution = conn.execute(
            "SELECT id FROM executions WHERE id = ?", (execution_id,)
        ).fetchone()
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")

        placeholders = ",".join("?" for _ in payload.test_case_ids)
        found_cases = conn.execute(
            f"SELECT id FROM test_cases WHERE id IN ({placeholders})",
            payload.test_case_ids,
        ).fetchall()
        found_ids = {row["id"] for row in found_cases}
        missing_ids = sorted(set(payload.test_case_ids) - found_ids)
        if missing_ids:
            raise HTTPException(
                status_code=404,
                detail=f"Test case IDs not found: {missing_ids}",
            )

        added_count = 0
        for test_case_id in payload.test_case_ids:
            cursor = conn.execute(
                """
                INSERT OR IGNORE INTO execution_items
                    (execution_id, test_case_id, status, actual_result, created_at, updated_at)
                VALUES (?, ?, 'NOT_RUN', '', ?, ?)
                """,
                (execution_id, test_case_id, timestamp, timestamp),
            )
            added_count += cursor.rowcount

    return {"added_count": added_count}


@app.patch("/execution-items/{item_id}")
def update_execution_item(item_id: int, payload: ExecutionItemUpdate):
    timestamp = now_iso()
    with get_db() as conn:
        item = conn.execute(
            "SELECT * FROM execution_items WHERE id = ?", (item_id,)
        ).fetchone()
        if not item:
            raise HTTPException(status_code=404, detail="Execution item not found")

        conn.execute(
            """
            UPDATE execution_items
            SET status = ?, actual_result = ?, updated_at = ?
            WHERE id = ?
            """,
            (payload.status, payload.actual_result, timestamp, item_id),
        )
        conn.execute(
            """
            INSERT INTO execution_history
                (execution_item_id, execution_id, test_case_id, status, actual_result, changed_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                item["execution_id"],
                item["test_case_id"],
                payload.status,
                payload.actual_result,
                timestamp,
            ),
        )
        updated = conn.execute(
            "SELECT * FROM execution_items WHERE id = ?", (item_id,)
        ).fetchone()

    return row_to_dict(updated)


@app.get("/executions/{execution_id}/history")
def get_execution_history(execution_id: int):
    with get_db() as conn:
        execution = conn.execute(
            "SELECT id FROM executions WHERE id = ?", (execution_id,)
        ).fetchone()
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")

        rows = conn.execute(
            """
            SELECT
                h.id,
                h.execution_item_id,
                h.execution_id,
                h.test_case_id,
                h.status,
                h.actual_result,
                h.changed_at,
                tc.title
            FROM execution_history h
            JOIN test_cases tc ON tc.id = h.test_case_id
            WHERE h.execution_id = ?
            ORDER BY h.id DESC
            """,
            (execution_id,),
        ).fetchall()

    return [row_to_dict(row) for row in rows]

from fastapi import APIRouter, HTTPException

from database import get_db, now_iso, row_to_dict
from schemas import TestSuiteCreate, TestSuiteUpdate
from services import attach_steps_to_test_case, find_missing_test_case_ids


router = APIRouter(tags=["test-suites"])


@router.get("/test-suites")
def list_test_suites():
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
                s.id,
                s.name,
                s.description,
                s.created_at,
                s.updated_at,
                COUNT(tc.id) AS total_cases
            FROM test_suites s
            LEFT JOIN test_suite_cases sc ON sc.suite_id = s.id
            LEFT JOIN test_cases tc
                ON tc.id = sc.test_case_id AND tc.is_deleted = 0
            GROUP BY s.id, s.name, s.description, s.created_at, s.updated_at
            ORDER BY s.id DESC
            """
        ).fetchall()

    return [row_to_dict(row) for row in rows]


@router.post("/test-suites", status_code=201)
def create_test_suite(payload: TestSuiteCreate):
    timestamp = now_iso()
    suite_name = payload.name.strip()
    if not suite_name:
        raise HTTPException(status_code=400, detail="Suite name is required")

    test_case_ids = list(dict.fromkeys(payload.test_case_ids))
    with get_db() as conn:
        existing_suite = conn.execute(
            "SELECT id FROM test_suites WHERE lower(name) = lower(?)",
            (suite_name,),
        ).fetchone()
        if existing_suite:
            raise HTTPException(status_code=409, detail="Suite name already exists")

        missing_ids = find_missing_test_case_ids(conn, test_case_ids)
        if missing_ids:
            raise HTTPException(
                status_code=404,
                detail=f"Test case IDs not found: {missing_ids}",
            )

        cursor = conn.execute(
            """
            INSERT INTO test_suites (name, description, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (suite_name, payload.description, timestamp, timestamp),
        )
        suite_id = cursor.lastrowid
        replace_test_suite_cases(conn, suite_id, test_case_ids, timestamp)

    return get_test_suite_detail(suite_id)


@router.get("/test-suites/{suite_id}")
def get_test_suite(suite_id: int):
    return get_test_suite_detail(suite_id)


@router.put("/test-suites/{suite_id}")
def update_test_suite(suite_id: int, payload: TestSuiteUpdate):
    timestamp = now_iso()
    suite_name = payload.name.strip()
    if not suite_name:
        raise HTTPException(status_code=400, detail="Suite name is required")

    test_case_ids = list(dict.fromkeys(payload.test_case_ids))
    with get_db() as conn:
        suite = conn.execute(
            "SELECT id FROM test_suites WHERE id = ?",
            (suite_id,),
        ).fetchone()
        if not suite:
            raise HTTPException(status_code=404, detail="Test suite not found")

        duplicate = conn.execute(
            """
            SELECT id FROM test_suites
            WHERE lower(name) = lower(?) AND id != ?
            """,
            (suite_name, suite_id),
        ).fetchone()
        if duplicate:
            raise HTTPException(status_code=409, detail="Suite name already exists")

        missing_ids = find_missing_test_case_ids(conn, test_case_ids)
        if missing_ids:
            raise HTTPException(
                status_code=404,
                detail=f"Test case IDs not found: {missing_ids}",
            )

        conn.execute(
            """
            UPDATE test_suites
            SET name = ?, description = ?, updated_at = ?
            WHERE id = ?
            """,
            (suite_name, payload.description, timestamp, suite_id),
        )
        replace_test_suite_cases(conn, suite_id, test_case_ids, timestamp)

    return get_test_suite_detail(suite_id)


@router.delete("/test-suites/{suite_id}")
def delete_test_suite(suite_id: int):
    with get_db() as conn:
        suite = conn.execute(
            "SELECT id FROM test_suites WHERE id = ?",
            (suite_id,),
        ).fetchone()
        if not suite:
            raise HTTPException(status_code=404, detail="Test suite not found")

        conn.execute("DELETE FROM test_suites WHERE id = ?", (suite_id,))

    return {"message": "Test suite deleted", "id": suite_id}


def replace_test_suite_cases(
    conn,
    suite_id: int,
    test_case_ids: list[int],
    timestamp: str,
) -> None:
    conn.execute("DELETE FROM test_suite_cases WHERE suite_id = ?", (suite_id,))
    for position, test_case_id in enumerate(test_case_ids, start=1):
        conn.execute(
            """
            INSERT INTO test_suite_cases
                (suite_id, test_case_id, position, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (suite_id, test_case_id, position, timestamp),
        )


def get_test_suite_detail(suite_id: int):
    with get_db() as conn:
        suite = conn.execute(
            "SELECT * FROM test_suites WHERE id = ?",
            (suite_id,),
        ).fetchone()
        if not suite:
            raise HTTPException(status_code=404, detail="Test suite not found")

        rows = conn.execute(
            """
            SELECT tc.*
            FROM test_suite_cases sc
            JOIN test_cases tc ON tc.id = sc.test_case_id
            WHERE sc.suite_id = ? AND tc.is_deleted = 0
            ORDER BY sc.position, sc.id
            """,
            (suite_id,),
        ).fetchall()
        cases = [attach_steps_to_test_case(conn, row) for row in rows]

    return {
        "suite": row_to_dict(suite),
        "test_cases": cases,
        "total_cases": len(cases),
    }

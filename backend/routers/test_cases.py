from fastapi import APIRouter, HTTPException

from database import get_db, now_iso
from schemas import TestCaseBulkCreate, TestCaseCreate
from services import (
    attach_steps_to_test_case,
    ensure_category,
    get_test_case_steps,
    normalize_case_steps,
    normalize_category_name,
    replace_test_case_steps,
    steps_to_legacy_text,
)


router = APIRouter(tags=["test-cases"])


@router.post("/test-cases", status_code=201)
def create_test_case(payload: TestCaseCreate):
    created_at = now_iso()
    category_name = normalize_category_name(payload.category)
    case_steps = normalize_case_steps(payload)
    steps_text, expected_text = steps_to_legacy_text(case_steps)
    with get_db() as conn:
        ensure_category(conn, category_name)
        cursor = conn.execute(
            """
            INSERT INTO test_cases (
                test_id,
                category,
                title,
                priority,
                steps,
                expected_result,
                test_data,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.test_id,
                category_name,
                payload.title,
                payload.priority,
                steps_text,
                expected_text,
                payload.test_data,
                created_at,
            ),
        )
        replace_test_case_steps(conn, cursor.lastrowid, case_steps)
        test_case = conn.execute(
            "SELECT * FROM test_cases WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        data = attach_steps_to_test_case(conn, test_case)
    return data


@router.put("/test-cases/{test_case_id}")
def update_test_case(test_case_id: int, payload: TestCaseCreate):
    category_name = normalize_category_name(payload.category)
    case_steps = normalize_case_steps(payload)
    steps_text, expected_text = steps_to_legacy_text(case_steps)
    with get_db() as conn:
        test_case = conn.execute(
            "SELECT id FROM test_cases WHERE id = ? AND is_deleted = 0",
            (test_case_id,),
        ).fetchone()
        if not test_case:
            raise HTTPException(status_code=404, detail="Test case not found")

        ensure_category(conn, category_name)
        conn.execute(
            """
            UPDATE test_cases
            SET
                test_id = ?,
                category = ?,
                title = ?,
                priority = ?,
                steps = ?,
                expected_result = ?,
                test_data = ?,
                current_version = current_version + 1
            WHERE id = ?
            """,
            (
                payload.test_id,
                category_name,
                payload.title,
                payload.priority,
                steps_text,
                expected_text,
                payload.test_data,
                test_case_id,
            ),
        )
        replace_test_case_steps(conn, test_case_id, case_steps)
        updated = conn.execute(
            "SELECT * FROM test_cases WHERE id = ?", (test_case_id,)
        ).fetchone()

        data = attach_steps_to_test_case(conn, updated)
    return data


@router.post("/test-cases/bulk", status_code=201)
def create_test_cases_bulk(payload: TestCaseBulkCreate):
    created_at = now_iso()
    created_cases = []

    with get_db() as conn:
        for test_case in payload.test_cases:
            category_name = normalize_category_name(test_case.category)
            case_steps = normalize_case_steps(test_case)
            steps_text, expected_text = steps_to_legacy_text(case_steps)
            ensure_category(conn, category_name)
            cursor = conn.execute(
                """
                INSERT INTO test_cases (
                    test_id,
                    category,
                    title,
                    priority,
                    steps,
                    expected_result,
                    test_data,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    test_case.test_id,
                    category_name,
                    test_case.title,
                    test_case.priority,
                    steps_text,
                    expected_text,
                    test_case.test_data,
                    created_at,
                ),
            )
            replace_test_case_steps(conn, cursor.lastrowid, case_steps)
            created = conn.execute(
                "SELECT * FROM test_cases WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
            created_cases.append(attach_steps_to_test_case(conn, created))

    return {"created_count": len(created_cases), "test_cases": created_cases}


@router.get("/test-cases")
def list_test_cases(include_retired: bool = False):
    with get_db() as conn:
        where_clause = "" if include_retired else "WHERE is_deleted = 0"
        rows = conn.execute(
            f"""
            SELECT *
            FROM test_cases
            {where_clause}
            ORDER BY id DESC
            """
        ).fetchall()
        data = [attach_steps_to_test_case(conn, row) for row in rows]
    return data


@router.post("/test-cases/{test_case_id}/restore")
def restore_test_case(test_case_id: int):
    with get_db() as conn:
        test_case = conn.execute(
            "SELECT id FROM test_cases WHERE id = ? AND is_deleted = 1",
            (test_case_id,),
        ).fetchone()
        if not test_case:
            raise HTTPException(status_code=404, detail="Retired test case not found")

        conn.execute(
            """
            UPDATE test_cases
            SET is_deleted = 0, deleted_at = ''
            WHERE id = ?
            """,
            (test_case_id,),
        )
        restored = conn.execute(
            "SELECT * FROM test_cases WHERE id = ?", (test_case_id,)
        ).fetchone()
        data = attach_steps_to_test_case(conn, restored)

    return data


@router.post("/test-cases/{test_case_id}/duplicate", status_code=201)
def duplicate_test_case(test_case_id: int):
    created_at = now_iso()
    with get_db() as conn:
        source = conn.execute(
            "SELECT * FROM test_cases WHERE id = ? AND is_deleted = 0",
            (test_case_id,),
        ).fetchone()
        if not source:
            raise HTTPException(status_code=404, detail="Test case not found")

        cursor = conn.execute(
            """
            INSERT INTO test_cases (
                test_id,
                category,
                title,
                priority,
                steps,
                expected_result,
                test_data,
                created_at
            )
            VALUES ('', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source["category"],
                f'{source["title"]} (Copy)',
                source["priority"],
                source["steps"],
                source["expected_result"],
                source["test_data"],
                created_at,
            ),
        )
        duplicated = conn.execute(
            "SELECT * FROM test_cases WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        source_steps = get_test_case_steps(conn, test_case_id)
        copied_steps = [
            {
                "step_text": step["step_text"],
                "expected_result": step["expected_result"],
            }
            for step in source_steps
        ]
        if not copied_steps and (source["steps"] or source["expected_result"]):
            copied_steps = [
                {
                    "step_text": source["steps"],
                    "expected_result": source["expected_result"],
                }
            ]
        replace_test_case_steps(conn, cursor.lastrowid, copied_steps)
        data = attach_steps_to_test_case(conn, duplicated)

    return data


@router.delete("/test-cases/{test_case_id}")
def delete_test_case(test_case_id: int):
    deleted_at = now_iso()
    with get_db() as conn:
        test_case = conn.execute(
            "SELECT id FROM test_cases WHERE id = ? AND is_deleted = 0",
            (test_case_id,),
        ).fetchone()
        if not test_case:
            raise HTTPException(status_code=404, detail="Test case not found")

        conn.execute(
            """
            UPDATE test_cases
            SET is_deleted = 1, deleted_at = ?
            WHERE id = ?
            """,
            (deleted_at, test_case_id),
        )

    return {"message": "Test case retired", "id": test_case_id}

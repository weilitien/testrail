from __future__ import annotations

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from database import get_db, now_iso, row_to_dict
from schemas import (
    AddCasesRequest,
    CategoryCreate,
    ExecutionCreate,
    ExecutionItemUpdate,
    ExecutionItemsBulkUpdate,
    TestCaseBulkCreate,
    TestCaseCreate,
    TestSuiteCreate,
    TestSuiteUpdate,
)
from services import (
    attach_steps_to_test_case,
    ensure_category,
    find_missing_execution_item_ids,
    find_missing_test_case_ids,
    get_test_case_steps,
    init_db,
    normalize_case_steps,
    normalize_category_name,
    replace_test_case_steps,
    steps_to_legacy_text,
    update_execution_item_result,
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


@app.get("/")
def health_check():
    return {"message": "Mini TestRail API is running"}


@app.get("/categories")
def list_categories():
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
                c.id,
                c.name,
                c.created_at,
                COUNT(tc.id) AS test_count
            FROM categories c
            LEFT JOIN test_cases tc ON lower(tc.category) = lower(c.name)
            GROUP BY c.id
            ORDER BY lower(c.name)
            """
        ).fetchall()

    return [row_to_dict(row) for row in rows]


@app.post("/categories", status_code=201)
def create_category(payload: CategoryCreate):
    category_name = normalize_category_name(payload.name)
    if not category_name:
        raise HTTPException(status_code=400, detail="Category name is required")

    created_at = now_iso()
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM categories WHERE lower(name) = lower(?)",
            (category_name,),
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Category name already exists")

        cursor = conn.execute(
            "INSERT INTO categories (name, created_at) VALUES (?, ?)",
            (category_name, created_at),
        )
        category = conn.execute(
            """
            SELECT id, name, created_at, 0 AS test_count
            FROM categories
            WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return row_to_dict(category)


@app.put("/categories/{category_id}")
def update_category(category_id: int, payload: CategoryCreate):
    new_name = normalize_category_name(payload.name)
    if not new_name:
        raise HTTPException(status_code=400, detail="Category name is required")

    with get_db() as conn:
        category = conn.execute(
            "SELECT * FROM categories WHERE id = ?",
            (category_id,),
        ).fetchone()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

        duplicate = conn.execute(
            """
            SELECT id FROM categories
            WHERE lower(name) = lower(?) AND id != ?
            """,
            (new_name, category_id),
        ).fetchone()
        if duplicate:
            raise HTTPException(status_code=409, detail="Category name already exists")

        old_name = category["name"]
        conn.execute(
            "UPDATE categories SET name = ? WHERE id = ?",
            (new_name, category_id),
        )
        conn.execute(
            "UPDATE test_cases SET category = ? WHERE lower(category) = lower(?)",
            (new_name, old_name),
        )
        updated = conn.execute(
            """
            SELECT
                c.id,
                c.name,
                c.created_at,
                COUNT(tc.id) AS test_count
            FROM categories c
            LEFT JOIN test_cases tc ON lower(tc.category) = lower(c.name)
            WHERE c.id = ?
            GROUP BY c.id
            """,
            (category_id,),
        ).fetchone()

    return row_to_dict(updated)


@app.delete("/categories/{category_id}")
def delete_category(category_id: int):
    with get_db() as conn:
        category = conn.execute(
            "SELECT * FROM categories WHERE id = ?",
            (category_id,),
        ).fetchone()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

        conn.execute(
            "UPDATE test_cases SET category = '' WHERE lower(category) = lower(?)",
            (category["name"],),
        )
        conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))

    return {"message": "Category deleted", "id": category_id}


@app.post("/test-cases", status_code=201)
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


@app.put("/test-cases/{test_case_id}")
def update_test_case(test_case_id: int, payload: TestCaseCreate):
    category_name = normalize_category_name(payload.category)
    case_steps = normalize_case_steps(payload)
    steps_text, expected_text = steps_to_legacy_text(case_steps)
    with get_db() as conn:
        test_case = conn.execute(
            "SELECT id FROM test_cases WHERE id = ?", (test_case_id,)
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
                test_data = ?
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


@app.post("/test-cases/bulk", status_code=201)
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


@app.get("/test-cases")
def list_test_cases():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM test_cases ORDER BY id DESC"
        ).fetchall()
        data = [attach_steps_to_test_case(conn, row) for row in rows]
    return data


@app.post("/test-cases/{test_case_id}/duplicate", status_code=201)
def duplicate_test_case(test_case_id: int):
    created_at = now_iso()
    with get_db() as conn:
        source = conn.execute(
            "SELECT * FROM test_cases WHERE id = ?", (test_case_id,)
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


@app.delete("/test-cases/{test_case_id}")
def delete_test_case(test_case_id: int):
    with get_db() as conn:
        test_case = conn.execute(
            "SELECT id FROM test_cases WHERE id = ?", (test_case_id,)
        ).fetchone()
        if not test_case:
            raise HTTPException(status_code=404, detail="Test case not found")

        conn.execute("DELETE FROM test_cases WHERE id = ?", (test_case_id,))

    return {"message": "Test case deleted", "id": test_case_id}


@app.get("/test-suites")
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
                COUNT(sc.id) AS total_cases
            FROM test_suites s
            LEFT JOIN test_suite_cases sc ON sc.suite_id = s.id
            GROUP BY s.id, s.name, s.description, s.created_at, s.updated_at
            ORDER BY s.id DESC
            """
        ).fetchall()

    return [row_to_dict(row) for row in rows]


@app.post("/test-suites", status_code=201)
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


@app.get("/test-suites/{suite_id}")
def get_test_suite(suite_id: int):
    return get_test_suite_detail(suite_id)


@app.put("/test-suites/{suite_id}")
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


@app.delete("/test-suites/{suite_id}")
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
            WHERE sc.suite_id = ?
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


@app.post("/executions", status_code=201)
def create_execution(payload: ExecutionCreate):
    created_at = now_iso()
    execution_name = payload.name.strip()
    with get_db() as conn:
        existing_execution = conn.execute(
            "SELECT id FROM executions WHERE lower(name) = lower(?)",
            (execution_name,),
        ).fetchone()
        if existing_execution:
            raise HTTPException(
                status_code=409,
                detail="Execution name already exists",
            )

        test_case_ids = list(dict.fromkeys(payload.test_case_ids))
        if test_case_ids:
            missing_ids = find_missing_test_case_ids(conn, test_case_ids)
            if missing_ids:
                raise HTTPException(
                    status_code=404,
                    detail=f"Test case IDs not found: {missing_ids}",
                )

        cursor = conn.execute(
            """
            INSERT INTO executions (name, description, created_at)
            VALUES (?, ?, ?)
            """,
            (execution_name, payload.description, created_at),
        )
        execution_id = cursor.lastrowid

        for test_case_id in test_case_ids:
            conn.execute(
                """
                INSERT INTO execution_items
                    (execution_id, test_case_id, status, actual_result, created_at, updated_at)
                VALUES (?, ?, 'NOT_RUN', '', ?, ?)
                """,
                (execution_id, test_case_id, created_at, created_at),
            )

        execution = conn.execute(
            "SELECT * FROM executions WHERE id = ?", (execution_id,)
        ).fetchone()

    data = row_to_dict(execution)
    data["added_count"] = len(test_case_ids)
    return data


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
                tc.test_id,
                tc.category,
                tc.title,
                tc.priority,
                tc.steps,
                tc.expected_result,
                tc.test_data
            FROM execution_items i
            JOIN test_cases tc ON tc.id = i.test_case_id
            WHERE i.execution_id = ?
            ORDER BY i.id
            """,
            (execution_id,),
        ).fetchall()

    item_list = []
    with get_db() as conn:
        for row in items:
            item = row_to_dict(row)
            item["case_steps"] = get_test_case_steps(conn, item["test_case_id"])
            item_list.append(item)
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


@app.delete("/executions/{execution_id}")
def delete_execution(execution_id: int):
    with get_db() as conn:
        execution = conn.execute(
            "SELECT id FROM executions WHERE id = ?", (execution_id,)
        ).fetchone()
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")

        conn.execute("DELETE FROM executions WHERE id = ?", (execution_id,))

    return {"message": "Execution deleted", "id": execution_id}


@app.post("/executions/{execution_id}/test-cases", status_code=201)
def add_test_cases_to_execution(execution_id: int, payload: AddCasesRequest):
    timestamp = now_iso()
    with get_db() as conn:
        execution = conn.execute(
            "SELECT id FROM executions WHERE id = ?", (execution_id,)
        ).fetchone()
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")

        missing_ids = find_missing_test_case_ids(conn, payload.test_case_ids)
        if missing_ids:
            raise HTTPException(
                status_code=404,
                detail=f"Test case IDs not found: {missing_ids}",
            )

        added_count = 0
        for test_case_id in payload.test_case_ids:
            cursor = conn.execute(
                """
                INSERT INTO execution_items
                    (execution_id, test_case_id, status, actual_result, created_at, updated_at)
                VALUES (?, ?, 'NOT_RUN', '', ?, ?)
                ON CONFLICT (execution_id, test_case_id) DO NOTHING
                """,
                (execution_id, test_case_id, timestamp, timestamp),
            )
            added_count += cursor.rowcount

    return {"added_count": added_count}


@app.patch("/execution-items/bulk")
def update_execution_items_bulk(payload: ExecutionItemsBulkUpdate):
    timestamp = now_iso()
    updated_items = []
    missing_ids = []

    unique_item_ids = list(dict.fromkeys(payload.item_ids))
    with get_db() as conn:
        missing_ids = find_missing_execution_item_ids(conn, unique_item_ids)
        if missing_ids:
            raise HTTPException(
                status_code=404,
                detail=f"Execution item IDs not found: {missing_ids}",
            )

        for item_id in unique_item_ids:
            updated = update_execution_item_result(
                conn, item_id, payload.status, payload.actual_result, timestamp
            )
            updated_items.append(row_to_dict(updated))

    return {"updated_count": len(updated_items), "items": updated_items}


@app.patch("/execution-items/{item_id}")
def update_execution_item(item_id: int, payload: ExecutionItemUpdate):
    timestamp = now_iso()
    with get_db() as conn:
        updated = update_execution_item_result(
            conn, item_id, payload.status, payload.actual_result, timestamp
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Execution item not found")
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

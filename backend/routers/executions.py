from fastapi import APIRouter, HTTPException

from database import get_db, now_iso, row_to_dict
from schemas import (
    AddCasesRequest,
    ExecutionCreate,
    ExecutionItemUpdate,
    ExecutionItemsBulkUpdate,
)
from services import (
    create_execution_item_from_snapshot,
    find_missing_execution_item_ids,
    find_missing_test_case_ids,
    parse_case_steps_snapshot,
    update_execution_item_result,
)


router = APIRouter(tags=["executions"])


@router.post("/executions", status_code=201)
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
            create_execution_item_from_snapshot(
                conn,
                execution_id,
                test_case_id,
                created_at,
            )

        execution = conn.execute(
            "SELECT * FROM executions WHERE id = ?", (execution_id,)
        ).fetchone()

    data = row_to_dict(execution)
    data["added_count"] = len(test_case_ids)
    return data


@router.get("/executions")
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


@router.get("/executions/{execution_id}")
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
                i.snapshot_test_id AS test_id,
                i.snapshot_category AS category,
                i.snapshot_title AS title,
                i.snapshot_priority AS priority,
                i.snapshot_steps AS steps,
                i.snapshot_expected_result AS expected_result,
                i.snapshot_test_data AS test_data,
                i.snapshot_case_steps,
                i.snapshot_version,
                COALESCE(tc.is_deleted, 0) AS original_case_retired,
                COALESCE(tc.deleted_at, '') AS original_case_deleted_at
            FROM execution_items i
            LEFT JOIN test_cases tc ON tc.id = i.test_case_id
            WHERE i.execution_id = ?
            ORDER BY i.id
            """,
            (execution_id,),
        ).fetchall()

    item_list = []
    for row in items:
        item = row_to_dict(row)
        item["case_steps"] = parse_case_steps_snapshot(item["snapshot_case_steps"])
        item.pop("snapshot_case_steps", None)
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


@router.delete("/executions/{execution_id}")
def delete_execution(execution_id: int):
    with get_db() as conn:
        execution = conn.execute(
            "SELECT id FROM executions WHERE id = ?", (execution_id,)
        ).fetchone()
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")

        conn.execute("DELETE FROM executions WHERE id = ?", (execution_id,))

    return {"message": "Execution deleted", "id": execution_id}


@router.post("/executions/{execution_id}/test-cases", status_code=201)
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
            cursor = create_execution_item_from_snapshot(
                conn,
                execution_id,
                test_case_id,
                timestamp,
            )
            if cursor:
                added_count += cursor.rowcount

    return {"added_count": added_count}


@router.patch("/execution-items/bulk")
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


@router.patch("/execution-items/{item_id}")
def update_execution_item(item_id: int, payload: ExecutionItemUpdate):
    timestamp = now_iso()
    with get_db() as conn:
        updated = update_execution_item_result(
            conn, item_id, payload.status, payload.actual_result, timestamp
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Execution item not found")
    return row_to_dict(updated)


@router.get("/executions/{execution_id}/history")
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
                i.snapshot_title AS title
            FROM execution_history h
            JOIN execution_items i ON i.id = h.execution_item_id
            WHERE h.execution_id = ?
            ORDER BY h.id DESC
            """,
            (execution_id,),
        ).fetchall()

    return [row_to_dict(row) for row in rows]

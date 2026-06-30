import os

import pytest

from conftest import create_case


POSTGRES_URL = os.getenv("POSTGRES_TEST_DATABASE_URL")


pytestmark = pytest.mark.postgres


@pytest.fixture()
def postgres_api_modules():
    if not POSTGRES_URL:
        pytest.skip("Set POSTGRES_TEST_DATABASE_URL to run PostgreSQL smoke tests")

    import database
    from sqlalchemy import create_engine
    from routers import executions, test_cases
    from services import init_db

    database.engine = create_engine(POSTGRES_URL, future=True)
    init_db()
    with database.get_db() as conn:
        conn.execute("DELETE FROM execution_history")
        conn.execute("DELETE FROM execution_items")
        conn.execute("DELETE FROM executions")
        conn.execute("DELETE FROM test_suite_cases")
        conn.execute("DELETE FROM test_case_steps")
        conn.execute("DELETE FROM test_cases")
        conn.execute("DELETE FROM test_suites")
        conn.execute("DELETE FROM categories")
    return test_cases, executions


def test_postgres_create_retire_and_rerun_smoke(postgres_api_modules):
    test_cases, executions = postgres_api_modules
    from schemas import ExecutionCreate, ExecutionItemUpdate, ExecutionRerunCreate

    active_case = create_case(
        test_cases,
        test_id="TC-PG-001",
        title="PostgreSQL active case",
    )
    retired_case = create_case(
        test_cases,
        test_id="TC-PG-002",
        title="PostgreSQL retired case",
    )
    source = executions.create_execution(
        ExecutionCreate(
            name="PostgreSQL Smoke Run",
            test_case_ids=[active_case["id"], retired_case["id"]],
        )
    )
    source_detail = executions.get_execution_detail(source["id"])
    executions.update_execution_item(
        source_detail["items"][0]["id"],
        ExecutionItemUpdate(status="PASS", actual_result="Passed on PostgreSQL"),
    )
    test_cases.delete_test_case(retired_case["id"])

    detail_after_retire = executions.get_execution_detail(source["id"])
    retired_item = next(
        item for item in detail_after_retire["items"] if item["test_case_id"] == retired_case["id"]
    )
    assert retired_item["original_case_retired"] == 1

    rerun = executions.rerun_execution(
        source["id"],
        ExecutionRerunCreate(
            name="PostgreSQL Smoke Run Rerun",
            description="Verifies PostgreSQL SQL compatibility",
        ),
    )
    rerun_detail = executions.get_execution_detail(rerun["id"])

    assert rerun["added_count"] == 1
    assert rerun["skipped_retired_count"] == 1
    assert [item["test_case_id"] for item in rerun_detail["items"]] == [active_case["id"]]
    assert rerun_detail["items"][0]["status"] == "NOT_RUN"
    assert executions.get_execution_history(rerun["id"]) == []

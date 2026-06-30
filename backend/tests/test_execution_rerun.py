import pytest
from fastapi import HTTPException

from conftest import create_case


def test_rerun_creates_new_execution_with_not_run_results(sqlite_api_modules):
    test_cases, _, executions = sqlite_api_modules
    from schemas import ExecutionCreate, ExecutionItemUpdate, ExecutionRerunCreate

    case_a = create_case(test_cases, "TC-RERUN-001", "First case")
    case_b = create_case(test_cases, "TC-RERUN-002", "Second case")
    source = executions.create_execution(
        ExecutionCreate(name="Regression Round 1", test_case_ids=[case_a["id"], case_b["id"]])
    )
    source_detail = executions.get_execution_detail(source["id"])
    executions.update_execution_item(
        source_detail["items"][0]["id"],
        ExecutionItemUpdate(status="FAIL", actual_result="Needs a fix"),
    )

    rerun = executions.rerun_execution(
        source["id"],
        ExecutionRerunCreate(
            name="Regression Round 2",
            description="Second pass after fixes",
        ),
    )
    rerun_detail = executions.get_execution_detail(rerun["id"])

    assert rerun["name"] == "Regression Round 2"
    assert rerun["description"] == "Second pass after fixes"
    assert rerun["added_count"] == 2
    assert rerun["skipped_retired_count"] == 0
    assert [item["status"] for item in rerun_detail["items"]] == ["NOT_RUN", "NOT_RUN"]
    assert [item["actual_result"] for item in rerun_detail["items"]] == ["", ""]
    assert executions.get_execution_history(rerun["id"]) == []


def test_rerun_skips_retired_source_cases(sqlite_api_modules):
    test_cases, _, executions = sqlite_api_modules
    from schemas import ExecutionCreate, ExecutionRerunCreate

    active_case = create_case(test_cases, "TC-RERUN-003", "Active case")
    retired_case = create_case(test_cases, "TC-RERUN-004", "Retired case")
    source = executions.create_execution(
        ExecutionCreate(
            name="Mixed Source Run",
            test_case_ids=[active_case["id"], retired_case["id"]],
        )
    )
    test_cases.delete_test_case(retired_case["id"])

    rerun = executions.rerun_execution(
        source["id"],
        ExecutionRerunCreate(name="Mixed Source Run Rerun"),
    )
    rerun_detail = executions.get_execution_detail(rerun["id"])

    assert rerun["added_count"] == 1
    assert rerun["skipped_retired_count"] == 1
    assert [item["test_case_id"] for item in rerun_detail["items"]] == [active_case["id"]]


def test_rerun_requires_unique_execution_name(sqlite_api_modules):
    test_cases, _, executions = sqlite_api_modules
    from schemas import ExecutionCreate, ExecutionRerunCreate

    test_case = create_case(test_cases, "TC-RERUN-005", "Unique name case")
    source = executions.create_execution(
        ExecutionCreate(name="Original Run", test_case_ids=[test_case["id"]])
    )
    executions.create_execution(ExecutionCreate(name="Already Used"))

    with pytest.raises(HTTPException) as error:
        executions.rerun_execution(
            source["id"],
            ExecutionRerunCreate(name="Already Used"),
        )

    assert error.value.status_code == 409
    assert error.value.detail == "Execution name already exists"

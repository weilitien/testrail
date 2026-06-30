import pytest
from fastapi import HTTPException

from conftest import create_case


def test_retire_hides_case_from_active_list_and_restore_returns_it(sqlite_api_modules):
    test_cases, _, _ = sqlite_api_modules
    test_case = create_case(test_cases, test_id="TC-SOFT-001", title="Soft delete check")

    assert [case["id"] for case in test_cases.list_test_cases()] == [test_case["id"]]

    retired = test_cases.delete_test_case(test_case["id"])
    assert retired == {"message": "Test case retired", "id": test_case["id"]}
    assert test_cases.list_test_cases() == []

    retired_cases = test_cases.list_test_cases(include_retired=True)
    assert len(retired_cases) == 1
    assert retired_cases[0]["id"] == test_case["id"]
    assert retired_cases[0]["is_deleted"] == 1
    assert retired_cases[0]["deleted_at"]

    restored = test_cases.restore_test_case(test_case["id"])
    assert restored["id"] == test_case["id"]
    assert restored["is_deleted"] == 0
    assert restored["deleted_at"] == ""
    assert [case["id"] for case in test_cases.list_test_cases()] == [test_case["id"]]


def test_retired_case_cannot_be_added_to_new_suite_or_execution(sqlite_api_modules):
    test_cases, test_suites, executions = sqlite_api_modules
    from schemas import ExecutionCreate, TestSuiteCreate

    test_case = create_case(test_cases, test_id="TC-SOFT-002", title="Retired add check")
    test_cases.delete_test_case(test_case["id"])

    with pytest.raises(HTTPException) as suite_error:
        test_suites.create_test_suite(
            TestSuiteCreate(name="Retired Suite", test_case_ids=[test_case["id"]])
        )
    assert suite_error.value.status_code == 404
    assert str(test_case["id"]) in suite_error.value.detail

    with pytest.raises(HTTPException) as execution_error:
        executions.create_execution(
            ExecutionCreate(name="Retired Run", test_case_ids=[test_case["id"]])
        )
    assert execution_error.value.status_code == 404
    assert str(test_case["id"]) in execution_error.value.detail


def test_retiring_case_preserves_execution_result_history_and_marks_source(sqlite_api_modules):
    test_cases, _, executions = sqlite_api_modules
    from schemas import ExecutionCreate, ExecutionItemUpdate

    test_case = create_case(test_cases, test_id="TC-SOFT-003", title="History check")
    execution = executions.create_execution(
        ExecutionCreate(name="Snapshot Run", test_case_ids=[test_case["id"]])
    )
    detail = executions.get_execution_detail(execution["id"])
    item_id = detail["items"][0]["id"]

    executions.update_execution_item(
        item_id,
        ExecutionItemUpdate(status="FAIL", actual_result="Observed failure"),
    )
    test_cases.delete_test_case(test_case["id"])

    detail_after_retire = executions.get_execution_detail(execution["id"])
    history = executions.get_execution_history(execution["id"])

    assert len(detail_after_retire["items"]) == 1
    item = detail_after_retire["items"][0]
    assert item["test_case_id"] == test_case["id"]
    assert item["title"] == test_case["title"]
    assert item["original_case_retired"] == 1
    assert item["original_case_deleted_at"]
    assert len(history) == 1
    assert history[0]["title"] == test_case["title"]

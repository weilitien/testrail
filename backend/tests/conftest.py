from pathlib import Path
import sys

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture()
def sqlite_api_modules(tmp_path):
    import database
    from routers import executions, test_cases, test_suites
    from services import init_db

    database.engine = None
    database.DB_PATH = str(tmp_path / "testrail-test.db")
    init_db()
    return test_cases, test_suites, executions


def create_case(test_cases, test_id="TC-SMOKE-001", title="Smoke case"):
    from schemas import TestCaseCreate, TestCaseStepCreate

    return test_cases.create_test_case(
        TestCaseCreate(
            test_id=test_id,
            category="Smoke",
            title=title,
            priority="High",
            case_steps=[
                TestCaseStepCreate(
                    step_text="Run the check",
                    expected_result="The check completes",
                )
            ],
        )
    )

from typing import Literal

from pydantic import BaseModel, Field


Status = Literal["NOT_RUN", "PASS", "FAIL", "BLOCKED", "SKIPPED"]


class TestCaseStepCreate(BaseModel):
    step_text: str = ""
    expected_result: str = ""


class TestCaseCreate(BaseModel):
    test_id: str = ""
    category: str = ""
    title: str = Field(..., min_length=1)
    priority: str = "Medium"
    steps: str = ""
    expected_result: str = ""
    case_steps: list[TestCaseStepCreate] = Field(default_factory=list)
    test_data: str = ""


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1)


class TestCaseBulkCreate(BaseModel):
    test_cases: list[TestCaseCreate] = Field(..., min_length=1)


class ExecutionCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""
    test_case_ids: list[int] = []


class ExecutionRerunCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""


class TestSuiteCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""
    test_case_ids: list[int] = []


class TestSuiteUpdate(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""
    test_case_ids: list[int] = []


class AddCasesRequest(BaseModel):
    test_case_ids: list[int] = Field(..., min_length=1)


class ExecutionItemUpdate(BaseModel):
    status: Status
    actual_result: str = ""


class ExecutionItemsBulkUpdate(BaseModel):
    item_ids: list[int] = Field(..., min_length=1)
    status: Status
    actual_result: str = ""

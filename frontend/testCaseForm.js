import { getDisplaySteps } from "./caseDetails.js";
import { escapeHtml } from "./utils.js";

export function createTestCaseFormState() {
  return {
    editingTestCaseId: null,
  };
}

export function addStepRow(elements, step = {}) {
  if (!elements.caseStepRows) {
    return;
  }

  const row = document.createElement("div");
  row.className = "stepEditorRow";
  row.innerHTML = `
    <label>
      Step
      <textarea class="stepTextInput" placeholder="Open login page">${escapeHtml(
        step.step_text || ""
      )}</textarea>
    </label>
    <label>
      Expected Result
      <textarea class="stepExpectedInput" placeholder="Login page is displayed">${escapeHtml(
        step.expected_result || ""
      )}</textarea>
    </label>
    <button class="iconButton dangerText removeStepButton" type="button">Remove</button>
  `;
  row.querySelector(".removeStepButton").addEventListener("click", () => {
    row.remove();
    if (!elements.caseStepRows.querySelector(".stepEditorRow")) {
      addStepRow(elements);
    }
  });
  elements.caseStepRows.appendChild(row);
}

export function renderStepEditor(elements, caseSteps = []) {
  if (!elements.caseStepRows) {
    return;
  }

  elements.caseStepRows.innerHTML = "";
  const rows = caseSteps.length ? caseSteps : [{}];
  for (const step of rows) {
    addStepRow(elements, step);
  }
}

function getStepRowsFromForm(elements) {
  if (!elements.caseStepRows) {
    return [];
  }

  return Array.from(elements.caseStepRows.querySelectorAll(".stepEditorRow"))
    .map((row) => ({
      step_text: row.querySelector(".stepTextInput").value,
      expected_result: row.querySelector(".stepExpectedInput").value,
    }))
    .filter((step) => step.step_text.trim() || step.expected_result.trim());
}

export function getTestCaseFormPayload(elements) {
  const caseSteps = getStepRowsFromForm(elements);
  return {
    test_id: document.querySelector("#caseTestId").value,
    category: document.querySelector("#caseCategory").value,
    title: document.querySelector("#caseTitle").value,
    priority: document.querySelector("#casePriority").value,
    steps: caseSteps.map((step) => step.step_text).join("\n"),
    expected_result: caseSteps.map((step) => step.expected_result).join("\n"),
    case_steps: caseSteps,
    test_data: document.querySelector("#caseTestData").value,
  };
}

function fillTestCaseForm(elements, testCase) {
  document.querySelector("#caseTestId").value = testCase.test_id || "";
  document.querySelector("#caseCategory").value = testCase.category || "";
  document.querySelector("#caseTitle").value = testCase.title || "";
  document.querySelector("#casePriority").value = testCase.priority || "Medium";
  renderStepEditor(elements, getDisplaySteps(testCase));
  document.querySelector("#caseTestData").value = testCase.test_data || "";
}

export function showCaseForm(elements) {
  if (elements.caseFormPanel) {
    elements.caseFormPanel.hidden = false;
    elements.caseFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function hideCaseForm(elements) {
  if (elements.caseFormPanel) {
    elements.caseFormPanel.hidden = true;
  }
}

export function startCreatingTestCase(elements, formState) {
  formState.editingTestCaseId = null;
  elements.caseForm.reset();
  renderStepEditor(elements);
  elements.caseFormTitle.textContent = "Create Test Case";
  elements.caseSubmitButton.textContent = "Create Case";
  showCaseForm(elements);
}

export function startEditingTestCase(elements, formState, caseBrowserState, testCase) {
  formState.editingTestCaseId = testCase.id;
  caseBrowserState.selectedCaseId = testCase.id;
  fillTestCaseForm(elements, testCase);
  elements.caseFormTitle.textContent = `Edit Test Case ${testCase.test_id || `#${testCase.id}`}`;
  elements.caseSubmitButton.textContent = "Save Case";
  showCaseForm(elements);
}

export function resetTestCaseForm(elements, formState) {
  formState.editingTestCaseId = null;
  elements.caseForm.reset();
  renderStepEditor(elements);
  elements.caseFormTitle.textContent = "Create Test Case";
  elements.caseSubmitButton.textContent = "Create Case";
  hideCaseForm(elements);
}

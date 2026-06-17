import { api } from "./api.js";
import { getSelectedTestCase } from "./caseBrowser.js";
import {
  getTestCaseFormPayload,
  resetTestCaseForm,
  startEditingTestCase,
} from "./testCaseForm.js";

export async function saveTestCase({
  elements,
  formState,
  caseBrowserState,
  refreshData,
  showToast,
}) {
  const payload = getTestCaseFormPayload(elements);
  const editingId = formState.editingTestCaseId;
  const path = editingId ? `/test-cases/${editingId}` : "/test-cases";
  const method = editingId ? "PUT" : "POST";

  const savedCase = await api(path, {
    method,
    body: JSON.stringify(payload),
  });
  caseBrowserState.selectedCaseId = savedCase.id;
  showToast(editingId ? "Test case saved" : "Test case created");
  resetTestCaseForm(elements, formState);
  await refreshData();
}

export async function duplicateTestCase(testCase, {
  elements,
  formState,
  caseBrowserState,
  getTestCases,
  refreshData,
  showToast,
}) {
  const duplicated = await api(`/test-cases/${testCase.id}/duplicate`, {
    method: "POST",
  });
  caseBrowserState.selectedCaseId = duplicated.id;
  await refreshData();
  const duplicatedCase = getSelectedTestCase(getTestCases(), caseBrowserState) || duplicated;
  startEditingTestCase(elements, formState, caseBrowserState, duplicatedCase);
  const titleInput = document.querySelector("#caseTitle");
  titleInput.focus();
  titleInput.select();
  showToast("Test case duplicated. Rename it and save.");
}

export async function deleteTestCase(testCase, {
  selectedExecutionCaseIds,
  caseBrowserState,
  refreshData,
  showToast,
}) {
  const confirmed = window.confirm(
    `Delete test case "${testCase.title}"? This also removes it from executions.`
  );
  if (!confirmed) {
    return;
  }

  selectedExecutionCaseIds.delete(testCase.id);
  await api(`/test-cases/${testCase.id}`, { method: "DELETE" });
  if (caseBrowserState.selectedCaseId === testCase.id) {
    caseBrowserState.selectedCaseId = null;
  }
  showToast("Test case deleted");
  await refreshData();
}

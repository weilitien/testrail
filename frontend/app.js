import { api } from "./api.js";
import {
  createCaseBrowserState,
  filterTestCases,
  getSelectedTestCase,
  renderCaseCategoryFilter,
  renderCaseDetail,
  renderCategoryOptions,
  renderCategoryTree,
  resetCaseFilters,
} from "./caseBrowser.js";
import {
  renderGroupedCaseChecklist,
  updateSelectedCaseCount,
} from "./checklists.js";
import { STATUSES } from "./config.js";
import {
  clearCsvPreview,
  confirmCsvImport,
  downloadCsvTemplate,
  previewTestCasesFromCsv,
} from "./csvImport.js";
import { elements, hasExecutionPage, hasSuitePage } from "./dom.js";
import { escapeHtml } from "./utils.js";
import {
  getStatusCounts,
  groupExecutionItemsByCategory,
  renderExecutionSummaryDetail,
  renderHistory,
  renderSelectedExecutionItemDetail,
} from "./executions.js";
import { exportExecutionReport } from "./reports.js";
import {
  clearSuiteSelection,
  deleteSelectedSuite,
  getSuiteCaseIds,
  refreshTestSuites,
  renderExecutionSuiteSelect,
  renderSuiteCaseChecklist,
  renderSuitePage,
  renderTestSuites,
  saveTestSuite,
} from "./suites.js";
import {
  addStepRow,
  createTestCaseFormState,
  hideCaseForm,
  resetTestCaseForm,
  startCreatingTestCase,
  startEditingTestCase,
} from "./testCaseForm.js";
import {
  deleteTestCase,
  duplicateTestCase,
  saveTestCase,
} from "./testCaseActions.js";

let testCases = [];
let executions = [];
let categories = [];
let selectedExecutionId = null;
let selectedExecutionItemId = null;
let selectedExecutionItemIds = new Set();
let selectedExecutionCaseIds = new Set();
let selectedAddCaseIds = new Set();
let executionDetailMode = "result";
let caseBrowserState = createCaseBrowserState();
let testCaseFormState = createTestCaseFormState();
let currentExecutionDetail = null;

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3000);
}

function renderTestCases() {
  const visibleTestCases = filterTestCases(testCases, elements, caseBrowserState);
  const visibleTreeTestCases = filterTestCases(testCases, elements, caseBrowserState, {
    ignoreGroup: true,
  });
  const selectedCaseStillVisible = visibleTestCases.some(
    (testCase) => testCase.id === caseBrowserState.selectedCaseId
  );
  const selectedCaseStillInTree = visibleTreeTestCases.some(
    (testCase) => testCase.id === caseBrowserState.selectedCaseId
  );

  if (!selectedCaseStillVisible && !selectedCaseStillInTree) {
    caseBrowserState.selectedCaseId = visibleTestCases[0]?.id || null;
  }

  if (elements.caseCount) {
    elements.caseCount.textContent =
      visibleTestCases.length === testCases.length
        ? `${testCases.length} case(s)`
        : `${visibleTestCases.length} of ${testCases.length} case(s)`;
  }

  renderCategoryTree({
    elements,
    testCases,
    categories,
    state: caseBrowserState,
    callbacks: {
      renderTestCases,
      hideCaseForm: () => hideCaseForm(elements),
      renameCategory,
      deleteCategory,
      showToast,
    },
  });
  renderCategoryOptions(elements, categories);
  renderExecutionCaseCategoryFilter();
  renderAddCaseCategoryFilter();
  renderSuiteCaseCategoryFilter();
  renderCaseDetail(elements, getSelectedTestCase(testCases, caseBrowserState));

  renderExecutionCaseChecklist();
  renderAddCaseChecklist();
  renderSuiteCaseChecklist(elements, testCases);
  renderExecutionSuiteSelect(elements);

}

function renderExecutionCaseCategoryFilter() {
  renderCaseCategoryFilter(elements.executionCaseCategoryFilter, testCases, categories);
}

function renderAddCaseCategoryFilter() {
  renderCaseCategoryFilter(elements.addCaseCategoryFilter, testCases, categories);
}

function renderSuiteCaseCategoryFilter() {
  renderCaseCategoryFilter(elements.suiteCaseCategoryFilter, testCases, categories);
}

async function createCategory(name) {
  const result = await api("/categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  caseBrowserState.selectedCaseGroup = { type: "category", category: result.name };
  showToast("Category created");
  await loadInitialData();
}

async function renameCategory(category) {
  const newName = window.prompt("Rename category", category.name);
  if (newName === null) {
    return;
  }

  const trimmedName = newName.trim();
  if (!trimmedName) {
    showToast("Category name is required");
    return;
  }

  const updated = await api(`/categories/${category.id}`, {
    method: "PUT",
    body: JSON.stringify({ name: trimmedName }),
  });
  if (
    caseBrowserState.selectedCaseGroup.type === "category" &&
    caseBrowserState.selectedCaseGroup.category === category.name
  ) {
    caseBrowserState.selectedCaseGroup = { type: "category", category: updated.name };
  }
  showToast("Category renamed");
  await loadInitialData();
}

async function deleteCategory(category) {
  const confirmed = window.confirm(
    `Delete category "${category.name}"? Test cases will become Uncategorized.`
  );
  if (!confirmed) {
    return;
  }

  await api(`/categories/${category.id}`, { method: "DELETE" });
  if (
    caseBrowserState.selectedCaseGroup.type === "category" &&
    caseBrowserState.selectedCaseGroup.category === category.name
  ) {
    caseBrowserState.selectedCaseGroup = { type: "all", category: "" };
  }
  showToast("Category deleted");
  await loadInitialData();
}

function renderExecutionCaseChecklist() {
  renderGroupedCaseChecklist({
    cases: testCases,
    searchElement: elements.executionCaseSearch,
    categoryElement: elements.executionCaseCategoryFilter,
    checklistElement: elements.executionCaseChecklist,
    selectedIds: selectedExecutionCaseIds,
    countElement: elements.selectedCaseCount,
  });
}

function renderAddCaseChecklist() {
  const existingCaseIds = new Set(
    currentExecutionDetail?.items.map((item) => item.test_case_id) || []
  );
  renderGroupedCaseChecklist({
    cases: testCases,
    searchElement: elements.addCaseSearch,
    categoryElement: elements.addCaseCategoryFilter,
    checklistElement: elements.addCaseChecklist,
    selectedIds: selectedAddCaseIds,
    countElement: elements.selectedAddCaseCount,
    excludeIds: existingCaseIds,
  });
}

function getSelectedExecutionCaseIds() {
  return Array.from(selectedExecutionCaseIds);
}

function renderExecutions() {
  if (!elements.executionList) {
    return;
  }

  const visibleExecutions = filterExecutions(executions);
  elements.executionCount.textContent =
    visibleExecutions.length === executions.length
      ? `${executions.length} execution(s)`
      : `${visibleExecutions.length} of ${executions.length} execution(s)`;
  elements.executionList.innerHTML = visibleExecutions.length
    ? ""
    : executions.length
      ? "<p class='muted'>No executions match the current search.</p>"
      : "<p class='muted'>No executions yet.</p>";

  for (const execution of visibleExecutions) {
    const isSelectedExecution = selectedExecutionId === execution.id;
    const row = document.createElement("article");
    row.className = `executionNavItem ${isSelectedExecution ? "selected" : ""}`;
    row.innerHTML = `
      <button class="executionNavButton" type="button" data-action="view">
        <span class="categoryToggle">${isSelectedExecution ? "-" : "+"}</span>
        <span class="navTypeLabel execution">Execution</span>
        <strong>${escapeHtml(execution.name)}</strong>
      </button>
      <div class="executionNavActions">
        <button class="danger" type="button" data-action="delete">Delete</button>
      </div>
    `;
    row.querySelector("[data-action='view']").addEventListener("click", () => {
      toggleExecution(execution.id).catch((error) => showToast(error.message));
    });
    row.querySelector("[data-action='delete']").addEventListener("click", () =>
      deleteExecution(execution)
    );
    if (isSelectedExecution && currentExecutionDetail?.items) {
      row.appendChild(createExecutionNavTree(currentExecutionDetail.items));
    }
    elements.executionList.appendChild(row);
  }
}

function createExecutionNavTree(items) {
  const tree = document.createElement("div");
  tree.className = "executionNavTree";

  if (!items.length) {
    tree.innerHTML = "<p class='muted'>No test cases in this execution.</p>";
    return tree;
  }

  for (const group of groupExecutionItemsByCategory(items)) {
    const groupElement = document.createElement("section");
    groupElement.className = "executionNavGroup";
    groupElement.innerHTML = `
      <div class="executionNavGroupHeader">
        <strong>${escapeHtml(group.label)}</strong>
        <span>${group.items.length}</span>
      </div>
      <div class="executionNavGroupItems"></div>
    `;

    const groupItems = groupElement.querySelector(".executionNavGroupItems");
    for (const item of group.items) {
      groupItems.appendChild(createExecutionNavResultItem(item));
    }
    tree.appendChild(groupElement);
  }

  return tree;
}

function createExecutionNavResultItem(item) {
  const button = document.createElement("button");
  const isSelectedResult =
    executionDetailMode === "result" && selectedExecutionItemId === item.id;
  button.className = `executionNavResultItem ${isSelectedResult ? "selected" : ""}`;
  button.type = "button";
  button.innerHTML = `
    <input
      class="executionNavResultCheckbox"
      type="checkbox"
      aria-label="Select ${escapeHtml(item.title)}"
      ${selectedExecutionItemIds.has(item.id) ? "checked" : ""}
    />
    <span class="caseId">${escapeHtml(item.test_id || "No Test ID")}</span>
    <span class="status ${item.status}">${item.status}</span>
    <strong>${escapeHtml(item.title)}</strong>
  `;
  button.querySelector(".executionNavResultCheckbox").addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.currentTarget.checked) {
      selectedExecutionItemIds.add(item.id);
    } else {
      selectedExecutionItemIds.delete(item.id);
    }
    updateSelectedResultCount();
  });
  button.addEventListener("click", () => {
    executionDetailMode = "result";
    selectedExecutionItemId = item.id;
    renderExecutionDetail(currentExecutionDetail);
    renderExecutions();
  });
  return button;
}

function filterExecutions(executionList) {
  const searchText = elements.executionSearch
    ? elements.executionSearch.value.trim().toLowerCase()
    : "";

  return executionList.filter((execution) => {
    const searchableText = [execution.name, execution.description]
      .join(" ")
      .toLowerCase();

    return !searchText || searchableText.includes(searchText);
  });
}

function resetExecutionSearch() {
  if (elements.executionSearch) {
    elements.executionSearch.value = "";
  }
}

function showExecutionCreator() {
  if (!elements.executionCreatorPane) {
    return;
  }

  elements.executionCreatorPane.hidden = false;
  if (elements.detailPanel) {
    elements.detailPanel.hidden = true;
  }
  if (elements.executionEmptyPanel) {
    elements.executionEmptyPanel.hidden = true;
  }
  renderExecutionCaseChecklist();
}

function hideExecutionCreator() {
  if (!elements.executionCreatorPane) {
    return;
  }

  elements.executionCreatorPane.hidden = true;
  if (selectedExecutionId && currentExecutionDetail && elements.detailPanel) {
    elements.detailPanel.hidden = false;
  } else if (elements.executionEmptyPanel) {
    elements.executionEmptyPanel.hidden = false;
  }
}

function clearExecutionDetail() {
  selectedExecutionId = null;
  selectedExecutionItemId = null;
  selectedExecutionItemIds = new Set();
  selectedAddCaseIds = new Set();
  executionDetailMode = "result";
  currentExecutionDetail = null;
  if (elements.detailPanel) {
    elements.detailPanel.hidden = true;
  }
  if (elements.executionCreatorPane) {
    elements.executionCreatorPane.hidden = true;
  }
  if (elements.executionEmptyPanel) {
    elements.executionEmptyPanel.hidden = false;
  }
  if (elements.selectedExecutionLabel) {
    elements.selectedExecutionLabel.textContent = "Select an execution";
  }
  if (elements.summaryShortcutMeta) {
    elements.summaryShortcutMeta.textContent = "Pass rate and status totals";
  }
  if (elements.historyList) {
    elements.historyList.innerHTML = "";
  }
  renderSelectedExecutionItemDetail(elements, null);
  updateSelectedResultCount();
  updateSelectedCaseCount(selectedAddCaseIds, elements.selectedAddCaseCount);
}

function renderExecutionDetail(detail) {
  const { execution, items, summary } = detail;
  const statusCounts = getStatusCounts(items);
  const selectedItemStillExists = items.some(
    (item) => item.id === selectedExecutionItemId
  );

  if (!selectedItemStillExists) {
    selectedExecutionItemId = items[0]?.id || null;
  }
  selectedExecutionItemIds = new Set(
    Array.from(selectedExecutionItemIds).filter((itemId) =>
      items.some((item) => item.id === itemId)
    )
  );
  const existingCaseIds = new Set(items.map((item) => item.test_case_id));
  selectedAddCaseIds = new Set(
    Array.from(selectedAddCaseIds).filter((caseId) => !existingCaseIds.has(caseId))
  );
  updateSelectedResultCount();
  renderAddCaseChecklist();

  elements.selectedExecutionLabel.textContent = execution.name;
  if (elements.summaryShortcutMeta) {
    elements.summaryShortcutMeta.textContent = `${summary.pass_rate}% pass rate / ${summary.total_cases} case(s)`;
  }
  if (elements.showExecutionSummaryButton) {
    elements.showExecutionSummaryButton.classList.toggle(
      "active",
      executionDetailMode === "summary"
    );
  }

  if (executionDetailMode === "summary") {
    renderExecutionSummaryDetail(elements, detail, statusCounts);
  } else {
    renderSelectedExecutionItemDetail(
      elements,
      items.find((item) => item.id === selectedExecutionItemId) || null
    );
  }
}

function updateSelectedResultCount() {
  if (elements.selectedResultCount) {
    elements.selectedResultCount.textContent = `${selectedExecutionItemIds.size} selected`;
  }
}

function expandExecutionRow(executionId) {
  if (!elements.detailPanel) {
    return;
  }

  elements.detailPanel.hidden = false;
  if (elements.executionEmptyPanel) {
    elements.executionEmptyPanel.hidden = true;
  }
}

function rerenderCurrentExecutionDetail() {
  if (currentExecutionDetail) {
    renderExecutionDetail(currentExecutionDetail);
  }
}

async function loadInitialData() {
  categories = await api("/categories");
  testCases = await api("/test-cases");
  renderTestCases();

  if (hasSuitePage) {
    await refreshTestSuites();
    await renderSuitePage(elements, showToast, testCases);
  }

  if (!hasExecutionPage) {
    return;
  }

  await refreshTestSuites();
  renderExecutionSuiteSelect(elements);

  executions = await api("/executions");
  renderExecutions();

  if (selectedExecutionId) {
    const selectedStillExists = executions.some((execution) => execution.id === selectedExecutionId);
    if (selectedStillExists) {
      await selectExecution(selectedExecutionId);
    } else {
      clearExecutionDetail();
    }
  }
}

async function applySuiteToExecutionCreator() {
  const suiteId = Number(elements.executionSuiteSelect.value);
  if (!suiteId) {
    showToast("Select a test suite first");
    return;
  }

  const suiteCaseIds = await getSuiteCaseIds(suiteId);
  if (!suiteCaseIds.length) {
    showToast("This suite has no test cases");
    return;
  }

  selectedExecutionCaseIds = new Set([
    ...selectedExecutionCaseIds,
    ...suiteCaseIds,
  ]);
  renderExecutionCaseChecklist();
  showToast(`${suiteCaseIds.length} case(s) selected from suite`);
}

async function selectExecution(executionId) {
  if (selectedExecutionId !== executionId) {
    selectedExecutionItemId = null;
    selectedExecutionItemIds = new Set();
    selectedAddCaseIds = new Set();
    executionDetailMode = "result";
  }
  selectedExecutionId = executionId;
  const detail = await api(`/executions/${executionId}`);
  const history = await api(`/executions/${executionId}/history`);
  currentExecutionDetail = detail;
  hideExecutionCreator();
  renderExecutions();
  renderExecutionDetail(detail);
  renderHistory(elements, history);
  expandExecutionRow(executionId);
}

async function toggleExecution(executionId) {
  if (selectedExecutionId === executionId) {
    clearExecutionDetail();
    renderExecutions();
    return;
  }

  await selectExecution(executionId);
}

async function updateExecutionItem(itemId, payload) {
  await api(`/execution-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  showToast("Result saved");
  await loadInitialData();
}

async function updateExecutionItemsBulk() {
  const itemIds = Array.from(selectedExecutionItemIds);
  if (!itemIds.length) {
    showToast("Select at least one result");
    return;
  }

  await api("/execution-items/bulk", {
    method: "PATCH",
    body: JSON.stringify({
      item_ids: itemIds,
      status: elements.bulkResultStatus.value,
      actual_result: elements.bulkResultNotes.value,
    }),
  });
  selectedExecutionItemIds = new Set();
  elements.bulkResultNotes.value = "";
  showToast(`Updated ${itemIds.length} result(s)`);
  await loadInitialData();
}

async function deleteExecution(execution) {
  const confirmed = window.confirm(
    `Delete execution "${execution.name}"? This also removes its results and history.`
  );
  if (!confirmed) {
    return;
  }

  await api(`/executions/${execution.id}`, { method: "DELETE" });
  if (selectedExecutionId === execution.id) {
    clearExecutionDetail();
  }
  showToast("Execution deleted");
  await loadInitialData();
}

if (elements.caseForm) {
  elements.caseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveTestCase({
        elements,
        formState: testCaseFormState,
        caseBrowserState,
        refreshData: loadInitialData,
        showToast,
      });
    } catch (error) {
      showToast(error.message);
    }
  });
}

if (elements.categoryForm) {
  elements.categoryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const categoryName = elements.categoryName.value.trim();
    if (!categoryName) {
      showToast("Category name is required");
      return;
    }

    try {
      await createCategory(categoryName);
      elements.categoryForm.reset();
    } catch (error) {
      showToast(error.message);
    }
  });
}

if (elements.createCaseButton) {
  elements.createCaseButton.addEventListener("click", () => {
    startCreatingTestCase(elements, testCaseFormState);
  });
}

if (elements.addStepButton) {
  elements.addStepButton.addEventListener("click", () => addStepRow(elements));
}

if (elements.cancelCaseEditButton) {
  elements.cancelCaseEditButton.addEventListener("click", () => {
    resetTestCaseForm(elements, testCaseFormState);
  });
}

if (elements.editSelectedCaseButton) {
  elements.editSelectedCaseButton.addEventListener("click", () => {
    const selectedCase = getSelectedTestCase(testCases, caseBrowserState);
    if (selectedCase) {
      startEditingTestCase(elements, testCaseFormState, caseBrowserState, selectedCase);
    }
  });
}

if (elements.duplicateSelectedCaseButton) {
  elements.duplicateSelectedCaseButton.addEventListener("click", async () => {
    const selectedCase = getSelectedTestCase(testCases, caseBrowserState);
    if (selectedCase) {
      await duplicateTestCase(selectedCase, {
        elements,
        formState: testCaseFormState,
        caseBrowserState,
        getTestCases: () => testCases,
        refreshData: loadInitialData,
        showToast,
      });
    }
  });
}

if (elements.deleteSelectedCaseButton) {
  elements.deleteSelectedCaseButton.addEventListener("click", async () => {
    const selectedCase = getSelectedTestCase(testCases, caseBrowserState);
    if (selectedCase) {
      await deleteTestCase(selectedCase, {
        selectedExecutionCaseIds,
        caseBrowserState,
        refreshData: loadInitialData,
        showToast,
      });
    }
  });
}

if (elements.toggleExecutionCreatorButton) {
  elements.toggleExecutionCreatorButton.addEventListener("click", showExecutionCreator);
}

if (elements.closeExecutionCreatorButton) {
  elements.closeExecutionCreatorButton.addEventListener("click", hideExecutionCreator);
}

if (elements.executionForm) {
  elements.executionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedCaseIds = getSelectedExecutionCaseIds();

    if (!selectedCaseIds.length) {
      showToast("Select at least one test case");
      return;
    }

    try {
      const execution = await api("/executions", {
        method: "POST",
        body: JSON.stringify({
          name: document.querySelector("#executionName").value,
          description: document.querySelector("#executionDescription").value,
          test_case_ids: selectedCaseIds,
        }),
      });
      elements.executionForm.reset();
      selectedExecutionCaseIds = new Set();
      renderExecutionSuiteSelect(elements);
      hideExecutionCreator();
      showToast("Execution created");
      await loadInitialData();
      await selectExecution(execution.id);
      elements.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      showToast(error.message);
    }
  });
}

if (elements.addSelectedCasesButton) {
  elements.addSelectedCasesButton.addEventListener("click", async () => {
    if (!selectedExecutionId) {
      showToast("Select an execution first");
      return;
    }

    const selectedIds = Array.from(selectedAddCaseIds);
    if (!selectedIds.length) {
      showToast("Select at least one test case");
      return;
    }

    await api(`/executions/${selectedExecutionId}/test-cases`, {
      method: "POST",
      body: JSON.stringify({ test_case_ids: selectedIds }),
    });
    selectedAddCaseIds = new Set();
    showToast("Cases added to execution");
    await loadInitialData();
  });
}

if (elements.applyBulkResultButton) {
  elements.applyBulkResultButton.addEventListener("click", async () => {
    try {
      await updateExecutionItemsBulk();
    } catch (error) {
      showToast(error.message);
    }
  });
}

if (elements.clearBulkSelectionButton) {
  elements.clearBulkSelectionButton.addEventListener("click", () => {
    selectedExecutionItemIds = new Set();
    updateSelectedResultCount();
    rerenderCurrentExecutionDetail();
  });
}

if (elements.showExecutionSummaryButton) {
  elements.showExecutionSummaryButton.addEventListener("click", () => {
    if (!currentExecutionDetail) {
      showToast("Select an execution first");
      return;
    }

    executionDetailMode = executionDetailMode === "summary" ? "result" : "summary";
    renderExecutionDetail(currentExecutionDetail);
  });
}

if (elements.exportExecutionReportButton) {
  elements.exportExecutionReportButton.addEventListener("click", () => {
    exportExecutionReport(currentExecutionDetail, showToast);
  });
}

if (elements.selectedExecutionItemForm) {
  elements.selectedExecutionItemForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedExecutionItemId) {
      showToast("Select a test result first");
      return;
    }

    await updateExecutionItem(selectedExecutionItemId, {
      status: elements.selectedExecutionItemStatus.value,
      actual_result: elements.selectedExecutionItemActualResult.value,
    });
  });
}

if (elements.refreshButton) {
  elements.refreshButton.addEventListener("click", loadInitialData);
}
if (elements.suiteForm) {
  elements.suiteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveTestSuite(elements, showToast);
      await loadInitialData();
    } catch (error) {
      showToast(error.message);
    }
  });
}
if (elements.cancelSuiteEditButton) {
  elements.cancelSuiteEditButton.addEventListener("click", () => {
    clearSuiteSelection(elements, testCases, showToast);
  });
}
if (elements.deleteSuiteButton) {
  elements.deleteSuiteButton.addEventListener("click", () => {
    deleteSelectedSuite(elements, showToast, testCases)
      .then((deleted) => {
        if (deleted) {
          return loadInitialData();
        }
        return null;
      })
      .catch((error) => showToast(error.message));
  });
}
if (elements.suiteSearch) {
  elements.suiteSearch.addEventListener("input", () => {
    renderTestSuites(elements, showToast, testCases);
  });
}
if (elements.clearSuiteSearchButton) {
  elements.clearSuiteSearchButton.addEventListener("click", () => {
    elements.suiteSearch.value = "";
    renderTestSuites(elements, showToast, testCases);
  });
}
if (elements.suiteCaseSearch) {
  elements.suiteCaseSearch.addEventListener("input", () => {
    renderSuiteCaseChecklist(elements, testCases);
  });
}
if (elements.suiteCaseCategoryFilter) {
  elements.suiteCaseCategoryFilter.addEventListener("change", () => {
    renderSuiteCaseChecklist(elements, testCases);
  });
}
if (elements.caseSearch) {
  elements.caseSearch.addEventListener("input", renderTestCases);
}
if (elements.casePriorityFilter) {
  elements.casePriorityFilter.addEventListener("change", renderTestCases);
}
if (elements.clearCaseFiltersButton) {
  elements.clearCaseFiltersButton.addEventListener("click", () => {
    resetCaseFilters(elements, caseBrowserState);
    renderTestCases();
  });
}
if (elements.previewCsvButton) {
  elements.previewCsvButton.addEventListener("click", () => {
    previewTestCasesFromCsv(elements, testCases, showToast);
  });
}
if (elements.confirmCsvImportButton) {
  elements.confirmCsvImportButton.addEventListener("click", async () => {
    try {
      await confirmCsvImport(elements, showToast, loadInitialData);
    } catch (error) {
      showToast(error.message);
    }
  });
}
if (elements.cancelCsvPreviewButton) {
  elements.cancelCsvPreviewButton.addEventListener("click", () => {
    clearCsvPreview(elements);
  });
}
if (elements.cancelCsvPreviewFooterButton) {
  elements.cancelCsvPreviewFooterButton.addEventListener("click", () => {
    clearCsvPreview(elements);
  });
}
if (elements.csvPreviewModal) {
  elements.csvPreviewModal.addEventListener("click", (event) => {
    if (event.target === elements.csvPreviewModal) {
      clearCsvPreview(elements);
    }
  });
}
if (elements.caseCsvFile) {
  elements.caseCsvFile.addEventListener("change", () => {
    clearCsvPreview(elements);
  });
}
if (elements.downloadCsvTemplateButton) {
  elements.downloadCsvTemplateButton.addEventListener("click", downloadCsvTemplate);
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.csvPreviewModal && !elements.csvPreviewModal.hidden) {
    clearCsvPreview(elements);
  }
});
if (elements.executionCaseSearch) {
  elements.executionCaseSearch.addEventListener("input", renderExecutionCaseChecklist);
}
if (elements.applyExecutionSuiteButton) {
  elements.applyExecutionSuiteButton.addEventListener("click", () => {
    applySuiteToExecutionCreator().catch((error) => showToast(error.message));
  });
}
if (elements.executionCaseCategoryFilter) {
  elements.executionCaseCategoryFilter.addEventListener("change", renderExecutionCaseChecklist);
}
if (elements.addCaseSearch) {
  elements.addCaseSearch.addEventListener("input", renderAddCaseChecklist);
}
if (elements.addCaseCategoryFilter) {
  elements.addCaseCategoryFilter.addEventListener("change", renderAddCaseChecklist);
}
if (elements.executionSearch) {
  elements.executionSearch.addEventListener("input", renderExecutions);
}
if (elements.clearExecutionSearchButton) {
  elements.clearExecutionSearchButton.addEventListener("click", () => {
    resetExecutionSearch();
    renderExecutions();
  });
}

loadInitialData().catch((error) => {
  showToast(error.message);
});

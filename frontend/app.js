import { api } from "./api.js";
import { STATUSES } from "./config.js";
import { elements, hasExecutionPage, hasSuitePage } from "./dom.js";
import {
  escapeCsvValue,
  escapeHtml,
  formatDate,
  getCsvValue,
  normalizeCsvHeader,
  parseCsv,
} from "./utils.js";

let testCases = [];
let executions = [];
let categories = [];
let testSuites = [];
let selectedExecutionId = null;
let selectedExecutionItemId = null;
let selectedExecutionItemIds = new Set();
let selectedExecutionCaseIds = new Set();
let selectedAddCaseIds = new Set();
let selectedSuiteCaseIds = new Set();
let selectedSuiteId = null;
let executionDetailMode = "result";
let selectedCaseId = null;
let selectedCaseGroup = { type: "all", category: "" };
let editingTestCaseId = null;
let currentExecutionDetail = null;
let collapsedCaseCategories = new Set();
let initializedCaseCategories = new Set();
let pendingCsvImportCases = [];

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3000);
}

function renderTestCases() {
  const visibleTestCases = filterTestCases(testCases);
  const selectedCaseStillVisible = visibleTestCases.some(
    (testCase) => testCase.id === selectedCaseId
  );

  if (!selectedCaseStillVisible) {
    selectedCaseId = visibleTestCases[0]?.id || null;
  }

  if (elements.caseCount) {
    elements.caseCount.textContent =
      visibleTestCases.length === testCases.length
        ? `${testCases.length} case(s)`
        : `${visibleTestCases.length} of ${testCases.length} case(s)`;
  }

  renderCategoryTree();
  renderCategoryOptions();
  renderExecutionCaseCategoryFilter();
  renderAddCaseCategoryFilter();
  renderSuiteCaseCategoryFilter();
  renderCaseDetail();

  renderExecutionCaseChecklist();
  renderAddCaseChecklist();
  renderSuiteCaseChecklist();
  renderExecutionSuiteSelect();

}

function renderCategoryTree() {
  if (!elements.categoryTree) {
    return;
  }

  const visibleForTree = filterTestCases(testCases, { ignoreGroup: true });
  const groupedCases = groupTestCasesByCategory(visibleForTree);

  elements.categoryTree.innerHTML = "";
  elements.categoryTree.appendChild(
    createCategoryTreeRow({
      label: "All Test Cases",
      count: testCases.length,
      active: selectedCaseGroup.type === "all",
      onClick: () => {
        selectedCaseGroup = { type: "all", category: "" };
        renderTestCases();
      },
    })
  );

  if (!groupedCases.length) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "muted treeEmptyState";
    emptyMessage.textContent = testCases.length
      ? "No test cases match the current filters."
      : "No test cases yet.";
    elements.categoryTree.appendChild(emptyMessage);
    return;
  }

  for (const group of groupedCases) {
    if (!initializedCaseCategories.has(group.category)) {
      initializedCaseCategories.add(group.category);
      collapsedCaseCategories.add(group.category);
    }
  }

  for (const group of groupedCases) {
    const categoryRecord = categories.find((category) => category.name === group.category);
    elements.categoryTree.appendChild(createCaseCategoryGroup(group, categoryRecord));
  }
}

function createCaseCategoryGroup(group, categoryRecord) {
  const groupElement = document.createElement("section");
  groupElement.className = "caseCategoryGroup";
  const collapsed = collapsedCaseCategories.has(group.category);

  groupElement.appendChild(
    createCategoryTreeRow({
      label: group.label,
      count: group.items.length,
      active:
        selectedCaseGroup.type === "category" &&
        selectedCaseGroup.category === group.category,
      collapsed,
      onToggle: () => {
        if (collapsed) {
          collapsedCaseCategories.delete(group.category);
        } else {
          collapsedCaseCategories.add(group.category);
        }
        renderTestCases();
      },
      onClick: () => {
        selectedCaseGroup = { type: "category", category: group.category };
        renderTestCases();
      },
      onRename: categoryRecord ? () => renameCategory(categoryRecord) : null,
      onDelete: categoryRecord ? () => deleteCategory(categoryRecord) : null,
    })
  );

  const caseList = document.createElement("div");
  caseList.className = "caseTreeItems";
  caseList.hidden = collapsed;
  for (const testCase of group.items) {
    caseList.appendChild(createCaseTreeItem(testCase));
  }
  groupElement.appendChild(caseList);
  return groupElement;
}

function createCaseTreeItem(testCase) {
  const row = document.createElement("button");
  row.className = `caseTreeItem ${selectedCaseId === testCase.id ? "selected" : ""}`;
  row.type = "button";
  row.innerHTML = `
    <span class="caseId">${escapeHtml(testCase.test_id || "No Test ID")}</span>
    <strong>${escapeHtml(testCase.title)}</strong>
    <span class="priority ${escapeHtml(testCase.priority || "Medium")}">
      ${escapeHtml(testCase.priority || "Medium")}
    </span>
  `;
  row.addEventListener("click", () => {
    selectedCaseId = testCase.id;
    hideCaseForm();
    renderTestCases();
  });
  return row;
}

function createCategoryTreeRow({
  label,
  count,
  active,
  collapsed = false,
  onClick,
  onToggle,
  onRename,
  onDelete,
}) {
  const row = document.createElement("div");
  row.className = `categoryRow ${active ? "active" : ""}`;

  const button = document.createElement("button");
  button.className = `treeItem ${onToggle ? "hasToggle" : "noToggle"}`;
  button.type = "button";
  button.innerHTML = `
    ${onToggle ? `<span class="categoryToggle">${collapsed ? "+" : "-"}</span>` : ""}
    <span>${escapeHtml(label)}</span>
    <strong>${count}</strong>
  `;
  button.addEventListener("click", onClick);
  if (onToggle) {
    button.querySelector(".categoryToggle").addEventListener("click", (event) => {
      event.stopPropagation();
      onToggle();
    });
  }
  row.appendChild(button);

  if (onRename && onDelete) {
    const actions = document.createElement("div");
    actions.className = "categoryActions";

    const renameButton = document.createElement("button");
    renameButton.className = "iconButton";
    renameButton.type = "button";
    renameButton.textContent = "Rename";
    renameButton.addEventListener("click", () => {
      onRename().catch((error) => showToast(error.message));
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "iconButton dangerText";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      onDelete().catch((error) => showToast(error.message));
    });

    actions.append(renameButton, deleteButton);
    row.appendChild(actions);
  }

  return row;
}

function renderCategoryOptions() {
  const categorySelect = document.querySelector("#caseCategory");
  if (!categorySelect) {
    return;
  }

  const currentValue = categorySelect.value;
  categorySelect.innerHTML = `
    <option value="">Uncategorized</option>
    ${categories
      .map(
        (category) =>
          `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`
      )
      .join("")}
  `;
  categorySelect.value = categories.some((category) => category.name === currentValue)
    ? currentValue
    : "";
}

function renderExecutionCaseCategoryFilter() {
  renderCaseCategoryFilter(elements.executionCaseCategoryFilter);
}

function renderAddCaseCategoryFilter() {
  renderCaseCategoryFilter(elements.addCaseCategoryFilter);
}

function renderSuiteCaseCategoryFilter() {
  renderCaseCategoryFilter(elements.suiteCaseCategoryFilter);
}

function renderCaseCategoryFilter(selectElement) {
  if (!selectElement) {
    return;
  }

  const currentValue = selectElement.value;
  const hasUncategorized = testCases.some((testCase) => !testCase.category);
  selectElement.innerHTML = `
    <option value="">All categories</option>
    ${hasUncategorized ? '<option value="__uncategorized__">Uncategorized</option>' : ""}
    ${categories
      .map(
        (category) =>
          `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`
      )
      .join("")}
  `;
  const validValues = new Set([
    "",
    ...(hasUncategorized ? ["__uncategorized__"] : []),
    ...categories.map((category) => category.name),
  ]);
  selectElement.value = validValues.has(currentValue)
    ? currentValue
    : "";
}

function renderCaseDetail() {
  if (!elements.caseDetailContent || !elements.caseDetailEmpty) {
    return;
  }

  const selectedCase = getSelectedTestCase();
  if (!selectedCase) {
    elements.caseDetailContent.hidden = true;
    elements.caseDetailEmpty.hidden = false;
    return;
  }

  elements.caseDetailEmpty.hidden = true;
  elements.caseDetailContent.hidden = false;
  elements.selectedCaseTitle.textContent = selectedCase.test_id || "No Test ID";
  elements.selectedCasePriority.innerHTML = `
    <span class="priority ${escapeHtml(selectedCase.priority || "Medium")}">
      ${escapeHtml(selectedCase.priority || "Medium")}
    </span>
  `;
  elements.caseDetailBody.innerHTML = `
    <h3>${escapeHtml(selectedCase.title)}</h3>
    <div class="metaLine">
      <span>${escapeHtml(selectedCase.category || "No category")}</span>
      <span>Created ${formatDate(selectedCase.created_at)}</span>
    </div>
    <div class="detailBlock">
      <strong>Steps</strong>
      ${renderStepsTable(getDisplaySteps(selectedCase))}
    </div>
    <div class="detailBlock">
      <strong>Test Data</strong>
      <p>${escapeHtml(selectedCase.test_data || "N/A")}</p>
    </div>
  `;
}

function getSelectedTestCase() {
  return testCases.find((testCase) => testCase.id === selectedCaseId);
}

function getDisplaySteps(testCase) {
  if (testCase.case_steps?.length) {
    return testCase.case_steps;
  }

  if (testCase.steps || testCase.expected_result) {
    return [
      {
        step_text: testCase.steps || "",
        expected_result: testCase.expected_result || "",
      },
    ];
  }

  return [];
}

function renderStepsTable(caseSteps) {
  if (!caseSteps.length) {
    return "<p>No steps</p>";
  }

  return `
    <div class="stepsTable">
      <div class="stepsTableHeader">
        <span>#</span>
        <span>Step</span>
        <span>Expected Result</span>
      </div>
      ${caseSteps
        .map(
          (step, index) => `
            <div class="stepsTableRow">
              <span>${index + 1}</span>
              <p>${escapeHtml(step.step_text || "No step")}</p>
              <p>${escapeHtml(step.expected_result || "No expected result")}</p>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function filterTestCases(cases, options = {}) {
  const searchText = elements.caseSearch
    ? elements.caseSearch.value.trim().toLowerCase()
    : "";
  const priority = elements.casePriorityFilter ? elements.casePriorityFilter.value : "";
  const ignoreGroup = Boolean(options.ignoreGroup);

  return cases.filter((testCase) => {
    const category = testCase.category || "__uncategorized__";
    const searchableText = [
      testCase.test_id,
      testCase.title,
      testCase.category,
      testCase.test_data,
    ]
      .join(" ")
      .toLowerCase();
    const matchesSearch = !searchText || searchableText.includes(searchText);
    const matchesPriority = !priority || testCase.priority === priority;
    const matchesGroup =
      ignoreGroup ||
      selectedCaseGroup.type === "all" ||
      (selectedCaseGroup.type === "category" && category === selectedCaseGroup.category);

    return matchesSearch && matchesPriority && matchesGroup;
  });
}

function resetCaseFilters() {
  if (elements.caseSearch) {
    elements.caseSearch.value = "";
  }
  if (elements.casePriorityFilter) {
    elements.casePriorityFilter.value = "";
  }
  selectedCaseGroup = { type: "all", category: "" };
}

function buildCsvImportPreview(rows) {
  const preview = {
    testCases: [],
    errors: [],
    warnings: [],
  };
  if (rows.length < 2) {
    preview.errors.push("CSV must include a header row and at least one data row.");
    return preview;
  }

  const headers = rows[0].map(normalizeCsvHeader);
  const seenTestIds = new Set();
  const existingTestIds = new Set(
    testCases
      .map((testCase) => testCase.test_id)
      .filter(Boolean)
      .map((testId) => testId.toLowerCase())
  );

  rows.slice(1).forEach((row, rowIndex) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] || "";
    });

    const rowNumber = rowIndex + 2;
    const steps = getCsvValue(record, ["steps"]);
    const expectedResult = getCsvValue(record, ["expected_result", "expected result"]);
    const testId = getCsvValue(record, ["test_id", "test id"]);
    const title = getCsvValue(record, ["title"]);
    const priority = getCsvValue(record, ["priority"], "Medium");
    const normalizedPriority = ["Critical", "High", "Medium", "Low"].includes(priority)
      ? priority
      : "Medium";

    if (!title) {
      preview.errors.push(`Row ${rowNumber}: title is required.`);
      return;
    }

    if (!["Critical", "High", "Medium", "Low"].includes(priority)) {
      preview.warnings.push(`Row ${rowNumber}: unknown priority "${priority}", using Medium.`);
    }

    if (testId) {
      const testIdKey = testId.toLowerCase();
      if (seenTestIds.has(testIdKey)) {
        preview.warnings.push(`Row ${rowNumber}: duplicate Test ID "${testId}" in this CSV.`);
      }
      if (existingTestIds.has(testIdKey)) {
        preview.warnings.push(`Row ${rowNumber}: Test ID "${testId}" already exists.`);
      }
      seenTestIds.add(testIdKey);
    }

    preview.testCases.push({
      test_id: testId,
      category: getCsvValue(record, ["category"]),
      title,
      priority: normalizedPriority,
      steps,
      expected_result: expectedResult,
      case_steps:
        steps || expectedResult
          ? [{ step_text: steps, expected_result: expectedResult }]
          : [],
      test_data: getCsvValue(record, ["test_data", "test data"]),
    });
  });

  if (!preview.testCases.length && !preview.errors.length) {
    preview.errors.push("No valid test cases found in CSV.");
  }

  return preview;
}

async function previewTestCasesFromCsv() {
  const file = elements.caseCsvFile.files[0];
  if (!file) {
    showToast("Choose a CSV file first");
    return;
  }

  try {
    const text = await file.text();
    const preview = buildCsvImportPreview(parseCsv(text));
    pendingCsvImportCases = preview.errors.length ? [] : preview.testCases;
    renderCsvImportPreview(preview);
  } catch (error) {
    showToast(error.message);
  }
}

function renderCsvImportPreview(preview) {
  if (!elements.csvPreviewModal || !elements.csvPreviewPanel || !elements.csvImportActions) {
    return;
  }

  elements.csvPreviewModal.hidden = false;
  elements.csvImportActions.hidden = Boolean(preview.errors.length);
  const sampleRows = preview.testCases.slice(0, 20);
  elements.csvPreviewPanel.innerHTML = `
    <div class="previewSummary">
      <strong>${preview.testCases.length} valid case(s)</strong>
      <span>${preview.errors.length} error(s)</span>
      <span>${preview.warnings.length} warning(s)</span>
    </div>
    ${preview.errors.length ? renderPreviewMessages("Errors", preview.errors, "error") : ""}
    ${preview.warnings.length ? renderPreviewMessages("Warnings", preview.warnings, "warning") : ""}
    ${
      sampleRows.length
        ? `
          <div class="previewTable">
            <div class="previewTableHeader">
              <span>Test ID</span>
              <span>Title</span>
              <span>Category</span>
              <span>Priority</span>
            </div>
            ${sampleRows
              .map(
                (testCase) => `
                  <div class="previewTableRow">
                    <span>${escapeHtml(testCase.test_id || "No Test ID")}</span>
                    <span>${escapeHtml(testCase.title)}</span>
                    <span>${escapeHtml(testCase.category || "Uncategorized")}</span>
                    <span>${escapeHtml(testCase.priority)}</span>
                  </div>
                `
              )
              .join("")}
          </div>
        `
        : ""
    }
  `;
}

function renderPreviewMessages(title, messages, type) {
  return `
    <div class="previewMessages ${type}">
      <strong>${title}</strong>
      <ul>
        ${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}
      </ul>
    </div>
  `;
}

async function confirmCsvImport() {
  if (!pendingCsvImportCases.length) {
    showToast("Preview a valid CSV first");
    return;
  }

  const result = await api("/test-cases/bulk", {
    method: "POST",
    body: JSON.stringify({ test_cases: pendingCsvImportCases }),
  });
  clearCsvPreview();
  elements.caseCsvFile.value = "";
  showToast(`Imported ${result.created_count} test case(s)`);
  await loadInitialData();
}

function clearCsvPreview() {
  pendingCsvImportCases = [];
  if (elements.csvPreviewModal) {
    elements.csvPreviewModal.hidden = true;
  }
  if (elements.csvPreviewPanel) {
    elements.csvPreviewPanel.innerHTML = "";
  }
  if (elements.csvImportActions) {
    elements.csvImportActions.hidden = true;
  }
}

function downloadCsvTemplate() {
  const rows = [
    ["test_id", "category", "title", "priority", "steps", "expected_result", "test_data"],
    [
      "TC-PWR-001",
      "Hardware",
      "Verify Power On/Off Function",
      "Critical",
      "Press the power button",
      "Device powers on/off successfully",
      "N/A",
    ],
  ];
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mini-testrail-test-cases-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function createCategory(name) {
  const result = await api("/categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  selectedCaseGroup = { type: "category", category: result.name };
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
  if (selectedCaseGroup.type === "category" && selectedCaseGroup.category === category.name) {
    selectedCaseGroup = { type: "category", category: updated.name };
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
  if (selectedCaseGroup.type === "category" && selectedCaseGroup.category === category.name) {
    selectedCaseGroup = { type: "all", category: "" };
  }
  showToast("Category deleted");
  await loadInitialData();
}

function renderExecutionCaseChecklist() {
  renderCaseChecklist({
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
  renderCaseChecklist({
    searchElement: elements.addCaseSearch,
    categoryElement: elements.addCaseCategoryFilter,
    checklistElement: elements.addCaseChecklist,
    selectedIds: selectedAddCaseIds,
    countElement: elements.selectedAddCaseCount,
    excludeIds: existingCaseIds,
  });
}

function renderSuiteCaseChecklist() {
  renderCaseChecklist({
    searchElement: elements.suiteCaseSearch,
    categoryElement: elements.suiteCaseCategoryFilter,
    checklistElement: elements.suiteCaseChecklist,
    selectedIds: selectedSuiteCaseIds,
    countElement: elements.selectedSuiteCaseCount,
  });
}

function renderCaseChecklist({
  searchElement,
  categoryElement,
  checklistElement,
  selectedIds,
  countElement,
  excludeIds = new Set(),
}) {
  if (!searchElement || !checklistElement) {
    return;
  }

  const searchText = searchElement.value.trim().toLowerCase();
  const selectedCategory = categoryElement ? categoryElement.value : "";
  const filteredCases = testCases.filter((testCase) => {
    if (excludeIds.has(testCase.id)) {
      return false;
    }

    const searchableText = [
      testCase.test_id,
      testCase.title,
      testCase.category,
      testCase.priority,
    ]
      .join(" ")
      .toLowerCase();
    const categoryValue = testCase.category || "__uncategorized__";
    const matchesSearch = !searchText || searchableText.includes(searchText);
    const matchesCategory = !selectedCategory || categoryValue === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  checklistElement.innerHTML = filteredCases.length
    ? ""
    : "<p class='muted'>No matching test cases.</p>";

  for (const group of groupTestCasesByCategory(filteredCases)) {
    const groupElement = document.createElement("section");
    groupElement.className = "checklistCategoryGroup";
    groupElement.innerHTML = `
      <div class="checklistCategoryHeader">
        <strong>${escapeHtml(group.label)}</strong>
        <span>${group.items.length} case(s)</span>
        <div class="checklistCategoryActions">
          <button class="iconButton" type="button" data-action="select">Select group</button>
          <button class="iconButton dangerText" type="button" data-action="clear">Clear group</button>
        </div>
      </div>
      <div class="checklistCategoryItems"></div>
    `;

    groupElement.querySelector("[data-action='select']").addEventListener("click", () => {
      for (const testCase of group.items) {
        selectedIds.add(testCase.id);
      }
      renderCaseChecklist({
        searchElement,
        categoryElement,
        checklistElement,
        selectedIds,
        countElement,
        excludeIds,
      });
    });
    groupElement.querySelector("[data-action='clear']").addEventListener("click", () => {
      for (const testCase of group.items) {
        selectedIds.delete(testCase.id);
      }
      renderCaseChecklist({
        searchElement,
        categoryElement,
        checklistElement,
        selectedIds,
        countElement,
        excludeIds,
      });
    });

    const groupItems = groupElement.querySelector(".checklistCategoryItems");
    for (const testCase of group.items) {
      groupItems.appendChild(
        createExecutionCaseCheckbox(testCase, selectedIds, countElement)
      );
    }

    checklistElement.appendChild(groupElement);
  }

  updateSelectedCaseCount(selectedIds, countElement);
}

function groupTestCasesByCategory(cases) {
  const groups = new Map();
  for (const testCase of cases) {
    const category = testCase.category || "__uncategorized__";
    const label = testCase.category || "Uncategorized";
    if (!groups.has(category)) {
      groups.set(category, { category, label, items: [] });
    }
    groups.get(category).items.push(testCase);
  }
  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function createExecutionCaseCheckbox(testCase, selectedIds, countElement) {
  const label = document.createElement("label");
  label.className = "checkboxRow";
  label.innerHTML = `
    <input
      type="checkbox"
      name="executionCase"
      value="${testCase.id}"
      ${selectedIds.has(testCase.id) ? "checked" : ""}
    />
    <span>
      <strong>${formatTestCaseLabel(testCase)}</strong>
      <small>
        ${escapeHtml(testCase.category || "No category")} /
        ${escapeHtml(testCase.priority || "Medium")}
      </small>
    </span>
  `;
  label.querySelector("input").addEventListener("change", (event) => {
    const testCaseId = Number(event.currentTarget.value);
    if (event.currentTarget.checked) {
      selectedIds.add(testCaseId);
    } else {
      selectedIds.delete(testCaseId);
    }
    updateSelectedCaseCount(selectedIds, countElement);
  });
  return label;
}

function getSelectedExecutionCaseIds() {
  return Array.from(selectedExecutionCaseIds);
}

function updateSelectedCaseCount(selectedIds = selectedExecutionCaseIds, countElement = elements.selectedCaseCount) {
  if (countElement) {
    countElement.textContent = `${selectedIds.size} selected`;
  }
}

function formatTestCaseLabel(testCase) {
  const visibleId = testCase.test_id || "No Test ID";
  return `${escapeHtml(visibleId)} - ${escapeHtml(testCase.title)}`;
}

function renderTestSuites() {
  if (!elements.suiteList) {
    return;
  }

  const visibleSuites = filterTestSuites(testSuites);
  if (elements.suiteCount) {
    elements.suiteCount.textContent =
      visibleSuites.length === testSuites.length
        ? `${testSuites.length} suite(s)`
        : `${visibleSuites.length} of ${testSuites.length} suite(s)`;
  }

  elements.suiteList.innerHTML = visibleSuites.length
    ? ""
    : testSuites.length
      ? "<p class='muted treeEmptyState'>No test suites match the current search.</p>"
      : "<p class='muted treeEmptyState'>No test suites yet.</p>";

  for (const suite of visibleSuites) {
    const button = document.createElement("button");
    button.className = `suiteNavItem ${selectedSuiteId === suite.id ? "selected" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="navTypeLabel suite">Test Suite</span>
      <strong>${escapeHtml(suite.name)}</strong>
      <small>${suite.total_cases || 0} case(s)</small>
    `;
    button.addEventListener("click", () => {
      selectTestSuite(suite.id).catch((error) => showToast(error.message));
    });
    elements.suiteList.appendChild(button);
  }
}

function renderExecutionSuiteSelect() {
  if (!elements.executionSuiteSelect) {
    return;
  }

  const currentValue = elements.executionSuiteSelect.value;
  elements.executionSuiteSelect.innerHTML = `
    <option value="">Select a suite</option>
    ${testSuites
      .map(
        (suite) => `
          <option value="${suite.id}">
            ${escapeHtml(suite.name)} (${suite.total_cases || 0} case(s))
          </option>
        `
      )
      .join("")}
  `;

  const validValues = new Set(["", ...testSuites.map((suite) => String(suite.id))]);
  elements.executionSuiteSelect.value = validValues.has(currentValue) ? currentValue : "";
}

function filterTestSuites(suites) {
  const searchText = elements.suiteSearch?.value.trim().toLowerCase() || "";
  if (!searchText) {
    return suites;
  }

  return suites.filter((suite) =>
    [suite.name, suite.description].join(" ").toLowerCase().includes(searchText)
  );
}

function renderSuiteDetail(detail = null) {
  if (!elements.suiteDetailEmpty || !elements.suiteDetailContent) {
    return;
  }

  if (!detail) {
    elements.suiteDetailEmpty.hidden = false;
    elements.suiteDetailContent.hidden = true;
    elements.deleteSuiteButton.hidden = true;
    elements.suiteFormTitle.textContent = "Create Test Suite";
    elements.suiteSubmitButton.textContent = "Create Suite";
    selectedSuiteCaseIds = new Set();
    renderSuiteCaseChecklist();
    return;
  }

  const { suite, test_cases: suiteCases } = detail;
  elements.suiteDetailEmpty.hidden = true;
  elements.suiteDetailContent.hidden = false;
  elements.deleteSuiteButton.hidden = false;
  elements.selectedSuiteTitle.textContent = suite.name;
  elements.selectedSuiteMeta.textContent = `${suiteCases.length} case(s)`;
  elements.suiteFormTitle.textContent = "Edit Test Suite";
  elements.suiteSubmitButton.textContent = "Save Suite";
  elements.suiteName.value = suite.name;
  elements.suiteDescription.value = suite.description || "";
  selectedSuiteCaseIds = new Set(suiteCases.map((testCase) => testCase.id));
  renderSuiteCaseChecklist();
  renderSuiteCaseList(suiteCases);
}

function renderSuiteCaseList(suiteCases) {
  if (!elements.suiteCaseList) {
    return;
  }

  elements.suiteCaseList.innerHTML = suiteCases.length
    ? ""
    : "<p class='muted'>No test cases in this suite yet.</p>";

  for (const group of groupTestCasesByCategory(suiteCases)) {
    const groupElement = document.createElement("section");
    groupElement.className = "suiteCaseGroup";
    groupElement.innerHTML = `
      <div class="executionNavGroupHeader">
        <strong>${escapeHtml(group.label)}</strong>
        <span>${group.items.length}</span>
      </div>
      <div class="suiteCaseItems"></div>
    `;

    const caseItems = groupElement.querySelector(".suiteCaseItems");
    for (const testCase of group.items) {
      const row = document.createElement("article");
      row.className = "suiteCaseRow";
      row.innerHTML = `
        <span class="caseId">${escapeHtml(testCase.test_id || "No Test ID")}</span>
        <strong>${escapeHtml(testCase.title)}</strong>
        <span class="priority ${escapeHtml(testCase.priority || "Medium")}">
          ${escapeHtml(testCase.priority || "Medium")}
        </span>
      `;
      caseItems.appendChild(row);
    }

    elements.suiteCaseList.appendChild(groupElement);
  }
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
  renderSelectedExecutionItemDetail(null);
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
    renderExecutionSummaryDetail(detail, statusCounts);
  } else {
    renderSelectedExecutionItemDetail(
      items.find((item) => item.id === selectedExecutionItemId) || null
    );
  }
}

function renderExecutionSummaryDashboard(summary, statusCounts) {
  return `
    <div class="summaryStats">
      <div class="summaryBox">Total<strong>${summary.total_cases}</strong></div>
      <div class="summaryBox">Passed<strong>${summary.passed_cases}</strong></div>
      <div class="summaryBox">Failed<strong>${statusCounts.FAIL}</strong></div>
      <div class="summaryBox">Not Run<strong>${statusCounts.NOT_RUN}</strong></div>
    </div>
    <div class="summaryDashboard">
      <div class="passRatePanel">
        <div
          class="passRateDonut"
          style="--pass-rate: ${summary.pass_rate}%;"
          aria-label="Pass rate ${summary.pass_rate}%"
        >
          <span>${summary.pass_rate}%</span>
        </div>
        <div>
          <strong>Pass Rate</strong>
          <p>${summary.passed_cases} of ${summary.total_cases} test case(s) passed</p>
        </div>
      </div>
      <div class="statusChart">
        <strong>Status Breakdown</strong>
        ${STATUSES.map((status) => renderStatusBar(status, statusCounts, summary.total_cases)).join("")}
      </div>
    </div>
  `;
}

function renderExecutionSummaryDetail(detail, statusCounts) {
  const { execution, summary } = detail;
  elements.selectedExecutionItemTitle.textContent = "Run Summary";
  if (elements.selectedExecutionItemMeta) {
    elements.selectedExecutionItemMeta.innerHTML = `
      <span>${escapeHtml(execution.name)}</span>
      <span>${summary.pass_rate}% pass rate</span>
      <span>${summary.total_cases} case(s)</span>
    `;
  }
  elements.selectedExecutionItemBody.innerHTML = renderExecutionSummaryDashboard(
    summary,
    statusCounts
  );
  elements.selectedExecutionItemForm.hidden = true;
}

function groupExecutionItemsByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    const category = item.category || "";
    const label = item.category || "Uncategorized";
    if (!groups.has(category)) {
      groups.set(category, { category, label, items: [] });
    }
    groups.get(category).items.push(item);
  }

  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function updateSelectedResultCount() {
  if (elements.selectedResultCount) {
    elements.selectedResultCount.textContent = `${selectedExecutionItemIds.size} selected`;
  }
}

function renderSelectedExecutionItemDetail(item) {
  if (!elements.selectedExecutionItemBody || !elements.selectedExecutionItemForm) {
    return;
  }

  if (!item) {
    elements.selectedExecutionItemTitle.textContent = "No Test Result Selected";
    if (elements.selectedExecutionItemMeta) {
      elements.selectedExecutionItemMeta.innerHTML = "";
    }
    elements.selectedExecutionItemBody.innerHTML =
      "<p class='muted'>Select a test result to view details and update status.</p>";
    elements.selectedExecutionItemForm.hidden = true;
    return;
  }

  elements.selectedExecutionItemTitle.textContent = item.title;
  if (elements.selectedExecutionItemMeta) {
    elements.selectedExecutionItemMeta.innerHTML = `
      <span class="caseId">${escapeHtml(item.test_id || "No Test ID")}</span>
      <span>${escapeHtml(item.category || "No category")}</span>
      <span class="priority ${escapeHtml(item.priority || "Medium")}">
        ${escapeHtml(item.priority || "Medium")}
      </span>
      <span class="status ${item.status}">${item.status}</span>
    `;
  }
  elements.selectedExecutionItemBody.innerHTML = `
    <div class="detailBlock">
      <strong>Steps</strong>
      ${renderStepsTable(getDisplaySteps(item))}
    </div>
    <div class="detailBlock">
      <strong>Test Data</strong>
      <p>${escapeHtml(item.test_data || "N/A")}</p>
    </div>
  `;
  elements.selectedExecutionItemStatus.value = item.status;
  elements.selectedExecutionItemActualResult.value = item.actual_result || "";
  elements.selectedExecutionItemForm.hidden = false;
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

function getStatusCounts(items) {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));

  for (const item of items) {
    if (counts[item.status] !== undefined) {
      counts[item.status] += 1;
    }
  }

  return counts;
}

function renderStatusBar(status, counts, total) {
  const count = counts[status];
  const percentage = total ? Math.round((count / total) * 100) : 0;

  return `
    <div class="statusBarRow">
      <div class="statusBarMeta">
        <span class="status ${status}">${status}</span>
        <span>${count} / ${percentage}%</span>
      </div>
      <div class="statusBarTrack" aria-label="${status} ${percentage}%">
        <div class="statusBarFill ${status}" style="width: ${percentage}%;"></div>
      </div>
    </div>
  `;
}

function exportExecutionReport() {
  if (!currentExecutionDetail) {
    showToast("Select an execution first");
    return;
  }

  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    showToast("Allow pop-ups to export the report");
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(buildExecutionReportHtml(currentExecutionDetail));
  reportWindow.document.close();
}

function buildExecutionReportHtml(detail) {
  const { execution, items, summary } = detail;
  const statusCounts = getStatusCounts(items);
  const generatedAt = new Date().toLocaleString();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(execution.name)} - Test Report</title>
    <style>${getReportStyles()}</style>
  </head>
  <body>
    <main class="reportPage">
      <header class="reportHero">
        <div>
          <span class="eyebrow">Mini TestRail Report</span>
          <h1>${escapeHtml(execution.name)}</h1>
          <p>${escapeHtml(execution.description || "No description")}</p>
        </div>
        <button class="printButton" type="button" onclick="window.print()">Print / Save PDF</button>
      </header>

      <section class="reportMeta">
        <div><span>Generated</span><strong>${escapeHtml(generatedAt)}</strong></div>
        <div><span>Total Cases</span><strong>${summary.total_cases}</strong></div>
        <div><span>Passed</span><strong>${summary.passed_cases}</strong></div>
        <div><span>Pass Rate</span><strong>${summary.pass_rate}%</strong></div>
      </section>

      <section class="reportSummary">
        <div class="passRateCard">
          ${renderReportDonut(summary.pass_rate)}
          <strong>Overall Pass Rate</strong>
          <p>${summary.passed_cases} of ${summary.total_cases} test case(s) passed.</p>
        </div>
        <div class="statusCards">
          ${STATUSES.map((status) => renderReportStatusCard(status, statusCounts, summary.total_cases)).join("")}
        </div>
      </section>

      ${groupExecutionItemsByCategory(items).map((group) => renderReportCategory(group)).join("")}
    </main>
  </body>
</html>`;
}

function renderReportStatusCard(status, counts, total) {
  const count = counts[status] || 0;
  const percentage = total ? Math.round((count / total) * 100) : 0;
  const color = getReportStatusColor(status);

  return `
    <article class="statusCard">
      <div>
        <span class="status ${status}">${status}</span>
        <strong>${count}</strong>
      </div>
      ${renderReportBar(percentage, color)}
      <small>${percentage}% of run</small>
    </article>
  `;
}

function renderReportDonut(passRate) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const filledLength = (Math.max(0, Math.min(passRate, 100)) / 100) * circumference;
  const emptyLength = circumference - filledLength;

  return `
    <svg class="passRateSvg" viewBox="0 0 120 120" role="img" aria-label="Pass rate ${passRate}%">
      <circle class="donutTrack" cx="60" cy="60" r="${radius}"></circle>
      <circle
        class="donutFill"
        cx="60"
        cy="60"
        r="${radius}"
        stroke-dasharray="${filledLength} ${emptyLength}"
      ></circle>
      <text x="60" y="64" text-anchor="middle">${passRate}%</text>
    </svg>
  `;
}

function renderReportBar(percentage, color) {
  return `
    <svg class="reportBarSvg" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="${percentage}% of run">
      <rect x="0" y="0" width="100" height="10" rx="5" fill="#dce8ec"></rect>
      <rect x="0" y="0" width="${percentage}" height="10" rx="5" fill="${color}"></rect>
    </svg>
  `;
}

function getReportStatusColor(status) {
  const colors = {
    NOT_RUN: "#94a3b8",
    PASS: "#22a447",
    FAIL: "#e21b2d",
    BLOCKED: "#f2a100",
    SKIPPED: "#68717c",
  };

  return colors[status] || "#94a3b8";
}

function renderReportCategory(group) {
  return `
    <section class="reportCategory">
      <div class="categoryHeader">
        <h2>${escapeHtml(group.label)}</h2>
        <span>${group.items.length} case(s)</span>
      </div>
      <div class="resultTable">
        <div class="resultTableHeader">
          <span>Test ID</span>
          <span>Title</span>
          <span>Priority</span>
          <span>Status</span>
          <span>Actual Notes</span>
          <span>Test Data</span>
        </div>
        ${group.items.map(renderReportResult).join("")}
      </div>
    </section>
  `;
}

function renderReportResult(item) {
  return `
    <article class="resultRow">
      <div class="resultMain">
        <span class="caseId">${escapeHtml(item.test_id || "No Test ID")}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <span class="priority">${escapeHtml(item.priority || "Medium")}</span>
        <span class="status ${item.status}">${item.status}</span>
        <p>${escapeHtml(item.actual_result || "No notes")}</p>
        <p>${escapeHtml(item.test_data || "N/A")}</p>
      </div>
    </article>
  `;
}

function getReportStyles() {
  return `
    :root {
      color: #111318;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #edf8fb;
    }

    * {
      box-sizing: border-box;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    body {
      margin: 0;
      background: linear-gradient(180deg, #d6f2f7 0%, #f8fbfc 240px);
    }

    .reportPage {
      width: min(1120px, calc(100% - 40px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }

    .reportHero,
    .reportMeta,
    .reportSummary,
    .reportCategory {
      border: 1px solid #d4e1e7;
      border-radius: 12px;
      background: #ffffff;
      box-shadow: 0 18px 42px rgb(17 19 24 / 8%);
    }

    .reportHero {
      display: flex;
      gap: 24px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 28px;
    }

    .eyebrow,
    .reportMeta span,
    .statusCard small {
      color: #5b6670;
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
    }

    h1, h2, h3, p { margin: 0; }

    h1 {
      margin-top: 8px;
      font-size: 42px;
      line-height: 1.05;
    }

    .reportHero p,
    .passRateCard p {
      color: #5b6670;
      line-height: 1.45;
    }

    .reportHero p { margin-top: 12px; font-size: 16px; }

    .printButton {
      border: 0;
      border-radius: 8px;
      padding: 14px 18px;
      background: #ff8755;
      color: #111318;
      font-size: 15px;
      font-weight: 900;
      cursor: pointer;
    }

    .reportMeta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 18px;
      padding: 18px;
    }

    .reportMeta div,
    .passRateCard,
    .statusCard {
      border-radius: 10px;
      padding: 14px;
      background: #f8fbfc;
    }

    .reportMeta div { background: #eef7fa; }

    .reportMeta strong {
      display: block;
      margin-top: 6px;
      font-size: 22px;
    }

    .reportSummary {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      gap: 18px;
      margin-top: 18px;
      padding: 18px;
    }

    .passRateCard {
      display: grid;
      justify-items: center;
      gap: 12px;
      text-align: center;
    }

    .passRateSvg {
      width: 154px;
      height: 154px;
    }

    .donutTrack,
    .donutFill {
      fill: none;
      stroke-width: 14;
    }

    .donutTrack {
      stroke: #dce8ec;
    }

    .donutFill {
      stroke: #22a447;
      stroke-linecap: round;
      transform: rotate(-90deg);
      transform-origin: 60px 60px;
    }

    .passRateSvg text {
      fill: #111318;
      font-size: 28px;
      font-weight: 900;
    }

    .statusCards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .statusCard {
      border: 1px solid #d4e1e7;
    }

    .statusCard div:first-child {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .statusCard strong { font-size: 24px; }

    .reportBarSvg {
      display: block;
      width: 100%;
      height: 10px;
      margin: 12px 0 8px;
    }

    .reportCategory {
      margin-top: 18px;
      overflow: hidden;
    }

    .categoryHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px;
      background: #eef7fa;
    }

    .categoryHeader h2 { font-size: 22px; }

    .categoryHeader span {
      border-radius: 999px;
      padding: 4px 10px;
      background: #ffffff;
      color: #5b6670;
      font-weight: 900;
    }

    .resultTableHeader,
    .resultMain {
      display: grid;
      grid-template-columns: 130px minmax(0, 1.15fr) 100px 110px minmax(0, 0.9fr) minmax(0, 0.7fr);
      gap: 12px;
      align-items: center;
    }

    .resultTableHeader {
      padding: 12px 18px;
      color: #5b6670;
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
    }

    .resultRow {
      border-top: 1px solid #d4e1e7;
      padding: 16px 18px;
      break-inside: avoid;
    }

    .resultMain strong,
    .caseId,
    .resultMain p {
      overflow-wrap: anywhere;
    }

    .resultMain p {
      color: #5b6670;
      font-size: 13px;
      line-height: 1.35;
      white-space: pre-wrap;
    }

    .caseId {
      color: #5b6670;
      font-weight: 900;
    }

    .priority,
    .status {
      width: fit-content;
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }

    .priority { background: #fed7aa; }
    .status { color: #ffffff; }
    .NOT_RUN { background: #94a3b8; }
    .PASS { background: #22a447; }
    .FAIL { background: #e21b2d; }
    .BLOCKED { background: #f2a100; }
    .SKIPPED { background: #68717c; }

    @media (max-width: 780px) {
      .reportHero,
      .reportSummary {
        display: grid;
        grid-template-columns: 1fr;
      }

      .reportMeta,
      .statusCards,
      .resultTableHeader,
      .resultMain {
        grid-template-columns: 1fr;
      }
    }

    @media print {
      @page {
        size: A4;
        margin: 10mm;
      }

      :root,
      body {
        background: #ffffff;
        font-size: 11px;
      }

      .reportPage {
        width: 100%;
        padding: 0;
      }

      .reportHero,
      .reportMeta,
      .reportSummary,
      .reportCategory {
        border-radius: 7px;
        box-shadow: none;
      }

      .reportHero {
        gap: 12px;
        padding: 12px 14px;
      }

      .eyebrow,
      .reportMeta span,
      .statusCard small {
        font-size: 9px;
      }

      h1 {
        margin-top: 4px;
        font-size: 24px;
        line-height: 1.1;
      }

      .reportHero p {
        margin-top: 4px;
        font-size: 10px;
        line-height: 1.3;
      }

      .printButton {
        display: none;
      }

      .reportMeta {
        gap: 6px;
        margin-top: 7px;
        padding: 7px;
      }

      .reportMeta div,
      .passRateCard,
      .statusCard {
        border-radius: 6px;
        padding: 7px;
      }

      .reportMeta strong {
        margin-top: 2px;
        font-size: 15px;
      }

      .reportSummary {
        grid-template-columns: 150px minmax(0, 1fr);
        gap: 7px;
        margin-top: 7px;
        padding: 7px;
      }

      .passRateCard {
        gap: 5px;
      }

      .passRateSvg {
        width: 82px;
        height: 82px;
      }

      .donutTrack,
      .donutFill {
        stroke-width: 10;
      }

      .passRateSvg text {
        font-size: 22px;
      }

      .passRateCard h2 {
        font-size: 13px;
      }

      .passRateCard p {
        font-size: 10px;
        line-height: 1.25;
      }

      .statusCards {
        gap: 6px;
      }

      .statusCard strong {
        font-size: 14px;
      }

      .reportBarSvg {
        height: 6px;
        margin: 5px 0 3px;
      }

      .reportCategory {
        margin-top: 8px;
      }

      .categoryHeader {
        gap: 8px;
        padding: 8px 10px;
      }

      .categoryHeader h2 {
        font-size: 14px;
      }

      .categoryHeader span {
        padding: 2px 7px;
        font-size: 10px;
      }

      .resultTableHeader,
      .resultMain {
        grid-template-columns: 66px minmax(0, 1fr) 48px 56px minmax(0, 0.7fr) minmax(0, 0.45fr);
        gap: 5px;
      }

      .resultTableHeader {
        padding: 4px 8px;
        font-size: 7px;
      }

      .resultRow {
        padding: 4px 8px;
      }

      .resultMain strong {
        font-size: 9px;
        line-height: 1.15;
      }

      .caseId {
        font-size: 8px;
      }

      .priority,
      .status {
        padding: 2px 5px;
        font-size: 7px;
      }

      .resultMain p {
        font-size: 8px;
        line-height: 1.18;
      }
    }
  `;
}

function renderHistory(history) {
  elements.historyList.innerHTML = history.length
    ? ""
    : "<p class='muted'>No result updates yet.</p>";

  for (const entry of history) {
    const row = document.createElement("article");
    row.className = "historyRow";
    row.innerHTML = `
      <div class="listRowHeader">
        <strong>${escapeHtml(entry.title)}</strong>
        <span class="status ${entry.status}">${entry.status}</span>
      </div>
      <p>${escapeHtml(entry.actual_result || "No notes")}</p>
      <span class="muted">${formatDate(entry.changed_at)}</span>
    `;
    elements.historyList.appendChild(row);
  }
}

async function loadInitialData() {
  categories = await api("/categories");
  testCases = await api("/test-cases");
  renderTestCases();

  if (hasSuitePage) {
    testSuites = await api("/test-suites");
    renderTestSuites();
    if (selectedSuiteId) {
      const selectedStillExists = testSuites.some((suite) => suite.id === selectedSuiteId);
      if (selectedStillExists) {
        await selectTestSuite(selectedSuiteId);
      } else {
        clearSuiteSelection();
      }
    } else {
      renderSuiteDetail(null);
    }
  }

  if (!hasExecutionPage) {
    return;
  }

  testSuites = await api("/test-suites");
  renderExecutionSuiteSelect();

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

async function selectTestSuite(suiteId) {
  selectedSuiteId = suiteId;
  const detail = await api(`/test-suites/${suiteId}`);
  renderTestSuites();
  renderSuiteDetail(detail);
}

function clearSuiteSelection() {
  selectedSuiteId = null;
  selectedSuiteCaseIds = new Set();
  if (elements.suiteForm) {
    elements.suiteForm.reset();
  }
  renderTestSuites();
  renderSuiteDetail(null);
}

async function saveTestSuite() {
  const selectedIds = Array.from(selectedSuiteCaseIds);
  const wasEditing = Boolean(selectedSuiteId);
  const payload = {
    name: elements.suiteName.value.trim(),
    description: elements.suiteDescription.value.trim(),
    test_case_ids: selectedIds,
  };

  const path = selectedSuiteId ? `/test-suites/${selectedSuiteId}` : "/test-suites";
  const method = selectedSuiteId ? "PUT" : "POST";
  const saved = await api(path, {
    method,
    body: JSON.stringify(payload),
  });

  selectedSuiteId = saved.suite.id;
  showToast(wasEditing ? "Test suite saved" : "Test suite created");
  await loadInitialData();
}

async function applySuiteToExecutionCreator() {
  const suiteId = Number(elements.executionSuiteSelect.value);
  if (!suiteId) {
    showToast("Select a test suite first");
    return;
  }

  const detail = await api(`/test-suites/${suiteId}`);
  const suiteCaseIds = detail.test_cases.map((testCase) => testCase.id);
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

async function deleteSelectedSuite() {
  if (!selectedSuiteId) {
    showToast("Select a test suite first");
    return;
  }

  const suiteName = elements.selectedSuiteTitle.textContent;
  const confirmed = window.confirm(`Delete test suite "${suiteName}"?`);
  if (!confirmed) {
    return;
  }

  await api(`/test-suites/${selectedSuiteId}`, { method: "DELETE" });
  showToast("Test suite deleted");
  clearSuiteSelection();
  await loadInitialData();
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
  renderHistory(history);
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

function addStepRow(step = {}) {
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
      addStepRow();
    }
  });
  elements.caseStepRows.appendChild(row);
}

function renderStepEditor(caseSteps = []) {
  if (!elements.caseStepRows) {
    return;
  }

  elements.caseStepRows.innerHTML = "";
  const rows = caseSteps.length ? caseSteps : [{}];
  for (const step of rows) {
    addStepRow(step);
  }
}

function getStepRowsFromForm() {
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

function getTestCaseFormPayload() {
  const caseSteps = getStepRowsFromForm();
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

function fillTestCaseForm(testCase) {
  document.querySelector("#caseTestId").value = testCase.test_id || "";
  document.querySelector("#caseCategory").value = testCase.category || "";
  document.querySelector("#caseTitle").value = testCase.title || "";
  document.querySelector("#casePriority").value = testCase.priority || "Medium";
  renderStepEditor(getDisplaySteps(testCase));
  document.querySelector("#caseTestData").value = testCase.test_data || "";
}

function showCaseForm() {
  if (elements.caseFormPanel) {
    elements.caseFormPanel.hidden = false;
    elements.caseFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function hideCaseForm() {
  if (elements.caseFormPanel) {
    elements.caseFormPanel.hidden = true;
  }
}

function startCreatingTestCase() {
  editingTestCaseId = null;
  elements.caseForm.reset();
  renderStepEditor();
  elements.caseFormTitle.textContent = "Create Test Case";
  elements.caseSubmitButton.textContent = "Create Case";
  showCaseForm();
}

function startEditingTestCase(testCase) {
  editingTestCaseId = testCase.id;
  selectedCaseId = testCase.id;
  fillTestCaseForm(testCase);
  elements.caseFormTitle.textContent = `Edit Test Case ${testCase.test_id || `#${testCase.id}`}`;
  elements.caseSubmitButton.textContent = "Save Case";
  showCaseForm();
}

function resetTestCaseForm() {
  editingTestCaseId = null;
  elements.caseForm.reset();
  renderStepEditor();
  elements.caseFormTitle.textContent = "Create Test Case";
  elements.caseSubmitButton.textContent = "Create Case";
  hideCaseForm();
}

async function duplicateTestCase(testCase) {
  const duplicated = await api(`/test-cases/${testCase.id}/duplicate`, { method: "POST" });
  selectedCaseId = duplicated.id;
  await loadInitialData();
  const duplicatedCase = getSelectedTestCase() || duplicated;
  startEditingTestCase(duplicatedCase);
  const titleInput = document.querySelector("#caseTitle");
  titleInput.focus();
  titleInput.select();
  showToast("Test case duplicated. Rename it and save.");
}

async function deleteTestCase(testCase) {
  const confirmed = window.confirm(
    `Delete test case "${testCase.title}"? This also removes it from executions.`
  );
  if (!confirmed) {
    return;
  }

  selectedExecutionCaseIds.delete(testCase.id);
  await api(`/test-cases/${testCase.id}`, { method: "DELETE" });
  if (selectedCaseId === testCase.id) {
    selectedCaseId = null;
  }
  showToast("Test case deleted");
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
      const payload = getTestCaseFormPayload();
      const path = editingTestCaseId ? `/test-cases/${editingTestCaseId}` : "/test-cases";
      const method = editingTestCaseId ? "PUT" : "POST";

      const savedCase = await api(path, {
        method,
        body: JSON.stringify(payload),
      });
      selectedCaseId = savedCase.id;
      showToast(editingTestCaseId ? "Test case saved" : "Test case created");
      resetTestCaseForm();
      await loadInitialData();
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
  elements.createCaseButton.addEventListener("click", startCreatingTestCase);
}

if (elements.addStepButton) {
  elements.addStepButton.addEventListener("click", () => addStepRow());
}

if (elements.cancelCaseEditButton) {
  elements.cancelCaseEditButton.addEventListener("click", resetTestCaseForm);
}

if (elements.editSelectedCaseButton) {
  elements.editSelectedCaseButton.addEventListener("click", () => {
    const selectedCase = getSelectedTestCase();
    if (selectedCase) {
      startEditingTestCase(selectedCase);
    }
  });
}

if (elements.duplicateSelectedCaseButton) {
  elements.duplicateSelectedCaseButton.addEventListener("click", async () => {
    const selectedCase = getSelectedTestCase();
    if (selectedCase) {
      await duplicateTestCase(selectedCase);
    }
  });
}

if (elements.deleteSelectedCaseButton) {
  elements.deleteSelectedCaseButton.addEventListener("click", async () => {
    const selectedCase = getSelectedTestCase();
    if (selectedCase) {
      await deleteTestCase(selectedCase);
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
      renderExecutionSuiteSelect();
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
  elements.exportExecutionReportButton.addEventListener("click", exportExecutionReport);
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
      await saveTestSuite();
    } catch (error) {
      showToast(error.message);
    }
  });
}
if (elements.cancelSuiteEditButton) {
  elements.cancelSuiteEditButton.addEventListener("click", clearSuiteSelection);
}
if (elements.deleteSuiteButton) {
  elements.deleteSuiteButton.addEventListener("click", () => {
    deleteSelectedSuite().catch((error) => showToast(error.message));
  });
}
if (elements.suiteSearch) {
  elements.suiteSearch.addEventListener("input", renderTestSuites);
}
if (elements.clearSuiteSearchButton) {
  elements.clearSuiteSearchButton.addEventListener("click", () => {
    elements.suiteSearch.value = "";
    renderTestSuites();
  });
}
if (elements.suiteCaseSearch) {
  elements.suiteCaseSearch.addEventListener("input", renderSuiteCaseChecklist);
}
if (elements.suiteCaseCategoryFilter) {
  elements.suiteCaseCategoryFilter.addEventListener("change", renderSuiteCaseChecklist);
}
if (elements.caseSearch) {
  elements.caseSearch.addEventListener("input", renderTestCases);
}
if (elements.casePriorityFilter) {
  elements.casePriorityFilter.addEventListener("change", renderTestCases);
}
if (elements.clearCaseFiltersButton) {
  elements.clearCaseFiltersButton.addEventListener("click", () => {
    resetCaseFilters();
    renderTestCases();
  });
}
if (elements.previewCsvButton) {
  elements.previewCsvButton.addEventListener("click", previewTestCasesFromCsv);
}
if (elements.confirmCsvImportButton) {
  elements.confirmCsvImportButton.addEventListener("click", async () => {
    try {
      await confirmCsvImport();
    } catch (error) {
      showToast(error.message);
    }
  });
}
if (elements.cancelCsvPreviewButton) {
  elements.cancelCsvPreviewButton.addEventListener("click", clearCsvPreview);
}
if (elements.cancelCsvPreviewFooterButton) {
  elements.cancelCsvPreviewFooterButton.addEventListener("click", clearCsvPreview);
}
if (elements.csvPreviewModal) {
  elements.csvPreviewModal.addEventListener("click", (event) => {
    if (event.target === elements.csvPreviewModal) {
      clearCsvPreview();
    }
  });
}
if (elements.caseCsvFile) {
  elements.caseCsvFile.addEventListener("change", clearCsvPreview);
}
if (elements.downloadCsvTemplateButton) {
  elements.downloadCsvTemplateButton.addEventListener("click", downloadCsvTemplate);
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.csvPreviewModal && !elements.csvPreviewModal.hidden) {
    clearCsvPreview();
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

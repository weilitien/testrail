// For Netlify, set this to your Railway API URL, for example:
// const API_BASE = "https://your-api.up.railway.app";
const API_BASE = window.API_BASE || "http://localhost:8000";

const STATUSES = ["NOT_RUN", "PASS", "FAIL", "BLOCKED", "SKIPPED"];

let testCases = [];
let executions = [];
let categories = [];
let selectedExecutionId = null;
let selectedExecutionItemId = null;
let selectedExecutionCaseIds = new Set();
let selectedCaseId = null;
let selectedCaseGroup = { type: "all", category: "" };
let editingTestCaseId = null;
let currentExecutionDetail = null;
let collapsedExecutionCategories = new Set();

const elements = {
  caseForm: document.querySelector("#caseForm"),
  caseFormPanel: document.querySelector("#caseFormPanel"),
  caseFormTitle: document.querySelector("#caseFormTitle"),
  caseSubmitButton: document.querySelector("#caseSubmitButton"),
  cancelCaseEditButton: document.querySelector("#cancelCaseEditButton"),
  createCaseButton: document.querySelector("#createCaseButton"),
  addStepButton: document.querySelector("#addStepButton"),
  caseStepRows: document.querySelector("#caseStepRows"),
  categoryForm: document.querySelector("#categoryForm"),
  categoryName: document.querySelector("#categoryName"),
  categoryTree: document.querySelector("#categoryTree"),
  caseDetailEmpty: document.querySelector("#caseDetailEmpty"),
  caseDetailContent: document.querySelector("#caseDetailContent"),
  selectedCaseTitle: document.querySelector("#selectedCaseTitle"),
  selectedCasePriority: document.querySelector("#selectedCasePriority"),
  caseDetailBody: document.querySelector("#caseDetailBody"),
  editSelectedCaseButton: document.querySelector("#editSelectedCaseButton"),
  duplicateSelectedCaseButton: document.querySelector("#duplicateSelectedCaseButton"),
  deleteSelectedCaseButton: document.querySelector("#deleteSelectedCaseButton"),
  executionForm: document.querySelector("#executionForm"),
  executionPageRoot: document.querySelector("#executionPageRoot"),
  executionCreatorPane: document.querySelector("#executionCreatorPane"),
  toggleExecutionCreatorButton: document.querySelector("#toggleExecutionCreatorButton"),
  closeExecutionCreatorButton: document.querySelector("#closeExecutionCreatorButton"),
  caseList: document.querySelector("#caseList"),
  caseSearch: document.querySelector("#caseSearch"),
  casePriorityFilter: document.querySelector("#casePriorityFilter"),
  clearCaseFiltersButton: document.querySelector("#clearCaseFiltersButton"),
  caseCsvFile: document.querySelector("#caseCsvFile"),
  downloadCsvTemplateButton: document.querySelector("#downloadCsvTemplateButton"),
  importCsvButton: document.querySelector("#importCsvButton"),
  executionList: document.querySelector("#executionList"),
  executionSearch: document.querySelector("#executionSearch"),
  clearExecutionSearchButton: document.querySelector("#clearExecutionSearchButton"),
  caseCount: document.querySelector("#caseCount"),
  executionCount: document.querySelector("#executionCount"),
  executionCaseSearch: document.querySelector("#executionCaseSearch"),
  executionCaseChecklist: document.querySelector("#executionCaseChecklist"),
  selectedCaseCount: document.querySelector("#selectedCaseCount"),
  caseSelect: document.querySelector("#caseSelect"),
  addCasesButton: document.querySelector("#addCasesButton"),
  executionSummary: document.querySelector("#executionSummary"),
  executionItems: document.querySelector("#executionItems"),
  selectedExecutionItemTitle: document.querySelector("#selectedExecutionItemTitle"),
  selectedExecutionItemBody: document.querySelector("#selectedExecutionItemBody"),
  selectedExecutionItemForm: document.querySelector("#selectedExecutionItemForm"),
  selectedExecutionItemStatus: document.querySelector("#selectedExecutionItemStatus"),
  selectedExecutionItemActualResult: document.querySelector(
    "#selectedExecutionItemActualResult"
  ),
  executionItemSearch: document.querySelector("#executionItemSearch"),
  executionStatusFilter: document.querySelector("#executionStatusFilter"),
  executionPriorityFilter: document.querySelector("#executionPriorityFilter"),
  clearExecutionFiltersButton: document.querySelector("#clearExecutionFiltersButton"),
  historyList: document.querySelector("#historyList"),
  detailPanel: document.querySelector("#executionDetailPanel"),
  executionEmptyPanel: document.querySelector("#executionEmptyPanel"),
  selectedExecutionLabel: document.querySelector("#selectedExecutionLabel"),
  refreshButton: document.querySelector("#refreshButton"),
  toast: document.querySelector("#toast"),
};

const hasExecutionPage = Boolean(elements.executionForm || elements.executionList || elements.detailPanel);

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || "Request failed");
  }

  return response.json();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3000);
}

function formatDate(value) {
  return new Date(value).toLocaleString();
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
  renderCaseDetail();

  if (elements.caseSelect) {
    elements.caseSelect.innerHTML = testCases
      .map(
        (testCase) =>
          `<option value="${testCase.id}">${formatTestCaseLabel(testCase)}</option>`
      )
      .join("");
  }
  renderExecutionCaseChecklist();

  if (!elements.caseList) {
    return;
  }

  elements.caseList.innerHTML = visibleTestCases.length
    ? ""
    : testCases.length
      ? "<p class='muted'>No test cases match the current filters.</p>"
      : "<p class='muted'>No test cases yet.</p>";

  for (const testCase of visibleTestCases) {
    const row = document.createElement("button");
    row.className = `caseTableRow ${selectedCaseId === testCase.id ? "selected" : ""}`;
    row.type = "button";
    row.innerHTML = `
      <span class="caseId">${escapeHtml(testCase.test_id || "No Test ID")}</span>
      <span class="caseTitle">${escapeHtml(testCase.title)}</span>
      <span>${escapeHtml(testCase.category || "No category")}</span>
      <span class="priority ${escapeHtml(testCase.priority || "Medium")}">
        ${escapeHtml(testCase.priority || "Medium")}
      </span>
    `;
    row.addEventListener("click", () => {
      selectedCaseId = testCase.id;
      hideCaseForm();
      renderTestCases();
    });
    elements.caseList.appendChild(row);
  }
}

function renderCategoryTree() {
  if (!elements.categoryTree) {
    return;
  }

  const uncategorizedCount = testCases.filter((testCase) => !testCase.category).length;

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

  if (uncategorizedCount) {
    elements.categoryTree.appendChild(
      createCategoryTreeRow({
        label: "Uncategorized",
        count: uncategorizedCount,
        active: selectedCaseGroup.type === "category" && selectedCaseGroup.category === "",
        onClick: () => {
          selectedCaseGroup = { type: "category", category: "" };
          renderTestCases();
        },
      })
    );
  }

  for (const category of categories) {
    elements.categoryTree.appendChild(
      createCategoryTreeRow({
        label: category.name,
        count: category.test_count,
        active:
          selectedCaseGroup.type === "category" &&
          selectedCaseGroup.category === category.name,
        onClick: () => {
          selectedCaseGroup = { type: "category", category: category.name };
          renderTestCases();
        },
        onRename: () => renameCategory(category),
        onDelete: () => deleteCategory(category),
      })
    );
  }
}

function createCategoryTreeRow({ label, count, active, onClick, onRename, onDelete }) {
  const row = document.createElement("div");
  row.className = `categoryRow ${active ? "active" : ""}`;

  const button = document.createElement("button");
  button.className = "treeItem";
  button.type = "button";
  button.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <strong>${count}</strong>
  `;
  button.addEventListener("click", onClick);
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

function filterTestCases(cases) {
  const searchText = elements.caseSearch
    ? elements.caseSearch.value.trim().toLowerCase()
    : "";
  const priority = elements.casePriorityFilter ? elements.casePriorityFilter.value : "";

  return cases.filter((testCase) => {
    const category = testCase.category || "";
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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      row.push(value.trim());
      if (row.some((cell) => cell)) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell)) {
    rows.push(row);
  }

  return rows;
}

function normalizeCsvHeader(header) {
  return header
    .trim()
    .toLowerCase()
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ");
}

function getCsvValue(record, names, fallback = "") {
  for (const name of names) {
    const value = record[normalizeCsvHeader(name)];
    if (value !== undefined && value !== "") {
      return value;
    }
  }

  return fallback;
}

function csvRowsToTestCases(rows) {
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map(normalizeCsvHeader);
  return rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] || "";
    });

    const steps = getCsvValue(record, ["steps"]);
    const expectedResult = getCsvValue(record, ["expected_result", "expected result"]);

    return {
      test_id: getCsvValue(record, ["test_id", "test id"]),
      category: getCsvValue(record, ["category"]),
      title: getCsvValue(record, ["title"]),
      priority: getCsvValue(record, ["priority"], "Medium"),
      steps,
      expected_result: expectedResult,
      case_steps:
        steps || expectedResult
          ? [{ step_text: steps, expected_result: expectedResult }]
          : [],
      test_data: getCsvValue(record, ["test_data", "test data"]),
    };
  }).filter((testCase) => testCase.title);
}

async function importTestCasesFromCsv() {
  const file = elements.caseCsvFile.files[0];
  if (!file) {
    showToast("Choose a CSV file first");
    return;
  }

  try {
    const text = await file.text();
    const testCasesToImport = csvRowsToTestCases(parseCsv(text));
    if (!testCasesToImport.length) {
      showToast("No valid test cases found in CSV");
      return;
    }

    const result = await api("/test-cases/bulk", {
      method: "POST",
      body: JSON.stringify({ test_cases: testCasesToImport }),
    });
    elements.caseCsvFile.value = "";
    showToast(`Imported ${result.created_count} test case(s)`);
    await loadInitialData();
  } catch (error) {
    showToast(error.message);
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

function escapeCsvValue(value) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
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
  if (!elements.executionCaseSearch || !elements.executionCaseChecklist) {
    return;
  }

  const searchText = elements.executionCaseSearch.value.trim().toLowerCase();
  const filteredCases = testCases.filter((testCase) =>
    testCase.title.toLowerCase().includes(searchText)
  );

  elements.executionCaseChecklist.innerHTML = filteredCases.length
    ? ""
    : "<p class='muted'>No matching test cases.</p>";

  for (const testCase of filteredCases) {
    const label = document.createElement("label");
    label.className = "checkboxRow";
    label.innerHTML = `
      <input
        type="checkbox"
        name="executionCase"
        value="${testCase.id}"
        ${selectedExecutionCaseIds.has(testCase.id) ? "checked" : ""}
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
        selectedExecutionCaseIds.add(testCaseId);
      } else {
        selectedExecutionCaseIds.delete(testCaseId);
      }
      updateSelectedCaseCount();
    });
    elements.executionCaseChecklist.appendChild(label);
  }

  updateSelectedCaseCount();
}

function getSelectedExecutionCaseIds() {
  return Array.from(selectedExecutionCaseIds);
}

function updateSelectedCaseCount() {
  const selectedCount = getSelectedExecutionCaseIds().length;
  if (elements.selectedCaseCount) {
    elements.selectedCaseCount.textContent = `${selectedCount} selected`;
  }
}

function formatTestCaseLabel(testCase) {
  const visibleId = testCase.test_id || "No Test ID";
  return `${escapeHtml(visibleId)} - ${escapeHtml(testCase.title)}`;
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
    const row = document.createElement("article");
    row.className = `executionNavItem ${selectedExecutionId === execution.id ? "selected" : ""}`;
    row.innerHTML = `
      <button class="executionNavButton" type="button" data-action="view">
        <strong>${escapeHtml(execution.name)}</strong>
        <span>${escapeHtml(execution.description || "No description")}</span>
        <small>${execution.total_cases} case(s) / ${execution.pass_rate}% pass rate</small>
      </button>
      <div class="executionNavActions">
        <button class="danger" type="button" data-action="delete">Delete</button>
      </div>
    `;
    row.querySelector("[data-action='view']").addEventListener("click", () => {
      selectExecution(execution.id);
    });
    row.querySelector("[data-action='delete']").addEventListener("click", () =>
      deleteExecution(execution)
    );
    elements.executionList.appendChild(row);
  }
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
  if (!elements.executionCreatorPane || !elements.executionPageRoot) {
    return;
  }

  elements.executionCreatorPane.hidden = false;
  elements.executionPageRoot.classList.remove("creatorCollapsed");
}

function hideExecutionCreator() {
  if (!elements.executionCreatorPane || !elements.executionPageRoot) {
    return;
  }

  elements.executionCreatorPane.hidden = true;
  elements.executionPageRoot.classList.add("creatorCollapsed");
}

function clearExecutionDetail() {
  selectedExecutionId = null;
  selectedExecutionItemId = null;
  currentExecutionDetail = null;
  if (elements.detailPanel) {
    elements.detailPanel.hidden = true;
  }
  if (elements.executionEmptyPanel) {
    elements.executionEmptyPanel.hidden = false;
  }
  if (elements.selectedExecutionLabel) {
    elements.selectedExecutionLabel.textContent = "Select an execution";
  }
  if (elements.executionSummary) {
    elements.executionSummary.innerHTML = "";
  }
  if (elements.executionItems) {
    elements.executionItems.innerHTML = "";
  }
  if (elements.historyList) {
    elements.historyList.innerHTML = "";
  }
  renderSelectedExecutionItemDetail(null);
  resetExecutionFilters();
}

function renderExecutionDetail(detail) {
  const { execution, items, summary } = detail;
  const filteredItems = filterExecutionItems(items);
  const statusCounts = getStatusCounts(items);
  const selectedItemStillVisible = filteredItems.some(
    (item) => item.id === selectedExecutionItemId
  );

  if (!selectedItemStillVisible) {
    selectedExecutionItemId = filteredItems[0]?.id || null;
  }

  elements.selectedExecutionLabel.textContent = execution.name;
  elements.executionSummary.innerHTML = `
    <div class="summaryBox">Total<strong>${summary.total_cases}</strong></div>
    <div class="summaryBox">Visible<strong>${filteredItems.length}</strong></div>
    <div class="summaryBox">Passed<strong>${summary.passed_cases}</strong></div>
    <div class="summaryBox">Pass Rate<strong>${summary.pass_rate}%</strong></div>
    <div class="chartPanel">
      <div
        class="passRateDonut"
        style="--pass-rate: ${summary.pass_rate}%;"
        aria-label="Pass rate ${summary.pass_rate}%"
      >
        <span>${summary.pass_rate}%</span>
      </div>
      <div class="statusChart">
        ${STATUSES.map((status) => renderStatusBar(status, statusCounts, summary.total_cases)).join("")}
      </div>
    </div>
  `;

  elements.executionItems.innerHTML = filteredItems.length
    ? ""
    : items.length
      ? "<p class='muted'>No test cases match the current filters.</p>"
      : "<p class='muted'>No test cases have been added to this execution.</p>";

  for (const group of groupExecutionItemsByCategory(filteredItems)) {
    const groupElement = document.createElement("section");
    groupElement.className = "executionCategoryGroup";
    const groupCollapsed = collapsedExecutionCategories.has(group.category);
    const groupStatusCounts = getStatusCounts(group.items);
    const passedCount = groupStatusCounts.PASS || 0;
    const passRate = group.items.length
      ? Math.round((passedCount / group.items.length) * 100)
      : 0;

    groupElement.innerHTML = `
      <button class="executionCategoryHeader" type="button">
        <span class="categoryToggle">${groupCollapsed ? "+" : "-"}</span>
        <strong>${escapeHtml(group.label)}</strong>
        <span>${group.items.length} case(s)</span>
        <span>${passRate}% pass</span>
        <span class="statusMiniSummary">
          ${STATUSES.map(
            (status) => `<small class="${status}">${status}: ${groupStatusCounts[status]}</small>`
          ).join("")}
        </span>
      </button>
      <div class="executionCategoryItems" ${groupCollapsed ? "hidden" : ""}></div>
    `;

    groupElement.querySelector(".executionCategoryHeader").addEventListener("click", () => {
      if (groupCollapsed) {
        collapsedExecutionCategories.delete(group.category);
      } else {
        collapsedExecutionCategories.add(group.category);
      }
      renderExecutionDetail(detail);
    });

    const groupItems = groupElement.querySelector(".executionCategoryItems");
    for (const item of group.items) {
      groupItems.appendChild(createExecutionResultRow(item, detail));
    }

    elements.executionItems.appendChild(groupElement);
  }

  renderSelectedExecutionItemDetail(
    items.find((item) => item.id === selectedExecutionItemId) || null
  );
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

function createExecutionResultRow(item, detail) {
  const row = document.createElement("button");
  row.className = `executionResultRow ${selectedExecutionItemId === item.id ? "selected" : ""}`;
  row.type = "button";
  row.innerHTML = `
    <span class="caseId">${escapeHtml(item.test_id || "No Test ID")}</span>
    <span class="caseTitle">${escapeHtml(item.title)}</span>
    <span class="priority ${escapeHtml(item.priority || "Medium")}">
      ${escapeHtml(item.priority || "Medium")}
    </span>
    <span class="status ${item.status}">${item.status}</span>
  `;
  row.addEventListener("click", () => {
    selectedExecutionItemId = item.id;
    renderExecutionDetail(detail);
  });
  return row;
}

function renderSelectedExecutionItemDetail(item) {
  if (!elements.selectedExecutionItemBody || !elements.selectedExecutionItemForm) {
    return;
  }

  if (!item) {
    elements.selectedExecutionItemTitle.textContent = "Selected Result";
    elements.selectedExecutionItemBody.innerHTML =
      "<p class='muted'>Select a test result to view details and update status.</p>";
    elements.selectedExecutionItemForm.hidden = true;
    return;
  }

  elements.selectedExecutionItemTitle.textContent = item.test_id || "No Test ID";
  elements.selectedExecutionItemBody.innerHTML = `
    <h3>${escapeHtml(item.title)}</h3>
    <div class="metaLine">
      <span>${escapeHtml(item.category || "No category")}</span>
      <span class="priority ${escapeHtml(item.priority || "Medium")}">
        ${escapeHtml(item.priority || "Medium")}
      </span>
      <span class="status ${item.status}">${item.status}</span>
    </div>
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

function filterExecutionItems(items) {
  const searchText = elements.executionItemSearch
    ? elements.executionItemSearch.value.trim().toLowerCase()
    : "";
  const status = elements.executionStatusFilter ? elements.executionStatusFilter.value : "";
  const priority = elements.executionPriorityFilter ? elements.executionPriorityFilter.value : "";

  return items.filter((item) => {
    const searchableText = [
      item.test_id,
      item.title,
      item.category,
    ]
      .join(" ")
      .toLowerCase();
    const matchesSearch = !searchText || searchableText.includes(searchText);
    const matchesStatus = !status || item.status === status;
    const matchesPriority = !priority || item.priority === priority;

    return matchesSearch && matchesStatus && matchesPriority;
  });
}

function rerenderCurrentExecutionDetail() {
  if (currentExecutionDetail) {
    renderExecutionDetail(currentExecutionDetail);
  }
}

function resetExecutionFilters() {
  if (elements.executionItemSearch) {
    elements.executionItemSearch.value = "";
  }
  if (elements.executionStatusFilter) {
    elements.executionStatusFilter.value = "";
  }
  if (elements.executionPriorityFilter) {
    elements.executionPriorityFilter.value = "";
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
        <span>${count}</span>
      </div>
      <div class="statusBarTrack" aria-label="${status} ${percentage}%">
        <div class="statusBarFill ${status}" style="width: ${percentage}%;"></div>
      </div>
    </div>
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

  if (!hasExecutionPage) {
    return;
  }

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

async function selectExecution(executionId) {
  if (selectedExecutionId !== executionId) {
    selectedExecutionItemId = null;
    collapsedExecutionCategories = new Set();
  }
  selectedExecutionId = executionId;
  const detail = await api(`/executions/${executionId}`);
  const history = await api(`/executions/${executionId}/history`);
  currentExecutionDetail = detail;
  renderExecutions();
  renderExecutionDetail(detail);
  renderHistory(history);
  expandExecutionRow(executionId);
}

async function updateExecutionItem(itemId, payload) {
  await api(`/execution-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  showToast("Result saved");
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

if (elements.addCasesButton) {
  elements.addCasesButton.addEventListener("click", async () => {
    if (!selectedExecutionId) {
      showToast("Select an execution first");
      return;
    }

    const selectedIds = Array.from(elements.caseSelect.selectedOptions).map((option) =>
      Number(option.value)
    );
    if (!selectedIds.length) {
      showToast("Select at least one test case");
      return;
    }

    await api(`/executions/${selectedExecutionId}/test-cases`, {
      method: "POST",
      body: JSON.stringify({ test_case_ids: selectedIds }),
    });
    showToast("Cases added to execution");
    await loadInitialData();
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
if (elements.importCsvButton) {
  elements.importCsvButton.addEventListener("click", importTestCasesFromCsv);
}
if (elements.downloadCsvTemplateButton) {
  elements.downloadCsvTemplateButton.addEventListener("click", downloadCsvTemplate);
}
if (elements.executionCaseSearch) {
  elements.executionCaseSearch.addEventListener("input", renderExecutionCaseChecklist);
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
if (elements.executionItemSearch) {
  elements.executionItemSearch.addEventListener("input", rerenderCurrentExecutionDetail);
}
if (elements.executionStatusFilter) {
  elements.executionStatusFilter.addEventListener("change", rerenderCurrentExecutionDetail);
}
if (elements.executionPriorityFilter) {
  elements.executionPriorityFilter.addEventListener("change", rerenderCurrentExecutionDetail);
}
if (elements.clearExecutionFiltersButton) {
  elements.clearExecutionFiltersButton.addEventListener("click", () => {
    resetExecutionFilters();
    rerenderCurrentExecutionDetail();
  });
}

loadInitialData().catch((error) => {
  showToast(error.message);
});

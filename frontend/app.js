// For Netlify, set this to your Railway API URL, for example:
// const API_BASE = "https://your-api.up.railway.app";
const API_BASE = window.API_BASE || "http://localhost:8000";

const STATUSES = ["NOT_RUN", "PASS", "FAIL", "BLOCKED", "SKIPPED"];

let testCases = [];
let executions = [];
let selectedExecutionId = null;
let selectedExecutionItemId = null;
let selectedExecutionCaseIds = new Set();
let selectedCaseId = null;
let selectedCaseGroup = { type: "all", category: "" };
let editingTestCaseId = null;
let currentExecutionDetail = null;

const elements = {
  caseForm: document.querySelector("#caseForm"),
  caseFormPanel: document.querySelector("#caseFormPanel"),
  caseFormTitle: document.querySelector("#caseFormTitle"),
  caseSubmitButton: document.querySelector("#caseSubmitButton"),
  cancelCaseEditButton: document.querySelector("#cancelCaseEditButton"),
  createCaseButton: document.querySelector("#createCaseButton"),
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

  const groups = new Map();
  for (const testCase of testCases) {
    const category = testCase.category || "No category";
    groups.set(category, (groups.get(category) || 0) + 1);
  }

  elements.categoryTree.innerHTML = "";
  elements.categoryTree.appendChild(
    createCategoryTreeButton({
      label: "All Test Cases",
      count: testCases.length,
      active: selectedCaseGroup.type === "all",
      onClick: () => {
        selectedCaseGroup = { type: "all", category: "" };
        renderTestCases();
      },
    })
  );

  for (const [category, count] of Array.from(groups.entries()).sort()) {
    elements.categoryTree.appendChild(
      createCategoryTreeButton({
        label: category,
        count,
        active: selectedCaseGroup.type === "category" && selectedCaseGroup.category === category,
        onClick: () => {
          selectedCaseGroup = { type: "category", category };
          renderTestCases();
        },
      })
    );
  }
}

function createCategoryTreeButton({ label, count, active, level = 0, onClick }) {
  const button = document.createElement("button");
  button.className = `treeItem level${level} ${active ? "active" : ""}`;
  button.type = "button";
  button.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <strong>${count}</strong>
  `;
  button.addEventListener("click", onClick);
  return button;
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
      <p>${escapeHtml(selectedCase.steps || "No steps")}</p>
    </div>
    <div class="detailBlock">
      <strong>Expected Result</strong>
      <p>${escapeHtml(selectedCase.expected_result || "No expected result")}</p>
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

function filterTestCases(cases) {
  const searchText = elements.caseSearch
    ? elements.caseSearch.value.trim().toLowerCase()
    : "";
  const priority = elements.casePriorityFilter ? elements.casePriorityFilter.value : "";

  return cases.filter((testCase) => {
    const category = testCase.category || "No category";
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

    return {
      test_id: getCsvValue(record, ["test_id", "test id"]),
      category: getCsvValue(record, ["category"]),
      title: getCsvValue(record, ["title"]),
      priority: getCsvValue(record, ["priority"], "Medium"),
      steps: getCsvValue(record, ["steps"]),
      expected_result: getCsvValue(record, ["expected_result", "expected result"]),
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

  for (const item of filteredItems) {
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

    elements.executionItems.appendChild(row);
  }

  renderSelectedExecutionItemDetail(
    items.find((item) => item.id === selectedExecutionItemId) || null
  );
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
      <p>${escapeHtml(item.steps || "No steps")}</p>
    </div>
    <div class="detailBlock">
      <strong>Expected Result</strong>
      <p>${escapeHtml(item.expected_result || "No expected result")}</p>
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

function getTestCaseFormPayload() {
  return {
    test_id: document.querySelector("#caseTestId").value,
    category: document.querySelector("#caseCategory").value,
    title: document.querySelector("#caseTitle").value,
    priority: document.querySelector("#casePriority").value,
    steps: document.querySelector("#caseSteps").value,
    expected_result: document.querySelector("#caseExpected").value,
    test_data: document.querySelector("#caseTestData").value,
  };
}

function fillTestCaseForm(testCase) {
  document.querySelector("#caseTestId").value = testCase.test_id || "";
  document.querySelector("#caseCategory").value = testCase.category || "";
  document.querySelector("#caseTitle").value = testCase.title || "";
  document.querySelector("#casePriority").value = testCase.priority || "Medium";
  document.querySelector("#caseSteps").value = testCase.steps || "";
  document.querySelector("#caseExpected").value = testCase.expected_result || "";
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
  elements.caseFormTitle.textContent = "Create Test Case";
  elements.caseSubmitButton.textContent = "Create Case";
  hideCaseForm();
}

async function duplicateTestCase(testCase) {
  const duplicated = await api(`/test-cases/${testCase.id}/duplicate`, { method: "POST" });
  selectedCaseId = duplicated.id;
  showToast("Test case duplicated");
  await loadInitialData();
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
  });
}

if (elements.createCaseButton) {
  elements.createCaseButton.addEventListener("click", startCreatingTestCase);
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

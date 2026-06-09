// For Netlify, set this to your Railway API URL, for example:
// const API_BASE = "https://your-api.up.railway.app";
const API_BASE = window.API_BASE || "http://localhost:8000";

const STATUSES = ["NOT_RUN", "PASS", "FAIL", "BLOCKED", "SKIPPED"];

let testCases = [];
let executions = [];
let selectedExecutionId = null;
let selectedExecutionCaseIds = new Set();

const elements = {
  caseForm: document.querySelector("#caseForm"),
  executionForm: document.querySelector("#executionForm"),
  caseList: document.querySelector("#caseList"),
  executionList: document.querySelector("#executionList"),
  caseCount: document.querySelector("#caseCount"),
  executionCount: document.querySelector("#executionCount"),
  executionCaseSearch: document.querySelector("#executionCaseSearch"),
  executionCaseChecklist: document.querySelector("#executionCaseChecklist"),
  selectedCaseCount: document.querySelector("#selectedCaseCount"),
  caseSelect: document.querySelector("#caseSelect"),
  addCasesButton: document.querySelector("#addCasesButton"),
  executionSummary: document.querySelector("#executionSummary"),
  executionItems: document.querySelector("#executionItems"),
  historyList: document.querySelector("#historyList"),
  detailPanel: document.querySelector("#executionDetailPanel"),
  selectedExecutionLabel: document.querySelector("#selectedExecutionLabel"),
  refreshButton: document.querySelector("#refreshButton"),
  toast: document.querySelector("#toast"),
};

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
  elements.caseCount.textContent = `${testCases.length} case(s)`;
  elements.caseList.innerHTML = testCases.length
    ? ""
    : "<p class='muted'>No test cases yet.</p>";

  elements.caseSelect.innerHTML = testCases
    .map(
      (testCase) =>
        `<option value="${testCase.id}">${formatTestCaseLabel(testCase)}</option>`
    )
    .join("");
  renderExecutionCaseChecklist();

  for (const testCase of testCases) {
    const row = document.createElement("article");
    row.className = "listRow";
    row.innerHTML = `
      <div class="listRowHeader">
        <div>
          <h3>${formatTestCaseLabel(testCase)}</h3>
          <div class="metaLine">
            <span>${escapeHtml(testCase.feature || "No feature")}</span>
            <span>${escapeHtml(testCase.sub_feature || "No sub feature")}</span>
            <span class="priority ${escapeHtml(testCase.priority || "Medium")}">
              ${escapeHtml(testCase.priority || "Medium")}
            </span>
          </div>
        </div>
        <div class="rowActions">
          <span class="muted">${formatDate(testCase.created_at)}</span>
          <button class="danger" type="button">Delete</button>
        </div>
      </div>
      <p><strong>Steps:</strong> ${escapeHtml(testCase.steps || "No steps")}</p>
      <p><strong>Expected:</strong> ${escapeHtml(testCase.expected_result || "No expected result")}</p>
      <p><strong>Test Data:</strong> ${escapeHtml(testCase.test_data || "N/A")}</p>
    `;
    row.querySelector("button").addEventListener("click", () => deleteTestCase(testCase));
    elements.caseList.appendChild(row);
  }
}

function renderExecutionCaseChecklist() {
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
          ${escapeHtml(testCase.feature || "No feature")} /
          ${escapeHtml(testCase.sub_feature || "No sub feature")} /
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
  elements.selectedCaseCount.textContent = `${selectedCount} selected`;
}

function formatTestCaseLabel(testCase) {
  const fallbackId = testCase.id || testCase.test_case_id;
  const visibleId = testCase.test_id || `Case #${fallbackId}`;
  return `${escapeHtml(visibleId)} - ${escapeHtml(testCase.title)}`;
}

function renderExecutions() {
  elements.executionCount.textContent = `${executions.length} execution(s)`;
  elements.executionList.innerHTML = executions.length
    ? ""
    : "<p class='muted'>No executions yet.</p>";

  for (const execution of executions) {
    const row = document.createElement("article");
    row.className = "listRow";
    row.innerHTML = `
      <div class="listRowHeader">
        <h3>#${execution.id} ${escapeHtml(execution.name)}</h3>
        <div class="rowActions">
          <button class="secondary" type="button" data-action="view">View Detail</button>
          <button class="danger" type="button" data-action="delete">Delete</button>
        </div>
      </div>
      <p>${escapeHtml(execution.description || "No description")}</p>
      <p>${execution.total_cases} case(s), ${execution.pass_rate}% pass rate</p>
    `;
    row.querySelector("[data-action='view']").addEventListener("click", () =>
      selectExecution(execution.id)
    );
    row.querySelector("[data-action='delete']").addEventListener("click", () =>
      deleteExecution(execution)
    );
    elements.executionList.appendChild(row);
  }
}

function clearExecutionDetail() {
  selectedExecutionId = null;
  elements.selectedExecutionLabel.textContent = "Select an execution";
  elements.executionSummary.innerHTML = "";
  elements.executionItems.innerHTML = "";
  elements.historyList.innerHTML = "";
}

function renderExecutionDetail(detail) {
  const { execution, items, summary } = detail;
  const statusCounts = getStatusCounts(items);
  elements.selectedExecutionLabel.textContent = `#${execution.id} ${execution.name}`;
  elements.executionSummary.innerHTML = `
    <div class="summaryBox">Total<strong>${summary.total_cases}</strong></div>
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

  elements.executionItems.innerHTML = items.length
    ? ""
    : "<p class='muted'>No test cases have been added to this execution.</p>";

  for (const item of items) {
    const row = document.createElement("article");
    row.className = "executionItem";
    row.innerHTML = `
      <div>
        <h3>${formatTestCaseLabel(item)}</h3>
        <div class="metaLine">
          <span>${escapeHtml(item.feature || "No feature")}</span>
          <span>${escapeHtml(item.sub_feature || "No sub feature")}</span>
          <span class="priority ${escapeHtml(item.priority || "Medium")}">
            ${escapeHtml(item.priority || "Medium")}
          </span>
        </div>
        <p><strong>Steps:</strong> ${escapeHtml(item.steps || "No steps")}</p>
        <p><strong>Expected:</strong> ${escapeHtml(item.expected_result || "No expected result")}</p>
        <p><strong>Test Data:</strong> ${escapeHtml(item.test_data || "N/A")}</p>
        <span class="status ${item.status}">${item.status}</span>
      </div>
      <form class="itemEditor">
        <label>
          Status
          <select name="status">
            ${STATUSES.map(
              (status) =>
                `<option value="${status}" ${status === item.status ? "selected" : ""}>${status}</option>`
            ).join("")}
          </select>
        </label>
        <label>
          Actual Result Notes
          <textarea name="actualResult">${escapeHtml(item.actual_result || "")}</textarea>
        </label>
        <button type="submit">Save Result</button>
      </form>
    `;

    row.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await updateExecutionItem(item.id, {
        status: form.get("status"),
        actual_result: form.get("actualResult"),
      });
    });

    elements.executionItems.appendChild(row);
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
        <strong>#${entry.test_case_id} ${escapeHtml(entry.title)}</strong>
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
  executions = await api("/executions");
  renderTestCases();
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
  selectedExecutionId = executionId;
  const detail = await api(`/executions/${executionId}`);
  const history = await api(`/executions/${executionId}/history`);
  renderExecutionDetail(detail);
  renderHistory(history);
}

async function updateExecutionItem(itemId, payload) {
  await api(`/execution-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  showToast("Result saved");
  await loadInitialData();
}

async function deleteTestCase(testCase) {
  const confirmed = window.confirm(
    `Delete test case #${testCase.id} "${testCase.title}"? This also removes it from executions.`
  );
  if (!confirmed) {
    return;
  }

  selectedExecutionCaseIds.delete(testCase.id);
  await api(`/test-cases/${testCase.id}`, { method: "DELETE" });
  showToast("Test case deleted");
  await loadInitialData();
}

async function deleteExecution(execution) {
  const confirmed = window.confirm(
    `Delete execution #${execution.id} "${execution.name}"? This also removes its results and history.`
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

elements.caseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/test-cases", {
    method: "POST",
    body: JSON.stringify({
      test_id: document.querySelector("#caseTestId").value,
      feature: document.querySelector("#caseFeature").value,
      sub_feature: document.querySelector("#caseSubFeature").value,
      title: document.querySelector("#caseTitle").value,
      priority: document.querySelector("#casePriority").value,
      steps: document.querySelector("#caseSteps").value,
      expected_result: document.querySelector("#caseExpected").value,
      test_data: document.querySelector("#caseTestData").value,
    }),
  });
  elements.caseForm.reset();
  showToast("Test case created");
  await loadInitialData();
});

elements.executionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const selectedCaseIds = getSelectedExecutionCaseIds();

  if (!selectedCaseIds.length) {
    showToast("Select at least one test case");
    return;
  }

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
  showToast("Execution created");
  await loadInitialData();
  await selectExecution(execution.id);
  elements.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

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

elements.refreshButton.addEventListener("click", loadInitialData);
elements.executionCaseSearch.addEventListener("input", renderExecutionCaseChecklist);

loadInitialData().catch((error) => {
  showToast(error.message);
});

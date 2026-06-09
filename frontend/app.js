// For Netlify, set this to your Railway API URL, for example:
// const API_BASE = "https://your-api.up.railway.app";
const API_BASE = window.API_BASE || "http://localhost:8000";

const STATUSES = ["NOT_RUN", "PASS", "FAIL", "BLOCKED", "SKIPPED"];

let testCases = [];
let executions = [];
let selectedExecutionId = null;

const elements = {
  caseForm: document.querySelector("#caseForm"),
  executionForm: document.querySelector("#executionForm"),
  caseList: document.querySelector("#caseList"),
  executionList: document.querySelector("#executionList"),
  caseCount: document.querySelector("#caseCount"),
  executionCount: document.querySelector("#executionCount"),
  caseSelect: document.querySelector("#caseSelect"),
  addCasesButton: document.querySelector("#addCasesButton"),
  executionSummary: document.querySelector("#executionSummary"),
  executionItems: document.querySelector("#executionItems"),
  historyList: document.querySelector("#historyList"),
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
    .map((testCase) => `<option value="${testCase.id}">#${testCase.id} ${testCase.title}</option>`)
    .join("");

  for (const testCase of testCases) {
    const row = document.createElement("article");
    row.className = "listRow";
    row.innerHTML = `
      <div class="listRowHeader">
        <h3>#${testCase.id} ${escapeHtml(testCase.title)}</h3>
        <span class="muted">${formatDate(testCase.created_at)}</span>
      </div>
      <p><strong>Steps:</strong> ${escapeHtml(testCase.steps || "No steps")}</p>
      <p><strong>Expected:</strong> ${escapeHtml(testCase.expected_result || "No expected result")}</p>
    `;
    elements.caseList.appendChild(row);
  }
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
        <button class="secondary" type="button">View Detail</button>
      </div>
      <p>${escapeHtml(execution.description || "No description")}</p>
      <p>${execution.total_cases} case(s), ${execution.pass_rate}% pass rate</p>
    `;
    row.querySelector("button").addEventListener("click", () => selectExecution(execution.id));
    elements.executionList.appendChild(row);
  }
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
        <h3>#${item.test_case_id} ${escapeHtml(item.title)}</h3>
        <p><strong>Steps:</strong> ${escapeHtml(item.steps || "No steps")}</p>
        <p><strong>Expected:</strong> ${escapeHtml(item.expected_result || "No expected result")}</p>
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
    await selectExecution(selectedExecutionId);
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
      title: document.querySelector("#caseTitle").value,
      steps: document.querySelector("#caseSteps").value,
      expected_result: document.querySelector("#caseExpected").value,
    }),
  });
  elements.caseForm.reset();
  showToast("Test case created");
  await loadInitialData();
});

elements.executionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const execution = await api("/executions", {
    method: "POST",
    body: JSON.stringify({
      name: document.querySelector("#executionName").value,
      description: document.querySelector("#executionDescription").value,
    }),
  });
  elements.executionForm.reset();
  showToast("Execution created");
  await loadInitialData();
  await selectExecution(execution.id);
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

loadInitialData().catch((error) => {
  showToast(error.message);
});

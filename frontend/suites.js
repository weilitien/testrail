import { api } from "./api.js";
import {
  groupTestCasesByCategory,
  renderGroupedCaseChecklist,
} from "./checklists.js";
import { escapeHtml } from "./utils.js";

let testSuites = [];
let selectedSuiteCaseIds = new Set();
let selectedSuiteId = null;

export async function refreshTestSuites() {
  testSuites = await api("/test-suites");
  return testSuites;
}

export async function renderSuitePage(elements, showToast, testCases) {
  renderTestSuites(elements, showToast, testCases);

  if (!selectedSuiteId) {
    renderSuiteDetail(elements, testCases, null);
    return;
  }

  const selectedStillExists = testSuites.some((suite) => suite.id === selectedSuiteId);
  if (selectedStillExists) {
    await selectTestSuite(selectedSuiteId, elements, showToast, testCases);
  } else {
    clearSuiteSelection(elements, testCases);
  }
}

export function renderTestSuites(elements, showToast, testCases) {
  if (!elements.suiteList) {
    return;
  }

  const visibleSuites = filterTestSuites(elements, testSuites);
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
      selectTestSuite(suite.id, elements, showToast, testCases).catch((error) =>
        showToast(error.message)
      );
    });
    elements.suiteList.appendChild(button);
  }
}

export function renderExecutionSuiteSelect(elements) {
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

export async function getSuiteCaseIds(suiteId) {
  const detail = await api(`/test-suites/${suiteId}`);
  return detail.test_cases.map((testCase) => testCase.id);
}

export function renderSuiteCaseChecklist(elements, testCases) {
  renderGroupedCaseChecklist({
    cases: testCases,
    searchElement: elements.suiteCaseSearch,
    categoryElement: elements.suiteCaseCategoryFilter,
    checklistElement: elements.suiteCaseChecklist,
    selectedIds: selectedSuiteCaseIds,
    countElement: elements.selectedSuiteCaseCount,
    onSelectionChange: () => {
      renderSelectedSuiteCaseList(elements, testCases);
    },
  });
  renderSelectedSuiteCaseList(elements, testCases);
}

export async function saveTestSuite(elements, showToast) {
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
}

export function clearSuiteSelection(elements, testCases, showToast = () => {}) {
  selectedSuiteId = null;
  selectedSuiteCaseIds = new Set();
  if (elements.suiteForm) {
    elements.suiteForm.reset();
  }
  renderTestSuites(elements, showToast, testCases);
  renderSuiteDetail(elements, testCases, null);
}

export async function deleteSelectedSuite(elements, showToast, testCases) {
  if (!selectedSuiteId) {
    showToast("Select a test suite first");
    return false;
  }

  const suiteName = elements.selectedSuiteTitle.textContent;
  const confirmed = window.confirm(`Delete test suite "${suiteName}"?`);
  if (!confirmed) {
    return false;
  }

  await api(`/test-suites/${selectedSuiteId}`, { method: "DELETE" });
  showToast("Test suite deleted");
  clearSuiteSelection(elements, testCases, showToast);
  return true;
}

function filterTestSuites(elements, suites) {
  const searchText = elements.suiteSearch?.value.trim().toLowerCase() || "";
  if (!searchText) {
    return suites;
  }

  return suites.filter((suite) =>
    [suite.name, suite.description].join(" ").toLowerCase().includes(searchText)
  );
}

async function selectTestSuite(suiteId, elements, showToast, testCases) {
  selectedSuiteId = suiteId;
  const detail = await api(`/test-suites/${suiteId}`);
  renderTestSuites(elements, showToast, testCases);
  renderSuiteDetail(elements, testCases, detail);
}

function renderSuiteDetail(elements, testCases, detail = null) {
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
    renderSuiteCaseChecklist(elements, testCases);
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
  renderSuiteCaseChecklist(elements, testCases);
  renderSuiteCaseList(elements, suiteCases);
}

function renderSuiteCaseList(elements, suiteCases) {
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

function renderSelectedSuiteCaseList(elements, testCases) {
  if (!elements.selectedSuiteCaseList) {
    return;
  }

  const selectedCases = testCases.filter((testCase) =>
    selectedSuiteCaseIds.has(testCase.id)
  );
  elements.selectedSuiteCaseList.innerHTML = selectedCases.length
    ? ""
    : "<p class='muted'>No test cases selected yet.</p>";

  for (const group of groupTestCasesByCategory(selectedCases)) {
    const groupElement = document.createElement("section");
    groupElement.className = "selectedSuiteCaseGroup";
    groupElement.innerHTML = `
      <div class="selectedSuiteCaseHeader">
        <strong>${escapeHtml(group.label)}</strong>
        <span>${group.items.length}</span>
      </div>
      <div class="selectedSuiteCaseItems"></div>
    `;

    const groupItems = groupElement.querySelector(".selectedSuiteCaseItems");
    for (const testCase of group.items) {
      const row = document.createElement("article");
      row.className = "selectedSuiteCaseRow";
      row.innerHTML = `
        <span class="caseId">${escapeHtml(testCase.test_id || "No Test ID")}</span>
        <strong>${escapeHtml(testCase.title)}</strong>
        <span class="priority ${escapeHtml(testCase.priority || "Medium")}">
          ${escapeHtml(testCase.priority || "Medium")}
        </span>
        <button class="iconButton dangerText" type="button">Remove</button>
      `;
      row.querySelector("button").addEventListener("click", () => {
        selectedSuiteCaseIds.delete(testCase.id);
        renderSuiteCaseChecklist(elements, testCases);
      });
      groupItems.appendChild(row);
    }

    elements.selectedSuiteCaseList.appendChild(groupElement);
  }
}

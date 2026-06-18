import { api } from "./api.js";
import {
  groupTestCasesByCategory,
  renderGroupedCaseChecklist,
} from "./checklists.js";
import {
  createTreeGroupSection,
  renderCaseIdentity,
  renderNavBadge,
  renderTreeEmptyState,
  renderTreeToggle,
} from "./treeUi.js";
import { escapeHtml } from "./utils.js";

let testSuites = [];
let selectedSuiteCaseIds = new Set();
let selectedSuiteId = null;
let selectedSuiteTreeCollapsed = false;

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
      ? renderTreeEmptyState("No test suites match the current search.")
      : renderTreeEmptyState("No test suites yet.");

  for (const suite of visibleSuites) {
    const isSelected = selectedSuiteId === suite.id;
    const selectedSuiteCases = testCases.filter((testCase) =>
      selectedSuiteCaseIds.has(testCase.id)
    );
    const canRenderCases = isSelected && !selectedSuiteTreeCollapsed;
    const wrapper = document.createElement("section");
    wrapper.className = `suiteTreeGroup ${isSelected ? "selected" : ""}`;

    const button = document.createElement("button");
    button.className = `suiteNavItem ${isSelected ? "selected" : ""}`;
    button.type = "button";
    button.innerHTML = `
      ${renderTreeToggle(isSelected && !selectedSuiteTreeCollapsed)}
      ${renderNavBadge("suite", "Test Suite")}
      <strong>${escapeHtml(suite.name)}</strong>
      <small>${suite.total_cases || 0} case(s)</small>
    `;
    button.addEventListener("click", () => {
      if (isSelected) {
        selectedSuiteTreeCollapsed = !selectedSuiteTreeCollapsed;
        renderTestSuites(elements, showToast, testCases);
        return;
      }
      selectTestSuite(suite.id, elements, showToast, testCases).catch((error) =>
        showToast(error.message)
      );
    });
    wrapper.appendChild(button);

    if (canRenderCases) {
      const caseList = document.createElement("div");
      caseList.className = "suiteTreeItems";
      caseList.innerHTML = selectedSuiteCases.length
        ? ""
        : renderTreeEmptyState("No test cases in this suite.");

      for (const group of groupTestCasesByCategory(selectedSuiteCases)) {
        caseList.appendChild(
          createTreeGroupSection({
            group,
            groupClassName: "suiteTreeCaseGroup",
            headerClassName: "suiteTreeCaseHeader",
            itemsClassName: "suiteTreeCaseItems",
            renderItem: createSuiteTreeCaseItem,
          })
        );
      }
      wrapper.appendChild(caseList);
    }

    elements.suiteList.appendChild(wrapper);
  }
}

function createSuiteTreeCaseItem(testCase) {
  const row = document.createElement("article");
  row.className = "suiteTreeCaseItem";
  row.innerHTML = renderCaseIdentity(testCase);
  return row;
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
      renderTestSuites(elements, () => {}, testCases);
    },
  });
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
  selectedSuiteTreeCollapsed = false;
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

  const suiteName = elements.suiteName?.value.trim() || "selected suite";
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
  selectedSuiteTreeCollapsed = false;
  const detail = await api(`/test-suites/${suiteId}`);
  renderSuiteDetail(elements, testCases, detail);
  renderTestSuites(elements, showToast, testCases);
}

function renderSuiteDetail(elements, testCases, detail = null) {
  if (!elements.suiteDetailEmpty) {
    return;
  }

  if (!detail) {
    elements.suiteDetailEmpty.hidden = false;
    elements.deleteSuiteButton.hidden = true;
    elements.suiteFormTitle.textContent = "Create Test Suite";
    elements.suiteSubmitButton.textContent = "Create Suite";
    selectedSuiteCaseIds = new Set();
    renderSuiteCaseChecklist(elements, testCases);
    return;
  }

  const { suite, test_cases: suiteCases } = detail;
  elements.suiteDetailEmpty.hidden = true;
  elements.deleteSuiteButton.hidden = false;
  elements.suiteFormTitle.textContent = "Edit Test Suite";
  elements.suiteSubmitButton.textContent = "Save Suite";
  elements.suiteName.value = suite.name;
  elements.suiteDescription.value = suite.description || "";
  selectedSuiteCaseIds = new Set(suiteCases.map((testCase) => testCase.id));
  renderSuiteCaseChecklist(elements, testCases);
}

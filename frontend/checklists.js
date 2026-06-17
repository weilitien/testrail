import { escapeHtml } from "./utils.js";

export function groupTestCasesByCategory(cases) {
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

export function renderGroupedCaseChecklist({
  cases,
  searchElement,
  categoryElement,
  checklistElement,
  selectedIds,
  countElement,
  excludeIds = new Set(),
  onSelectionChange = () => {},
}) {
  if (!searchElement || !checklistElement) {
    return;
  }

  const searchText = searchElement.value.trim().toLowerCase();
  const selectedCategory = categoryElement ? categoryElement.value : "";
  const filteredCases = cases.filter((testCase) => {
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

  const rerender = () =>
    renderGroupedCaseChecklist({
      cases,
      searchElement,
      categoryElement,
      checklistElement,
      selectedIds,
      countElement,
      excludeIds,
      onSelectionChange,
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
      onSelectionChange();
      rerender();
    });
    groupElement.querySelector("[data-action='clear']").addEventListener("click", () => {
      for (const testCase of group.items) {
        selectedIds.delete(testCase.id);
      }
      onSelectionChange();
      rerender();
    });

    const groupItems = groupElement.querySelector(".checklistCategoryItems");
    for (const testCase of group.items) {
      groupItems.appendChild(
        createCaseCheckbox(testCase, selectedIds, countElement, onSelectionChange)
      );
    }

    checklistElement.appendChild(groupElement);
  }

  updateSelectedCaseCount(selectedIds, countElement);
}

export function updateSelectedCaseCount(selectedIds, countElement) {
  if (countElement) {
    countElement.textContent = `${selectedIds.size} selected`;
  }
}

function createCaseCheckbox(testCase, selectedIds, countElement, onSelectionChange) {
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
    onSelectionChange();
  });
  return label;
}

function formatTestCaseLabel(testCase) {
  const visibleId = testCase.test_id || "No Test ID";
  return `${escapeHtml(visibleId)} - ${escapeHtml(testCase.title)}`;
}

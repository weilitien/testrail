import { groupTestCasesByCategory } from "./checklists.js";
import { getDisplaySteps, renderStepsTable } from "./caseDetails.js";
import { escapeHtml, formatDate } from "./utils.js";

export function createCaseBrowserState() {
  return {
    selectedCaseId: null,
    selectedCaseGroup: { type: "all", category: "" },
    collapsedCategories: new Set(),
    initializedCategories: new Set(),
  };
}

export function getSelectedTestCase(testCases, state) {
  return testCases.find((testCase) => testCase.id === state.selectedCaseId);
}

export function filterTestCases(testCases, elements, state, options = {}) {
  const searchText = elements.caseSearch
    ? elements.caseSearch.value.trim().toLowerCase()
    : "";
  const priority = elements.casePriorityFilter ? elements.casePriorityFilter.value : "";
  const ignoreGroup = Boolean(options.ignoreGroup);

  return testCases.filter((testCase) => {
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
      state.selectedCaseGroup.type === "all" ||
      (state.selectedCaseGroup.type === "category" &&
        category === state.selectedCaseGroup.category);

    return matchesSearch && matchesPriority && matchesGroup;
  });
}

export function resetCaseFilters(elements, state) {
  if (elements.caseSearch) {
    elements.caseSearch.value = "";
  }
  if (elements.casePriorityFilter) {
    elements.casePriorityFilter.value = "";
  }
  state.selectedCaseGroup = { type: "all", category: "" };
}

export function renderCategoryTree({
  elements,
  testCases,
  categories,
  state,
  callbacks,
}) {
  if (!elements.categoryTree) {
    return;
  }

  const visibleForTree = filterTestCases(testCases, elements, state, {
    ignoreGroup: true,
  });
  const groupedCases = groupTestCasesByCategory(visibleForTree);

  elements.categoryTree.innerHTML = "";
  elements.categoryTree.appendChild(
    createCategoryTreeRow({
      label: "All Test Cases",
      count: testCases.length,
      active: state.selectedCaseGroup.type === "all",
      onClick: () => {
        state.selectedCaseGroup = { type: "all", category: "" };
        callbacks.renderTestCases();
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
    if (!state.initializedCategories.has(group.category)) {
      state.initializedCategories.add(group.category);
      state.collapsedCategories.add(group.category);
    }
  }

  for (const group of groupedCases) {
    const categoryRecord = categories.find((category) => category.name === group.category);
    elements.categoryTree.appendChild(
      createCaseCategoryGroup({
        group,
        categoryRecord,
        state,
        callbacks,
      })
    );
  }
}

function createCaseCategoryGroup({ group, categoryRecord, state, callbacks }) {
  const groupElement = document.createElement("section");
  groupElement.className = "caseCategoryGroup";
  const collapsed = state.collapsedCategories.has(group.category);

  groupElement.appendChild(
    createCategoryTreeRow({
      label: group.label,
      count: group.items.length,
      active:
        state.selectedCaseGroup.type === "category" &&
        state.selectedCaseGroup.category === group.category,
      collapsed,
      onToggle: () => {
        if (collapsed) {
          state.collapsedCategories.delete(group.category);
        } else {
          state.collapsedCategories.add(group.category);
        }
        callbacks.renderTestCases();
      },
      onClick: () => {
        state.selectedCaseGroup = { type: "category", category: group.category };
        callbacks.renderTestCases();
      },
      onRename: categoryRecord ? () => callbacks.renameCategory(categoryRecord) : null,
      onDelete: categoryRecord ? () => callbacks.deleteCategory(categoryRecord) : null,
      onError: callbacks.showToast,
    })
  );

  const caseList = document.createElement("div");
  caseList.className = "caseTreeItems";
  caseList.hidden = collapsed;
  for (const testCase of group.items) {
    caseList.appendChild(createCaseTreeItem(testCase, state, callbacks));
  }
  groupElement.appendChild(caseList);
  return groupElement;
}

function createCaseTreeItem(testCase, state, callbacks) {
  const row = document.createElement("button");
  row.className = `caseTreeItem ${state.selectedCaseId === testCase.id ? "selected" : ""}`;
  row.type = "button";
  row.innerHTML = `
    <span class="caseId">${escapeHtml(testCase.test_id || "No Test ID")}</span>
    <strong>${escapeHtml(testCase.title)}</strong>
    <span class="priority ${escapeHtml(testCase.priority || "Medium")}">
      ${escapeHtml(testCase.priority || "Medium")}
    </span>
  `;
  row.addEventListener("click", () => {
    state.selectedCaseId = testCase.id;
    callbacks.hideCaseForm();
    callbacks.renderTestCases();
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
  onError,
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
      onRename().catch((error) => onError(error.message));
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "iconButton dangerText";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      onDelete().catch((error) => onError(error.message));
    });

    actions.append(renameButton, deleteButton);
    row.appendChild(actions);
  }

  return row;
}

export function renderCategoryOptions(elements, categories) {
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

export function renderCaseCategoryFilter(selectElement, testCases, categories) {
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
  selectElement.value = validValues.has(currentValue) ? currentValue : "";
}

export function renderCaseDetail(elements, selectedCase) {
  if (!elements.caseDetailContent || !elements.caseDetailEmpty) {
    return;
  }

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

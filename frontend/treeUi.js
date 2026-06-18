import { escapeHtml } from "./utils.js";

export function renderTreeToggle(expanded) {
  return `<span class="treeToggle">${expanded ? "-" : "+"}</span>`;
}

export function renderNavBadge(type, label) {
  return `<span class="navBadge ${escapeHtml(type)}">${escapeHtml(label)}</span>`;
}

export function renderCaseIdentity(testCase) {
  return `
    <span class="caseId">${escapeHtml(testCase.test_id || "No Test ID")}</span>
    <strong>${escapeHtml(testCase.title)}</strong>
  `;
}

export function renderTreeEmptyState(message) {
  return `<p class="muted treeEmptyState">${escapeHtml(message)}</p>`;
}

function renderTreeGroupHeaderWithTags({
  className,
  label,
  count,
  labelTag = "span",
  countTag = "strong",
}) {
  const safeLabelTag = labelTag === "strong" ? "strong" : "span";
  const safeCountTag = countTag === "span" ? "span" : "strong";

  return `
    <div class="${escapeHtml(className)}">
      <${safeLabelTag}>${escapeHtml(label)}</${safeLabelTag}>
      <${safeCountTag}>${count}</${safeCountTag}>
    </div>
  `;
}

export function createTreeGroupSection({
  group,
  groupClassName,
  headerClassName,
  itemsClassName,
  renderItem,
  labelTag = "span",
  countTag = "strong",
}) {
  const groupElement = document.createElement("section");
  groupElement.className = groupClassName;
  groupElement.innerHTML = `
    ${renderTreeGroupHeaderWithTags({
      className: headerClassName,
      label: group.label,
      count: group.items.length,
      labelTag,
      countTag,
    })}
    <div class="${itemsClassName}"></div>
  `;

  const groupItems = groupElement.querySelector(`.${itemsClassName}`);
  for (const item of group.items) {
    groupItems.appendChild(renderItem(item));
  }

  return groupElement;
}

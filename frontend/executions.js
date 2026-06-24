import { STATUSES } from "./config.js";
import { getDisplaySteps, renderStepsTable } from "./caseDetails.js";
import { escapeHtml, formatDate } from "./utils.js";

export function groupExecutionItemsByCategory(items) {
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

export function getStatusCounts(items) {
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

function getStatusDonutStyle(counts, total) {
  if (!total) {
    return "--donut-segments: #dce8ec 0 100%;";
  }

  const colors = {
    PASS: "var(--pass)",
    FAIL: "var(--fail)",
    BLOCKED: "var(--blocked)",
    SKIPPED: "var(--skipped)",
    NOT_RUN: "var(--not-run)",
  };
  let offset = 0;
  const segments = STATUSES
    .filter((status) => counts[status] > 0)
    .map((status) => {
      const start = offset;
      const end = offset + (counts[status] / total) * 100;
      offset = end;
      return `${colors[status]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });

  return `--donut-segments: ${segments.join(", ")};`;
}

function getFailedCategoryRows(items) {
  const failedItems = items.filter((item) => item.status === "FAIL");
  const groups = groupExecutionItemsByCategory(failedItems).map((group) => ({
    label: group.label,
    count: group.items.length,
    criticalCount: group.items.filter((item) => item.priority === "Critical").length,
    highCount: group.items.filter((item) => item.priority === "High").length,
  }));

  return {
    failedTotal: failedItems.length,
    groups: groups.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}

function renderFailedByCategory(items) {
  const { failedTotal, groups } = getFailedCategoryRows(items);

  if (!failedTotal) {
    return `
      <div class="failedCategoryPanel">
        <strong>Failed by Category</strong>
        <p class="muted">No failed test cases in this run.</p>
      </div>
    `;
  }

  return `
    <div class="failedCategoryPanel">
      <div class="summaryPanelHeader">
        <strong>Failed by Category</strong>
        <span>${failedTotal} failed</span>
      </div>
      <div class="failedCategoryList">
        ${groups
          .map((group, index) => {
            const percentage = Math.round((group.count / failedTotal) * 100);
            const riskText = [
              group.criticalCount ? `${group.criticalCount} critical` : "",
              group.highCount ? `${group.highCount} high` : "",
            ]
              .filter(Boolean)
              .join(" / ");

            return `
              <div class="failedCategoryRow">
                <div class="failedCategoryMeta">
                  <strong>${escapeHtml(group.label)}</strong>
                  <span>${group.count} fail(s) / ${percentage}%${index === 0 ? " / top category" : ""}</span>
                </div>
                <div class="failedCategoryTrack" aria-label="${escapeHtml(group.label)} ${percentage}% of failures">
                  <div class="failedCategoryFill" style="width: ${percentage}%;"></div>
                </div>
                ${riskText ? `<small>${escapeHtml(riskText)}</small>` : ""}
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderExecutionSummaryDashboard(summary, statusCounts, items) {
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
          style="${getStatusDonutStyle(statusCounts, summary.total_cases)}"
          aria-label="Pass rate ${summary.pass_rate}%, status distribution"
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
    ${renderFailedByCategory(items)}
  `;
}

export function renderExecutionSummaryDetail(elements, detail, statusCounts) {
  const { execution, items, summary } = detail;
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
    statusCounts,
    items
  );
  elements.selectedExecutionItemForm.hidden = true;
}

export function renderSelectedExecutionItemDetail(elements, item) {
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
      <span>Version ${item.snapshot_version || 1}</span>
      <span class="status ${item.status}">${item.status}</span>
      ${item.original_case_retired ? '<span class="retiredBadge">Retired source</span>' : ""}
    `;
  }
  elements.selectedExecutionItemBody.innerHTML = `
    ${
      item.original_case_retired
        ? `<div class="retiredNotice">
            <strong>Reusable test case retired</strong>
            <p>This result keeps the frozen snapshot captured when the execution was created.</p>
            ${
              item.original_case_deleted_at
                ? `<small>Retired ${formatDate(item.original_case_deleted_at)}</small>`
                : ""
            }
          </div>`
        : ""
    }
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

export function renderHistory(elements, history) {
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

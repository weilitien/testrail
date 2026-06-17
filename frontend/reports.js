import { STATUSES } from "./config.js";
import { escapeHtml } from "./utils.js";

export function exportExecutionReport(detail, showToast) {
  if (!detail) {
    showToast("Select an execution first");
    return;
  }

  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    showToast("Allow pop-ups to export the report");
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(buildExecutionReportHtml(detail));
  reportWindow.document.close();
}

function buildExecutionReportHtml(detail) {
  const { execution, items, summary } = detail;
  const statusCounts = getStatusCounts(items);
  const generatedAt = new Date().toLocaleString();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(execution.name)} - Test Report</title>
    <style>${getReportStyles()}</style>
  </head>
  <body>
    <main class="reportPage">
      <header class="reportHero">
        <div>
          <span class="eyebrow">Mini TestRail Report</span>
          <h1>${escapeHtml(execution.name)}</h1>
          <p>${escapeHtml(execution.description || "No description")}</p>
        </div>
        <button class="printButton" type="button" onclick="window.print()">Print / Save PDF</button>
      </header>

      <section class="reportMeta">
        <div><span>Generated</span><strong>${escapeHtml(generatedAt)}</strong></div>
        <div><span>Total Cases</span><strong>${summary.total_cases}</strong></div>
        <div><span>Passed</span><strong>${summary.passed_cases}</strong></div>
        <div><span>Pass Rate</span><strong>${summary.pass_rate}%</strong></div>
      </section>

      <section class="reportSummary">
        <div class="passRateCard">
          ${renderReportDonut(summary.pass_rate)}
          <strong>Overall Pass Rate</strong>
          <p>${summary.passed_cases} of ${summary.total_cases} test case(s) passed.</p>
        </div>
        <div class="statusCards">
          ${STATUSES.map((status) => renderReportStatusCard(status, statusCounts, summary.total_cases)).join("")}
        </div>
      </section>

      ${groupExecutionItemsByCategory(items).map((group) => renderReportCategory(group)).join("")}
    </main>
  </body>
</html>`;
}

function renderReportStatusCard(status, counts, total) {
  const count = counts[status] || 0;
  const percentage = total ? Math.round((count / total) * 100) : 0;
  const color = getReportStatusColor(status);

  return `
    <article class="statusCard">
      <div>
        <span class="status ${status}">${status}</span>
        <strong>${count}</strong>
      </div>
      ${renderReportBar(percentage, color)}
      <small>${percentage}% of run</small>
    </article>
  `;
}

function renderReportDonut(passRate) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const filledLength = (Math.max(0, Math.min(passRate, 100)) / 100) * circumference;
  const emptyLength = circumference - filledLength;

  return `
    <svg class="passRateSvg" viewBox="0 0 120 120" role="img" aria-label="Pass rate ${passRate}%">
      <circle class="donutTrack" cx="60" cy="60" r="${radius}"></circle>
      <circle
        class="donutFill"
        cx="60"
        cy="60"
        r="${radius}"
        stroke-dasharray="${filledLength} ${emptyLength}"
      ></circle>
      <text x="60" y="64" text-anchor="middle">${passRate}%</text>
    </svg>
  `;
}

function renderReportBar(percentage, color) {
  return `
    <svg class="reportBarSvg" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="${percentage}% of run">
      <rect x="0" y="0" width="100" height="10" rx="5" fill="#dce8ec"></rect>
      <rect x="0" y="0" width="${percentage}" height="10" rx="5" fill="${color}"></rect>
    </svg>
  `;
}

function getReportStatusColor(status) {
  const colors = {
    NOT_RUN: "#94a3b8",
    PASS: "#22a447",
    FAIL: "#e21b2d",
    BLOCKED: "#f2a100",
    SKIPPED: "#68717c",
  };

  return colors[status] || "#94a3b8";
}

function renderReportCategory(group) {
  return `
    <section class="reportCategory">
      <div class="categoryHeader">
        <h2>${escapeHtml(group.label)}</h2>
        <span>${group.items.length} case(s)</span>
      </div>
      <div class="resultTable">
        <div class="resultTableHeader">
          <span>Test ID</span>
          <span>Title</span>
          <span>Priority</span>
          <span>Status</span>
          <span>Actual Notes</span>
          <span>Test Data</span>
        </div>
        ${group.items.map(renderReportResult).join("")}
      </div>
    </section>
  `;
}

function renderReportResult(item) {
  return `
    <article class="resultRow">
      <div class="resultMain">
        <span class="caseId">${escapeHtml(item.test_id || "No Test ID")}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <span class="priority">${escapeHtml(item.priority || "Medium")}</span>
        <span class="status ${item.status}">${item.status}</span>
        <p>${escapeHtml(item.actual_result || "No notes")}</p>
        <p>${escapeHtml(item.test_data || "N/A")}</p>
      </div>
    </article>
  `;
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

function getReportStyles() {
  return `
    :root {
      color: #111318;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #edf8fb;
    }

    * {
      box-sizing: border-box;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    body {
      margin: 0;
      background: linear-gradient(180deg, #d6f2f7 0%, #f8fbfc 240px);
    }

    .reportPage {
      width: min(1120px, calc(100% - 40px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }

    .reportHero,
    .reportMeta,
    .reportSummary,
    .reportCategory {
      border: 1px solid #d4e1e7;
      border-radius: 12px;
      background: #ffffff;
      box-shadow: 0 18px 42px rgb(17 19 24 / 8%);
    }

    .reportHero {
      display: flex;
      gap: 24px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 28px;
    }

    .eyebrow,
    .reportMeta span,
    .statusCard small {
      color: #5b6670;
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
    }

    h1, h2, h3, p { margin: 0; }

    h1 {
      margin-top: 8px;
      font-size: 42px;
      line-height: 1.05;
    }

    .reportHero p,
    .passRateCard p {
      color: #5b6670;
      line-height: 1.45;
    }

    .reportHero p { margin-top: 12px; font-size: 16px; }

    .printButton {
      border: 0;
      border-radius: 8px;
      padding: 14px 18px;
      background: #ff8755;
      color: #111318;
      font-size: 15px;
      font-weight: 900;
      cursor: pointer;
    }

    .reportMeta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 18px;
      padding: 18px;
    }

    .reportMeta div,
    .passRateCard,
    .statusCard {
      border-radius: 10px;
      padding: 14px;
      background: #f8fbfc;
    }

    .reportMeta div { background: #eef7fa; }

    .reportMeta strong {
      display: block;
      margin-top: 6px;
      font-size: 22px;
    }

    .reportSummary {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      gap: 18px;
      margin-top: 18px;
      padding: 18px;
    }

    .passRateCard {
      display: grid;
      justify-items: center;
      gap: 12px;
      text-align: center;
    }

    .passRateSvg {
      width: 154px;
      height: 154px;
    }

    .donutTrack,
    .donutFill {
      fill: none;
      stroke-width: 14;
    }

    .donutTrack {
      stroke: #dce8ec;
    }

    .donutFill {
      stroke: #22a447;
      stroke-linecap: round;
      transform: rotate(-90deg);
      transform-origin: 60px 60px;
    }

    .passRateSvg text {
      fill: #111318;
      font-size: 28px;
      font-weight: 900;
    }

    .statusCards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .statusCard {
      border: 1px solid #d4e1e7;
    }

    .statusCard div:first-child {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .statusCard strong { font-size: 24px; }

    .reportBarSvg {
      display: block;
      width: 100%;
      height: 10px;
      margin: 12px 0 8px;
    }

    .reportCategory {
      margin-top: 18px;
      overflow: hidden;
    }

    .categoryHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px;
      background: #eef7fa;
    }

    .categoryHeader h2 { font-size: 22px; }

    .categoryHeader span {
      border-radius: 999px;
      padding: 4px 10px;
      background: #ffffff;
      color: #5b6670;
      font-weight: 900;
    }

    .resultTableHeader,
    .resultMain {
      display: grid;
      grid-template-columns: 130px minmax(0, 1.15fr) 100px 110px minmax(0, 0.9fr) minmax(0, 0.7fr);
      gap: 12px;
      align-items: center;
    }

    .resultTableHeader {
      padding: 12px 18px;
      color: #5b6670;
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
    }

    .resultRow {
      border-top: 1px solid #d4e1e7;
      padding: 16px 18px;
      break-inside: avoid;
    }

    .resultMain strong,
    .caseId,
    .resultMain p {
      overflow-wrap: anywhere;
    }

    .resultMain p {
      color: #5b6670;
      font-size: 13px;
      line-height: 1.35;
      white-space: pre-wrap;
    }

    .caseId {
      color: #5b6670;
      font-weight: 900;
    }

    .priority,
    .status {
      width: fit-content;
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }

    .priority { background: #fed7aa; }
    .status { color: #ffffff; }
    .NOT_RUN { background: #94a3b8; }
    .PASS { background: #22a447; }
    .FAIL { background: #e21b2d; }
    .BLOCKED { background: #f2a100; }
    .SKIPPED { background: #68717c; }

    @media (max-width: 780px) {
      .reportHero,
      .reportSummary {
        display: grid;
        grid-template-columns: 1fr;
      }

      .reportMeta,
      .statusCards,
      .resultTableHeader,
      .resultMain {
        grid-template-columns: 1fr;
      }
    }

    @media print {
      @page {
        size: A4;
        margin: 10mm;
      }

      :root,
      body {
        background: #ffffff;
        font-size: 11px;
      }

      .reportPage {
        width: 100%;
        padding: 0;
      }

      .reportHero,
      .reportMeta,
      .reportSummary,
      .reportCategory {
        border-radius: 7px;
        box-shadow: none;
      }

      .reportHero {
        gap: 12px;
        padding: 12px 14px;
      }

      .eyebrow,
      .reportMeta span,
      .statusCard small {
        font-size: 9px;
      }

      h1 {
        margin-top: 4px;
        font-size: 24px;
        line-height: 1.1;
      }

      .reportHero p {
        margin-top: 4px;
        font-size: 10px;
        line-height: 1.3;
      }

      .printButton {
        display: none;
      }

      .reportMeta {
        gap: 6px;
        margin-top: 7px;
        padding: 7px;
      }

      .reportMeta div,
      .passRateCard,
      .statusCard {
        border-radius: 6px;
        padding: 7px;
      }

      .reportMeta strong {
        margin-top: 2px;
        font-size: 15px;
      }

      .reportSummary {
        grid-template-columns: 150px minmax(0, 1fr);
        gap: 7px;
        margin-top: 7px;
        padding: 7px;
      }

      .passRateCard {
        gap: 5px;
      }

      .passRateSvg {
        width: 82px;
        height: 82px;
      }

      .donutTrack,
      .donutFill {
        stroke-width: 10;
      }

      .passRateSvg text {
        font-size: 22px;
      }

      .passRateCard h2 {
        font-size: 13px;
      }

      .passRateCard p {
        font-size: 10px;
        line-height: 1.25;
      }

      .statusCards {
        gap: 6px;
      }

      .statusCard strong {
        font-size: 14px;
      }

      .reportBarSvg {
        height: 6px;
        margin: 5px 0 3px;
      }

      .reportCategory {
        margin-top: 8px;
      }

      .categoryHeader {
        gap: 8px;
        padding: 8px 10px;
      }

      .categoryHeader h2 {
        font-size: 14px;
      }

      .categoryHeader span {
        padding: 2px 7px;
        font-size: 10px;
      }

      .resultTableHeader,
      .resultMain {
        grid-template-columns: 66px minmax(0, 1fr) 48px 56px minmax(0, 0.7fr) minmax(0, 0.45fr);
        gap: 5px;
      }

      .resultTableHeader {
        padding: 4px 8px;
        font-size: 7px;
      }

      .resultRow {
        padding: 4px 8px;
      }

      .resultMain strong {
        font-size: 9px;
        line-height: 1.15;
      }

      .caseId {
        font-size: 8px;
      }

      .priority,
      .status {
        padding: 2px 5px;
        font-size: 7px;
      }

      .resultMain p {
        font-size: 8px;
        line-height: 1.18;
      }
    }
  `;
}

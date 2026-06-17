import { api } from "./api.js";
import {
  escapeCsvValue,
  escapeHtml,
  getCsvValue,
  normalizeCsvHeader,
  parseCsv,
} from "./utils.js";

let pendingCsvImportCases = [];

function buildCsvImportPreview(rows, testCases) {
  const preview = {
    testCases: [],
    errors: [],
    warnings: [],
  };
  if (rows.length < 2) {
    preview.errors.push("CSV must include a header row and at least one data row.");
    return preview;
  }

  const headers = rows[0].map(normalizeCsvHeader);
  const seenTestIds = new Set();
  const existingTestIds = new Set(
    testCases
      .map((testCase) => testCase.test_id)
      .filter(Boolean)
      .map((testId) => testId.toLowerCase())
  );

  rows.slice(1).forEach((row, rowIndex) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] || "";
    });

    const rowNumber = rowIndex + 2;
    const steps = getCsvValue(record, ["steps"]);
    const expectedResult = getCsvValue(record, ["expected_result", "expected result"]);
    const testId = getCsvValue(record, ["test_id", "test id"]);
    const title = getCsvValue(record, ["title"]);
    const priority = getCsvValue(record, ["priority"], "Medium");
    const normalizedPriority = ["Critical", "High", "Medium", "Low"].includes(priority)
      ? priority
      : "Medium";

    if (!title) {
      preview.errors.push(`Row ${rowNumber}: title is required.`);
      return;
    }

    if (!["Critical", "High", "Medium", "Low"].includes(priority)) {
      preview.warnings.push(`Row ${rowNumber}: unknown priority "${priority}", using Medium.`);
    }

    if (testId) {
      const testIdKey = testId.toLowerCase();
      if (seenTestIds.has(testIdKey)) {
        preview.warnings.push(`Row ${rowNumber}: duplicate Test ID "${testId}" in this CSV.`);
      }
      if (existingTestIds.has(testIdKey)) {
        preview.warnings.push(`Row ${rowNumber}: Test ID "${testId}" already exists.`);
      }
      seenTestIds.add(testIdKey);
    }

    preview.testCases.push({
      test_id: testId,
      category: getCsvValue(record, ["category"]),
      title,
      priority: normalizedPriority,
      steps,
      expected_result: expectedResult,
      case_steps:
        steps || expectedResult
          ? [{ step_text: steps, expected_result: expectedResult }]
          : [],
      test_data: getCsvValue(record, ["test_data", "test data"]),
    });
  });

  if (!preview.testCases.length && !preview.errors.length) {
    preview.errors.push("No valid test cases found in CSV.");
  }

  return preview;
}

export async function previewTestCasesFromCsv(elements, testCases, showToast) {
  const file = elements.caseCsvFile.files[0];
  if (!file) {
    showToast("Choose a CSV file first");
    return;
  }

  try {
    const text = await file.text();
    const preview = buildCsvImportPreview(parseCsv(text), testCases);
    pendingCsvImportCases = preview.errors.length ? [] : preview.testCases;
    renderCsvImportPreview(elements, preview);
  } catch (error) {
    showToast(error.message);
  }
}

function renderCsvImportPreview(elements, preview) {
  if (!elements.csvPreviewModal || !elements.csvPreviewPanel || !elements.csvImportActions) {
    return;
  }

  elements.csvPreviewModal.hidden = false;
  elements.csvImportActions.hidden = Boolean(preview.errors.length);
  const sampleRows = preview.testCases.slice(0, 20);
  elements.csvPreviewPanel.innerHTML = `
    <div class="previewSummary">
      <strong>${preview.testCases.length} valid case(s)</strong>
      <span>${preview.errors.length} error(s)</span>
      <span>${preview.warnings.length} warning(s)</span>
    </div>
    ${preview.errors.length ? renderPreviewMessages("Errors", preview.errors, "error") : ""}
    ${preview.warnings.length ? renderPreviewMessages("Warnings", preview.warnings, "warning") : ""}
    ${
      sampleRows.length
        ? `
          <div class="previewTable">
            <div class="previewTableHeader">
              <span>Test ID</span>
              <span>Title</span>
              <span>Category</span>
              <span>Priority</span>
            </div>
            ${sampleRows
              .map(
                (testCase) => `
                  <div class="previewTableRow">
                    <span>${escapeHtml(testCase.test_id || "No Test ID")}</span>
                    <span>${escapeHtml(testCase.title)}</span>
                    <span>${escapeHtml(testCase.category || "Uncategorized")}</span>
                    <span>${escapeHtml(testCase.priority)}</span>
                  </div>
                `
              )
              .join("")}
          </div>
        `
        : ""
    }
  `;
}

function renderPreviewMessages(title, messages, type) {
  return `
    <div class="previewMessages ${type}">
      <strong>${title}</strong>
      <ul>
        ${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}
      </ul>
    </div>
  `;
}

export async function confirmCsvImport(elements, showToast, refreshData) {
  if (!pendingCsvImportCases.length) {
    showToast("Preview a valid CSV first");
    return;
  }

  const result = await api("/test-cases/bulk", {
    method: "POST",
    body: JSON.stringify({ test_cases: pendingCsvImportCases }),
  });
  clearCsvPreview(elements);
  elements.caseCsvFile.value = "";
  showToast(`Imported ${result.created_count} test case(s)`);
  await refreshData();
}

export function clearCsvPreview(elements) {
  pendingCsvImportCases = [];
  if (elements.csvPreviewModal) {
    elements.csvPreviewModal.hidden = true;
  }
  if (elements.csvPreviewPanel) {
    elements.csvPreviewPanel.innerHTML = "";
  }
  if (elements.csvImportActions) {
    elements.csvImportActions.hidden = true;
  }
}

export function downloadCsvTemplate() {
  const rows = [
    ["test_id", "category", "title", "priority", "steps", "expected_result", "test_data"],
    [
      "TC-PWR-001",
      "Hardware",
      "Verify Power On/Off Function",
      "Critical",
      "Press the power button",
      "Device powers on/off successfully",
      "N/A",
    ],
  ];
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mini-testrail-test-cases-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

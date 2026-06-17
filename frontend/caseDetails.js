import { escapeHtml } from "./utils.js";

export function getDisplaySteps(testCase) {
  if (testCase.case_steps?.length) {
    return testCase.case_steps;
  }

  if (testCase.steps || testCase.expected_result) {
    return [
      {
        step_text: testCase.steps || "",
        expected_result: testCase.expected_result || "",
      },
    ];
  }

  return [];
}

export function renderStepsTable(caseSteps) {
  if (!caseSteps.length) {
    return "<p>No steps</p>";
  }

  return `
    <div class="stepsTable">
      <div class="stepsTableHeader">
        <span>#</span>
        <span>Step</span>
        <span>Expected Result</span>
      </div>
      ${caseSteps
        .map(
          (step, index) => `
            <div class="stepsTableRow">
              <span>${index + 1}</span>
              <p>${escapeHtml(step.step_text || "No step")}</p>
              <p>${escapeHtml(step.expected_result || "No expected result")}</p>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

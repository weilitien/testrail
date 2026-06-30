# Mini TestRail

A beginner-friendly full-stack TestRail-like web app using FastAPI, PostgreSQL for Docker Compose, SQLite fallback for simple manual runs, and plain HTML/CSS/JavaScript.

The app has three main workspaces:

- `Test Cases`: manage reusable test cases.
- `Test Suites`: manage reusable groups of test cases.
- `Executions`: create test runs, update results, and review history.

## Tech Stack

- Backend: FastAPI
- Database: PostgreSQL in Docker Compose, SQLite fallback for simple manual local runs
- Frontend: plain HTML, CSS, JavaScript
- Backend deployment target: Railway
- Frontend deployment target: Netlify

## Features

### Test Cases

- Create test cases
- Edit test cases
- Duplicate test cases
- Retire test cases without deleting historical execution results
- Show and restore retired test cases
- Import test cases from CSV
- Preview CSV imports before confirming
- Automatic test case version number updates when a test case is edited
- Create, rename, and delete categories
- Search test cases by Test ID, title, or category
- Filter test cases by priority
- Browse test cases by managed Category tree
- View selected test case details in a detail panel

Test cases include:

- Test ID
- Category
- Title
- Priority
- Step rows with Step and Expected Result
- Test Data

### Test Suites

- Create reusable test suites
- Edit test suite name and description
- Add or remove test cases from a suite with searchable, category-grouped checkboxes
- Review suite contents in the left-side suite tree before saving
- Add or remove suite cases directly from the checkbox picker
- Browse suites from the left-side suite tree
- View selected suite contents in the left-side tree, grouped by category
- Delete test suites without deleting the original test cases

### Executions

- Create executions by selecting test cases from a checkbox list
- Create executions faster by applying a Test Suite to preselect its test cases
- Create a rerun from an existing execution with a new name and description
- Filter and select execution test cases by category
- Execution names must be unique
- Delete executions
- Add more test cases into an existing execution with search, category filter, and grouped checkboxes
- Browse executions from a left-side execution list
- View execution pass rate, multi-status donut chart, and status breakdown
- Analyze failed execution results by category in Run Summary
- Export execution reports with the same multi-status summary donut
- Filter execution results by search, status, and priority
- Review execution results grouped by category with expandable sections
- Bulk update execution results selected from the left-side execution tree
- Select one result from the left-side execution tree and edit it in the `Selected Result` panel
- View the frozen test case version used by each execution result
- See when the original reusable test case for an execution result has been retired
- Update result status: `NOT_RUN`, `PASS`, `FAIL`, `BLOCKED`, `SKIPPED`
- Add actual result notes
- View execution history

The frontend does not display internal database IDs for executions or test cases. It shows user-facing names and Test IDs instead.

The UI uses one unified left sidebar with icon-supported tree-style workspace navigation and the current page's list or tree. The right side stays focused on the selected item's detail, editor, and related actions.

### Test Case Versioning

Executions use frozen test case snapshots.

When a test case is edited, its `current_version` increases. Existing executions keep the test case title, priority, steps, expected result, test data, and version that were captured when the execution item was created. This prevents old test results from silently changing when the reusable test case is updated later.

## Current UI

### Test Cases Page

Open:

```text
http://localhost:5173/index.html
```

Layout:

- Left sidebar: workspace navigation and searchable test case tree grouped by category, with a clear selected-case highlight
- Main panel: category manager, search filters including retired-case visibility, create/edit/restore test case tools, selected test case detail, and CSV import

### Executions Page

Open:

```text
http://localhost:5173/executions.html
```

Layout:

- Left sidebar: workspace navigation and execution tree. The selected execution expands to show its test cases and result statuses
- Main panel: execution search, create execution action, selected execution detail, rerun form, run summary shortcut, report export, add/bulk tools, and focused selected result editor
- The first execution is selected automatically when the page opens
- Bottom of the main panel: history
- Create execution opens in the main panel with selectable test cases
- Selected result detail shows the frozen test case version used for that run

### Test Suites Page

Open:

```text
http://localhost:5173/suites.html
```

Layout:

- Left sidebar: workspace navigation and test suite tree. The selected suite expands to show its test cases grouped by category
- Main panel: suite search, create/edit form, and add/remove test case controls
- Test case picker: searchable and grouped by category
- Selected suite cases: checked items in the picker; uncheck to remove before saving

## Project Structure

```text
backend/
  Dockerfile
  database.py
  main.py
  requirements.txt
  Procfile
  railway.json
  runtime.txt
  routers/
    categories.py
    executions.py
    test_cases.py
    test_suites.py
  schemas.py
  services.py
frontend/
  Dockerfile
  index.html
  suites.html
  executions.html
  styles.css
  app.js
  api.js
  caseBrowser.js
  caseDetails.js
  checklists.js
  config.js
  csvImport.js
  dom.js
  executions.js
  env.js
  reports.js
  suites.js
  testCaseActions.js
  testCaseForm.js
  treeUi.js
  utils.js
  nginx.conf
  netlify.toml
  styles/
    base.css
    components.css
    checklists.css
    layout.css
    overlays.css
    reports.css
    responsive.css
    sidebar.css
    suites.css
    executions.css
    test-cases.css
  assets/
    app-icon.jpg
    icon-test-case.svg
    icon-test-execution.svg
    icon-test-suite.svg
docker-compose.yml
.env.example
```

## Run Locally

### Docker Quick Start

Prerequisite:

- Docker Desktop or Docker Engine with Docker Compose v2

Run the full app with one command:

```bash
docker compose up --build
```

Then open:

```text
http://localhost:5173/index.html
```

Services:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- PostgreSQL: `localhost:5432`
- PostgreSQL data volume: `postgres_data`

Check running containers:

```bash
docker compose ps
```

Check backend health:

```bash
curl http://localhost:8000/
```

Expected response:

```json
{"message":"Mini TestRail API is running"}
```

Stop the app:

```bash
docker compose down
```

Remove the Docker PostgreSQL volume if you want a clean database:

```bash
docker compose down -v
```

Docker Compose waits for the backend healthcheck before starting the frontend container. Both containers also expose health status in `docker compose ps`.

### Docker Troubleshooting

If the frontend shows `ERR_CONNECTION_REFUSED` for `localhost:8000`, check whether the backend is healthy:

```bash
docker compose ps
docker compose logs backend
```

If ports are already in use, stop the process using port `5173` or `8000`, or edit the left side of the port mapping in `docker-compose.yml`.

Example:

```yaml
ports:
  - "5174:80"
```

Then open:

```text
http://localhost:5174/index.html
```

If the app starts but old local data looks wrong, reset the Docker PostgreSQL volume:

```bash
docker compose down -v
docker compose up --build
```

### Manual Local Run

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at:

```text
http://localhost:8000
```

Manual backend runs use SQLite by default. Set `DATABASE_URL` if you want to connect the backend to PostgreSQL outside Docker.

### Backend Tests

Install the development test dependency once:

```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt
```

Run the backend tests from the repo root:

```bash
backend/.venv/bin/python -m pytest backend/tests
```

Run the PostgreSQL smoke test against the Docker database:

```bash
POSTGRES_TEST_DATABASE_URL="postgresql+psycopg://mini_testrail:mini_testrail_password@localhost:5432/mini_testrail" \
  backend/.venv/bin/python -m pytest backend/tests -m postgres
```

The PostgreSQL smoke test clears the configured test database tables before it runs.

### Frontend

Serve the frontend folder:

```bash
cd frontend
python3 -m http.server 5173
```

Then open:

```text
http://localhost:5173/index.html
```

If port `5173` is already in use, choose another port:

```bash
python3 -m http.server 5174
```

Then open:

```text
http://localhost:5174/index.html
```

## Deploy

### Railway Backend

1. Create a Railway project from this repo.
2. Set the Railway service root directory to `backend`.
3. Railway will install `requirements.txt` and run the command in `railway.json`.
4. Set `FRONTEND_ORIGIN` to your Netlify URL after deploying the frontend.

Optional environment variables:

- `DATABASE_URL`: PostgreSQL connection string. If omitted, the backend uses local SQLite.
- `DATABASE_PATH`: SQLite database path for manual local fallback. Defaults to `testrail.db`.
- `FRONTEND_ORIGIN`: allowed frontend origin for CORS. Defaults to `*`.

### Netlify Frontend

1. Create a Netlify site from this repo.
2. Set the base directory to `frontend`.
3. Set the publish directory to `frontend` if Netlify asks from the repo root.
4. Update `frontend/env.js` so `API_BASE` points to your Railway backend URL.

Example:

```js
window.API_BASE = "https://your-api.up.railway.app";
```

## API Endpoints

### Health Check

- `GET /`

### Test Cases

- `GET /test-cases`
- `GET /test-cases?include_retired=true`
- `POST /test-cases`
- `POST /test-cases/bulk`
- `PUT /test-cases/{test_case_id}`
- `POST /test-cases/{test_case_id}/restore`
- `POST /test-cases/{test_case_id}/duplicate`
- `DELETE /test-cases/{test_case_id}`

### Categories

- `GET /categories`
- `POST /categories`
- `PUT /categories/{category_id}`
- `DELETE /categories/{category_id}`

### Test Suites

- `GET /test-suites`
- `POST /test-suites`
- `GET /test-suites/{suite_id}`
- `PUT /test-suites/{suite_id}`
- `DELETE /test-suites/{suite_id}`

### Executions

- `GET /executions`
- `POST /executions`
- `GET /executions/{execution_id}`
- `DELETE /executions/{execution_id}`
- `POST /executions/{execution_id}/rerun`
- `POST /executions/{execution_id}/test-cases`
- `PATCH /execution-items/bulk`
- `PATCH /execution-items/{item_id}`
- `GET /executions/{execution_id}/history`

## API Examples

### Create a Category

```json
{
  "name": "Hardware"
}
```

Category names must be unique. If a duplicate name is submitted, the API returns:

```json
{
  "detail": "Category name already exists"
}
```

### Create a Test Case

```json
{
  "test_id": "TC-PWR-001",
  "category": "Hardware",
  "title": "Verify Power On/Off Function",
  "priority": "Critical",
  "case_steps": [
    {
      "step_text": "Press the power button",
      "expected_result": "Device powers on/off successfully"
    }
  ],
  "test_data": "N/A"
}
```

### Bulk Import Test Cases

```json
{
  "test_cases": [
    {
      "test_id": "TC-PWR-001",
      "category": "Hardware",
      "title": "Verify Power On/Off Function",
      "priority": "Critical",
      "case_steps": [
        {
          "step_text": "Press the power button",
          "expected_result": "Device powers on/off successfully"
        }
      ],
      "test_data": "N/A"
    }
  ]
}
```

### CSV Import Format

CSV import supports these headers:

```csv
test_id,category,title,priority,steps,expected_result,test_data
TC-PWR-001,Hardware,Verify Power On/Off Function,Critical,Press the power button,Device powers on/off successfully,N/A
```

Display-style headers like `Test ID`, `Category`, `Expected Result`, and `Test Data` also work.
CSV `steps` and `expected_result` values are imported as the first structured step row.
The Test Cases page also provides a `Download Template` button and a modal preview step before import. Preview checks required titles, unknown priorities, and duplicate Test IDs.

### Create an Execution

```json
{
  "name": "Regression Run",
  "description": "Release verification",
  "test_case_ids": [1, 2, 3]
}
```

The backend creates the execution and related execution items in one request. Each new result starts with `NOT_RUN`.
Each execution item stores a snapshot of the selected test case at creation time.

Execution names must be unique. If a duplicate name is submitted, the API returns:

```json
{
  "detail": "Execution name already exists"
}
```

### Rerun an Execution

```json
{
  "name": "Regression Run - Round 2",
  "description": "Second pass after fixes"
}
```

The backend creates a new execution from the source execution's test cases. New results start with `NOT_RUN`, actual result notes are empty, and snapshots are captured from the current active reusable test cases.
Retired source test cases are skipped and reported in `skipped_retired_count`.

### Update an Execution Result

```json
{
  "status": "PASS",
  "actual_result": "The device powered on and the LED changed state correctly."
}
```

Every result update is saved into execution history.

### Bulk Update Execution Results

```json
{
  "item_ids": [1, 2, 3],
  "status": "PASS",
  "actual_result": "Passed during smoke verification."
}
```

Bulk updates also write one history entry per updated result.

## Notes

- Docker Compose uses PostgreSQL.
- Manual local backend runs use SQLite unless `DATABASE_URL` is set.
- SQLite foreign keys are enabled when using the SQLite fallback.
- If an older local SQLite database still has retired Feature/Sub Feature columns, the backend clears and rebuilds the local SQLite tables on startup.
- Deleting a category does not delete test cases. Related test cases become Uncategorized.
- Retiring a test case hides it from active reusable test case lists. Existing execution results and history keep their frozen snapshots.
- Deleting an execution also removes its results and history.
- Existing executions keep frozen test case snapshots. Editing a reusable test case does not rewrite historical execution results.
- The frontend is intentionally plain HTML/CSS/JavaScript with native ES modules, so no build step is required.

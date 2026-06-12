# Mini TestRail

A beginner-friendly full-stack TestRail-like web app using FastAPI, SQLite, and plain HTML/CSS/JavaScript.

The app has two main workspaces:

- `Test Cases`: manage reusable test cases.
- `Executions`: create test runs, update results, and review history.

## Tech Stack

- Backend: FastAPI
- Database: SQLite
- Frontend: plain HTML, CSS, JavaScript
- Backend deployment target: Railway
- Frontend deployment target: Netlify

## Features

### Test Cases

- Create test cases
- Edit test cases
- Duplicate test cases
- Delete test cases
- Import test cases from CSV
- Search test cases by Test ID, title, or category
- Filter test cases by priority
- Browse test cases by auto-generated Category tree
- View selected test case details in a detail panel

Test cases include:

- Test ID
- Category
- Title
- Priority
- Steps
- Expected Result
- Test Data

### Executions

- Create executions by selecting test cases from a checkbox list
- Execution names must be unique
- Delete executions
- Add more test cases into an existing execution
- Browse executions from a left-side execution list
- View execution pass rate and status chart
- Filter execution results by search, status, and priority
- Select one result from `Tests & Results` and edit it in the `Selected Result` panel
- Update result status: `NOT_RUN`, `PASS`, `FAIL`, `BLOCKED`, `SKIPPED`
- Add actual result notes
- View execution history

The frontend does not display internal database IDs for executions or test cases. It shows user-facing names and Test IDs instead.

## Current UI

### Test Cases Page

Open:

```text
http://localhost:5173/index.html
```

Layout:

- Left: Category tree
- Center: searchable and filterable test case list
- Right: selected test case detail, create/edit form, and CSV import

### Executions Page

Open:

```text
http://localhost:5173/executions.html
```

Layout:

- Left: execution list
- Center: selected execution detail, run summary, tests and results, selected result editor, and history
- Right: collapsible create execution form with selectable test cases

## Project Structure

```text
backend/
  main.py
  requirements.txt
  Procfile
  railway.json
  runtime.txt
frontend/
  index.html
  executions.html
  styles.css
  app.js
  netlify.toml
  assets/
    app-icon.jpg
```

## Run Locally

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

- `DATABASE_PATH`: SQLite database path. Defaults to `testrail.db`.
- `FRONTEND_ORIGIN`: allowed frontend origin for CORS. Defaults to `*`.

### Netlify Frontend

1. Create a Netlify site from this repo.
2. Set the base directory to `frontend`.
3. Set the publish directory to `frontend` if Netlify asks from the repo root.
4. Update `frontend/app.js` so `API_BASE` points to your Railway backend URL.

Example:

```js
const API_BASE = "https://your-api.up.railway.app";
```

## API Endpoints

### Health Check

- `GET /`

### Test Cases

- `GET /test-cases`
- `POST /test-cases`
- `POST /test-cases/bulk`
- `PUT /test-cases/{test_case_id}`
- `POST /test-cases/{test_case_id}/duplicate`
- `DELETE /test-cases/{test_case_id}`

### Executions

- `GET /executions`
- `POST /executions`
- `GET /executions/{execution_id}`
- `DELETE /executions/{execution_id}`
- `POST /executions/{execution_id}/test-cases`
- `PATCH /execution-items/{item_id}`
- `GET /executions/{execution_id}/history`

## API Examples

### Create a Test Case

```json
{
  "test_id": "TC-PWR-001",
  "category": "Hardware",
  "title": "Verify Power On/Off Function",
  "priority": "Critical",
  "steps": "Press the power button",
  "expected_result": "Device powers on/off successfully",
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
      "steps": "Press the power button",
      "expected_result": "Device powers on/off successfully",
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

### Create an Execution

```json
{
  "name": "Regression Run",
  "description": "Release verification",
  "test_case_ids": [1, 2, 3]
}
```

The backend creates the execution and related execution items in one request. Each new result starts with `NOT_RUN`.

Execution names must be unique. If a duplicate name is submitted, the API returns:

```json
{
  "detail": "Execution name already exists"
}
```

### Update an Execution Result

```json
{
  "status": "PASS",
  "actual_result": "The device powered on and the LED changed state correctly."
}
```

Every result update is saved into execution history.

## Notes

- SQLite foreign keys are enabled in the backend.
- If an older local database still has retired Feature/Sub Feature columns, the backend clears and rebuilds the local SQLite tables on startup.
- Deleting a test case also removes related execution items and history through cascading deletes.
- Deleting an execution also removes its results and history.
- The frontend is intentionally plain HTML/CSS/JavaScript, so no build step is required.

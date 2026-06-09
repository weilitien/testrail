# Mini TestRail

A beginner-friendly full-stack TestRail-like app using FastAPI, SQLite, and plain HTML/CSS/JavaScript.

## Features

- Create and list test cases
- Delete test cases
- Create test executions by selecting test cases
- Delete test executions
- Add selected test cases into an execution
- Update result status: `NOT_RUN`, `PASS`, `FAIL`, `BLOCKED`, `SKIPPED`
- Add actual result notes
- View execution history
- View execution detail and pass rate

Test cases include:

- Test ID
- Feature
- Sub Feature
- Title
- Priority
- Steps
- Expected Result
- Test Data

## Project Structure

```text
backend/
  main.py
  requirements.txt
  Procfile
  railway.json
frontend/
  index.html
  styles.css
  app.js
  netlify.toml
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

The API runs at `http://localhost:8000`.

### Frontend

Open `frontend/index.html` in your browser, or serve it with:

```bash
cd frontend
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

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

- `GET /test-cases`
- `POST /test-cases`
- `DELETE /test-cases/{test_case_id}`
- `GET /executions`
- `POST /executions`
- `GET /executions/{execution_id}`
- `DELETE /executions/{execution_id}`
- `POST /executions/{execution_id}/test-cases`
- `PATCH /execution-items/{item_id}`
- `GET /executions/{execution_id}/history`

Create an execution with selected test cases:

```json
{
  "name": "Regression Run",
  "description": "Release verification",
  "test_case_ids": [1, 2, 3]
}
```

The backend creates the execution and its related execution items in one request. Each new item starts with `NOT_RUN`.

Create a test case:

```json
{
  "test_id": "TC-PWR-001",
  "feature": "Power",
  "sub_feature": "Power Button",
  "title": "Verify Power On/Off Function",
  "priority": "Critical",
  "steps": "Press the power button",
  "expected_result": "Device powers on/off successfully",
  "test_data": "N/A"
}
```

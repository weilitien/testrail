import json
import sqlite3

from database import engine, get_db, now_iso, row_to_dict
from schemas import Status, TestCaseCreate


def reset_legacy_category_schema(conn: sqlite3.Connection) -> None:
    """Clear old local data when the app finds the retired feature columns."""
    if engine:
        return

    existing_table = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'test_cases'"
    ).fetchone()
    if not existing_table:
        return

    columns = conn.execute("PRAGMA table_info(test_cases)").fetchall()
    column_names = {column["name"] for column in columns}
    if "feature" not in column_names and "sub_feature" not in column_names:
        return

    conn.executescript(
        """
        DROP TABLE IF EXISTS execution_history;
        DROP TABLE IF EXISTS execution_items;
        DROP TABLE IF EXISTS executions;
        DROP TABLE IF EXISTS test_suite_cases;
        DROP TABLE IF EXISTS test_suites;
        DROP TABLE IF EXISTS test_case_steps;
        DROP TABLE IF EXISTS test_cases;
        DROP TABLE IF EXISTS categories;
        """
    )


def init_db() -> None:
    """Create tables if this is the first run of the app."""
    with get_db() as conn:
        reset_legacy_category_schema(conn)
        if engine:
            schema = """
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS test_cases (
                id SERIAL PRIMARY KEY,
                test_id TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL,
                priority TEXT NOT NULL DEFAULT 'Medium',
                steps TEXT NOT NULL DEFAULT '',
                expected_result TEXT NOT NULL DEFAULT '',
                test_data TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                current_version INTEGER NOT NULL DEFAULT 1,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                deleted_at TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS test_case_steps (
                id SERIAL PRIMARY KEY,
                test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
                step_order INTEGER NOT NULL,
                step_text TEXT NOT NULL DEFAULT '',
                expected_result TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS executions (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                version TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS test_suites (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS test_suite_cases (
                id SERIAL PRIMARY KEY,
                suite_id INTEGER NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
                test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
                position INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                UNIQUE (suite_id, test_case_id)
            );

            CREATE TABLE IF NOT EXISTS execution_items (
                id SERIAL PRIMARY KEY,
                execution_id INTEGER NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
                test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
                status TEXT NOT NULL DEFAULT 'NOT_RUN',
                actual_result TEXT NOT NULL DEFAULT '',
                snapshot_test_id TEXT NOT NULL DEFAULT '',
                snapshot_category TEXT NOT NULL DEFAULT '',
                snapshot_title TEXT NOT NULL DEFAULT '',
                snapshot_priority TEXT NOT NULL DEFAULT 'Medium',
                snapshot_steps TEXT NOT NULL DEFAULT '',
                snapshot_expected_result TEXT NOT NULL DEFAULT '',
                snapshot_test_data TEXT NOT NULL DEFAULT '',
                snapshot_case_steps TEXT NOT NULL DEFAULT '[]',
                snapshot_version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE (execution_id, test_case_id)
            );

            CREATE TABLE IF NOT EXISTS execution_history (
                id SERIAL PRIMARY KEY,
                execution_item_id INTEGER NOT NULL REFERENCES execution_items(id) ON DELETE CASCADE,
                execution_id INTEGER NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
                test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                actual_result TEXT NOT NULL DEFAULT '',
                changed_at TEXT NOT NULL
            );
            """
        else:
            schema = """
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS test_cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                test_id TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL,
                priority TEXT NOT NULL DEFAULT 'Medium',
                steps TEXT NOT NULL DEFAULT '',
                expected_result TEXT NOT NULL DEFAULT '',
                test_data TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                current_version INTEGER NOT NULL DEFAULT 1,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                deleted_at TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS test_case_steps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                test_case_id INTEGER NOT NULL,
                step_order INTEGER NOT NULL,
                step_text TEXT NOT NULL DEFAULT '',
                expected_result TEXT NOT NULL DEFAULT '',
                FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                version TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS test_suites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS test_suite_cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                suite_id INTEGER NOT NULL,
                test_case_id INTEGER NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (suite_id) REFERENCES test_suites(id) ON DELETE CASCADE,
                FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
                UNIQUE (suite_id, test_case_id)
            );

            CREATE TABLE IF NOT EXISTS execution_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id INTEGER NOT NULL,
                test_case_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'NOT_RUN',
                actual_result TEXT NOT NULL DEFAULT '',
                snapshot_test_id TEXT NOT NULL DEFAULT '',
                snapshot_category TEXT NOT NULL DEFAULT '',
                snapshot_title TEXT NOT NULL DEFAULT '',
                snapshot_priority TEXT NOT NULL DEFAULT 'Medium',
                snapshot_steps TEXT NOT NULL DEFAULT '',
                snapshot_expected_result TEXT NOT NULL DEFAULT '',
                snapshot_test_data TEXT NOT NULL DEFAULT '',
                snapshot_case_steps TEXT NOT NULL DEFAULT '[]',
                snapshot_version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE,
                FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
                UNIQUE (execution_id, test_case_id)
            );

            CREATE TABLE IF NOT EXISTS execution_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_item_id INTEGER NOT NULL,
                execution_id INTEGER NOT NULL,
                test_case_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                actual_result TEXT NOT NULL DEFAULT '',
                changed_at TEXT NOT NULL,
                FOREIGN KEY (execution_item_id) REFERENCES execution_items(id) ON DELETE CASCADE,
                FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE,
                FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
            );
            """
        conn.executescript(schema)
        ensure_execution_columns(conn)
        ensure_versioning_columns(conn)
        ensure_soft_delete_columns(conn)
        sync_categories_from_test_cases(conn)
        sync_steps_from_legacy_fields(conn)
        backfill_execution_item_snapshots(conn)


def get_table_columns(conn, table_name: str) -> set[str]:
    if engine:
        rows = conn.execute(
            """
            SELECT column_name AS name
            FROM information_schema.columns
            WHERE table_name = ?
            """,
            (table_name,),
        ).fetchall()
    else:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {row["name"] for row in rows}


def add_column_if_missing(conn, table_name: str, column_name: str, definition: str) -> None:
    if column_name in get_table_columns(conn, table_name):
        return

    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def ensure_versioning_columns(conn) -> None:
    """Add lightweight versioning columns for existing local/dev databases."""
    add_column_if_missing(
        conn,
        "test_cases",
        "current_version",
        "INTEGER NOT NULL DEFAULT 1",
    )

    snapshot_columns = {
        "snapshot_test_id": "TEXT NOT NULL DEFAULT ''",
        "snapshot_category": "TEXT NOT NULL DEFAULT ''",
        "snapshot_title": "TEXT NOT NULL DEFAULT ''",
        "snapshot_priority": "TEXT NOT NULL DEFAULT 'Medium'",
        "snapshot_steps": "TEXT NOT NULL DEFAULT ''",
        "snapshot_expected_result": "TEXT NOT NULL DEFAULT ''",
        "snapshot_test_data": "TEXT NOT NULL DEFAULT ''",
        "snapshot_case_steps": "TEXT NOT NULL DEFAULT '[]'",
        "snapshot_version": "INTEGER NOT NULL DEFAULT 1",
    }
    for column_name, definition in snapshot_columns.items():
        add_column_if_missing(conn, "execution_items", column_name, definition)


def ensure_execution_columns(conn) -> None:
    """Add run-level metadata columns for existing databases."""
    add_column_if_missing(
        conn,
        "executions",
        "version",
        "TEXT NOT NULL DEFAULT ''",
    )


def ensure_soft_delete_columns(conn) -> None:
    """Add lifecycle columns so test cases can be retired without losing history."""
    add_column_if_missing(
        conn,
        "test_cases",
        "is_deleted",
        "INTEGER NOT NULL DEFAULT 0",
    )
    add_column_if_missing(
        conn,
        "test_cases",
        "deleted_at",
        "TEXT NOT NULL DEFAULT ''",
    )


def normalize_category_name(name: str) -> str:
    """Keep category names consistent before saving them."""
    return " ".join(name.strip().split())


def ensure_category(conn: sqlite3.Connection, name: str) -> None:
    """Create a category if the user typed a new one in a test case form."""
    category_name = normalize_category_name(name)
    if not category_name:
        return

    existing = conn.execute(
        "SELECT id FROM categories WHERE lower(name) = lower(?)",
        (category_name,),
    ).fetchone()
    if existing:
        return

    conn.execute(
        "INSERT INTO categories (name, created_at) VALUES (?, ?)",
        (category_name, now_iso()),
    )


def sync_categories_from_test_cases(conn: sqlite3.Connection) -> None:
    """Backfill category records from existing test cases."""
    rows = conn.execute(
        """
        SELECT DISTINCT category
        FROM test_cases
        WHERE trim(category) != ''
        """
    ).fetchall()
    for row in rows:
        ensure_category(conn, row["category"])


def sync_steps_from_legacy_fields(conn: sqlite3.Connection) -> None:
    """Create one structured step for old test cases that only used text fields."""
    rows = conn.execute(
        """
        SELECT id, steps, expected_result
        FROM test_cases
        WHERE trim(steps) != '' OR trim(expected_result) != ''
        """
    ).fetchall()
    for row in rows:
        existing_step = conn.execute(
            "SELECT id FROM test_case_steps WHERE test_case_id = ? LIMIT 1",
            (row["id"],),
        ).fetchone()
        if existing_step:
            continue

        replace_test_case_steps(
            conn,
            row["id"],
            [
                {
                    "step_text": row["steps"],
                    "expected_result": row["expected_result"],
                }
            ],
        )


def normalize_case_steps(payload: TestCaseCreate) -> list[dict]:
    """Prefer structured steps, but support the older textarea fields."""
    step_rows = [
        {
            "step_text": step.step_text.strip(),
            "expected_result": step.expected_result.strip(),
        }
        for step in payload.case_steps
        if step.step_text.strip() or step.expected_result.strip()
    ]
    if step_rows:
        return step_rows

    if payload.steps.strip() or payload.expected_result.strip():
        return [
            {
                "step_text": payload.steps.strip(),
                "expected_result": payload.expected_result.strip(),
            }
        ]

    return []


def steps_to_legacy_text(case_steps: list[dict]) -> tuple[str, str]:
    """Store readable text summaries for older CSV/API clients."""
    steps = "\n".join(step["step_text"] for step in case_steps if step["step_text"])
    expected = "\n".join(
        step["expected_result"] for step in case_steps if step["expected_result"]
    )
    return steps, expected


def replace_test_case_steps(
    conn: sqlite3.Connection, test_case_id: int, case_steps: list[dict]
) -> None:
    conn.execute("DELETE FROM test_case_steps WHERE test_case_id = ?", (test_case_id,))
    for index, step in enumerate(case_steps, start=1):
        conn.execute(
            """
            INSERT INTO test_case_steps
                (test_case_id, step_order, step_text, expected_result)
            VALUES (?, ?, ?, ?)
            """,
            (
                test_case_id,
                index,
                step["step_text"],
                step["expected_result"],
            ),
        )


def get_test_case_steps(conn: sqlite3.Connection, test_case_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, test_case_id, step_order, step_text, expected_result
        FROM test_case_steps
        WHERE test_case_id = ?
        ORDER BY step_order, id
        """,
        (test_case_id,),
    ).fetchall()
    return [row_to_dict(row) for row in rows]


def attach_steps_to_test_case(conn: sqlite3.Connection, row: sqlite3.Row) -> dict:
    data = row_to_dict(row)
    data["case_steps"] = get_test_case_steps(conn, data["id"])
    return data


def serialize_case_steps(case_steps: list[dict]) -> str:
    return json.dumps(
        [
            {
                "step_text": step.get("step_text", ""),
                "expected_result": step.get("expected_result", ""),
            }
            for step in case_steps
        ]
    )


def parse_case_steps_snapshot(raw_steps: str) -> list[dict]:
    try:
        steps = json.loads(raw_steps or "[]")
    except json.JSONDecodeError:
        return []

    if not isinstance(steps, list):
        return []

    return [
        {
            "step_text": str(step.get("step_text", "")),
            "expected_result": str(step.get("expected_result", "")),
        }
        for step in steps
        if isinstance(step, dict)
    ]


def create_execution_item_from_snapshot(
    conn,
    execution_id: int,
    test_case_id: int,
    timestamp: str,
):
    """Add a test case to an execution using a frozen snapshot of its current data."""
    test_case = conn.execute(
        "SELECT * FROM test_cases WHERE id = ? AND is_deleted = 0",
        (test_case_id,),
    ).fetchone()
    if not test_case:
        return None

    case_steps = get_test_case_steps(conn, test_case_id)
    snapshot_steps = serialize_case_steps(case_steps)
    return conn.execute(
        """
        INSERT INTO execution_items (
            execution_id,
            test_case_id,
            status,
            actual_result,
            snapshot_test_id,
            snapshot_category,
            snapshot_title,
            snapshot_priority,
            snapshot_steps,
            snapshot_expected_result,
            snapshot_test_data,
            snapshot_case_steps,
            snapshot_version,
            created_at,
            updated_at
        )
        VALUES (?, ?, 'NOT_RUN', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (execution_id, test_case_id) DO NOTHING
        """,
        (
            execution_id,
            test_case_id,
            test_case["test_id"],
            test_case["category"],
            test_case["title"],
            test_case["priority"],
            test_case["steps"],
            test_case["expected_result"],
            test_case["test_data"],
            snapshot_steps,
            test_case["current_version"],
            timestamp,
            timestamp,
        ),
    )


def backfill_execution_item_snapshots(conn) -> None:
    """Populate snapshots for execution items created before versioning existed."""
    rows = conn.execute(
        """
        SELECT
            i.id AS execution_item_id,
            tc.id AS test_case_id,
            tc.test_id,
            tc.category,
            tc.title,
            tc.priority,
            tc.steps,
            tc.expected_result,
            tc.test_data,
            tc.current_version
        FROM execution_items i
        JOIN test_cases tc ON tc.id = i.test_case_id
        WHERE trim(i.snapshot_title) = ''
        """
    ).fetchall()

    for row in rows:
        case_steps = get_test_case_steps(conn, row["test_case_id"])
        conn.execute(
            """
            UPDATE execution_items
            SET
                snapshot_test_id = ?,
                snapshot_category = ?,
                snapshot_title = ?,
                snapshot_priority = ?,
                snapshot_steps = ?,
                snapshot_expected_result = ?,
                snapshot_test_data = ?,
                snapshot_case_steps = ?,
                snapshot_version = ?
            WHERE id = ?
            """,
            (
                row["test_id"],
                row["category"],
                row["title"],
                row["priority"],
                row["steps"],
                row["expected_result"],
                row["test_data"],
                serialize_case_steps(case_steps),
                row["current_version"],
                row["execution_item_id"],
            ),
        )


def find_missing_test_case_ids(conn: sqlite3.Connection, test_case_ids: list[int]) -> list[int]:
    """Return requested IDs that are missing or no longer active."""
    if not test_case_ids:
        return []

    placeholders = ",".join("?" for _ in test_case_ids)
    found_cases = conn.execute(
        f"""
        SELECT id
        FROM test_cases
        WHERE id IN ({placeholders}) AND is_deleted = 0
        """,
        test_case_ids,
    ).fetchall()
    found_ids = {row["id"] for row in found_cases}
    return sorted(set(test_case_ids) - found_ids)


def find_missing_execution_item_ids(conn, item_ids: list[int]) -> list[int]:
    if not item_ids:
        return []

    placeholders = ",".join("?" for _ in item_ids)
    found_items = conn.execute(
        f"SELECT id FROM execution_items WHERE id IN ({placeholders})",
        item_ids,
    ).fetchall()
    found_ids = {row["id"] for row in found_items}
    return sorted(set(item_ids) - found_ids)


def update_execution_item_result(
    conn, item_id: int, status: Status, actual_result: str, timestamp: str
):
    item = conn.execute(
        "SELECT * FROM execution_items WHERE id = ?", (item_id,)
    ).fetchone()
    if not item:
        return None

    conn.execute(
        """
        UPDATE execution_items
        SET status = ?, actual_result = ?, updated_at = ?
        WHERE id = ?
        """,
        (status, actual_result, timestamp, item_id),
    )
    conn.execute(
        """
        INSERT INTO execution_history
            (execution_item_id, execution_id, test_case_id, status, actual_result, changed_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            item_id,
            item["execution_id"],
            item["test_case_id"],
            status,
            actual_result,
            timestamp,
        ),
    )
    return conn.execute(
        "SELECT * FROM execution_items WHERE id = ?", (item_id,)
    ).fetchone()

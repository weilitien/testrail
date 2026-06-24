from fastapi import APIRouter, HTTPException

from database import get_db, now_iso, row_to_dict
from schemas import CategoryCreate
from services import normalize_category_name


router = APIRouter(tags=["categories"])


@router.get("/categories")
def list_categories():
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
                c.id,
                c.name,
                c.created_at,
                COUNT(tc.id) AS test_count
            FROM categories c
            LEFT JOIN test_cases tc
                ON lower(tc.category) = lower(c.name) AND tc.is_deleted = 0
            GROUP BY c.id
            ORDER BY lower(c.name)
            """
        ).fetchall()

    return [row_to_dict(row) for row in rows]


@router.post("/categories", status_code=201)
def create_category(payload: CategoryCreate):
    category_name = normalize_category_name(payload.name)
    if not category_name:
        raise HTTPException(status_code=400, detail="Category name is required")

    created_at = now_iso()
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM categories WHERE lower(name) = lower(?)",
            (category_name,),
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Category name already exists")

        cursor = conn.execute(
            "INSERT INTO categories (name, created_at) VALUES (?, ?)",
            (category_name, created_at),
        )
        category = conn.execute(
            """
            SELECT id, name, created_at, 0 AS test_count
            FROM categories
            WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return row_to_dict(category)


@router.put("/categories/{category_id}")
def update_category(category_id: int, payload: CategoryCreate):
    new_name = normalize_category_name(payload.name)
    if not new_name:
        raise HTTPException(status_code=400, detail="Category name is required")

    with get_db() as conn:
        category = conn.execute(
            "SELECT * FROM categories WHERE id = ?",
            (category_id,),
        ).fetchone()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

        duplicate = conn.execute(
            """
            SELECT id FROM categories
            WHERE lower(name) = lower(?) AND id != ?
            """,
            (new_name, category_id),
        ).fetchone()
        if duplicate:
            raise HTTPException(status_code=409, detail="Category name already exists")

        old_name = category["name"]
        conn.execute(
            "UPDATE categories SET name = ? WHERE id = ?",
            (new_name, category_id),
        )
        conn.execute(
            "UPDATE test_cases SET category = ? WHERE lower(category) = lower(?)",
            (new_name, old_name),
        )
        updated = conn.execute(
            """
            SELECT
                c.id,
                c.name,
                c.created_at,
                COUNT(tc.id) AS test_count
            FROM categories c
            LEFT JOIN test_cases tc
                ON lower(tc.category) = lower(c.name) AND tc.is_deleted = 0
            WHERE c.id = ?
            GROUP BY c.id
            """,
            (category_id,),
        ).fetchone()

    return row_to_dict(updated)


@router.delete("/categories/{category_id}")
def delete_category(category_id: int):
    with get_db() as conn:
        category = conn.execute(
            "SELECT * FROM categories WHERE id = ?",
            (category_id,),
        ).fetchone()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

        conn.execute(
            "UPDATE test_cases SET category = '' WHERE lower(category) = lower(?)",
            (category["name"],),
        )
        conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))

    return {"message": "Category deleted", "id": category_id}

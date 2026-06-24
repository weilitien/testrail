from __future__ import annotations

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import categories, executions, test_cases, test_suites
from services import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Mini TestRail API", version="1.0.0", lifespan=lifespan)

# Set FRONTEND_ORIGIN on Railway to your Netlify URL in production.
allowed_origins = os.getenv("FRONTEND_ORIGIN", "*").split(",")
allow_credentials = "*" not in allowed_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    return {"message": "Mini TestRail API is running"}


app.include_router(categories.router)
app.include_router(test_cases.router)
app.include_router(test_suites.router)
app.include_router(executions.router)

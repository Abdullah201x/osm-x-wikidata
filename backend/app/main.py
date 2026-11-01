"""
Main FastAPI Application Entrypoint for osmwd-api.
Stateless, memory-capped, rate-limited backend for reverse QA and edit validation.
"""

from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded

from app.config import ALLOWED_ORIGINS, USER_AGENT
from app.limiter import limiter, get_real_client_ip  # noqa: F401 (re-exported)
from app.store import DatasetStore
from app.routers import reverse, verify, preview, healthz

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load static datasets into memory store
    app.state.store = DatasetStore()
    app.state.http_client = httpx.AsyncClient(
        timeout=10.0,
        headers={"User-Agent": USER_AGENT}
    )
    yield
    # Shutdown: Close HTTP client
    await app.state.http_client.aclose()

app = FastAPI(
    title="OSM x Wikidata GCC Linker API",
    description="High-speed reverse analysis and edit validation API for OpenStreetMap and Wikidata",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "HEAD", "OPTIONS"],
    allow_headers=["*"],
)

# Attach Routers
app.include_router(reverse.router)
app.include_router(verify.router)
app.include_router(preview.router)
app.include_router(healthz.router)


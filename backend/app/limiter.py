"""
Shared slowapi limiter. Lives in its own module so routers can import it
for per-route decorators without a circular import through app.main.
"""

from fastapi import Request
from slowapi import Limiter


def get_real_client_ip(request: Request) -> str:
    """
    Extracts the true mapper client IP from Caddy's X-Real-IP header,
    with fallback to X-Forwarded-For and request.client.host.
    """
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.split(",")[0].strip()

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()

    if request.client and request.client.host:
        return request.client.host

    return "127.0.0.1"


limiter = Limiter(key_func=get_real_client_ip, default_limits=["120/minute"])

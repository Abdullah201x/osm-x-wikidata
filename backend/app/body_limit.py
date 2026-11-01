"""
Request body size cap. Pure ASGI so it works on streamed bodies too:
rejects up front on an oversized Content-Length, and aborts mid-stream
when a chunked body (no Content-Length) exceeds the cap.
"""

import json

MAX_BODY_BYTES = 16 * 1024


class BodySizeLimitMiddleware:
    def __init__(self, app, max_bytes: int = MAX_BODY_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in ("POST", "PUT", "PATCH"):
            await self.app(scope, receive, send)
            return

        for name, value in scope["headers"]:
            if name == b"content-length":
                try:
                    too_big = int(value) > self.max_bytes
                except ValueError:
                    too_big = True
                if too_big:
                    await self._reject(send)
                    return
                break

        received = 0
        responded = False  # we sent the 413 ourselves; drop anything the app sends after

        async def limited_receive():
            nonlocal received, responded
            message = await receive()
            if message["type"] == "http.request" and not responded:
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    # FastAPI turns exceptions raised while reading the body into
                    # a 400, so answer 413 here and tell the app the client left.
                    responded = True
                    await self._reject(send)
                    return {"type": "http.disconnect"}
            return message

        async def guarded_send(message):
            if not responded:
                await send(message)

        await self.app(scope, limited_receive, guarded_send)

    async def _reject(self, send):
        body = json.dumps({"detail": f"Request body exceeds {self.max_bytes} bytes."}).encode()
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
        })
        await send({"type": "http.response.body", "body": body})


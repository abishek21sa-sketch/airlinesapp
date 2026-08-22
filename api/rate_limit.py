"""
Per-IP sliding-window rate limiting -- stdlib only, no new dependency to
install. Exists specifically because Copilot calls the real Claude API on
every request: with zero rate limiting, a deployed, public instance is an
open-ended spending exposure the moment it gets any real traffic (or a bot).

Known, accepted limitation: this is in-process memory, not shared across
workers/replicas. Fine for a single-instance deployment (the realistic
starting point here); if this ever runs with multiple backend processes or
horizontal scaling, each process enforces the limit independently, so the
EFFECTIVE limit becomes (per-process limit x number of processes). Solving
that properly needs a shared store (Redis, etc.) -- deliberately not built
here, since that's real infrastructure this project doesn't need yet, and
adding it before it's needed is its own risk.
"""

from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _client_key(self, request: Request) -> str:
        # Render/Railway/Vercel all sit behind a reverse proxy -- the real
        # client IP arrives via X-Forwarded-For, not request.client.host
        # (which would just be the proxy's own address). Take the first
        # entry, which is the original client, per the standard convention.
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def check(self, request: Request) -> None:
        key = self._client_key(request)
        now = time.monotonic()
        with self._lock:
            timestamps = self._requests[key]
            cutoff = now - self.window_seconds
            while timestamps and timestamps[0] < cutoff:
                timestamps.popleft()
            if len(timestamps) >= self.max_requests:
                retry_after = max(1, int(self.window_seconds - (now - timestamps[0])))
                raise HTTPException(
                    status_code=429,
                    detail=(
                        f"Too many requests -- limit is {self.max_requests} per "
                        f"{int(self.window_seconds)}s. Try again in {retry_after}s."
                    ),
                    headers={"Retry-After": str(retry_after)},
                )
            timestamps.append(now)


# Copilot specifically, since that's where a request costs real money.
# Configurable via env vars so limits can be tuned post-deployment without
# a code change or redeploy of logic, just an env var update.
COPILOT_RATE_LIMIT_MAX = int(os.getenv("COPILOT_RATE_LIMIT_MAX", "12"))
COPILOT_RATE_LIMIT_WINDOW_SECONDS = float(os.getenv("COPILOT_RATE_LIMIT_WINDOW_SECONDS", "60"))

_copilot_limiter = SlidingWindowRateLimiter(
    max_requests=COPILOT_RATE_LIMIT_MAX,
    window_seconds=COPILOT_RATE_LIMIT_WINDOW_SECONDS,
)


def rate_limit_copilot(request: Request) -> None:
    """FastAPI dependency -- attach with Depends(rate_limit_copilot) on any
    route that calls the real Claude API."""
    _copilot_limiter.check(request)

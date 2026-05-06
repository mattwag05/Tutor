"""HTTP bridge to web/'s classroom + course storage for the spaced-review
picker.

The Python backend can't read ``data/classrooms/<id>.json`` /
``data/courses/<id>.json`` natively (they're owned by Next.js / web/),
so the picker delegates classroom and course content lookups to
``GET /api/spaced-review/block`` on the local web/ origin.

Returns the normalized payload shape that
``picker._resolve_question_payload`` consumes (a single question dict).
Returns ``None`` on any HTTP error so the picker silently drops
irresolvable attempts -- mirroring its behavior when a book page goes
missing.
"""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

DEFAULT_WEB_BASE_URL = "http://127.0.0.1:3782"
LOOKUP_TIMEOUT_S = 5.0


def web_base_url() -> str:
    return os.getenv("DEEPTUTOR_WEB_URL") or DEFAULT_WEB_BASE_URL


async def fetch_block_content(
    source: str,
    source_id: str,
    *,
    client: httpx.AsyncClient | None = None,
) -> dict | None:
    """Fetch the original question payload for a non-book attempt.

    Pass an ``httpx.AsyncClient`` to amortize the connection pool when
    many lookups run via ``asyncio.gather``; otherwise a single-shot
    client is created per call.
    """
    if client is None:
        async with httpx.AsyncClient(timeout=LOOKUP_TIMEOUT_S) as one_shot:
            return await fetch_block_content(source, source_id, client=one_shot)

    url = f"{web_base_url()}/api/spaced-review/block"
    params = {"source": source, "source_id": source_id}
    try:
        resp = await client.get(url, params=params)
        if resp.status_code != 200:
            logger.debug(
                "spaced-review block lookup %s/%s -> HTTP %d: %s",
                source,
                source_id,
                resp.status_code,
                resp.text[:200],
            )
            return None
        data = resp.json()
        if not isinstance(data, dict):
            return None
        return data
    except (httpx.HTTPError, ValueError) as exc:
        logger.debug(
            "spaced-review block lookup %s/%s failed: %s", source, source_id, exc
        )
        return None

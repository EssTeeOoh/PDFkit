import logging
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.analytics_store import get_summary, record_event

logger = logging.getLogger(__name__)
router = APIRouter(tags=["telemetry"])


class TelemetryEvent(BaseModel):
    category: Literal["usage", "error"]
    name: str
    tool: str | None = None
    status: str | None = None
    source: str = "frontend"
    message: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


@router.post("/telemetry/events")
def create_telemetry_event(event: TelemetryEvent):
    clean_name = event.name.strip()[:100] or "unknown"
    clean_tool = event.tool.strip()[:50] if event.tool else None
    clean_message = event.message.strip()[:500] if event.message else None

    summary = record_event(
        category=event.category,
        name=clean_name,
        tool=clean_tool,
        status=event.status,
        source=event.source[:50],
        message=clean_message,
    )

    if event.category == "error":
        logger.error(
            "frontend-error | source=%s tool=%s name=%s status=%s message=%s metadata=%s",
            event.source,
            clean_tool or "-",
            clean_name,
            event.status or "-",
            clean_message or "-",
            event.metadata,
        )
    else:
        logger.info(
            "usage-event | source=%s tool=%s name=%s status=%s",
            event.source,
            clean_tool or "-",
            clean_name,
            event.status or "-",
        )

    return {
        "ok": True,
        "updated_at": summary.get("updated_at"),
    }


@router.get("/telemetry/summary")
def telemetry_summary():
    return get_summary()

from fastapi import APIRouter, Header, HTTPException, status

from app.config import ADMIN_TOKEN
from app.services.analytics_store import get_summary

router = APIRouter(tags=["admin-telemetry"])


@router.get("/admin/telemetry/summary")
def admin_telemetry_summary(x_admin_token: str | None = Header(default=None, alias="X-Admin-Token")):
    if not ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin telemetry is not configured.",
        )

    if not x_admin_token or x_admin_token != ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin token.",
        )

    return get_summary(include_clients=True)

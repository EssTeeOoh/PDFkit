import json
import threading
from datetime import datetime, timezone
from pathlib import Path

from app.logger import LOG_DIR

ANALYTICS_FILE = LOG_DIR / "analytics-summary.json"
_lock = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_summary() -> dict:
    return {
        "updated_at": None,
        "totals": {
            "events": 0,
            "errors": 0,
        },
        "by_category": {},
        "by_name": {},
        "by_tool": {},
        "tool_actions": {},
        "recent": [],
    }


def _load_summary() -> dict:
    if not ANALYTICS_FILE.exists():
        return _default_summary()

    try:
        return json.loads(ANALYTICS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return _default_summary()


def _save_summary(summary: dict) -> None:
    tmp_path = Path(f"{ANALYTICS_FILE}.tmp")
    tmp_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    tmp_path.replace(ANALYTICS_FILE)


def record_event(
    *,
    category: str,
    name: str,
    tool: str | None = None,
    status: str | None = None,
    source: str = "frontend",
    message: str | None = None,
) -> dict:
    with _lock:
        summary = _load_summary()
        summary["updated_at"] = _now_iso()
        summary["totals"]["events"] += 1
        if category == "error":
            summary["totals"]["errors"] += 1

        summary["by_category"][category] = summary["by_category"].get(category, 0) + 1
        summary["by_name"][name] = summary["by_name"].get(name, 0) + 1

        if tool:
            summary["by_tool"][tool] = summary["by_tool"].get(tool, 0) + 1
            action_key = f"{tool}:{name}:{status or 'unknown'}"
            summary["tool_actions"][action_key] = summary["tool_actions"].get(action_key, 0) + 1

        recent_event = {
            "at": summary["updated_at"],
            "category": category,
            "name": name,
            "tool": tool,
            "status": status,
            "source": source,
            "message": message,
        }
        summary["recent"] = [recent_event, *summary.get("recent", [])][:25]
        _save_summary(summary)
        return summary


def get_summary() -> dict:
    with _lock:
        return _load_summary()

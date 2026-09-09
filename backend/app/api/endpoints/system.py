from fastapi import APIRouter
from typing import Dict, Any
from datetime import datetime, timezone
from data_collector.collector_service import collector_service
from backend.app.core.config import settings

router = APIRouter()

@router.get("/health")
async def health_check() -> Dict[str, Any]:
    provider_health = await collector_service.provider.health_check()
    return {
        "status": "HEALTHY",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "provider": provider_health,
    }

@router.get("/data-status")
async def data_status() -> Dict[str, Any]:
    """Returns data freshness, latency, and provider connectivity (Section 26)."""
    now = datetime.now(timezone.utc)
    ticks_status = {}
    for sym, tick in collector_service.latest_ticks.items():
        age_sec = (now - tick.received_timestamp).total_seconds()
        ticks_status[sym] = {
            "price": tick.price,
            "latency_ms": tick.latency_ms,
            "data_age_sec": round(age_sec, 2),
            "is_stale": tick.is_stale,
            "last_tick_time": tick.provider_timestamp.isoformat(),
        }

    return {
        "provider": collector_service.provider.name,
        "connected": collector_service.provider.is_connected,
        "market_session": "OPEN",
        "data_delay_type": "REALTIME",
        "symbols": ticks_status,
        "timestamp": now.isoformat()
    }

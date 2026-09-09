import asyncio
import json
import logging
from typing import Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from data_collector.collector_service import collector_service
from prediction_engine.inference.service import prediction_service

logger = logging.getLogger("websocket")
router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_market_connections: Set[WebSocket] = set()
        self.active_pred_connections: Set[WebSocket] = set()

    async def connect_market(self, ws: WebSocket):
        await ws.accept()
        self.active_market_connections.add(ws)

    def disconnect_market(self, ws: WebSocket):
        self.active_market_connections.discard(ws)

    async def connect_pred(self, ws: WebSocket):
        await ws.accept()
        self.active_pred_connections.add(ws)

    def disconnect_pred(self, ws: WebSocket):
        self.active_pred_connections.discard(ws)

    async def broadcast_market(self, message: dict):
        text = json.dumps(message)
        for ws in list(self.active_market_connections):
            try:
                await ws.send_text(text)
            except Exception:
                self.disconnect_market(ws)

    async def broadcast_pred(self, message: dict):
        text = json.dumps(message)
        for ws in list(self.active_pred_connections):
            try:
                await ws.send_text(text)
            except Exception:
                self.disconnect_pred(ws)

ws_manager = ConnectionManager()

@router.websocket("/ws/market")
async def websocket_market_endpoint(websocket: WebSocket):
    await ws_manager.connect_market(websocket)
    try:
        # Send initial snapshot immediately
        for sym, tick in collector_service.latest_ticks.items():
            await websocket.send_json({
                "type": "tick",
                "symbol": sym,
                "price": tick.price,
                "timestamp": tick.provider_timestamp.isoformat(),
                "latency_ms": tick.latency_ms,
                "day_open": tick.day_open,
                "day_high": tick.day_high,
                "day_low": tick.day_low,
                "previous_close": tick.previous_close,
            })
        while True:
            # Keep alive and listen for ping/pong or client messages
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect_market(websocket)
    except Exception:
        ws_manager.disconnect_market(websocket)

@router.websocket("/ws/prediction")
async def websocket_prediction_endpoint(websocket: WebSocket):
    await ws_manager.connect_pred(websocket)
    try:
        for sym, pred in prediction_service.latest_predictions.items():
            await websocket.send_json({
                "type": "prediction",
                "symbol": sym,
                "data": pred,
            })
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect_pred(websocket)
    except Exception:
        ws_manager.disconnect_pred(websocket)

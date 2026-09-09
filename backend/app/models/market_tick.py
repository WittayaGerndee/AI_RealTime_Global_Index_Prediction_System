from sqlalchemy import Column, BigInteger, Integer, String, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func
from backend.app.db.session import Base

class MarketTick(Base):
    __tablename__ = "market_ticks"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False, index=True)
    provider_timestamp = Column(DateTime(timezone=True), primary_key=True, nullable=False, index=True)
    received_timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    price = Column(Numeric(16, 4), nullable=False)
    bid = Column(Numeric(16, 4), nullable=True)
    ask = Column(Numeric(16, 4), nullable=True)
    volume = Column(Numeric(18, 4), default=0)
    day_open = Column(Numeric(16, 4), nullable=True)
    day_high = Column(Numeric(16, 4), nullable=True)
    day_low = Column(Numeric(16, 4), nullable=True)
    previous_close = Column(Numeric(16, 4), nullable=True)
    source = Column(String(64), default="websocket")
    sequence = Column(BigInteger, default=0)
    latency_ms = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

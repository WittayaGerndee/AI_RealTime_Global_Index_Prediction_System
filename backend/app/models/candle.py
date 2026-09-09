from sqlalchemy import Column, BigInteger, Integer, String, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func
from backend.app.db.session import Base

class Candle(Base):
    __tablename__ = "candles"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False, index=True)
    timeframe = Column(String(16), nullable=False) # 1s, 5s, 15s, 1m, 5m, 15m, 30m, 1h, 1d
    bucket_time = Column(DateTime(timezone=True), primary_key=True, nullable=False, index=True)
    open = Column(Numeric(16, 4), nullable=False)
    high = Column(Numeric(16, 4), nullable=False)
    low = Column(Numeric(16, 4), nullable=False)
    close = Column(Numeric(16, 4), nullable=False)
    volume = Column(Numeric(18, 4), default=0)
    tick_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

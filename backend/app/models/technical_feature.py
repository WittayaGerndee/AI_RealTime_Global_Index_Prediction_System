from sqlalchemy import Column, BigInteger, Integer, String, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func
from backend.app.db.session import Base

class TechnicalFeature(Base):
    __tablename__ = "technical_features"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False, index=True)
    bucket_time = Column(DateTime(timezone=True), primary_key=True, nullable=False, index=True)
    timeframe = Column(String(16), nullable=False)
    ema_5 = Column(Numeric(16, 4), nullable=True)
    ema_9 = Column(Numeric(16, 4), nullable=True)
    ema_20 = Column(Numeric(16, 4), nullable=True)
    ema_50 = Column(Numeric(16, 4), nullable=True)
    ema_200 = Column(Numeric(16, 4), nullable=True)
    rsi_14 = Column(Numeric(8, 4), nullable=True)
    macd = Column(Numeric(16, 4), nullable=True)
    macd_signal = Column(Numeric(16, 4), nullable=True)
    macd_histogram = Column(Numeric(16, 4), nullable=True)
    bb_upper = Column(Numeric(16, 4), nullable=True)
    bb_middle = Column(Numeric(16, 4), nullable=True)
    bb_lower = Column(Numeric(16, 4), nullable=True)
    atr_14 = Column(Numeric(16, 4), nullable=True)
    roc = Column(Numeric(12, 6), nullable=True)
    stochastic = Column(Numeric(8, 4), nullable=True)
    volatility = Column(Numeric(12, 6), nullable=True)
    momentum = Column(Numeric(16, 4), nullable=True)
    vwap = Column(Numeric(16, 4), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

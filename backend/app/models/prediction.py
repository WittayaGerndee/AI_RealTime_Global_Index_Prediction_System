from sqlalchemy import Column, BigInteger, Integer, String, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.app.db.session import Base

class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False, index=True)
    prediction_time = Column(DateTime(timezone=True), nullable=False, index=True)
    target_time = Column(DateTime(timezone=True), nullable=False, index=True)
    horizon = Column(String(32), nullable=False) # 1m, 5m, 15m, 30m, 60m, session_close
    model_version = Column(String(32), nullable=False)
    current_price = Column(Numeric(16, 4), nullable=False)
    expected_price = Column(Numeric(16, 4), nullable=False)
    expected_close = Column(Numeric(16, 4), nullable=False)
    lower_bound = Column(Numeric(16, 4), nullable=False)
    upper_bound = Column(Numeric(16, 4), nullable=False)
    direction = Column(String(16), nullable=False) # UP, DOWN, SIDEWAYS
    direction_probability = Column(Numeric(6, 4), nullable=False)
    range_probability = Column(Numeric(6, 4), nullable=False, default=0.80)
    stabilization_low = Column(Numeric(16, 4), nullable=False)
    stabilization_high = Column(Numeric(16, 4), nullable=False)
    stabilization_probability = Column(Numeric(6, 4), nullable=False)
    confidence = Column(Numeric(6, 4), nullable=False)
    feature_snapshot_hash = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    result = relationship("PredictionResult", back_populates="prediction", uselist=False, cascade="all, delete-orphan")

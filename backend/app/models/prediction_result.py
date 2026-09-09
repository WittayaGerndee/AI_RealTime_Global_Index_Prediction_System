from sqlalchemy import Column, BigInteger, Numeric, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.app.db.session import Base

class PredictionResult(Base):
    __tablename__ = "prediction_results"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    prediction_id = Column(BigInteger, ForeignKey("predictions.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    actual_price = Column(Numeric(16, 4), nullable=False)
    actual_close = Column(Numeric(16, 4), nullable=True)
    absolute_error = Column(Numeric(16, 4), nullable=False)
    percentage_error = Column(Numeric(8, 4), nullable=False)
    direction_correct = Column(Boolean, nullable=False)
    inside_range = Column(Boolean, nullable=False)
    inside_stabilization_zone = Column(Boolean, nullable=False)
    evaluated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    prediction = relationship("Prediction", back_populates="result")

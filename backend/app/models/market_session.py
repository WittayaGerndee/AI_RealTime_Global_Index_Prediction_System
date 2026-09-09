from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from backend.app.db.session import Base

class MarketSession(Base):
    __tablename__ = "market_sessions"

    id = Column(Integer, primary_key=True, index=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False)
    session_date = Column(Date, nullable=False)
    open_time = Column(DateTime(timezone=True), nullable=False)
    close_time = Column(DateTime(timezone=True), nullable=False)
    timezone = Column(String(64), nullable=False)
    status = Column(String(32), nullable=False, default="CLOSED") # OPEN, CLOSED, PRE_MARKET, POST_MARKET, HOLIDAY
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("instrument_id", "session_date", name="uq_instrument_session_date"),
    )

from sqlalchemy import Column, Integer, String, Boolean, Numeric, DateTime
from sqlalchemy.sql import func
from backend.app.db.session import Base

class Instrument(Base):
    __tablename__ = "instruments"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, nullable=False, index=True)
    name = Column(String(128), nullable=False)
    provider = Column(String(64), nullable=False, default="twelve_data")
    provider_symbol = Column(String(64), nullable=False)
    market = Column(String(64), nullable=False)
    timezone = Column(String(64), nullable=False, default="UTC")
    currency = Column(String(16), nullable=False, default="USD")
    tick_size = Column(Numeric(12, 4), nullable=False, default=0.01)
    price_decimals = Column(Integer, nullable=False, default=2)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

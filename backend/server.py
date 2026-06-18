"""
FastAPI Inventory & Order Management backend.
PostgreSQL via SQLAlchemy 2.0 async + JWT admin auth.
All routes are mounted under /api as required by the ingress.
"""

from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import json
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, AsyncGenerator
from contextlib import asynccontextmanager

import csv
import io
import math
import pandas as pd
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Request, UploadFile, File, Query
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator, ValidationError

from sqlalchemy import (
    Column,
    String,
    Integer,
    Numeric,
    DateTime,
    ForeignKey,
    select,
    func,
    update,
)
from sqlalchemy.orm import declarative_base, relationship, selectinload
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.exc import IntegrityError

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("inventory")

# ---------------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------------
DATABASE_URL = os.environ["DATABASE_URL"]
# Render/Railway often provide postgresql:// or postgres:// — convert for async driver
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24  # 24 hours
LOW_STOCK_THRESHOLD = 10

engine = create_async_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


def new_id() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=new_id)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False, default="Admin")
    role = Column(String, nullable=False, default="admin")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Product(Base):
    __tablename__ = "products"
    id = Column(String, primary_key=True, default=new_id)
    # Identity
    name = Column(String, nullable=False)
    sku = Column(String, unique=True, nullable=False, index=True)
    barcode = Column(String, nullable=True, index=True)
    category = Column(String, nullable=True, index=True)
    brand = Column(String, nullable=True)
    # Copy
    description = Column(String, nullable=True)
    short_description = Column(String, nullable=True)
    # Pricing
    price = Column(Numeric(12, 2), nullable=False)
    cost_price = Column(Numeric(12, 2), nullable=True)
    discount_price = Column(Numeric(12, 2), nullable=True)
    tax_rate = Column(Numeric(5, 2), nullable=False, default=0)
    currency = Column(String, nullable=False, default="USD")
    # Inventory
    quantity = Column(Integer, nullable=False, default=0)
    reorder_level = Column(Integer, nullable=False, default=10)
    unit = Column(String, nullable=False, default="pcs")
    # Logistics / variants
    weight_kg = Column(Numeric(10, 3), nullable=True)
    length_cm = Column(Numeric(10, 2), nullable=True)
    width_cm = Column(Numeric(10, 2), nullable=True)
    height_cm = Column(Numeric(10, 2), nullable=True)
    color = Column(String, nullable=True)
    size = Column(String, nullable=True)
    # Marketing
    image_url = Column(String, nullable=True)
    tags = Column(String, nullable=True)
    supplier = Column(String, nullable=True)
    status = Column(String, nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ProductImportLog(Base):
    __tablename__ = "product_import_logs"
    id = Column(String, primary_key=True, default=new_id)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    total_rows = Column(Integer, nullable=False, default=0)
    created_count = Column(Integer, nullable=False, default=0)
    failed_count = Column(Integer, nullable=False, default=0)
    errors_json = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Category(Base):
    __tablename__ = "categories"
    id = Column(String, primary_key=True, default=new_id)
    name = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Customer(Base):
    __tablename__ = "customers"
    id = Column(String, primary_key=True, default=new_id)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    phone = Column(String, nullable=False)
    address = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ProductVariant(Base):
    __tablename__ = "product_variants"
    id = Column(String, primary_key=True, default=new_id)
    product_id = Column(String, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    sku = Column(String, unique=True, nullable=False, index=True)
    color = Column(String, nullable=True)
    size = Column(String, nullable=True)
    price = Column(Numeric(12, 2), nullable=True)  # override; falls back to product.price
    discount_price = Column(Numeric(12, 2), nullable=True)
    quantity = Column(Integer, nullable=False, default=0)
    image_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Order(Base):
    __tablename__ = "orders"
    id = Column(String, primary_key=True, default=new_id)
    customer_id = Column(String, ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    status = Column(String, nullable=False, default="pending")
    stock_restored = Column(Integer, nullable=False, default=0)  # 0/1 flag
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    customer = relationship("Customer", lazy="joined")
    items = relationship(
        "OrderItem", cascade="all, delete-orphan", lazy="selectin"
    )


class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(String, primary_key=True, default=new_id)
    order_id = Column(String, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(String, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    variant_id = Column(String, ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=True)
    product_name = Column(String, nullable=False)
    product_sku = Column(String, nullable=False)
    variant_label = Column(String, nullable=True)
    unit_price = Column(Numeric(12, 2), nullable=False)
    quantity = Column(Integer, nullable=False)
    line_total = Column(Numeric(12, 2), nullable=False)


ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned", "refunded"]
STOCK_RELEASE_STATUSES = {"cancelled", "returned", "refunded"}
ALLOWED_TRANSITIONS = {
    "pending": {"confirmed", "processing", "cancelled"},
    "confirmed": {"processing", "shipped", "cancelled"},
    "processing": {"shipped", "cancelled"},
    "shipped": {"delivered", "returned"},
    "delivered": {"returned", "refunded"},
    "returned": {"refunded"},
    "cancelled": set(),
    "refunded": set(),
}


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.get(User, payload["sub"])
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: EmailStr
    name: str
    role: str


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProductIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    sku: str = Field(..., min_length=1, max_length=80)
    barcode: Optional[str] = Field(None, max_length=80)
    category: Optional[str] = Field(None, max_length=80)
    brand: Optional[str] = Field(None, max_length=80)
    description: Optional[str] = None
    short_description: Optional[str] = Field(None, max_length=300)
    price: float = Field(..., ge=0)
    cost_price: Optional[float] = Field(None, ge=0)
    discount_price: Optional[float] = Field(None, ge=0)
    tax_rate: float = Field(0, ge=0, le=100)
    currency: str = Field("USD", min_length=3, max_length=8)
    quantity: int = Field(..., ge=0)
    reorder_level: int = Field(10, ge=0)
    unit: str = Field("pcs", min_length=1, max_length=20)
    weight_kg: Optional[float] = Field(None, ge=0)
    length_cm: Optional[float] = Field(None, ge=0)
    width_cm: Optional[float] = Field(None, ge=0)
    height_cm: Optional[float] = Field(None, ge=0)
    color: Optional[str] = Field(None, max_length=40)
    size: Optional[str] = Field(None, max_length=40)
    image_url: Optional[str] = Field(None, max_length=500)
    tags: Optional[str] = Field(None, max_length=300)
    supplier: Optional[str] = Field(None, max_length=120)
    status: str = Field("active", pattern="^(active|inactive|draft)$")

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, v: str) -> str:
        return v.strip().upper()


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    sku: Optional[str] = Field(None, min_length=1, max_length=80)
    barcode: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    short_description: Optional[str] = None
    price: Optional[float] = Field(None, ge=0)
    cost_price: Optional[float] = Field(None, ge=0)
    discount_price: Optional[float] = Field(None, ge=0)
    tax_rate: Optional[float] = Field(None, ge=0, le=100)
    currency: Optional[str] = None
    quantity: Optional[int] = Field(None, ge=0)
    reorder_level: Optional[int] = Field(None, ge=0)
    unit: Optional[str] = None
    weight_kg: Optional[float] = Field(None, ge=0)
    length_cm: Optional[float] = Field(None, ge=0)
    width_cm: Optional[float] = Field(None, ge=0)
    height_cm: Optional[float] = Field(None, ge=0)
    color: Optional[str] = None
    size: Optional[str] = None
    image_url: Optional[str] = None
    tags: Optional[str] = None
    supplier: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(active|inactive|draft)$")

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, v):
        return v.strip().upper() if v else v


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    sku: str
    barcode: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    short_description: Optional[str] = None
    price: float
    cost_price: Optional[float] = None
    discount_price: Optional[float] = None
    tax_rate: float
    currency: str
    quantity: int
    reorder_level: int
    unit: str
    weight_kg: Optional[float] = None
    length_cm: Optional[float] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    color: Optional[str] = None
    size: Optional[str] = None
    image_url: Optional[str] = None
    tags: Optional[str] = None
    supplier: Optional[str] = None
    status: str
    created_at: datetime


class CustomerIn(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    phone: str = Field(..., min_length=3, max_length=40)
    address: Optional[str] = None


class CategoryIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        return v.strip()


class CategoryUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        return v.strip()


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    created_at: datetime


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    full_name: str
    email: EmailStr
    phone: str
    address: Optional[str] = None
    created_at: datetime


class OrderItemIn(BaseModel):
    product_id: str
    variant_id: Optional[str] = None
    quantity: int = Field(..., gt=0)


class OrderIn(BaseModel):
    customer_id: str
    items: List[OrderItemIn] = Field(..., min_length=1)


class OrderStatusIn(BaseModel):
    status: str = Field(..., pattern="^(pending|confirmed|processing|shipped|delivered|cancelled|returned|refunded)$")


class VariantIn(BaseModel):
    sku: str = Field(..., min_length=1, max_length=80)
    color: Optional[str] = Field(None, max_length=40)
    size: Optional[str] = Field(None, max_length=40)
    price: Optional[float] = Field(None, ge=0)
    discount_price: Optional[float] = Field(None, ge=0)
    quantity: int = Field(..., ge=0)
    image_url: Optional[str] = None

    @field_validator("sku")
    @classmethod
    def normalize(cls, v):
        return v.strip().upper()


class VariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    product_id: str
    sku: str
    color: Optional[str] = None
    size: Optional[str] = None
    price: Optional[float] = None
    discount_price: Optional[float] = None
    quantity: int
    image_url: Optional[str] = None


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    product_id: str
    variant_id: Optional[str] = None
    product_name: str
    product_sku: str
    variant_label: Optional[str] = None
    unit_price: float
    quantity: int
    line_total: float


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    customer_id: str
    customer_name: Optional[str] = None
    total_amount: float
    status: str
    created_at: datetime
    items: List[OrderItemOut] = []


class ChartPoint(BaseModel):
    label: str
    value: float


class ImportRowError(BaseModel):
    row: int
    sku: Optional[str] = None
    error: str


class ProductImportOut(BaseModel):
    log_id: str
    total_rows: int
    created: int
    failed: int
    errors: List[ImportRowError] = []


class ProductImportLogOut(BaseModel):
    id: str
    filename: str
    file_type: str
    total_rows: int
    created_count: int
    failed_count: int
    errors: List[ImportRowError] = []
    created_at: datetime


class DashboardOut(BaseModel):
    total_products: int
    total_customers: int
    total_orders: int
    total_revenue: float
    low_stock_count: int
    low_stock_products: List[ProductOut]
    revenue_trend: List[ChartPoint] = []
    orders_trend: List[ChartPoint] = []
    revenue_by_category: List[ChartPoint] = []
    order_status_breakdown: List[ChartPoint] = []
    inventory_health: List[ChartPoint] = []


# ---------------------------------------------------------------------------
# Startup: create tables, seed admin & sample data
# ---------------------------------------------------------------------------
async def seed_admin_and_samples():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
        admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")

        existing = (
            await db.execute(select(User).where(User.email == admin_email))
        ).scalar_one_or_none()
        if existing is None:
            db.add(
                User(
                    email=admin_email,
                    password_hash=hash_password(admin_password),
                    name="Admin",
                    role="admin",
                )
            )
            await db.commit()
            logger.info("Seeded admin user %s", admin_email)
        elif not verify_password(admin_password, existing.password_hash):
            existing.password_hash = hash_password(admin_password)
            await db.commit()
            logger.info("Updated admin password from env")

        category_count = (await db.execute(select(func.count(Category.id)))).scalar_one()
        if category_count == 0:
            db.add_all([
                Category(name="Computer Accessories"),
                Category(name="Displays"),
                Category(name="Audio"),
                Category(name="Cameras"),
            ])
            await db.commit()
            logger.info("Seeded default categories")

        if os.environ.get("SEED_SAMPLE_DATA", "false").lower() != "true":
            return

        product_count = (await db.execute(select(func.count(Product.id)))).scalar_one()
        if product_count == 0:
            sample_products = [
                Product(
                    name="Wireless Mouse", sku="WM-001", barcode="8901234567001",
                    category="Computer Accessories", brand="Logitech",
                    description="Ergonomic 2.4GHz wireless mouse with USB receiver and 12-month battery life.",
                    short_description="2.4GHz ergonomic wireless mouse",
                    price=29.99, cost_price=14.50, discount_price=24.99, tax_rate=8.0,
                    quantity=120, reorder_level=20, unit="pcs",
                    weight_kg=0.115, length_cm=10.5, width_cm=6.2, height_cm=3.8,
                    color="Graphite", image_url="https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=600",
                    tags="mouse,wireless,office", supplier="Acme Imports", status="active",
                ),
                Product(
                    name="Mechanical Keyboard", sku="KB-002", barcode="8901234567002",
                    category="Computer Accessories", brand="Keychron",
                    description="RGB backlit 87-key mechanical keyboard with hot-swap brown switches.",
                    short_description="RGB mechanical keyboard, brown switches",
                    price=89.50, cost_price=52.00, tax_rate=8.0,
                    quantity=45, reorder_level=15, unit="pcs",
                    weight_kg=0.96, color="Space Gray", size="TKL",
                    image_url="https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600",
                    tags="keyboard,mechanical,rgb", supplier="Acme Imports", status="active",
                ),
                Product(
                    name="27\" 4K Monitor", sku="MN-003", barcode="8901234567003",
                    category="Displays", brand="LG",
                    description="27-inch IPS 4K UHD monitor with USB-C 90W power delivery and HDR400.",
                    short_description="27\" IPS 4K, USB-C 90W",
                    price=349.00, cost_price=240.00, discount_price=319.00, tax_rate=8.0,
                    quantity=8, reorder_level=10, unit="pcs",
                    weight_kg=6.2, length_cm=62, width_cm=20, height_cm=44,
                    color="Black", image_url="https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600",
                    tags="monitor,4k,display", supplier="Global Display Co", status="active",
                ),
                Product(
                    name="USB-C Hub 7-in-1", sku="HB-004", barcode="8901234567004",
                    category="Computer Accessories", brand="Anker",
                    description="HDMI 4K, 100W PD pass-through, USB 3.0 ×2, SD/microSD reader, Ethernet.",
                    short_description="HDMI + 100W PD + USB 3 hub",
                    price=42.00, cost_price=22.00, tax_rate=8.0,
                    quantity=3, reorder_level=10, unit="pcs",
                    weight_kg=0.078, color="Silver",
                    image_url="https://images.unsplash.com/photo-1625948515291-69613efd103f?w=600",
                    tags="hub,usb-c,travel", supplier="Globex Industries", status="active",
                ),
                Product(
                    name="Noise Cancelling Headphones", sku="HP-005", barcode="8901234567005",
                    category="Audio", brand="Sony",
                    description="Wireless over-ear ANC headphones, 30-hour battery, LDAC and multipoint.",
                    short_description="Wireless ANC over-ear, 30h battery",
                    price=199.99, cost_price=130.00, discount_price=179.99, tax_rate=8.0,
                    quantity=27, reorder_level=10, unit="pcs",
                    weight_kg=0.254, color="Midnight Blue",
                    image_url="https://images.unsplash.com/photo-1583394838336-acd977736f90?w=600",
                    tags="headphones,anc,wireless,bluetooth", supplier="Initech LLC", status="active",
                ),
                Product(
                    name="Webcam 1080p", sku="WC-006", barcode="8901234567006",
                    category="Cameras", brand="Logitech",
                    description="Full HD streaming webcam with dual omnidirectional mics and autofocus.",
                    short_description="1080p autofocus webcam",
                    price=59.99, cost_price=32.00, tax_rate=8.0,
                    quantity=0, reorder_level=15, unit="pcs",
                    weight_kg=0.162, color="Black",
                    image_url="https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?w=600",
                    tags="webcam,streaming,1080p", supplier="Acme Imports", status="active",
                ),
            ]
            db.add_all(sample_products)

        customer_count = (await db.execute(select(func.count(Customer.id)))).scalar_one()
        if customer_count == 0:
            db.add_all([
                Customer(full_name="Acme Corporation", email="ops@acme.com", phone="+1-415-555-0101", address="500 Market St, San Francisco"),
                Customer(full_name="Globex Industries", email="purchasing@globex.io", phone="+1-212-555-0144", address="42 Broadway, New York"),
                Customer(full_name="Initech LLC", email="orders@initech.co", phone="+1-512-555-0190", address="1100 Congress Ave, Austin"),
            ])

        await db.commit()
        logger.info("Sample data seeded")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await seed_admin_and_samples()
    yield
    await engine.dispose()


# ---------------------------------------------------------------------------
# FastAPI app + routes
# ---------------------------------------------------------------------------
app = FastAPI(title="Inventory & Order Management API", lifespan=lifespan)
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"service": "inventory-api", "status": "ok"}


@api.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    await db.execute(select(1))
    return {"status": "healthy", "db": "ok"}


# --------- Auth ---------
@api.post("/auth/login", response_model=LoginOut)
async def login(payload: LoginIn, db: AsyncSession = Depends(get_db)):
    email = payload.email.lower()
    user = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user.id, user.email)
    return LoginOut(access_token=token, user=UserOut.model_validate(user))


@api.get("/auth/me", response_model=UserOut)
async def me(current: User = Depends(get_current_user)):
    return UserOut.model_validate(current)


# --------- Products ---------
def product_to_out(p: Product) -> ProductOut:
    def fnum(v):
        return float(v) if v is not None else None
    return ProductOut(
        id=p.id, name=p.name, sku=p.sku, barcode=p.barcode,
        category=p.category, brand=p.brand,
        description=p.description, short_description=p.short_description,
        price=float(p.price), cost_price=fnum(p.cost_price),
        discount_price=fnum(p.discount_price), tax_rate=float(p.tax_rate),
        currency=p.currency, quantity=p.quantity,
        reorder_level=p.reorder_level, unit=p.unit,
        weight_kg=fnum(p.weight_kg), length_cm=fnum(p.length_cm),
        width_cm=fnum(p.width_cm), height_cm=fnum(p.height_cm),
        color=p.color, size=p.size, image_url=p.image_url, tags=p.tags,
        supplier=p.supplier, status=p.status, created_at=p.created_at,
    )


IMPORT_CSV_HEADERS = [
    "name", "sku", "barcode", "category", "brand", "price", "cost_price", "discount_price",
    "tax_rate", "currency", "quantity", "reorder_level", "unit", "color", "size",
    "weight_kg", "image_url", "tags", "supplier", "status", "short_description", "description",
]
IMPORT_CSV_EXAMPLE = [
    "Sample Mug", "MUG-001", "8901234567999", "Drinkware", "GenericBrand",
    "12.99", "5.50", "", "8.0", "USD", "100", "20", "pcs", "White", "11oz",
    "0.35", "https://example.com/mug.jpg", "ceramic,kitchen", "Acme Imports",
    "active", "Classic ceramic mug", "11oz ceramic coffee mug, dishwasher safe.",
]


IMPORT_REQUIRED_COLUMNS = {"name", "sku", "price", "quantity"}


async def ensure_category_exists(db: AsyncSession, name: Optional[str]) -> None:
    if not name:
        return
    existing = (
        await db.execute(select(Category).where(Category.name == name))
    ).scalar_one_or_none()
    if existing is None:
        db.add(Category(name=name))
        await db.flush()


def _clean_import_cell(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value).strip() or None


def _canonicalize_import_row(raw: dict) -> dict:
    data = {}
    for key, value in raw.items():
        if key is None:
            continue
        col = str(key).strip()
        if not col:
            continue
        cleaned = _clean_import_cell(value)
        if cleaned is not None:
            data[col] = cleaned
    return data


def _import_row_get(data: dict, key: str):
    target = key.lower()
    for k, v in data.items():
        if str(k).strip().lower() == target:
            return v
    return None


def _validate_import_columns(columns) -> None:
    if columns is None or len(columns) == 0:
        raise HTTPException(status_code=400, detail="File must include a header row")
    normalized = {str(c).strip().lower() for c in columns if c is not None and str(c).strip()}
    if not IMPORT_REQUIRED_COLUMNS.issubset(normalized):
        raise HTTPException(status_code=400, detail="File must include columns: name, sku, price, quantity")


def _parse_csv_import_rows(raw: bytes) -> list[tuple[int, dict]]:
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    _validate_import_columns(reader.fieldnames)
    return [(idx, _canonicalize_import_row(row)) for idx, row in enumerate(reader, start=2)]


def _parse_xlsx_import_rows(raw: bytes) -> list[tuple[int, dict]]:
    df = pd.read_excel(io.BytesIO(raw), engine="openpyxl")
    _validate_import_columns(df.columns)
    return [(int(idx) + 2, _canonicalize_import_row(row.to_dict())) for idx, row in df.iterrows()]


def _parse_import_file(filename: str, raw: bytes) -> list[tuple[int, dict]]:
    lower = (filename or "").lower()
    if lower.endswith(".csv"):
        return _parse_csv_import_rows(raw)
    if lower.endswith(".xlsx"):
        return _parse_xlsx_import_rows(raw)
    raise HTTPException(status_code=400, detail="Please upload a .csv or .xlsx file")


def import_row_to_product_in(data: dict) -> ProductIn:
    def cell(key: str):
        return _import_row_get(data, key)

    cost_price = cell("cost_price")
    discount_price = cell("discount_price")
    weight_kg = cell("weight_kg")
    return ProductIn(
        name=cell("name") or "",
        sku=cell("sku") or "",
        barcode=cell("barcode"),
        category=cell("category"),
        brand=cell("brand"),
        description=cell("description"),
        short_description=cell("short_description"),
        price=float(cell("price") or 0),
        cost_price=float(cost_price) if cost_price is not None else None,
        discount_price=float(discount_price) if discount_price is not None else None,
        tax_rate=float(cell("tax_rate") or 0),
        currency=cell("currency") or "USD",
        quantity=int(float(cell("quantity") or 0)),
        reorder_level=int(float(cell("reorder_level") or 10)),
        unit=cell("unit") or "pcs",
        weight_kg=float(weight_kg) if weight_kg is not None else None,
        color=cell("color"),
        size=cell("size"),
        image_url=cell("image_url"),
        tags=cell("tags"),
        supplier=cell("supplier"),
        status=cell("status") or "active",
    )


async def _import_products_from_rows(
    db: AsyncSession,
    rows: list[tuple[int, dict]],
    filename: str,
) -> dict:
    file_type = "xlsx" if filename.lower().endswith(".xlsx") else "csv"
    total_rows = len(rows)
    created = 0
    errors: list[dict] = []
    for idx, data in rows:
        try:
            payload = import_row_to_product_in(data)
            async with db.begin_nested():
                if payload.category:
                    await ensure_category_exists(db, payload.category)
                p = Product(**payload.model_dump())
                db.add(p)
                await db.flush()
            created += 1
        except IntegrityError:
            errors.append({"row": idx, "sku": _import_row_get(data, "sku"), "error": "Duplicate SKU"})
        except ValidationError as e:
            msg = "; ".join(f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in e.errors())
            errors.append({"row": idx, "sku": _import_row_get(data, "sku"), "error": msg[:200]})
        except Exception as e:
            errors.append({"row": idx, "sku": _import_row_get(data, "sku"), "error": str(e)[:200]})

    log = ProductImportLog(
        filename=filename,
        file_type=file_type,
        total_rows=total_rows,
        created_count=created,
        failed_count=len(errors),
        errors_json=json.dumps(errors),
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return {
        "log_id": log.id,
        "total_rows": total_rows,
        "created": created,
        "failed": len(errors),
        "errors": errors,
    }


def _import_log_to_out(log: ProductImportLog) -> ProductImportLogOut:
    errors_raw = json.loads(log.errors_json) if log.errors_json else []
    return ProductImportLogOut(
        id=log.id,
        filename=log.filename,
        file_type=log.file_type,
        total_rows=log.total_rows,
        created_count=log.created_count,
        failed_count=log.failed_count,
        errors=[ImportRowError(**e) for e in errors_raw],
        created_at=log.created_at,
    )


def csv_row_to_product_in(data: dict) -> ProductIn:
    return import_row_to_product_in(data)


@api.get("/products", response_model=List[ProductOut])
async def list_products(_: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Product).order_by(Product.created_at.desc()))).scalars().all()
    return [product_to_out(p) for p in rows]


@api.post("/products", response_model=ProductOut, status_code=201)
async def create_product(payload: ProductIn, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = Product(**payload.model_dump())
    db.add(p)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="SKU must be unique")
    await db.refresh(p)
    return product_to_out(p)


@api.get("/products/import/template")
async def import_template(
    format: str = Query("json", pattern="^(json|csv|xlsx)$"),
    _: User = Depends(get_current_user),
):
    row = dict(zip(IMPORT_CSV_HEADERS, IMPORT_CSV_EXAMPLE))
    if format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(IMPORT_CSV_HEADERS)
        writer.writerow(IMPORT_CSV_EXAMPLE)
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="products_import_template.csv"'},
        )
    if format == "xlsx":
        xbuf = io.BytesIO()
        pd.DataFrame([row], columns=IMPORT_CSV_HEADERS).to_excel(xbuf, index=False, engine="openpyxl")
        return Response(
            content=xbuf.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="products_import_template.xlsx"'},
        )
    return {
        "headers": IMPORT_CSV_HEADERS,
        "example_row": IMPORT_CSV_EXAMPLE,
        "formats": ["json", "csv", "xlsx"],
    }


@api.post("/products/import/preview")
async def import_preview(
    file: UploadFile = File(...),
    _: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Please upload a .csv or .xlsx file")
    raw = await file.read()
    rows = _parse_import_file(file.filename, raw)
    lower = file.filename.lower()
    return {
        "filename": file.filename,
        "file_type": "xlsx" if lower.endswith(".xlsx") else "csv",
        "total_rows": len(rows),
    }


@api.get("/products/import/logs", response_model=List[ProductImportLogOut])
async def list_import_logs(_: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(ProductImportLog).order_by(ProductImportLog.created_at.desc()).limit(50)
        )
    ).scalars().all()
    return [_import_log_to_out(log) for log in rows]


@api.get("/products/import/logs/{log_id}", response_model=ProductImportLogOut)
async def get_import_log(log_id: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    log = await db.get(ProductImportLog, log_id)
    if log is None:
        raise HTTPException(status_code=404, detail="Import log not found")
    return _import_log_to_out(log)


@api.post("/products/import", response_model=ProductImportOut)
async def import_products_file(
    file: UploadFile = File(...),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Please upload a .csv or .xlsx file")
    raw = await file.read()
    rows = _parse_import_file(file.filename, raw)
    result = await _import_products_from_rows(db, rows, file.filename)
    return ProductImportOut(
        log_id=result["log_id"],
        total_rows=result["total_rows"],
        created=result["created"],
        failed=result["failed"],
        errors=[ImportRowError(**e) for e in result["errors"][:50]],
    )


@api.get("/products/{product_id}", response_model=ProductOut)
async def get_product(product_id: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await db.get(Product, product_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_to_out(p)


@api.put("/products/{product_id}", response_model=ProductOut)
async def update_product(product_id: str, payload: ProductUpdate, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await db.get(Product, product_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Product not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(p, k, v)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="SKU must be unique")
    await db.refresh(p)
    return product_to_out(p)


@api.delete("/products/{product_id}", status_code=204)
async def delete_product(product_id: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await db.get(Product, product_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Product not found")
    try:
        await db.delete(p)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Product is referenced by existing orders")


# --------- Categories ---------
def category_to_out(c: Category) -> CategoryOut:
    return CategoryOut(id=c.id, name=c.name, created_at=c.created_at)


@api.get("/categories", response_model=List[CategoryOut])
async def list_categories(_: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Category).order_by(Category.name.asc()))).scalars().all()
    return [category_to_out(c) for c in rows]


@api.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(payload: CategoryIn, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = Category(name=payload.name)
    db.add(c)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Category name already exists")
    await db.refresh(c)
    return category_to_out(c)


@api.put("/categories/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: str,
    payload: CategoryUpdate,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = await db.get(Category, category_id)
    if c is None:
        raise HTTPException(status_code=404, detail="Category not found")
    old_name = c.name
    new_name = payload.name
    if old_name != new_name:
        c.name = new_name
        await db.execute(
            update(Product).where(Product.category == old_name).values(category=new_name)
        )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Category name already exists")
    await db.refresh(c)
    return category_to_out(c)


@api.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = await db.get(Category, category_id)
    if c is None:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.delete(c)
    await db.commit()


# --------- Customers ---------
def customer_to_out(c: Customer) -> CustomerOut:
    return CustomerOut(
        id=c.id, full_name=c.full_name, email=c.email, phone=c.phone,
        address=c.address, created_at=c.created_at,
    )


@api.get("/customers", response_model=List[CustomerOut])
async def list_customers(_: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Customer).order_by(Customer.created_at.desc()))).scalars().all()
    return [customer_to_out(c) for c in rows]


@api.post("/customers", response_model=CustomerOut, status_code=201)
async def create_customer(payload: CustomerIn, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = Customer(**payload.model_dump())
    c.email = c.email.lower()
    db.add(c)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Email already exists")
    await db.refresh(c)
    return customer_to_out(c)


@api.get("/customers/{customer_id}", response_model=CustomerOut)
async def get_customer(customer_id: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = await db.get(Customer, customer_id)
    if c is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer_to_out(c)


@api.get("/customers/{customer_id}/orders", response_model=List[OrderOut])
async def customer_orders(customer_id: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = await db.get(Customer, customer_id)
    if c is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    rows = (
        await db.execute(
            select(Order)
            .where(Order.customer_id == customer_id)
            .options(selectinload(Order.items), selectinload(Order.customer))
            .order_by(Order.created_at.desc())
        )
    ).scalars().all()
    return [order_to_out(o) for o in rows]


@api.delete("/customers/{customer_id}", status_code=204)
async def delete_customer(customer_id: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = await db.get(Customer, customer_id)
    if c is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    try:
        await db.delete(c)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Customer has existing orders and cannot be deleted")


# --------- Orders ---------
def order_to_out(o: Order) -> OrderOut:
    return OrderOut(
        id=o.id,
        customer_id=o.customer_id,
        customer_name=o.customer.full_name if o.customer else None,
        total_amount=float(o.total_amount),
        status=o.status,
        created_at=o.created_at,
        items=[
            OrderItemOut(
                id=it.id,
                product_id=it.product_id,
                variant_id=it.variant_id,
                product_name=it.product_name,
                product_sku=it.product_sku,
                variant_label=it.variant_label,
                unit_price=float(it.unit_price),
                quantity=it.quantity,
                line_total=float(it.line_total),
            )
            for it in o.items
        ],
    )


@api.get("/orders", response_model=List[OrderOut])
async def list_orders(_: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Order)
            .options(selectinload(Order.items), selectinload(Order.customer))
            .order_by(Order.created_at.desc())
        )
    ).scalars().all()
    return [order_to_out(o) for o in rows]


@api.post("/orders", response_model=OrderOut, status_code=201)
async def create_order(payload: OrderIn, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    customer = await db.get(Customer, payload.customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Aggregate by (product_id, variant_id) so duplicate lines do not double-deduct stock.
    aggregated: dict[tuple[str, Optional[str]], int] = {}
    for it in payload.items:
        key = (it.product_id, it.variant_id)
        aggregated[key] = aggregated.get(key, 0) + it.quantity

    order = Order(customer_id=customer.id, total_amount=0, status="pending")
    total = 0.0
    for (product_id, variant_id), qty in aggregated.items():
        product = await db.get(Product, product_id)
        if product is None:
            raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

        if variant_id:
            variant = await db.get(ProductVariant, variant_id)
            if variant is None or variant.product_id != product_id:
                raise HTTPException(status_code=404, detail=f"Variant {variant_id} not found for product")
            if variant.quantity < qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for {product.name} ({variant.sku}): have {variant.quantity}, need {qty}",
                )
            base_price = variant.discount_price if variant.discount_price is not None else (variant.price if variant.price is not None else (product.discount_price if product.discount_price is not None else product.price))
            line_total = float(base_price) * qty
            total += line_total
            variant.quantity -= qty
            label_parts = [v for v in (variant.color, variant.size) if v]
            order.items.append(OrderItem(
                product_id=product.id, variant_id=variant.id,
                product_name=product.name, product_sku=product.sku,
                variant_label=" / ".join(label_parts) if label_parts else variant.sku,
                unit_price=base_price, quantity=qty, line_total=line_total,
            ))
        else:
            if product.quantity < qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for {product.name} (have {product.quantity}, need {qty})",
                )
            base_price = product.discount_price if product.discount_price is not None else product.price
            line_total = float(base_price) * qty
            total += line_total
            product.quantity -= qty
            order.items.append(OrderItem(
                product_id=product.id, variant_id=None,
                product_name=product.name, product_sku=product.sku,
                variant_label=None,
                unit_price=base_price, quantity=qty, line_total=line_total,
            ))
    order.total_amount = total
    db.add(order)
    await db.commit()

    refreshed = (
        await db.execute(
            select(Order).where(Order.id == order.id)
            .options(selectinload(Order.items), selectinload(Order.customer))
        )
    ).scalar_one()
    return order_to_out(refreshed)


async def _restore_order_stock(order: Order, db: AsyncSession):
    """Return reserved stock back to products/variants. Idempotent via order.stock_restored."""
    if order.stock_restored:
        return
    for it in order.items:
        if it.variant_id:
            v = await db.get(ProductVariant, it.variant_id)
            if v is not None:
                v.quantity += it.quantity
        else:
            p = await db.get(Product, it.product_id)
            if p is not None:
                p.quantity += it.quantity
    order.stock_restored = 1


@api.patch("/orders/{order_id}/status", response_model=OrderOut)
async def update_order_status(order_id: str, payload: OrderStatusIn, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    o = (
        await db.execute(
            select(Order).where(Order.id == order_id)
            .options(selectinload(Order.items), selectinload(Order.customer))
        )
    ).scalar_one_or_none()
    if o is None:
        raise HTTPException(status_code=404, detail="Order not found")
    new_status = payload.status
    if new_status == o.status:
        return order_to_out(o)
    if new_status not in ALLOWED_TRANSITIONS.get(o.status, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from '{o.status}' to '{new_status}'. Allowed: {sorted(ALLOWED_TRANSITIONS.get(o.status, set())) or ['(terminal)']}",
        )
    if new_status in STOCK_RELEASE_STATUSES:
        await _restore_order_stock(o, db)
    o.status = new_status
    o.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(o)
    return order_to_out(o)


@api.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(order_id: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    o = (
        await db.execute(
            select(Order)
            .where(Order.id == order_id)
            .options(selectinload(Order.items), selectinload(Order.customer))
        )
    ).scalar_one_or_none()
    if o is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order_to_out(o)


@api.delete("/orders/{order_id}", status_code=204)
async def delete_order(order_id: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Cancel/Delete an order. Returns the reserved stock back to inventory (idempotent)."""
    o = (
        await db.execute(
            select(Order).where(Order.id == order_id)
            .options(selectinload(Order.items))
        )
    ).scalar_one_or_none()
    if o is None:
        raise HTTPException(status_code=404, detail="Order not found")
    await _restore_order_stock(o, db)
    await db.delete(o)
    await db.commit()


# --------- Variants ---------
@api.get("/products/{product_id}/variants", response_model=List[VariantOut])
async def list_variants(product_id: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if await db.get(Product, product_id) is None:
        raise HTTPException(status_code=404, detail="Product not found")
    rows = (await db.execute(
        select(ProductVariant).where(ProductVariant.product_id == product_id).order_by(ProductVariant.created_at.asc())
    )).scalars().all()
    return [VariantOut.model_validate(v) for v in rows]


@api.post("/products/{product_id}/variants", response_model=VariantOut, status_code=201)
async def create_variant(product_id: str, payload: VariantIn, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if await db.get(Product, product_id) is None:
        raise HTTPException(status_code=404, detail="Product not found")
    v = ProductVariant(product_id=product_id, **payload.model_dump())
    db.add(v)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Variant SKU must be unique")
    await db.refresh(v)
    return VariantOut.model_validate(v)


@api.delete("/products/{product_id}/variants/{variant_id}", status_code=204)
async def delete_variant(product_id: str, variant_id: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    v = await db.get(ProductVariant, variant_id)
    if v is None or v.product_id != product_id:
        raise HTTPException(status_code=404, detail="Variant not found")
    try:
        await db.delete(v)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Variant is referenced by existing orders")


# --------- Dashboard ---------
def _month_label(dt: datetime) -> str:
    return dt.strftime("%b %Y")


async def _dashboard_charts(db: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)
    month_starts = []
    for offset in range(5, -1, -1):
        year = now.year
        month = now.month - offset
        while month <= 0:
            month += 12
            year -= 1
        month_starts.append(datetime(year, month, 1, tzinfo=timezone.utc))

    monthly_rows = (
        await db.execute(
            select(
                func.date_trunc("month", Order.created_at).label("month"),
                func.count(Order.id).label("orders"),
                func.coalesce(func.sum(Order.total_amount), 0).label("revenue"),
            )
            .where(Order.created_at >= month_starts[0])
            .group_by("month")
            .order_by("month")
        )
    ).all()
    monthly_map = {
        row.month.replace(tzinfo=timezone.utc) if row.month.tzinfo is None else row.month: row
        for row in monthly_rows
    }

    revenue_trend = []
    orders_trend = []
    for start in month_starts:
        row = monthly_map.get(start)
        revenue_trend.append(ChartPoint(label=_month_label(start), value=float(row.revenue if row else 0)))
        orders_trend.append(ChartPoint(label=_month_label(start), value=float(row.orders if row else 0)))

    category_rows = (
        await db.execute(
            select(Product.category, func.coalesce(func.sum(OrderItem.line_total), 0).label("revenue"))
            .select_from(OrderItem)
            .join(Product, OrderItem.product_id == Product.id)
            .where(Product.category.isnot(None))
            .group_by(Product.category)
            .order_by(func.sum(OrderItem.line_total).desc())
            .limit(8)
        )
    ).all()
    revenue_by_category = [
        ChartPoint(label=row.category or "Uncategorized", value=float(row.revenue))
        for row in category_rows
        if float(row.revenue) > 0
    ]

    status_rows = (
        await db.execute(
            select(Order.status, func.count(Order.id).label("count"))
            .group_by(Order.status)
            .order_by(func.count(Order.id).desc())
        )
    ).all()
    order_status_breakdown = [
        ChartPoint(label=row.status.replace("_", " ").title(), value=float(row.count))
        for row in status_rows
    ]

    products = (await db.execute(select(Product))).scalars().all()
    out_of_stock = sum(1 for p in products if p.quantity == 0)
    low_stock = sum(1 for p in products if 0 < p.quantity <= p.reorder_level)
    healthy = sum(1 for p in products if p.quantity > p.reorder_level)
    inventory_health = [
        ChartPoint(label="Healthy", value=float(healthy)),
        ChartPoint(label="Low Stock", value=float(low_stock)),
        ChartPoint(label="Out of Stock", value=float(out_of_stock)),
    ]

    return {
        "revenue_trend": revenue_trend,
        "orders_trend": orders_trend,
        "revenue_by_category": revenue_by_category,
        "order_status_breakdown": order_status_breakdown,
        "inventory_health": inventory_health,
    }


@api.get("/dashboard", response_model=DashboardOut)
async def dashboard(_: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    total_products = (await db.execute(select(func.count(Product.id)))).scalar_one()
    total_customers = (await db.execute(select(func.count(Customer.id)))).scalar_one()
    total_orders = (await db.execute(select(func.count(Order.id)))).scalar_one()
    total_revenue = (await db.execute(select(func.coalesce(func.sum(Order.total_amount), 0)))).scalar_one()
    low_stock_rows = (
        await db.execute(
            select(Product)
            .where(Product.quantity <= Product.reorder_level)
            .order_by(Product.quantity.asc())
        )
    ).scalars().all()
    charts = await _dashboard_charts(db)
    return DashboardOut(
        total_products=total_products,
        total_customers=total_customers,
        total_orders=total_orders,
        total_revenue=float(total_revenue or 0),
        low_stock_count=len(low_stock_rows),
        low_stock_products=[product_to_out(p) for p in low_stock_rows],
        **charts,
    )


# ---------------------------------------------------------------------------
# Wire up CORS + router
# ---------------------------------------------------------------------------
_cors_raw = os.environ.get("CORS_ORIGINS", "*").strip()
if not _cors_raw:
    _cors_raw = "*"
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api)

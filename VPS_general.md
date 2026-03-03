# VPS General Information

## Credentials
- **IP Address:** `66.23.231.181`
- **User:** `root`
- **Password:** `Brokewalk25$`

## Project Structure
The backend API is located at `/opt/octopilot-api` and runs inside a Docker container managed by PM2.

- **API Root (VPS):** `/opt/octopilot-api`
- **Production API URL:** `https://api.octopilotai.com/api/v1`

## API Service Details
- **Port:** `8000` (Internal)
- **Framework:** FastAPI / Uvicorn
- **Process Manager:** PM2
- **Commands:**
  - `pm2 status`
  - `pm2 restart octopilot-api`
  - `pm2 logs octopilot-api`

---

# Backend Source Code Reference

## Entry Point
### [main.py](file:///opt/octopilot-api/main.py)
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from config import settings
from routes import router
from dashboard_routes import router as dashboard_router
from session_routes import router as session_router
from settings_routes import router as settings_router
from reports_routes import router as reports_router
from stream_routes import router as stream_router
from user_routes import router as user_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Octopilot API starting up...")
    # Create tables
    from database import engine, Base
    import models
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    print("👋 Octopilot API shutting down...")

app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS - allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(router, prefix="/api/v1", tags=["API v1"])
app.include_router(dashboard_router, prefix="/api/v1", tags=["Dashboard"])
app.include_router(session_router, prefix="/api/v1", tags=["Sessions"])
app.include_router(settings_router, prefix="/api/v1", tags=["Settings"])
app.include_router(reports_router, prefix="/api/v1", tags=["Reports"])
app.include_router(stream_router, prefix="/api/v1", tags=["Stream"])
app.include_router(user_router, prefix="/api/v1", tags=["User"])

@app.get("/")
async def root():
    return {
        "name": settings.API_TITLE,
        "version": settings.API_VERSION,
        "status": "running"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
```

## Core Configuration
### [config.py](file:///opt/octopilot-api/config.py)
```python
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://octopilot:OctoPilot2025@localhost:5432/octopilot"
    
    # Firebase Project ID for token verification
    FIREBASE_PROJECT_ID: str = "boardwalk-ai"
    
    # API Settings
    API_TITLE: str = "Octopilot API"
    API_VERSION: str = "1.1.0"
    DEBUG: bool = False
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()
```

### [database.py](file:///opt/octopilot-api/database.py)
```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=10,
    max_overflow=20
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
```

## Authentication & Real-time
### [auth.py](file:///opt/octopilot-api/auth.py)
```python
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx
from functools import lru_cache
from config import settings

security = HTTPBearer()

@lru_cache(maxsize=1)
def get_firebase_public_keys():
    try:
        response = httpx.get(
            "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
            timeout=10.0
        )
        return response.json()
    except Exception as e:
        print(f"❌ [Auth] Error fetching Firebase keys: {e}")
        return {}

async def verify_firebase_token(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> dict:
    token = credentials.credentials
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        public_keys = get_firebase_public_keys()
        
        if kid not in public_keys:
            get_firebase_public_keys.cache_clear()
            public_keys = get_firebase_public_keys()
            if kid not in public_keys:
                raise HTTPException(status_code=401, detail="Invalid token key ID")
        
        payload = jwt.decode(
            token,
            public_keys[kid],
            algorithms=["RS256"],
            audience=settings.FIREBASE_PROJECT_ID,
            issuer=f"https://securetoken.google.com/{settings.FIREBASE_PROJECT_ID}"
        )
        return {
            "uid": payload.get("user_id") or payload.get("sub"),
            "email": payload.get("email"),
            "name": payload.get("name")
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

async def get_current_user(user_claims: dict = Depends(verify_firebase_token)) -> dict:
    return user_claims
```

### [broadcaster.py](file:///opt/octopilot-api/broadcaster.py)
```python
import asyncio
from typing import Dict, Set

class Broadcaster:
    def __init__(self):
        self.active_connections: Dict[str, Set[asyncio.Queue]] = {}

    def get_queue(self, user_id: str) -> asyncio.Queue:
        queue = asyncio.Queue()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(queue)
        return queue

    def unsubscribe(self, user_id: str, queue: asyncio.Queue):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(queue)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    def notify(self, user_id: str, event_type: str, data: str = None):
        if user_id in self.active_connections:
            message = f"{event_type}|{data}" if data else event_type
            for queue in self.active_connections[user_id]:
                try:
                    queue.put_nowait(message)
                except: pass

broadcaster = Broadcaster()
```

## Models & Schemas
### [models.py](file:///opt/octopilot-api/models.py)
```python
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import uuid

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firebase_uid = Column(String(128), unique=True, nullable=False, index=True)
    email = Column(String(255))
    name = Column(String(255))
    is_admin = Column(Boolean, default=False)
    plan = Column(String(50), default="Free")
    word_credits = Column(Integer, default=300)
    source_credits = Column(Integer, default=20)
    humanizer_credits = Column(Integer, default=300)
    subscription_status = Column(String(20), default="expired")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Session(Base):
    __tablename__ = "sessions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    login_email = Column(String(255))
    session_start_time = Column(DateTime(timezone=True), server_default=func.now())
    last_heartbeat = Column(DateTime(timezone=True))
    major_name = Column(String(255))
    essay_type = Column(String(100))
    word_count = Column(Integer)
    is_humanized = Column(Boolean, default=False)
    export_status = Column(String(50), default="not_exported")
    user = relationship("User", back_populates="sessions")

User.sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
```

## Routes
### [session_routes.py](file:///opt/octopilot-api/session_routes.py)
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from database import get_db
from models import User, Session
from auth import get_current_user

router = APIRouter(prefix="/sessions", tags=["Sessions"])

class SessionCreate(BaseModel):
    login_email: str
    major_name: str = None
    essay_type: str = None

@router.post("")
async def create_session(data: SessionCreate, auth: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.firebase_uid == auth["uid"]))
    user = result.scalar_one_or_none()
    session = Session(user_id=user.id, login_email=data.login_email, major_name=data.major_name, essay_type=data.essay_type)
    db.add(session); await db.commit(); await db.refresh(session)
    return {"id": str(session.id)}

@router.post("/{session_id}/heartbeat")
async def heartbeat(session_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if session:
        session.last_heartbeat = datetime.utcnow()
        await db.commit()
    return {"success": True}
```

### [dashboard_routes.py](file:///opt/octopilot-api/dashboard_routes.py)
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
from models import User, Session
from auth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    total = await db.execute(select(func.count(User.id)))
    active_subs = await db.execute(select(func.count(User.id)).where(User.subscription_status == "active"))
    return {"totalUsers": total.scalar(), "activeSubscriptions": active_subs.scalar()}

@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    return result.scalars().all()

@router.patch("/users/{user_id}/credits")
async def update_credits(user_id: UUID, data: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        user.word_credits = data.get("wordCredits", user.word_credits)
        await db.commit()
    return {"success": True}
```

## Deployment
### [Dockerfile](file:///opt/octopilot-api/Dockerfile)
```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

"""
API Routes for JarViewer
"""

from fastapi import APIRouter

from .endpoints import jars, health

api_router = APIRouter()

# Include route modules
api_router.include_router(health.router, tags=["health"])
api_router.include_router(jars.router, prefix="/jars", tags=["jars"])

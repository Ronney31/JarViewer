"""
API Routes for JarViewer
"""

from fastapi import APIRouter

from .endpoints import jars, health, dependency_exports

api_router = APIRouter()

# Include route modules
api_router.include_router(health.router, tags=["health"])
api_router.include_router(jars.router, prefix="/jars", tags=["jars"])
api_router.include_router(dependency_exports.router, tags=["exports"])

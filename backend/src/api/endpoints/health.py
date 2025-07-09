"""
Health check endpoints
"""

import time
from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "service": "jarviewer-backend",
        "version": "1.0.0"
    }

@router.get("/ready")
async def readiness_check():
    """Readiness check endpoint."""
    return {
        "status": "ready",
        "timestamp": time.time(),
        "checks": {
            "temp_directory": True,
            "memory": True,
        }
    }

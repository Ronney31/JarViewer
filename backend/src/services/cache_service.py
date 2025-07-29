"""
Caching Service for Performance Optimization
Provides Redis-based caching for expensive dependency analysis operations
"""

import json
import hashlib
from typing import Any, Optional, Dict, List, Union
from datetime import datetime, timedelta
import structlog
import redis
from dataclasses import asdict
import pickle
import gzip

from ..core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


class CacheService:
    """Service for caching expensive dependency analysis operations."""
    
    def __init__(self):
        self.redis_client = None
        self.enabled = settings.REDIS_URL is not None and settings.ENABLE_CACHE
        self.default_ttl = 3600  # 1 hour default TTL
        self.compression_threshold = 1024  # Compress data larger than 1KB
        
        if self.enabled and settings.REDIS_URL:
            try:
                self.redis_client = redis.from_url(
                    settings.REDIS_URL,
                    decode_responses=False,  # We handle encoding ourselves
                    socket_connect_timeout=5,
                    socket_timeout=5,
                    retry_on_timeout=True,
                    health_check_interval=30
                )
                # Test connection
                self.redis_client.ping()
                logger.info("Cache service initialized with Redis", redis_url=settings.REDIS_URL)
            except Exception as e:
                logger.warning("Failed to connect to Redis, caching disabled", error=str(e))
                self.enabled = False
                self.redis_client = None
        else:
            logger.info("Cache service initialized without Redis (caching disabled)")
    
    def _generate_cache_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate a cache key from prefix and parameters."""
        # Create a deterministic string from args and kwargs
        key_data = {
            'args': args,
            'kwargs': sorted(kwargs.items())
        }
        key_string = json.dumps(key_data, sort_keys=True)
        key_hash = hashlib.md5(key_string.encode()).hexdigest()
        return f"{prefix}:{key_hash}"
    
    def _serialize_data(self, data: Any) -> bytes:
        """Serialize data for storage with optional compression."""
        try:
            # Use pickle for complex objects, JSON for simple ones
            if isinstance(data, (dict, list, str, int, float, bool)) or data is None:
                serialized = json.dumps(data, default=str).encode('utf-8')
            else:
                serialized = pickle.dumps(data)
            
            # Compress if data is large enough
            if len(serialized) > self.compression_threshold:
                compressed = gzip.compress(serialized)
                # Only use compression if it actually reduces size
                if len(compressed) < len(serialized):
                    return b'compressed:' + compressed
            
            return b'raw:' + serialized
            
        except Exception as e:
            logger.warning("Failed to serialize cache data", error=str(e))
            raise
    
    def _deserialize_data(self, data: bytes) -> Any:
        """Deserialize data from storage with decompression support."""
        try:
            if data.startswith(b'compressed:'):
                decompressed = gzip.decompress(data[11:])  # Remove 'compressed:' prefix
                return self._deserialize_raw(decompressed)
            elif data.startswith(b'raw:'):
                return self._deserialize_raw(data[4:])  # Remove 'raw:' prefix
            else:
                # Legacy format
                return self._deserialize_raw(data)
                
        except Exception as e:
            logger.warning("Failed to deserialize cache data", error=str(e))
            raise
    
    def _deserialize_raw(self, data: bytes) -> Any:
        """Deserialize raw data."""
        try:
            # Try JSON first
            return json.loads(data.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            # Fall back to pickle
            return pickle.loads(data)
    
    async def get(self, key: str) -> Optional[Any]:
        """Get data from cache."""
        if not self.enabled:
            return None
        
        try:
            data = self.redis_client.get(key)
            if data is None:
                return None
            
            result = self._deserialize_data(data)
            logger.debug("Cache hit", key=key)
            return result
            
        except Exception as e:
            logger.warning("Cache get failed", key=key, error=str(e))
            return None
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set data in cache with optional TTL."""
        if not self.enabled:
            return False
        
        try:
            serialized = self._serialize_data(value)
            ttl = ttl or self.default_ttl
            
            result = self.redis_client.setex(key, ttl, serialized)
            logger.debug("Cache set", key=key, ttl=ttl, size=len(serialized))
            return result
            
        except Exception as e:
            logger.warning("Cache set failed", key=key, error=str(e))
            return False
    
    async def delete(self, key: str) -> bool:
        """Delete data from cache."""
        if not self.enabled:
            return False
        
        try:
            result = self.redis_client.delete(key)
            logger.debug("Cache delete", key=key)
            return bool(result)
            
        except Exception as e:
            logger.warning("Cache delete failed", key=key, error=str(e))
            return False
    
    async def clear_pattern(self, pattern: str) -> int:
        """Clear all keys matching a pattern."""
        if not self.enabled:
            return 0
        
        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                result = self.redis_client.delete(*keys)
                logger.info("Cache pattern cleared", pattern=pattern, count=result)
                return result
            return 0
            
        except Exception as e:
            logger.warning("Cache pattern clear failed", pattern=pattern, error=str(e))
            return 0
    
    # Specific caching methods for dependency analysis
    
    async def get_dependency_tree(self, jar_id: str, jar_hash: str) -> Optional[Any]:
        """Get cached dependency tree."""
        key = self._generate_cache_key("dep_tree", jar_id, jar_hash)
        return await self.get(key)
    
    async def set_dependency_tree(self, jar_id: str, jar_hash: str, tree: Any, ttl: int = 7200) -> bool:
        """Cache dependency tree (2 hour TTL by default)."""
        key = self._generate_cache_key("dep_tree", jar_id, jar_hash)
        return await self.set(key, tree, ttl)
    
    async def get_comprehensive_analysis(self, jar_id: str, jar_hash: str) -> Optional[Any]:
        """Get cached comprehensive analysis."""
        key = self._generate_cache_key("comp_analysis", jar_id, jar_hash)
        return await self.get(key)
    
    async def set_comprehensive_analysis(self, jar_id: str, jar_hash: str, analysis: Any, ttl: int = 3600) -> bool:
        """Cache comprehensive analysis (1 hour TTL by default)."""
        key = self._generate_cache_key("comp_analysis", jar_id, jar_hash)
        return await self.set(key, analysis, ttl)
    
    async def get_search_index(self, jar_id: str, jar_hash: str) -> Optional[Any]:
        """Get cached search index."""
        key = self._generate_cache_key("search_index", jar_id, jar_hash)
        return await self.get(key)
    
    async def set_search_index(self, jar_id: str, jar_hash: str, index: Any, ttl: int = 7200) -> bool:
        """Cache search index (2 hour TTL by default)."""
        key = self._generate_cache_key("search_index", jar_id, jar_hash)
        return await self.set(key, index, ttl)
    
    async def get_conflict_analysis(self, jar_id: str, jar_hash: str) -> Optional[Any]:
        """Get cached conflict analysis."""
        key = self._generate_cache_key("conflicts", jar_id, jar_hash)
        return await self.get(key)
    
    async def set_conflict_analysis(self, jar_id: str, jar_hash: str, conflicts: Any, ttl: int = 3600) -> bool:
        """Cache conflict analysis (1 hour TTL by default)."""
        key = self._generate_cache_key("conflicts", jar_id, jar_hash)
        return await self.set(key, conflicts, ttl)
    
    async def invalidate_jar_cache(self, jar_id: str) -> int:
        """Invalidate all cache entries for a specific JAR."""
        patterns = [
            f"dep_tree:*{jar_id}*",
            f"comp_analysis:*{jar_id}*",
            f"search_index:*{jar_id}*",
            f"conflicts:*{jar_id}*"
        ]
        
        total_cleared = 0
        for pattern in patterns:
            total_cleared += await self.clear_pattern(pattern)
        
        logger.info("JAR cache invalidated", jar_id=jar_id, cleared_keys=total_cleared)
        return total_cleared
    
    # Performance monitoring cache
    
    async def get_performance_metrics(self, operation: str, time_window: str = "1h") -> Optional[List[Dict]]:
        """Get cached performance metrics."""
        key = self._generate_cache_key("perf_metrics", operation, time_window)
        return await self.get(key)
    
    async def set_performance_metrics(self, operation: str, metrics: List[Dict], time_window: str = "1h", ttl: int = 300) -> bool:
        """Cache performance metrics (5 minute TTL by default)."""
        key = self._generate_cache_key("perf_metrics", operation, time_window)
        return await self.set(key, metrics, ttl)
    
    # Health check
    
    def health_check(self) -> Dict[str, Any]:
        """Check cache service health."""
        if not self.enabled:
            return {
                "status": "disabled",
                "redis_connected": False,
                "message": "Redis not configured"
            }
        
        try:
            info = self.redis_client.info()
            return {
                "status": "healthy",
                "redis_connected": True,
                "redis_version": info.get("redis_version"),
                "used_memory": info.get("used_memory_human"),
                "connected_clients": info.get("connected_clients"),
                "keyspace_hits": info.get("keyspace_hits", 0),
                "keyspace_misses": info.get("keyspace_misses", 0)
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "redis_connected": False,
                "error": str(e)
            }


# Global cache service instance
cache_service = CacheService()
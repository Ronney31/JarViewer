"""
Performance Monitoring Service
Tracks and analyzes performance metrics for dependency analysis operations
"""

import time
import asyncio
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from collections import defaultdict, deque
import structlog
from contextlib import asynccontextmanager
import threading
import statistics

from .cache_service import cache_service

logger = structlog.get_logger()


@dataclass
class PerformanceMetric:
    """Individual performance metric."""
    operation: str
    start_time: datetime
    end_time: datetime
    duration_ms: float
    success: bool
    error_type: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    memory_usage_mb: Optional[float] = None
    cpu_usage_percent: Optional[float] = None


@dataclass
class PerformanceStats:
    """Aggregated performance statistics."""
    operation: str
    total_calls: int
    success_rate: float
    avg_duration_ms: float
    min_duration_ms: float
    max_duration_ms: float
    p50_duration_ms: float
    p95_duration_ms: float
    p99_duration_ms: float
    error_count: int
    error_types: Dict[str, int]
    last_updated: datetime


class PerformanceMonitoringService:
    """Service for monitoring and analyzing performance metrics."""
    
    def __init__(self):
        self.metrics: Dict[str, deque] = defaultdict(lambda: deque(maxlen=1000))
        self.lock = threading.RLock()
        self.enabled = True
        self.collection_interval = 60  # seconds
        self.retention_hours = 24
        
        # Start background collection task
        self._start_background_collection()
    
    def _start_background_collection(self):
        """Start background task for metric collection and cleanup."""
        def background_task():
            while self.enabled:
                try:
                    self._cleanup_old_metrics()
                    self._aggregate_and_cache_metrics()
                    time.sleep(self.collection_interval)
                except Exception as e:
                    logger.warning("Performance monitoring background task error", error=str(e))
        
        thread = threading.Thread(target=background_task, daemon=True)
        thread.start()
    
    def _cleanup_old_metrics(self):
        """Remove metrics older than retention period."""
        cutoff_time = datetime.now() - timedelta(hours=self.retention_hours)
        
        with self.lock:
            for operation, metrics in self.metrics.items():
                # Remove old metrics
                while metrics and metrics[0].start_time < cutoff_time:
                    metrics.popleft()
    
    def _aggregate_and_cache_metrics(self):
        """Aggregate metrics and cache them for quick access."""
        with self.lock:
            for operation, metrics in self.metrics.items():
                if not metrics:
                    continue
                
                stats = self._calculate_stats(operation, list(metrics))
                
                # Cache aggregated stats
                asyncio.create_task(
                    cache_service.set_performance_metrics(
                        operation, 
                        [asdict(stats)], 
                        "1h", 
                        300  # 5 minute TTL
                    )
                )
    
    def _calculate_stats(self, operation: str, metrics: List[PerformanceMetric]) -> PerformanceStats:
        """Calculate aggregated statistics from metrics."""
        if not metrics:
            return PerformanceStats(
                operation=operation,
                total_calls=0,
                success_rate=0.0,
                avg_duration_ms=0.0,
                min_duration_ms=0.0,
                max_duration_ms=0.0,
                p50_duration_ms=0.0,
                p95_duration_ms=0.0,
                p99_duration_ms=0.0,
                error_count=0,
                error_types={},
                last_updated=datetime.now()
            )
        
        durations = [m.duration_ms for m in metrics]
        successful_metrics = [m for m in metrics if m.success]
        error_metrics = [m for m in metrics if not m.success]
        
        # Calculate percentiles
        sorted_durations = sorted(durations)
        total_count = len(sorted_durations)
        
        def percentile(p: float) -> float:
            if not sorted_durations:
                return 0.0
            index = int(p * (total_count - 1))
            return sorted_durations[index]
        
        # Count error types
        error_types = defaultdict(int)
        for metric in error_metrics:
            if metric.error_type:
                error_types[metric.error_type] += 1
        
        return PerformanceStats(
            operation=operation,
            total_calls=len(metrics),
            success_rate=len(successful_metrics) / len(metrics) * 100,
            avg_duration_ms=statistics.mean(durations) if durations else 0.0,
            min_duration_ms=min(durations) if durations else 0.0,
            max_duration_ms=max(durations) if durations else 0.0,
            p50_duration_ms=percentile(0.5),
            p95_duration_ms=percentile(0.95),
            p99_duration_ms=percentile(0.99),
            error_count=len(error_metrics),
            error_types=dict(error_types),
            last_updated=datetime.now()
        )
    
    @asynccontextmanager
    async def monitor_operation(
        self, 
        operation: str, 
        context: Optional[Dict[str, Any]] = None
    ):
        """Context manager for monitoring operation performance."""
        if not self.enabled:
            yield
            return
        
        start_time = datetime.now()
        start_perf = time.perf_counter()
        success = True
        error_type = None
        
        try:
            yield
        except Exception as e:
            success = False
            error_type = type(e).__name__
            raise
        finally:
            end_time = datetime.now()
            end_perf = time.perf_counter()
            duration_ms = (end_perf - start_perf) * 1000
            
            metric = PerformanceMetric(
                operation=operation,
                start_time=start_time,
                end_time=end_time,
                duration_ms=duration_ms,
                success=success,
                error_type=error_type,
                context=context
            )
            
            self.record_metric(metric)
    
    def record_metric(self, metric: PerformanceMetric):
        """Record a performance metric."""
        if not self.enabled:
            return
        
        with self.lock:
            self.metrics[metric.operation].append(metric)
        
        # Log slow operations
        if metric.duration_ms > 5000:  # 5 seconds
            logger.warning(
                "Slow operation detected",
                operation=metric.operation,
                duration_ms=metric.duration_ms,
                success=metric.success,
                context=metric.context
            )
    
    async def get_stats(self, operation: str, time_window: str = "1h") -> Optional[PerformanceStats]:
        """Get performance statistics for an operation."""
        # Try cache first
        cached_stats = await cache_service.get_performance_metrics(operation, time_window)
        if cached_stats and cached_stats:
            return PerformanceStats(**cached_stats[0])
        
        # Calculate from in-memory metrics
        with self.lock:
            metrics = list(self.metrics.get(operation, []))
        
        if not metrics:
            return None
        
        # Filter by time window
        if time_window == "1h":
            cutoff = datetime.now() - timedelta(hours=1)
        elif time_window == "24h":
            cutoff = datetime.now() - timedelta(hours=24)
        else:
            cutoff = datetime.now() - timedelta(hours=1)
        
        filtered_metrics = [m for m in metrics if m.start_time >= cutoff]
        
        if not filtered_metrics:
            return None
        
        return self._calculate_stats(operation, filtered_metrics)
    
    async def get_all_stats(self, time_window: str = "1h") -> Dict[str, PerformanceStats]:
        """Get performance statistics for all operations."""
        stats = {}
        
        with self.lock:
            operations = list(self.metrics.keys())
        
        for operation in operations:
            operation_stats = await self.get_stats(operation, time_window)
            if operation_stats:
                stats[operation] = operation_stats
        
        return stats
    
    def get_slow_operations(self, threshold_ms: float = 1000, limit: int = 10) -> List[PerformanceMetric]:
        """Get slowest operations above threshold."""
        slow_operations = []
        
        with self.lock:
            for operation, metrics in self.metrics.items():
                for metric in metrics:
                    if metric.duration_ms > threshold_ms:
                        slow_operations.append(metric)
        
        # Sort by duration (slowest first)
        slow_operations.sort(key=lambda x: x.duration_ms, reverse=True)
        return slow_operations[:limit]
    
    def get_error_summary(self, time_window: str = "1h") -> Dict[str, Dict[str, int]]:
        """Get error summary by operation and error type."""
        if time_window == "1h":
            cutoff = datetime.now() - timedelta(hours=1)
        elif time_window == "24h":
            cutoff = datetime.now() - timedelta(hours=24)
        else:
            cutoff = datetime.now() - timedelta(hours=1)
        
        error_summary = defaultdict(lambda: defaultdict(int))
        
        with self.lock:
            for operation, metrics in self.metrics.items():
                for metric in metrics:
                    if (not metric.success and 
                        metric.start_time >= cutoff and 
                        metric.error_type):
                        error_summary[operation][metric.error_type] += 1
        
        return dict(error_summary)
    
    async def get_performance_report(self) -> Dict[str, Any]:
        """Get comprehensive performance report."""
        all_stats = await self.get_all_stats("1h")
        slow_ops = self.get_slow_operations()
        error_summary = self.get_error_summary("1h")
        
        # Calculate overall health score
        total_calls = sum(stats.total_calls for stats in all_stats.values())
        total_errors = sum(stats.error_count for stats in all_stats.values())
        avg_success_rate = statistics.mean([stats.success_rate for stats in all_stats.values()]) if all_stats else 100.0
        
        health_score = min(100.0, avg_success_rate * (1 - min(0.5, len(slow_ops) / max(1, total_calls))))
        
        return {
            "timestamp": datetime.now().isoformat(),
            "health_score": round(health_score, 2),
            "total_operations": len(all_stats),
            "total_calls": total_calls,
            "total_errors": total_errors,
            "operation_stats": {op: asdict(stats) for op, stats in all_stats.items()},
            "slow_operations": [asdict(op) for op in slow_ops],
            "error_summary": error_summary,
            "recommendations": self._generate_recommendations(all_stats, slow_ops, error_summary)
        }
    
    def _generate_recommendations(
        self, 
        stats: Dict[str, PerformanceStats], 
        slow_ops: List[PerformanceMetric],
        errors: Dict[str, Dict[str, int]]
    ) -> List[str]:
        """Generate performance recommendations."""
        recommendations = []
        
        # Check for slow operations
        if slow_ops:
            recommendations.append(
                f"Found {len(slow_ops)} slow operations. Consider optimizing or adding caching."
            )
        
        # Check for high error rates
        for operation, operation_stats in stats.items():
            if operation_stats.success_rate < 95.0:
                recommendations.append(
                    f"Operation '{operation}' has low success rate ({operation_stats.success_rate:.1f}%). "
                    "Review error handling and retry logic."
                )
        
        # Check for high latency operations
        for operation, operation_stats in stats.items():
            if operation_stats.p95_duration_ms > 5000:  # 5 seconds
                recommendations.append(
                    f"Operation '{operation}' has high P95 latency ({operation_stats.p95_duration_ms:.0f}ms). "
                    "Consider performance optimization."
                )
        
        # Check for frequent errors
        for operation, error_types in errors.items():
            total_errors = sum(error_types.values())
            if total_errors > 10:  # More than 10 errors in the last hour
                recommendations.append(
                    f"Operation '{operation}' has frequent errors ({total_errors} in last hour). "
                    "Review error patterns and root causes."
                )
        
        if not recommendations:
            recommendations.append("System performance is healthy. No immediate optimizations needed.")
        
        return recommendations
    
    def enable(self):
        """Enable performance monitoring."""
        self.enabled = True
        logger.info("Performance monitoring enabled")
    
    def disable(self):
        """Disable performance monitoring."""
        self.enabled = False
        logger.info("Performance monitoring disabled")
    
    def clear_metrics(self, operation: Optional[str] = None):
        """Clear metrics for specific operation or all operations."""
        with self.lock:
            if operation:
                self.metrics[operation].clear()
                logger.info("Metrics cleared for operation", operation=operation)
            else:
                self.metrics.clear()
                logger.info("All metrics cleared")


# Global performance monitoring service instance
performance_service = PerformanceMonitoringService()


# Decorator for easy performance monitoring
def monitor_performance(operation: str, context: Optional[Dict[str, Any]] = None):
    """Decorator for monitoring function performance."""
    def decorator(func: Callable):
        if asyncio.iscoroutinefunction(func):
            async def async_wrapper(*args, **kwargs):
                async with performance_service.monitor_operation(operation, context):
                    return await func(*args, **kwargs)
            return async_wrapper
        else:
            def sync_wrapper(*args, **kwargs):
                # For sync functions, we need to handle the async context manager differently
                start_time = datetime.now()
                start_perf = time.perf_counter()
                success = True
                error_type = None
                
                try:
                    result = func(*args, **kwargs)
                    return result
                except Exception as e:
                    success = False
                    error_type = type(e).__name__
                    raise
                finally:
                    end_time = datetime.now()
                    end_perf = time.perf_counter()
                    duration_ms = (end_perf - start_perf) * 1000
                    
                    metric = PerformanceMetric(
                        operation=operation,
                        start_time=start_time,
                        end_time=end_time,
                        duration_ms=duration_ms,
                        success=success,
                        error_type=error_type,
                        context=context
                    )
                    
                    performance_service.record_metric(metric)
            
            return sync_wrapper
    return decorator
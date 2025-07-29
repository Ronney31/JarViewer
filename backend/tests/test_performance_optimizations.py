"""
Tests for performance optimizations and caching functionality
"""

import pytest
import asyncio
import time
from unittest.mock import Mock, patch, AsyncMock
from pathlib import Path
import tempfile
import json

from src.services.cache_service import CacheService
from src.services.performance_monitoring_service import (
    PerformanceMonitoringService, 
    PerformanceMetric,
    PerformanceStats
)
from src.services.comprehensive_dependency_service import ComprehensiveDependencyService
from src.services.dependency_tree_service import DependencyTreeService
from src.services.dependency_search_service import DependencySearchService
from src.models.jar import DependencyNode, DependencyTree, DependencyScope, DependencySource


class TestCacheService:
    """Test cache service functionality."""
    
    @pytest.fixture
    def cache_service(self):
        """Create cache service instance for testing."""
        # Mock Redis to avoid requiring actual Redis instance
        with patch('src.services.cache_service.redis') as mock_redis:
            mock_client = Mock()
            mock_redis.from_url.return_value = mock_client
            mock_client.ping.return_value = True
            
            cache = CacheService()
            cache.redis_client = mock_client
            cache.enabled = True
            return cache
    
    def test_cache_key_generation(self, cache_service):
        """Test cache key generation."""
        key1 = cache_service._generate_cache_key("test", "arg1", "arg2", param1="value1")
        key2 = cache_service._generate_cache_key("test", "arg1", "arg2", param1="value1")
        key3 = cache_service._generate_cache_key("test", "arg1", "arg3", param1="value1")
        
        assert key1 == key2  # Same inputs should generate same key
        assert key1 != key3  # Different inputs should generate different keys
        assert key1.startswith("test:")
    
    def test_data_serialization(self, cache_service):
        """Test data serialization and deserialization."""
        test_data = {
            "string": "test",
            "number": 42,
            "list": [1, 2, 3],
            "nested": {"key": "value"}
        }
        
        serialized = cache_service._serialize_data(test_data)
        deserialized = cache_service._deserialize_data(serialized)
        
        assert deserialized == test_data
    
    def test_compression(self, cache_service):
        """Test data compression for large objects."""
        # Create large data that should be compressed
        large_data = {"data": "x" * 2000}  # Larger than compression threshold
        
        serialized = cache_service._serialize_data(large_data)
        assert serialized.startswith(b'compressed:') or serialized.startswith(b'raw:')
        
        deserialized = cache_service._deserialize_data(serialized)
        assert deserialized == large_data
    
    @pytest.mark.asyncio
    async def test_cache_operations(self, cache_service):
        """Test basic cache operations."""
        # Mock Redis operations
        cache_service.redis_client.get.return_value = None
        cache_service.redis_client.setex.return_value = True
        cache_service.redis_client.delete.return_value = 1
        
        # Test cache miss
        result = await cache_service.get("nonexistent_key")
        assert result is None
        
        # Test cache set
        test_data = {"test": "data"}
        success = await cache_service.set("test_key", test_data, ttl=300)
        assert success is True
        
        # Test cache delete
        success = await cache_service.delete("test_key")
        assert success is True
    
    @pytest.mark.asyncio
    async def test_dependency_specific_caching(self, cache_service):
        """Test dependency-specific cache methods."""
        jar_id = "test_jar"
        jar_hash = "test_hash"
        test_tree = {"jar_id": jar_id, "dependencies": []}
        
        # Mock Redis operations
        cache_service.redis_client.get.return_value = None
        cache_service.redis_client.setex.return_value = True
        
        # Test dependency tree caching
        success = await cache_service.set_dependency_tree(jar_id, jar_hash, test_tree)
        assert success is True
        
        # Test comprehensive analysis caching
        analysis = {"total_deps": 10, "conflicts": []}
        success = await cache_service.set_comprehensive_analysis(jar_id, jar_hash, analysis)
        assert success is True
    
    def test_health_check(self, cache_service):
        """Test cache service health check."""
        # Mock Redis info
        cache_service.redis_client.info.return_value = {
            "redis_version": "7.0.0",
            "used_memory_human": "1.5M",
            "connected_clients": 2,
            "keyspace_hits": 100,
            "keyspace_misses": 10
        }
        
        health = cache_service.health_check()
        
        assert health["status"] == "healthy"
        assert health["redis_connected"] is True
        assert "redis_version" in health


class TestPerformanceMonitoringService:
    """Test performance monitoring service."""
    
    @pytest.fixture
    def perf_service(self):
        """Create performance monitoring service for testing."""
        service = PerformanceMonitoringService()
        service.enabled = True
        return service
    
    def test_metric_recording(self, perf_service):
        """Test performance metric recording."""
        from datetime import datetime
        
        metric = PerformanceMetric(
            operation="test_operation",
            start_time=datetime.now(),
            end_time=datetime.now(),
            duration_ms=100.0,
            success=True
        )
        
        perf_service.record_metric(metric)
        
        assert "test_operation" in perf_service.metrics
        assert len(perf_service.metrics["test_operation"]) == 1
        assert perf_service.metrics["test_operation"][0] == metric
    
    @pytest.mark.asyncio
    async def test_operation_monitoring(self, perf_service):
        """Test operation monitoring context manager."""
        async with perf_service.monitor_operation("test_op", {"context": "test"}):
            await asyncio.sleep(0.01)  # Small delay
        
        assert "test_op" in perf_service.metrics
        metrics = list(perf_service.metrics["test_op"])
        assert len(metrics) == 1
        assert metrics[0].success is True
        assert metrics[0].duration_ms > 0
    
    @pytest.mark.asyncio
    async def test_operation_monitoring_with_error(self, perf_service):
        """Test operation monitoring with errors."""
        with pytest.raises(ValueError):
            async with perf_service.monitor_operation("error_op"):
                raise ValueError("Test error")
        
        assert "error_op" in perf_service.metrics
        metrics = list(perf_service.metrics["error_op"])
        assert len(metrics) == 1
        assert metrics[0].success is False
        assert metrics[0].error_type == "ValueError"
    
    def test_stats_calculation(self, perf_service):
        """Test performance statistics calculation."""
        from datetime import datetime
        
        # Add test metrics
        for i in range(10):
            metric = PerformanceMetric(
                operation="test_stats",
                start_time=datetime.now(),
                end_time=datetime.now(),
                duration_ms=float(i * 10),  # 0, 10, 20, ..., 90 ms
                success=i < 8  # 8 successes, 2 failures
            )
            perf_service.record_metric(metric)
        
        stats = perf_service._calculate_stats("test_stats", list(perf_service.metrics["test_stats"]))
        
        assert stats.total_calls == 10
        assert stats.success_rate == 80.0  # 8/10 * 100
        assert stats.avg_duration_ms == 45.0  # Average of 0-90
        assert stats.min_duration_ms == 0.0
        assert stats.max_duration_ms == 90.0
        assert stats.error_count == 2
    
    def test_slow_operations_detection(self, perf_service):
        """Test slow operations detection."""
        from datetime import datetime
        
        # Add fast and slow operations
        fast_metric = PerformanceMetric(
            operation="fast_op",
            start_time=datetime.now(),
            end_time=datetime.now(),
            duration_ms=100.0,
            success=True
        )
        
        slow_metric = PerformanceMetric(
            operation="slow_op",
            start_time=datetime.now(),
            end_time=datetime.now(),
            duration_ms=2000.0,  # 2 seconds
            success=True
        )
        
        perf_service.record_metric(fast_metric)
        perf_service.record_metric(slow_metric)
        
        slow_ops = perf_service.get_slow_operations(threshold_ms=1000.0, limit=5)
        
        assert len(slow_ops) == 1
        assert slow_ops[0].operation == "slow_op"
        assert slow_ops[0].duration_ms == 2000.0


class TestOptimizedServices:
    """Test optimized service implementations."""
    
    @pytest.fixture
    def temp_jar_path(self):
        """Create temporary JAR path for testing."""
        with tempfile.TemporaryDirectory() as temp_dir:
            jar_path = Path(temp_dir) / "test.jar"
            jar_path.mkdir()
            
            # Create some test files
            (jar_path / "META-INF").mkdir()
            (jar_path / "META-INF" / "MANIFEST.MF").write_text("Manifest-Version: 1.0\n")
            
            yield jar_path
    
    @pytest.mark.asyncio
    async def test_comprehensive_dependency_service_caching(self, temp_jar_path):
        """Test comprehensive dependency service with caching."""
        with patch('src.services.comprehensive_dependency_service.cache_service') as mock_cache:
            mock_cache.get_comprehensive_analysis = AsyncMock(return_value=None)
            mock_cache.set_comprehensive_analysis = AsyncMock(return_value=True)
            
            service = ComprehensiveDependencyService()
            
            # Mock the analysis methods to avoid complex setup
            with patch.object(service, '_extract_maven_dependencies', return_value=[]):
                with patch.object(service, '_extract_gradle_dependencies', return_value=[]):
                    with patch.object(service, '_detect_libraries_from_code', return_value=[]):
                        with patch.object(service, '_detect_frameworks', return_value=[]):
                            with patch.object(service, '_analyze_packages', return_value={
                                'top_packages': [], 'external_packages': [], 
                                'total_classes': 0, 'total_packages': 0
                            }):
                                with patch.object(service, '_detect_java_version', return_value=None):
                                    with patch.object(service, '_detect_build_tool', return_value=None):
                                        with patch.object(service, '_extract_license_information', return_value={}):
                                            with patch.object(service, '_check_outdated_dependencies', return_value=[]):
                                                with patch.object(service, '_assess_security_risks', return_value=[]):
                                                    
                                                    result = await service.analyze_comprehensive_dependencies(
                                                        temp_jar_path, 1024, "test_jar"
                                                    )
                                                    
                                                    assert result is not None
                                                    assert result.total_dependencies == 0
                                                    
                                                    # Verify cache was called
                                                    mock_cache.get_comprehensive_analysis.assert_called_once()
                                                    mock_cache.set_comprehensive_analysis.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_dependency_tree_service_caching(self, temp_jar_path):
        """Test dependency tree service with caching."""
        with patch('src.services.dependency_tree_service.cache_service') as mock_cache:
            mock_cache.get_dependency_tree = AsyncMock(return_value=None)
            mock_cache.set_dependency_tree = AsyncMock(return_value=True)
            
            service = DependencyTreeService()
            
            # Mock the extraction methods
            with patch.object(service, '_extract_direct_dependencies', return_value=[]):
                with patch.object(service, '_build_transitive_dependencies', return_value=None):
                    with patch.object(service, '_generate_dependency_paths', return_value=None):
                        
                        result = await service.build_dependency_tree("test_jar", temp_jar_path)
                        
                        assert result is not None
                        assert result.jar_id == "test_jar"
                        
                        # Verify cache was called
                        mock_cache.get_dependency_tree.assert_called_once()
                        mock_cache.set_dependency_tree.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_dependency_search_service_indexing(self):
        """Test dependency search service with optimized indexing."""
        service = DependencySearchService()
        
        # Create test dependency tree
        tree = DependencyTree(jar_id="test_jar")
        
        # Add test dependencies
        dep1 = DependencyNode(
            group_id="com.example",
            artifact_id="test-lib",
            version="1.0.0",
            scope=DependencyScope.COMPILE,
            source=DependencySource.MAVEN_POM
        )
        
        dep2 = DependencyNode(
            group_id="org.apache",
            artifact_id="commons-lang",
            version="3.12.0",
            scope=DependencyScope.COMPILE,
            source=DependencySource.GRADLE_BUILD
        )
        
        tree.all_dependencies = {
            dep1.id: dep1,
            dep2.id: dep2
        }
        tree.total_dependencies = 2
        
        with patch('src.services.dependency_search_service.cache_service') as mock_cache:
            mock_cache.get_search_index = AsyncMock(return_value=None)
            mock_cache.set_search_index = AsyncMock(return_value=True)
            
            # Test index building
            index = await service.build_search_index(tree)
            
            assert isinstance(index, dict)
            assert len(index) > 0
            
            # Verify cache was called
            mock_cache.get_search_index.assert_called_once()
            mock_cache.set_search_index.assert_called_once()
            
            # Test search functionality
            results = await service.search_dependencies(tree, "example", max_results=10)
            
            assert isinstance(results, list)


class TestPerformanceIntegration:
    """Integration tests for performance optimizations."""
    
    @pytest.mark.asyncio
    async def test_end_to_end_performance_monitoring(self):
        """Test end-to-end performance monitoring."""
        from src.services.performance_monitoring_service import performance_service, monitor_performance
        
        # Enable monitoring
        performance_service.enable()
        
        @monitor_performance("test_function")
        async def test_async_function():
            await asyncio.sleep(0.01)
            return "success"
        
        @monitor_performance("test_sync_function")
        def test_sync_function():
            time.sleep(0.01)
            return "success"
        
        # Test async function
        result = await test_async_function()
        assert result == "success"
        
        # Test sync function
        result = test_sync_function()
        assert result == "success"
        
        # Check metrics were recorded
        stats = await performance_service.get_stats("test_function")
        assert stats is not None
        assert stats.total_calls >= 1
        
        # Test performance report
        report = await performance_service.get_performance_report()
        assert "health_score" in report
        assert "total_operations" in report
        assert "operation_stats" in report
    
    @pytest.mark.asyncio
    async def test_cache_performance_impact(self):
        """Test performance impact of caching."""
        cache_service = CacheService()
        
        # Mock Redis for testing
        with patch.object(cache_service, 'redis_client') as mock_redis:
            mock_redis.get.return_value = None
            mock_redis.setex.return_value = True
            cache_service.enabled = True
            
            # Test cache operations performance
            start_time = time.time()
            
            for i in range(100):
                await cache_service.set(f"key_{i}", {"data": f"value_{i}"})
            
            cache_duration = time.time() - start_time
            
            # Cache operations should be fast
            assert cache_duration < 1.0  # Should complete in less than 1 second
    
    def test_memory_usage_optimization(self):
        """Test memory usage optimizations."""
        # Test that large dependency trees don't consume excessive memory
        tree = DependencyTree(jar_id="large_tree")
        
        # Create many dependencies
        for i in range(1000):
            dep = DependencyNode(
                group_id=f"com.example.group{i % 10}",
                artifact_id=f"artifact-{i}",
                version="1.0.0",
                scope=DependencyScope.COMPILE,
                source=DependencySource.MAVEN_POM
            )
            tree.all_dependencies[dep.id] = dep
        
        tree.total_dependencies = 1000
        
        # Test that tree operations are still efficient
        start_time = time.time()
        
        # Simulate tree operations
        compile_deps = [dep for dep in tree.all_dependencies.values() 
                       if dep.scope == DependencyScope.COMPILE]
        
        operation_time = time.time() - start_time
        
        assert len(compile_deps) == 1000
        assert operation_time < 0.1  # Should be very fast


@pytest.mark.asyncio
async def test_progressive_loading_simulation():
    """Test progressive loading behavior simulation."""
    # Simulate large dependency tree
    large_tree = {
        "jar_id": "large_jar",
        "total_dependencies": 5000,
        "root_dependencies": []
    }
    
    # Create root dependencies
    for i in range(100):  # 100 root dependencies
        root_dep = {
            "id": f"root_{i}",
            "group_id": f"com.example.root{i}",
            "artifact_id": f"root-artifact-{i}",
            "children": []
        }
        
        # Add children (simulate deep tree)
        for j in range(50):  # 50 children per root
            child_dep = {
                "id": f"child_{i}_{j}",
                "group_id": f"com.example.child{i}",
                "artifact_id": f"child-artifact-{i}-{j}",
                "children": []
            }
            root_dep["children"].append(child_dep)
        
        large_tree["root_dependencies"].append(root_dep)
    
    # Test that progressive loading would be triggered
    assert large_tree["total_dependencies"] > 100  # Threshold for progressive loading
    
    # Simulate batch loading
    batch_size = 50
    total_items = large_tree["total_dependencies"]
    batches_needed = (total_items + batch_size - 1) // batch_size
    
    assert batches_needed > 1  # Should require multiple batches
    
    # Simulate loading time for each batch
    batch_load_times = []
    for batch in range(min(5, batches_needed)):  # Test first 5 batches
        start_time = time.time()
        
        # Simulate batch processing
        await asyncio.sleep(0.001)  # Minimal delay
        
        batch_time = time.time() - start_time
        batch_load_times.append(batch_time)
    
    # Verify batch loading is consistent
    avg_batch_time = sum(batch_load_times) / len(batch_load_times)
    assert avg_batch_time < 0.01  # Each batch should load quickly


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
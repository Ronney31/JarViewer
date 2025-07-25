#!/usr/bin/env python3
"""
Integration test for dependency export API endpoints
"""

import sys
import os
import json
import asyncio
from pathlib import Path
from unittest.mock import Mock, patch

# Add the src directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Mock structlog to avoid dependency issues
class MockLogger:
    def info(self, *args, **kwargs):
        print(f"INFO: {args} {kwargs}")
    
    def warning(self, *args, **kwargs):
        print(f"WARNING: {args} {kwargs}")
    
    def error(self, *args, **kwargs):
        print(f"ERROR: {args} {kwargs}")

class MockStructlog:
    def get_logger(self):
        return MockLogger()

sys.modules['structlog'] = MockStructlog()

# Import the models and services
from src.models.jar import (
    DependencyNode, DependencyTree, DependencyConflict, ConflictType, 
    ConflictSeverity, DependencyScope, DependencySource, JarFile
)

from src.services.dependency_export_service import (
    DependencyExportService, ExportFormat, ExportOptions
)

from src.api.endpoints.dependency_exports import (
    get_export_formats, preview_dependency_export, export_dependencies
)

async def test_export_api_integration():
    """Test the complete export API integration."""
    print("\n=== Testing Export API Integration ===\n")
    
    # Test 1: Test get_export_formats endpoint
    print("1. Testing get_export_formats endpoint...")
    formats_response = await get_export_formats()
    
    print(f"   ✓ Formats response received")
    print(f"   ✓ Available formats: {len(formats_response['formats'])}")
    
    # Verify format structure
    for fmt in formats_response['formats']:
        assert 'id' in fmt
        assert 'name' in fmt
        assert 'description' in fmt
        assert 'mime_type' in fmt
        assert 'extension' in fmt
        print(f"   ✓ Format {fmt['id']}: {fmt['name']}")
    
    # Test 2: Create mock JAR service and dependency tree service
    print("\n2. Setting up mock services...")
    
    # Create sample dependency tree
    tree = DependencyTree(jar_id="test-jar-id")
    
    # Add dependencies
    root_dep = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-boot-starter",
        version="2.7.0",
        scope=DependencyScope.COMPILE,
        source=DependencySource.MAVEN_POM,
        description="Spring Boot Starter"
    )
    tree.add_dependency(root_dep)
    
    child_dep = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-core",
        version="5.3.21",
        scope=DependencyScope.COMPILE,
        source=DependencySource.MAVEN_POM,
        description="Spring Core"
    )
    tree.add_dependency(child_dep, root_dep.id)
    
    # Add conflict
    conflict = DependencyConflict(
        conflict_type=ConflictType.VERSION_CONFLICT,
        affected_dependencies=[child_dep.id],
        description="Version conflict for spring-core",
        severity=ConflictSeverity.HIGH,
        conflicting_versions=["5.3.21", "5.2.15"],
        resolution_suggestion="Use version 5.3.21"
    )
    tree.conflicts = [conflict]
    tree.update_all_conflict_status()
    
    # Create mock JAR file
    from src.models.jar import JarStats, JarMetadata
    
    mock_stats = JarStats(
        total_files=10,
        total_directories=5,
        total_size=1024,
        compressed_size=512,
        compression_ratio=0.5,
        file_types={"class": 8, "xml": 2}
    )
    
    mock_metadata = JarMetadata(
        manifest=None,
        dependencies=[],
        frameworks=[]
    )
    
    mock_jar_file = JarFile(
        name="test-jar.jar",
        size=1024,
        structure=[],
        stats=mock_stats,
        metadata=mock_metadata,
        temp_path="/tmp/test-jar.jar"
    )
    
    print(f"   ✓ Created mock dependency tree with {tree.total_dependencies} dependencies")
    print(f"   ✓ Created mock JAR file: {mock_jar_file.name}")
    
    # Test 3: Test preview endpoint with mocked services
    print("\n3. Testing preview_dependency_export endpoint...")
    
    with patch('src.api.endpoints.dependency_exports.jar_service') as mock_jar_service, \
         patch('src.api.endpoints.dependency_exports.dependency_tree_service') as mock_tree_service:
        
        # Setup mocks
        mock_jar_service.active_jars = {"test-jar-id": mock_jar_file}
        
        async def mock_build_tree(*args, **kwargs):
            return tree
        
        mock_tree_service.build_dependency_tree = mock_build_tree
        
        # Test preview (pass None for scope to avoid Query object issues)
        preview_response = await preview_dependency_export(
            jar_id="test-jar-id",
            format=ExportFormat.JSON,
            include_transitive=True,
            include_conflicts=True,
            include_metadata=True,
            scope=None
        )
        
        print(f"   ✓ Preview response received")
        print(f"   ✓ Format: {preview_response['format']}")
        print(f"   ✓ Filename: {preview_response['filename']}")
        print(f"   ✓ MIME type: {preview_response['mime_type']}")
        print(f"   ✓ Total dependencies: {preview_response['total_dependencies']}")
        print(f"   ✓ Preview content length: {len(preview_response['preview'])}")
        
        # Verify preview structure
        assert preview_response['format'] == 'json'
        assert preview_response['total_dependencies'] == tree.total_dependencies
        assert 'preview' in preview_response
        assert 'is_truncated' in preview_response
    
    # Test 4: Test export endpoint with different formats
    print("\n4. Testing export_dependencies endpoint...")
    
    with patch('src.api.endpoints.dependency_exports.jar_service') as mock_jar_service, \
         patch('src.api.endpoints.dependency_exports.dependency_tree_service') as mock_tree_service:
        
        # Setup mocks
        mock_jar_service.active_jars = {"test-jar-id": mock_jar_file}
        
        async def mock_build_tree(*args, **kwargs):
            return tree
        
        mock_tree_service.build_dependency_tree = mock_build_tree
        
        # Test JSON export
        print("   Testing JSON export...")
        json_response = await export_dependencies(
            jar_id="test-jar-id",
            format=ExportFormat.JSON,
            include_transitive=True,
            include_conflicts=True,
            include_metadata=True
        )
        
        print(f"   ✓ JSON export completed")
        print(f"   ✓ Response type: {type(json_response)}")
        
        # Test CSV export
        print("   Testing CSV export...")
        csv_response = await export_dependencies(
            jar_id="test-jar-id",
            format=ExportFormat.CSV,
            include_transitive=True,
            include_conflicts=True,
            include_metadata=True
        )
        
        print(f"   ✓ CSV export completed")
        print(f"   ✓ Response type: {type(csv_response)}")
        
        # Test TEXT_TREE export
        print("   Testing TEXT_TREE export...")
        text_response = await export_dependencies(
            jar_id="test-jar-id",
            format=ExportFormat.TEXT_TREE,
            include_transitive=True,
            include_conflicts=True,
            include_metadata=True
        )
        
        print(f"   ✓ TEXT_TREE export completed")
        print(f"   ✓ Response type: {type(text_response)}")
    
    # Test 5: Test filtering options
    print("\n5. Testing export filtering options...")
    
    with patch('src.api.endpoints.dependency_exports.jar_service') as mock_jar_service, \
         patch('src.api.endpoints.dependency_exports.dependency_tree_service') as mock_tree_service:
        
        # Setup mocks
        mock_jar_service.active_jars = {"test-jar-id": mock_jar_file}
        
        async def mock_build_tree(*args, **kwargs):
            return tree
        
        mock_tree_service.build_dependency_tree = mock_build_tree
        
        # Test scope filtering
        print("   Testing scope filtering...")
        scope_response = await export_dependencies(
            jar_id="test-jar-id",
            format=ExportFormat.JSON,
            scope=["compile"]
        )
        print(f"   ✓ Scope filtering completed")
        
        # Test conflict filtering
        print("   Testing conflict filtering...")
        conflict_response = await export_dependencies(
            jar_id="test-jar-id",
            format=ExportFormat.JSON,
            filter_conflicts=True
        )
        print(f"   ✓ Conflict filtering completed")
        
        # Test max depth filtering
        print("   Testing max depth filtering...")
        depth_response = await export_dependencies(
            jar_id="test-jar-id",
            format=ExportFormat.JSON,
            max_depth=1
        )
        print(f"   ✓ Max depth filtering completed")
    
    print("\n=== All API integration tests passed! ===")
    return True

if __name__ == "__main__":
    try:
        asyncio.run(test_export_api_integration())
        print("\n🎉 SUCCESS: Export API integration is complete and functional!")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
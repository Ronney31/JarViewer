#!/usr/bin/env python3
"""
Quick test to check if export service is working
"""

import sys
import os
import json
import signal
from pathlib import Path

# Add the src directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Mock structlog to avoid dependency issues
class MockLogger:
    def info(self, *args, **kwargs):
        print(f"INFO: {args} {kwargs}")
    
    def warning(self, *args, **kwargs):
        print(f"WARNING: {args} {kwargs}")

class MockStructlog:
    def get_logger(self):
        return MockLogger()

sys.modules['structlog'] = MockStructlog()

# Import the models directly from src
from src.models.jar import (
    DependencyNode, DependencyTree, DependencyConflict, ConflictType, 
    ConflictSeverity, DependencyScope, DependencySource
)

# Import the export service
from src.services.dependency_export_service import (
    DependencyExportService, ExportFormat, ExportOptions, ExportResult
)

def timeout_handler(signum, frame):
    raise TimeoutError("Test timed out")

async def test_basic_export():
    """Test basic export functionality."""
    print("Testing basic export...")
    
    # Set timeout
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(10)  # 10 second timeout
    
    try:
        # Create a simple dependency tree
        tree = DependencyTree(jar_id="test-jar")
        
        # Add one simple dependency
        dep = DependencyNode(
            group_id="org.example",
            artifact_id="test-lib",
            version="1.0.0",
            scope=DependencyScope.COMPILE,
            source=DependencySource.MAVEN_POM
        )
        tree.add_dependency(dep)
        
        print(f"Created tree with {tree.total_dependencies} dependencies")
        
        # Create export service
        export_service = DependencyExportService()
        
        # Test JSON export
        print("Testing JSON export...")
        result = await export_service.export_dependency_tree(
            tree=tree,
            format=ExportFormat.JSON,
            options=ExportOptions(),
            jar_name="test"
        )
        
        print(f"JSON export successful: {result.filename}, size: {result.size}")
        
        # Parse JSON to verify
        json_data = json.loads(result.content)
        print(f"JSON contains {len(json_data['dependencies'])} dependencies")
        
        signal.alarm(0)  # Cancel timeout
        return True
        
    except TimeoutError:
        print("ERROR: Test timed out!")
        return False
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    import asyncio
    
    try:
        success = asyncio.run(test_basic_export())
        if success:
            print("✓ Basic export test passed!")
        else:
            print("✗ Basic export test failed!")
            sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)
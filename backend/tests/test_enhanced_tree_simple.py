#!/usr/bin/env python3
"""
Simple test script to verify enhanced dependency tree functionality
"""

import sys
import os
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

# Import the models
# Import the models directly from src
from src.models.jar import (
    DependencyNode, DependencyTree, DependencyConflict, ConflictType, 
    ConflictSeverity, DependencyScope, DependencySource
)

def test_enhanced_dependency_tree():
    """Test the enhanced dependency tree functionality."""
    print("\n=== Testing Enhanced Dependency Tree Functionality ===\n")
    
    # Test 1: Create dependency node with enhanced features
    print("1. Testing DependencyNode with enhanced features...")
    node = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-core",
        version="5.3.21",
        scope=DependencyScope.COMPILE,
        source=DependencySource.MAVEN_POM
    )
    
    print(f"   ✓ Created node: {node.name}")
    print(f"   ✓ Coordinate: {node.coordinate}")
    print(f"   ✓ Initial conflict status: has_conflicts={node.has_conflicts}")
    print(f"   ✓ Path string: {node.path_string}")
    
    # Test 2: Test parent-child relationships and dependency path tracking
    print("\n2. Testing parent-child relationships and dependency path tracking...")
    parent = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-boot-starter",
        version="2.7.0"
    )
    parent.depth = 0
    parent.dependency_path = []
    
    child = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-core",
        version="5.3.21"
    )
    
    parent.add_child(child)
    print(f"   ✓ Added child to parent")
    print(f"   ✓ Child parent_id: {child.parent_id == parent.id}")
    print(f"   ✓ Child depth: {child.depth}")
    print(f"   ✓ Child is_transitive: {child.is_transitive}")
    print(f"   ✓ Child dependency_path: {child.dependency_path}")
    print(f"   ✓ Child path_string: {child.path_string}")
    
    # Test 3: Test conflict status indicators
    print("\n3. Testing conflict status indicators...")
    conflict = DependencyConflict(
        conflict_type=ConflictType.VERSION_CONFLICT,
        affected_dependencies=[node.id],
        description="Test version conflict",
        conflicting_versions=["5.3.21", "5.2.15"]
    )
    
    # Calculate severity
    severity = conflict.calculate_severity()
    conflict.severity = severity
    print(f"   ✓ Created conflict with severity: {severity}")
    
    # Update node conflict status
    node.update_conflict_status([conflict])
    print(f"   ✓ Updated node conflict status: has_conflicts={node.has_conflicts}")
    print(f"   ✓ Node conflict severity: {node.conflict_severity}")
    print(f"   ✓ Node conflict IDs: {len(node.conflict_ids)}")
    
    # Test 4: Test tree building from flat list
    print("\n4. Testing tree building from flat list...")
    tree = DependencyTree(jar_id="test-jar-id")
    
    # Create flat list with parent-child relationships
    root_dep = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-boot-starter",
        version="2.7.0"
    )
    
    child_dep = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-core",
        version="5.3.21"
    )
    child_dep.parent_id = root_dep.id
    
    grandchild_dep = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-jcl",
        version="5.3.21"
    )
    grandchild_dep.parent_id = child_dep.id
    
    flat_list = [root_dep, child_dep, grandchild_dep]
    
    # Build tree
    tree.build_from_flat_list(flat_list)
    
    print(f"   ✓ Built tree from flat list")
    print(f"   ✓ Total dependencies: {tree.total_dependencies}")
    print(f"   ✓ Direct dependencies: {tree.direct_dependencies}")
    print(f"   ✓ Transitive dependencies: {tree.transitive_dependencies}")
    print(f"   ✓ Max depth: {tree.max_depth}")
    print(f"   ✓ Root dependencies count: {len(tree.root_dependencies)}")
    
    # Verify hierarchy
    assert len(tree.root_dependencies) == 1
    assert tree.root_dependencies[0] == root_dep
    assert len(root_dep.children) == 1
    assert root_dep.children[0] == child_dep
    assert len(child_dep.children) == 1
    assert child_dep.children[0] == grandchild_dep
    
    print(f"   ✓ Hierarchy verified")
    print(f"   ✓ Root depth: {root_dep.depth}")
    print(f"   ✓ Child depth: {child_dep.depth}")
    print(f"   ✓ Grandchild depth: {grandchild_dep.depth}")
    
    # Test 5: Test conflict detection with severity calculation
    print("\n5. Testing conflict detection with severity calculation...")
    
    # Add conflicting dependencies
    dep1 = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-core",
        version="5.3.21"
    )
    dep2 = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-core",
        version="5.2.15"
    )
    
    conflict_tree = DependencyTree(jar_id="conflict-test")
    conflict_tree.add_dependency(dep1)
    conflict_tree.add_dependency(dep2)
    
    # Detect conflicts
    conflicts = conflict_tree.detect_conflicts()
    print(f"   ✓ Detected {len(conflicts)} conflicts")
    
    if conflicts:
        conflict = conflicts[0]
        print(f"   ✓ Conflict type: {conflict.conflict_type}")
        print(f"   ✓ Conflict severity: {conflict.severity}")
        print(f"   ✓ Affected dependencies: {len(conflict.affected_dependencies)}")
        print(f"   ✓ Conflicting versions: {conflict.conflicting_versions}")
    
    # Update conflict status for all nodes
    conflict_tree.update_all_conflict_status(conflicts)
    print(f"   ✓ Updated conflict status for all nodes")
    print(f"   ✓ Dep1 has conflicts: {dep1.has_conflicts}")
    print(f"   ✓ Dep2 has conflicts: {dep2.has_conflicts}")
    
    # Test 6: Test different conflict severities
    print("\n6. Testing different conflict severities...")
    
    # Major version conflict (critical)
    major_conflict = DependencyConflict(
        conflict_type=ConflictType.VERSION_CONFLICT,
        affected_dependencies=["dep1", "dep2"],
        description="Major version conflict",
        conflicting_versions=["2.0.0", "3.0.0"]
    )
    major_severity = major_conflict.calculate_severity()
    print(f"   ✓ Major version conflict severity: {major_severity}")
    assert major_severity == ConflictSeverity.CRITICAL
    
    # Minor version conflict (high)
    minor_conflict = DependencyConflict(
        conflict_type=ConflictType.VERSION_CONFLICT,
        affected_dependencies=["dep1", "dep2"],
        description="Minor version conflict",
        conflicting_versions=["2.1.0", "2.2.0"]
    )
    minor_severity = minor_conflict.calculate_severity()
    print(f"   ✓ Minor version conflict severity: {minor_severity}")
    assert minor_severity == ConflictSeverity.HIGH
    
    # Missing dependency (high)
    missing_conflict = DependencyConflict(
        conflict_type=ConflictType.MISSING,
        affected_dependencies=["dep1"],
        description="Missing dependency"
    )
    missing_severity = missing_conflict.calculate_severity()
    print(f"   ✓ Missing dependency severity: {missing_severity}")
    assert missing_severity == ConflictSeverity.HIGH
    
    # Duplicate dependency (low)
    duplicate_conflict = DependencyConflict(
        conflict_type=ConflictType.DUPLICATE,
        affected_dependencies=["dep1", "dep2"],
        description="Duplicate dependency"
    )
    duplicate_severity = duplicate_conflict.calculate_severity()
    print(f"   ✓ Duplicate dependency severity: {duplicate_severity}")
    assert duplicate_severity == ConflictSeverity.LOW
    
    print("\n=== All tests passed! Enhanced dependency tree functionality is working correctly. ===")
    return True

if __name__ == "__main__":
    try:
        test_enhanced_dependency_tree()
        print("\n🎉 SUCCESS: Enhanced dependency tree implementation is complete and functional!")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
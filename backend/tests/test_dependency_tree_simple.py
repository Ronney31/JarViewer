#!/usr/bin/env python3
"""
Simple test script to verify dependency tree functionality
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from models.jar import DependencyNode, DependencyTree, DependencyScope, DependencySource
from services.dependency_tree_service import DependencyTreeService


def test_dependency_tree_basic():
    """Test basic dependency tree functionality."""
    print("Testing basic dependency tree functionality...")
    
    # Test DependencyNode creation
    node = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-core",
        version="5.3.21",
        scope=DependencyScope.COMPILE,
        source=DependencySource.MAVEN_POM
    )
    
    assert node.group_id == "org.springframework"
    assert node.artifact_id == "spring-core"
    assert node.version == "5.3.21"
    assert node.coordinate == "org.springframework:spring-core:5.3.21"
    assert node.name == "org.springframework:spring-core"
    print("✓ DependencyNode creation works")
    
    # Test DependencyTree creation
    tree = DependencyTree(jar_id="test-jar-id")
    assert tree.jar_id == "test-jar-id"
    assert tree.total_dependencies == 0
    print("✓ DependencyTree creation works")
    
    # Test adding dependencies
    tree.add_dependency(node)
    assert tree.total_dependencies == 1
    assert tree.direct_dependencies == 1
    assert tree.transitive_dependencies == 0
    print("✓ Adding dependencies works")
    
    # Test adding transitive dependency
    transitive_node = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-jcl",
        version="5.3.21"
    )
    tree.add_dependency(transitive_node, node.id)
    
    assert tree.total_dependencies == 2
    assert tree.direct_dependencies == 1
    assert tree.transitive_dependencies == 1
    assert tree.max_depth == 1
    print("✓ Adding transitive dependencies works")
    
    # Test conflict detection
    conflicting_node = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-core",
        version="5.2.15"
    )
    tree.add_dependency(conflicting_node)
    
    conflicts = tree.detect_conflicts()
    assert len(conflicts) == 1
    assert conflicts[0].conflict_type.value == "version_conflict"
    assert "5.3.21" in conflicts[0].conflicting_versions
    assert "5.2.15" in conflicts[0].conflicting_versions
    print("✓ Conflict detection works")
    
    # Test dependency path generation
    path = tree.get_dependency_path(transitive_node.id)
    assert path is not None
    assert len(path.path) == 2
    assert path.depth == 1
    print("✓ Dependency path generation works")
    
    print("All basic dependency tree tests passed! ✓")


def test_dependency_tree_service():
    """Test dependency tree service functionality."""
    print("\nTesting dependency tree service...")
    
    service = DependencyTreeService()
    
    # Test package to dependency mapping
    info = service._get_dependency_info_from_package("org.springframework")
    assert info is not None
    assert info['group_id'] == "org.springframework"
    assert info['artifact_id'] == "spring-core"
    print("✓ Package to dependency mapping works")
    
    # Test analysis report creation
    tree = DependencyTree(jar_id="test-jar-id")
    dep = DependencyNode(
        group_id="org.springframework",
        artifact_id="spring-core",
        version="5.3.21"
    )
    tree.add_dependency(dep)
    
    report = service.create_analysis_report(tree)
    assert report.jar_id == "test-jar-id"
    assert report.dependency_tree == tree
    assert "total_dependencies" in report.summary
    assert report.summary["total_dependencies"] == 1
    print("✓ Analysis report creation works")
    
    print("All dependency tree service tests passed! ✓")


def test_enhanced_features():
    """Test enhanced dependency tree features."""
    print("\nTesting enhanced dependency tree features...")
    
    tree = DependencyTree(jar_id="test-jar-id")
    
    # Test scope counting
    compile_dep = DependencyNode(
        group_id="org.example",
        artifact_id="compile-lib",
        version="1.0.0",
        scope=DependencyScope.COMPILE
    )
    
    test_dep = DependencyNode(
        group_id="org.example",
        artifact_id="test-lib",
        version="1.0.0",
        scope=DependencyScope.TEST
    )
    
    runtime_dep = DependencyNode(
        group_id="org.example",
        artifact_id="runtime-lib",
        version="1.0.0",
        scope=DependencyScope.RUNTIME
    )
    
    tree.add_dependency(compile_dep)
    tree.add_dependency(test_dep)
    tree.add_dependency(runtime_dep)
    
    assert tree.scope_counts[DependencyScope.COMPILE] == 1
    assert tree.scope_counts[DependencyScope.TEST] == 1
    assert tree.scope_counts[DependencyScope.RUNTIME] == 1
    print("✓ Scope counting works")
    
    # Test source counting
    maven_dep = DependencyNode(
        group_id="org.example",
        artifact_id="maven-lib",
        version="1.0.0",
        source=DependencySource.MAVEN_POM
    )
    
    gradle_dep = DependencyNode(
        group_id="org.example",
        artifact_id="gradle-lib",
        version="1.0.0",
        source=DependencySource.GRADLE_BUILD
    )
    
    tree.add_dependency(maven_dep)
    tree.add_dependency(gradle_dep)
    
    assert tree.source_counts[DependencySource.MAVEN_POM] == 1
    assert tree.source_counts[DependencySource.GRADLE_BUILD] == 1
    print("✓ Source counting works")
    
    # Test finding dependencies
    found_deps = tree.find_dependency("org.example", "compile-lib")
    assert len(found_deps) == 1
    assert found_deps[0].artifact_id == "compile-lib"
    print("✓ Finding dependencies works")
    
    print("All enhanced feature tests passed! ✓")


if __name__ == "__main__":
    try:
        test_dependency_tree_basic()
        test_dependency_tree_service()
        test_enhanced_features()
        print("\n🎉 All dependency tree tests passed successfully!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
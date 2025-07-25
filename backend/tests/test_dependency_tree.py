"""
Tests for dependency tree functionality
"""

import pytest
from pathlib import Path
import tempfile
import shutil
from unittest.mock import Mock, patch

from ..models.jar import (
    DependencyNode, DependencyTree, DependencyScope, DependencySource, 
    DependencyConflict, ConflictType, ConflictSeverity
)
from ..services.dependency_tree_service import DependencyTreeService


class TestDependencyTree:
    """Test dependency tree data structure."""
    
    def test_dependency_node_creation(self):
        """Test creating a dependency node."""
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
        assert node.scope == DependencyScope.COMPILE
        assert node.source == DependencySource.MAVEN_POM
        assert node.coordinate == "org.springframework:spring-core:5.3.21"
        assert node.name == "org.springframework:spring-core"
        assert not node.is_transitive
        assert node.depth == 0
    
    def test_dependency_tree_creation(self):
        """Test creating a dependency tree."""
        tree = DependencyTree(jar_id="test-jar-id")
        
        assert tree.jar_id == "test-jar-id"
        assert tree.total_dependencies == 0
        assert tree.direct_dependencies == 0
        assert tree.transitive_dependencies == 0
        assert tree.max_depth == 0
        assert len(tree.root_dependencies) == 0
        assert len(tree.all_dependencies) == 0
    
    def test_add_root_dependency(self):
        """Test adding a root dependency to the tree."""
        tree = DependencyTree(jar_id="test-jar-id")
        
        root_dep = DependencyNode(
            group_id="org.springframework",
            artifact_id="spring-core",
            version="5.3.21"
        )
        
        tree.add_dependency(root_dep)
        
        assert tree.total_dependencies == 1
        assert tree.direct_dependencies == 1
        assert tree.transitive_dependencies == 0
        assert tree.max_depth == 0
        assert len(tree.root_dependencies) == 1
        assert root_dep.id in tree.all_dependencies
        assert not root_dep.is_transitive
        assert root_dep.depth == 0
    
    def test_add_transitive_dependency(self):
        """Test adding a transitive dependency to the tree."""
        tree = DependencyTree(jar_id="test-jar-id")
        
        # Add root dependency
        root_dep = DependencyNode(
            group_id="org.springframework",
            artifact_id="spring-core",
            version="5.3.21"
        )
        tree.add_dependency(root_dep)
        
        # Add transitive dependency
        transitive_dep = DependencyNode(
            group_id="org.springframework",
            artifact_id="spring-jcl",
            version="5.3.21"
        )
        tree.add_dependency(transitive_dep, root_dep.id)
        
        assert tree.total_dependencies == 2
        assert tree.direct_dependencies == 1
        assert tree.transitive_dependencies == 1
        assert tree.max_depth == 1
        assert len(root_dep.children) == 1
        assert transitive_dep.is_transitive
        assert transitive_dep.depth == 1
        assert transitive_dep.parent_id == root_dep.id
    
    def test_find_dependency(self):
        """Test finding dependencies by group and artifact ID."""
        tree = DependencyTree(jar_id="test-jar-id")
        
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
        dep3 = DependencyNode(
            group_id="org.hibernate",
            artifact_id="hibernate-core",
            version="5.6.9"
        )
        
        tree.add_dependency(dep1)
        tree.add_dependency(dep2)
        tree.add_dependency(dep3)
        
        # Find spring-core dependencies
        spring_deps = tree.find_dependency("org.springframework", "spring-core")
        assert len(spring_deps) == 2
        
        # Find hibernate dependencies
        hibernate_deps = tree.find_dependency("org.hibernate", "hibernate-core")
        assert len(hibernate_deps) == 1
        
        # Find non-existent dependency
        missing_deps = tree.find_dependency("com.example", "missing")
        assert len(missing_deps) == 0
    
    def test_get_dependency_path(self):
        """Test getting dependency path."""
        tree = DependencyTree(jar_id="test-jar-id")
        
        # Create dependency chain: root -> child -> grandchild
        root_dep = DependencyNode(
            group_id="org.springframework",
            artifact_id="spring-boot-starter",
            version="2.7.0"
        )
        tree.add_dependency(root_dep)
        
        child_dep = DependencyNode(
            group_id="org.springframework",
            artifact_id="spring-core",
            version="5.3.21"
        )
        tree.add_dependency(child_dep, root_dep.id)
        
        grandchild_dep = DependencyNode(
            group_id="org.springframework",
            artifact_id="spring-jcl",
            version="5.3.21"
        )
        tree.add_dependency(grandchild_dep, child_dep.id)
        
        # Test path to grandchild
        path = tree.get_dependency_path(grandchild_dep.id)
        assert path is not None
        assert path.depth == 2
        assert len(path.path) == 3
        assert path.path[0] == root_dep.id
        assert path.path[1] == child_dep.id
        assert path.path[2] == grandchild_dep.id
    
    def test_detect_version_conflicts(self):
        """Test detecting version conflicts."""
        tree = DependencyTree(jar_id="test-jar-id")
        
        # Add same dependency with different versions
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
        
        tree.add_dependency(dep1)
        tree.add_dependency(dep2)
        
        # Detect conflicts
        conflicts = tree.detect_conflicts()
        
        assert len(conflicts) == 1
        conflict = conflicts[0]
        assert conflict.conflict_type.value == "version_conflict"
        assert len(conflict.affected_dependencies) == 2
        assert "5.3.21" in conflict.conflicting_versions
        assert "5.2.15" in conflict.conflicting_versions
        assert "spring-core" in conflict.description
    
    def test_dependency_node_conflict_status(self):
        """Test dependency node conflict status indicators."""
        node = DependencyNode(
            group_id="org.springframework",
            artifact_id="spring-core",
            version="5.3.21"
        )
        
        # Initially no conflicts
        assert not node.has_conflicts
        assert node.conflict_severity is None
        assert len(node.conflict_ids) == 0
        
        # Create a conflict
        conflict = DependencyConflict(
            conflict_type=ConflictType.VERSION_CONFLICT,
            affected_dependencies=[node.id],
            description="Test conflict",
            severity=ConflictSeverity.HIGH
        )
        
        # Update conflict status
        node.update_conflict_status([conflict])
        
        assert node.has_conflicts
        assert node.conflict_severity == ConflictSeverity.HIGH
        assert conflict.id in node.conflict_ids
    
    def test_dependency_node_add_child(self):
        """Test adding child dependencies with proper tree structure."""
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
        
        assert child.parent_id == parent.id
        assert child.depth == 1
        assert child.is_transitive
        assert child.dependency_path == [parent.name]
        assert child in parent.children
    
    def test_dependency_path_string(self):
        """Test dependency path string representation."""
        node = DependencyNode(
            group_id="org.springframework",
            artifact_id="spring-core",
            version="5.3.21"
        )
        
        # No path
        assert node.path_string == node.name
        
        # With path
        node.dependency_path = ["org.springframework:spring-boot-starter", "org.springframework:spring-boot"]
        expected_path = "org.springframework:spring-boot-starter -> org.springframework:spring-boot -> org.springframework:spring-core"
        assert node.path_string == expected_path
    
    def test_build_from_flat_list(self):
        """Test building tree from flat list of dependencies."""
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
        
        assert tree.total_dependencies == 3
        assert tree.direct_dependencies == 1
        assert tree.transitive_dependencies == 2
        assert tree.max_depth == 2
        
        # Check hierarchy
        assert len(tree.root_dependencies) == 1
        assert tree.root_dependencies[0] == root_dep
        assert len(root_dep.children) == 1
        assert root_dep.children[0] == child_dep
        assert len(child_dep.children) == 1
        assert child_dep.children[0] == grandchild_dep
        
        # Check depths and paths
        assert root_dep.depth == 0
        assert child_dep.depth == 1
        assert grandchild_dep.depth == 2
        assert not root_dep.is_transitive
        assert child_dep.is_transitive
        assert grandchild_dep.is_transitive
    
    def test_conflict_severity_calculation(self):
        """Test conflict severity calculation."""
        # Version conflict with major version difference (critical)
        conflict1 = DependencyConflict(
            conflict_type=ConflictType.VERSION_CONFLICT,
            affected_dependencies=["dep1", "dep2"],
            description="Major version conflict",
            conflicting_versions=["2.0.0", "3.0.0"]
        )
        assert conflict1.calculate_severity() == ConflictSeverity.CRITICAL
        
        # Version conflict with minor version difference (high)
        conflict2 = DependencyConflict(
            conflict_type=ConflictType.VERSION_CONFLICT,
            affected_dependencies=["dep1", "dep2"],
            description="Minor version conflict",
            conflicting_versions=["2.1.0", "2.2.0"]
        )
        assert conflict2.calculate_severity() == ConflictSeverity.HIGH
        
        # Missing dependency (high)
        conflict3 = DependencyConflict(
            conflict_type=ConflictType.MISSING,
            affected_dependencies=["dep1"],
            description="Missing dependency"
        )
        assert conflict3.calculate_severity() == ConflictSeverity.HIGH
        
        # Duplicate dependency (low)
        conflict4 = DependencyConflict(
            conflict_type=ConflictType.DUPLICATE,
            affected_dependencies=["dep1", "dep2"],
            description="Duplicate dependency"
        )
        assert conflict4.calculate_severity() == ConflictSeverity.LOW
    
    def test_update_all_conflict_status(self):
        """Test updating conflict status for all dependencies in tree."""
        tree = DependencyTree(jar_id="test-jar-id")
        
        # Add dependencies with conflicts
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
        dep3 = DependencyNode(
            group_id="org.hibernate",
            artifact_id="hibernate-core",
            version="5.6.9"
        )
        
        tree.add_dependency(dep1)
        tree.add_dependency(dep2)
        tree.add_dependency(dep3)
        
        # Detect conflicts
        conflicts = tree.detect_conflicts()
        
        # Update all conflict status
        tree.update_all_conflict_status(conflicts)
        
        # Check that conflicting dependencies have conflict status
        assert dep1.has_conflicts
        assert dep2.has_conflicts
        assert not dep3.has_conflicts
        
        assert dep1.conflict_severity is not None
        assert dep2.conflict_severity is not None
        assert dep3.conflict_severity is None


class TestDependencyTreeService:
    """Test dependency tree service."""
    
    @pytest.fixture
    def temp_jar_path(self):
        """Create a temporary directory for testing."""
        temp_dir = tempfile.mkdtemp()
        temp_path = Path(temp_dir)
        
        # Create some test files
        (temp_path / "META-INF").mkdir()
        
        # Create a simple pom.xml
        pom_content = """<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <dependencies>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-core</artifactId>
            <version>5.3.21</version>
        </dependency>
        <dependency>
            <groupId>junit</groupId>
            <artifactId>junit</artifactId>
            <version>4.13.2</version>
            <scope>test</scope>
        </dependency>
    </dependencies>
</project>"""
        
        with open(temp_path / "pom.xml", "w") as f:
            f.write(pom_content)
        
        yield temp_path
        
        # Cleanup
        shutil.rmtree(temp_dir)
    
    @pytest.mark.asyncio
    async def test_extract_maven_dependencies(self, temp_jar_path):
        """Test extracting Maven dependencies."""
        service = DependencyTreeService()
        
        dependencies = await service._extract_maven_dependencies(temp_jar_path)
        
        assert len(dependencies) == 2
        
        # Check spring-core dependency
        spring_dep = next((dep for dep in dependencies if dep.artifact_id == "spring-core"), None)
        assert spring_dep is not None
        assert spring_dep.group_id == "org.springframework"
        assert spring_dep.version == "5.3.21"
        assert spring_dep.scope == DependencyScope.COMPILE
        assert spring_dep.source == DependencySource.MAVEN_POM
        
        # Check junit dependency
        junit_dep = next((dep for dep in dependencies if dep.artifact_id == "junit"), None)
        assert junit_dep is not None
        assert junit_dep.group_id == "junit"
        assert junit_dep.version == "4.13.2"
        assert junit_dep.scope == DependencyScope.TEST
        assert junit_dep.source == DependencySource.MAVEN_POM
    
    @pytest.mark.asyncio
    async def test_build_dependency_tree(self, temp_jar_path):
        """Test building a complete dependency tree."""
        service = DependencyTreeService()
        
        tree = await service.build_dependency_tree("test-jar-id", temp_jar_path)
        
        assert tree.jar_id == "test-jar-id"
        assert tree.total_dependencies >= 2  # At least the two from pom.xml
        assert tree.direct_dependencies >= 2
        assert len(tree.root_dependencies) >= 2
        
        # Check that dependencies were added correctly
        spring_deps = tree.find_dependency("org.springframework", "spring-core")
        assert len(spring_deps) >= 1
        
        junit_deps = tree.find_dependency("junit", "junit")
        assert len(junit_deps) >= 1
    
    def test_create_analysis_report(self):
        """Test creating an analysis report."""
        service = DependencyTreeService()
        
        # Create a simple tree
        tree = DependencyTree(jar_id="test-jar-id")
        
        dep = DependencyNode(
            group_id="org.springframework",
            artifact_id="spring-core",
            version="5.3.21"
        )
        tree.add_dependency(dep)
        
        # Create report
        report = service.create_analysis_report(tree)
        
        assert report.jar_id == "test-jar-id"
        assert report.dependency_tree == tree
        assert "total_dependencies" in report.summary
        assert report.summary["total_dependencies"] == 1
        assert isinstance(report.security_risks, list)
        assert isinstance(report.license_risks, list)
        assert isinstance(report.outdated_dependencies, list)
        assert isinstance(report.recommendations, list)
    
    def test_build_tree_from_flat_list(self):
        """Test building tree from flat list using service."""
        service = DependencyTreeService()
        
        # Create flat list of dependencies
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
        
        grandchild_dep = DependencyNode(
            group_id="org.springframework",
            artifact_id="spring-jcl",
            version="5.3.21"
        )
        
        flat_list = [root_dep, child_dep, grandchild_dep]
        
        # Define parent-child relationships
        relationships = {
            root_dep.id: [child_dep.id],
            child_dep.id: [grandchild_dep.id]
        }
        
        # Build tree
        tree = service.build_tree_from_flat_list("test-jar-id", flat_list, relationships)
        
        assert tree.jar_id == "test-jar-id"
        assert tree.total_dependencies == 3
        assert tree.direct_dependencies == 1
        assert tree.transitive_dependencies == 2
        assert tree.max_depth == 2
        
        # Check hierarchy
        assert len(tree.root_dependencies) == 1
        assert tree.root_dependencies[0] == root_dep
        assert len(root_dep.children) == 1
        assert root_dep.children[0] == child_dep
        assert len(child_dep.children) == 1
        assert child_dep.children[0] == grandchild_dep
    
    def test_build_tree_from_flat_list_without_relationships(self):
        """Test building tree from flat list without explicit relationships."""
        service = DependencyTreeService()
        
        # Create flat list where parent_id is already set
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
        
        flat_list = [root_dep, child_dep]
        
        # Build tree without explicit relationships
        tree = service.build_tree_from_flat_list("test-jar-id", flat_list)
        
        assert tree.total_dependencies == 2
        assert tree.direct_dependencies == 1
        assert tree.transitive_dependencies == 1
        assert len(tree.root_dependencies) == 1
        assert tree.root_dependencies[0] == root_dep
        assert len(root_dep.children) == 1
        assert root_dep.children[0] == child_dep


if __name__ == "__main__":
    pytest.main([__file__])
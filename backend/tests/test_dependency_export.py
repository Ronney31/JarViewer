"""
Tests for dependency export functionality
"""

import pytest
import json
import csv
import io
from pathlib import Path
import tempfile
import shutil
from unittest.mock import Mock, patch

from ..models.jar import (
    DependencyNode, DependencyTree, DependencyScope, DependencySource, 
    DependencyConflict, ConflictType, ConflictSeverity
)
from ..services.dependency_export_service import (
    DependencyExportService, ExportFormat, ExportOptions, ExportResult
)


class TestDependencyExport:
    """Test dependency export functionality."""
    
    @pytest.fixture
    def sample_tree(self):
        """Create a sample dependency tree for testing."""
        tree = DependencyTree(jar_id="test-jar-id")
        
        # Add root dependencies
        root_dep1 = DependencyNode(
            group_id="org.springframework",
            artifact_id="spring-boot-starter",
            version="2.7.0",
            scope=DependencyScope.COMPILE,
            source=DependencySource.MAVEN_POM,
            description="Spring Boot Starter"
        )
        tree.add_dependency(root_dep1)
        
        root_dep2 = DependencyNode(
            group_id="org.projectlombok",
            artifact_id="lombok",
            version="1.18.24",
            scope=DependencyScope.PROVIDED,
            source=DependencySource.MAVEN_POM,
            description="Lombok"
        )
        tree.add_dependency(root_dep2)
        
        # Add transitive dependencies
        child_dep1 = DependencyNode(
            group_id="org.springframework",
            artifact_id="spring-core",
            version="5.3.21",
            scope=DependencyScope.COMPILE,
            source=DependencySource.MAVEN_POM,
            description="Spring Core"
        )
        tree.add_dependency(child_dep1, root_dep1.id)
        
        child_dep2 = DependencyNode(
            group_id="org.springframework",
            artifact_id="spring-context",
            version="5.3.21",
            scope=DependencyScope.COMPILE,
            source=DependencySource.MAVEN_POM,
            description="Spring Context"
        )
        tree.add_dependency(child_dep2, root_dep1.id)
        
        # Add a conflict
        conflict = DependencyConflict(
            conflict_type=ConflictType.VERSION_CONFLICT,
            affected_dependencies=[child_dep1.id],
            description="Version conflict for spring-core",
            severity=ConflictSeverity.HIGH,
            conflicting_versions=["5.3.21", "5.2.15"],
            resolution_suggestion="Use version 5.3.21"
        )
        tree.conflicts = [conflict]
        
        # Update conflict status
        tree.update_all_conflict_status()
        
        return tree
    
    @pytest.fixture
    def export_service(self):
        """Create a dependency export service."""
        service = DependencyExportService()
        
        # Create a temporary directory for exports
        temp_dir = tempfile.mkdtemp()
        service.temp_dir = Path(temp_dir)
        
        yield service
        
        # Cleanup
        shutil.rmtree(temp_dir)
    
    @pytest.mark.asyncio
    async def test_export_json(self, sample_tree, export_service):
        """Test exporting dependency tree as JSON."""
        # Export as JSON
        result = await export_service.export_dependency_tree(
            tree=sample_tree,
            format=ExportFormat.JSON,
            options=ExportOptions(),
            jar_name="test-jar"
        )
        
        # Verify result
        assert result.format == ExportFormat.JSON
        assert result.filename == "test-jar_dependencies.json"
        assert result.mime_type == "application/json"
        assert result.size > 0
        assert isinstance(result.content, str)
        
        # Parse JSON content
        json_data = json.loads(result.content)
        
        # Verify structure
        assert json_data["jar_id"] == sample_tree.jar_id
        assert "statistics" in json_data
        assert json_data["statistics"]["total_dependencies"] == sample_tree.total_dependencies
        assert len(json_data["dependencies"]) == 2  # Two root dependencies
        assert "conflicts" in json_data
        assert len(json_data["conflicts"]) == 1
    
    @pytest.mark.asyncio
    async def test_export_csv(self, sample_tree, export_service):
        """Test exporting dependency tree as CSV."""
        # Export as CSV
        result = await export_service.export_dependency_tree(
            tree=sample_tree,
            format=ExportFormat.CSV,
            options=ExportOptions(),
            jar_name="test-jar"
        )
        
        # Verify result
        assert result.format == ExportFormat.CSV
        assert result.filename == "test-jar_dependencies.csv"
        assert result.mime_type == "text/csv"
        assert result.size > 0
        assert isinstance(result.content, str)
        
        # Parse CSV content
        csv_reader = csv.reader(io.StringIO(result.content))
        rows = list(csv_reader)
        
        # Verify structure
        assert len(rows) == sample_tree.total_dependencies + 1  # Header + all dependencies
        assert "Group ID" in rows[0]  # Header row
        assert "Artifact ID" in rows[0]
        assert "Version" in rows[0]
        assert "Has Conflicts" in rows[0]
    
    @pytest.mark.asyncio
    async def test_export_text_tree(self, sample_tree, export_service):
        """Test exporting dependency tree as text tree."""
        # Export as text tree
        result = await export_service.export_dependency_tree(
            tree=sample_tree,
            format=ExportFormat.TEXT_TREE,
            options=ExportOptions(),
            jar_name="test-jar"
        )
        
        # Verify result
        assert result.format == ExportFormat.TEXT_TREE
        assert result.filename == "test-jar_dependencies.txt"
        assert result.mime_type == "text/plain"
        assert result.size > 0
        assert isinstance(result.content, str)
        
        # Verify content
        assert "Dependency Tree for test-jar" in result.content
        assert "org.springframework:spring-boot-starter" in result.content
        assert "org.projectlombok:lombok" in result.content
        assert "CONFLICT" in result.content
    
    @pytest.mark.asyncio
    async def test_filter_dependencies(self, sample_tree, export_service):
        """Test filtering dependencies during export."""
        # Export with filtering
        options = ExportOptions(
            include_transitive=False,  # Only direct dependencies
            include_conflicts=True,
            include_metadata=True
        )
        
        result = await export_service.export_dependency_tree(
            tree=sample_tree,
            format=ExportFormat.JSON,
            options=options,
            jar_name="test-jar"
        )
        
        # Parse JSON content
        json_data = json.loads(result.content)
        
        # Verify filtering
        assert len(json_data["dependencies"]) == 2  # Two root dependencies
        
        # Check that no children are included
        for dep in json_data["dependencies"]:
            assert "children" not in dep or len(dep["children"]) == 0
    
    @pytest.mark.asyncio
    async def test_scope_filtering(self, sample_tree, export_service):
        """Test filtering dependencies by scope."""
        # Export with scope filtering
        options = ExportOptions(
            include_transitive=True,
            include_conflicts=True,
            include_metadata=True,
            filter_scope=[DependencyScope.PROVIDED]  # Only PROVIDED scope
        )
        
        result = await export_service.export_dependency_tree(
            tree=sample_tree,
            format=ExportFormat.JSON,
            options=options,
            jar_name="test-jar"
        )
        
        # Parse JSON content
        json_data = json.loads(result.content)
        
        # Verify filtering
        assert len(json_data["dependencies"]) == 1  # Only lombok
        assert json_data["dependencies"][0]["artifact_id"] == "lombok"
    
    @pytest.mark.asyncio
    async def test_conflict_filtering(self, sample_tree, export_service):
        """Test filtering dependencies by conflict status."""
        # Export with conflict filtering
        options = ExportOptions(
            include_transitive=True,
            include_conflicts=True,
            include_metadata=True,
            filter_conflicts=True  # Only dependencies with conflicts
        )
        
        result = await export_service.export_dependency_tree(
            tree=sample_tree,
            format=ExportFormat.JSON,
            options=options,
            jar_name="test-jar"
        )
        
        # Parse JSON content
        json_data = json.loads(result.content)
        
        # Verify filtering - should include dependencies with conflicts
        # The filtering should include both the conflicted dependency and its parents
        found_conflict = False
        
        # Check all dependencies in the export
        def check_dependencies(deps):
            nonlocal found_conflict
            for dep in deps:
                if dep.get("has_conflicts", False):
                    found_conflict = True
                    return
                # Check children recursively
                if "children" in dep:
                    check_dependencies(dep["children"])
        
        check_dependencies(json_data["dependencies"])
        
        # Also check that we have at least some dependencies (not empty due to filtering)
        assert len(json_data["dependencies"]) > 0, "Conflict filtering should not result in empty dependency list"
        assert found_conflict, "Should find at least one dependency with conflicts"
    
    @pytest.mark.asyncio
    async def test_save_export_to_file(self, export_service):
        """Test saving export result to file."""
        # Create a simple export result
        export_result = ExportResult(
            format=ExportFormat.JSON,
            content='{"test": "data"}',
            filename="test_export.json",
            mime_type="application/json",
            size=16,
            summary={"format": "json"}
        )
        
        # Save to file
        file_path = await export_service.save_export_to_file(export_result)
        
        # Verify file was created
        assert file_path.exists()
        
        # Verify content
        with open(file_path, 'r') as f:
            content = f.read()
            assert content == '{"test": "data"}'
        
        # Clean up
        export_service.cleanup_export_file(file_path)
        assert not file_path.exists()
    
    @pytest.mark.asyncio
    async def test_export_validation(self, sample_tree, export_service):
        """Test export validation functionality."""
        # Test invalid format
        with pytest.raises(ValueError, match="Invalid export format"):
            await export_service.export_dependency_tree(
                tree=sample_tree,
                format="invalid_format",  # Invalid format
                jar_name="test-jar"
            )
        
        # Test invalid jar_name with special characters
        with pytest.raises(ValueError, match="jar_name contains invalid characters"):
            await export_service.export_dependency_tree(
                tree=sample_tree,
                format=ExportFormat.JSON,
                jar_name="test<jar>name"  # Invalid characters
            )
        
        # Test empty jar_name
        with pytest.raises(ValueError, match="jar_name must be a non-empty string"):
            await export_service.export_dependency_tree(
                tree=sample_tree,
                format=ExportFormat.JSON,
                jar_name=""  # Empty name
            )
        
        # Test None tree
        with pytest.raises(ValueError, match="Dependency tree cannot be None"):
            await export_service.export_dependency_tree(
                tree=None,
                format=ExportFormat.JSON,
                jar_name="test-jar"
            )
        
        # Test invalid max_depth
        options = ExportOptions(max_depth=-1)
        with pytest.raises(ValueError, match="max_depth must be non-negative"):
            await export_service.export_dependency_tree(
                tree=sample_tree,
                format=ExportFormat.JSON,
                options=options,
                jar_name="test-jar"
            )
    
    @pytest.mark.asyncio
    async def test_empty_tree_export(self, export_service):
        """Test exporting an empty dependency tree."""
        # Create empty tree
        empty_tree = DependencyTree(jar_id="empty-jar-id")
        
        # Export should work but result in empty content
        result = await export_service.export_dependency_tree(
            tree=empty_tree,
            format=ExportFormat.JSON,
            jar_name="empty-jar"
        )
        
        # Verify result
        assert result.format == ExportFormat.JSON
        assert result.size > 0  # Should have basic structure
        
        # Parse JSON content
        json_data = json.loads(result.content)
        assert json_data["jar_id"] == "empty-jar-id"
        assert len(json_data["dependencies"]) == 0
        assert json_data["statistics"]["total_dependencies"] == 0


if __name__ == "__main__":
    pytest.main([__file__])
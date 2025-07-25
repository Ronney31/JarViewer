"""
Dependency Export Service
Provides functionality to export dependency tree data in various formats
"""

import json
import csv
import io
from enum import Enum
from typing import Dict, List, Any, Optional, BinaryIO, Union
import structlog
from pathlib import Path
import tempfile
import os

from ..models.jar import (
    DependencyTree, DependencyNode, DependencyConflict,
    ConflictSeverity, DependencyScope, DependencySource
)

logger = structlog.get_logger()


class ExportFormat(str, Enum):
    """Supported export formats."""
    JSON = "json"
    CSV = "csv"
    TEXT_TREE = "text_tree"


class ExportOptions:
    """Options for dependency export."""
    
    def __init__(
        self,
        include_transitive: bool = True,
        include_conflicts: bool = True,
        include_metadata: bool = True,
        max_depth: Optional[int] = None,
        filter_scope: Optional[List[DependencyScope]] = None,
        filter_conflicts: Optional[bool] = None
    ):
        self.include_transitive = include_transitive
        self.include_conflicts = include_conflicts
        self.include_metadata = include_metadata
        self.max_depth = max_depth
        self.filter_scope = filter_scope
        self.filter_conflicts = filter_conflicts


class ExportResult:
    """Result of dependency export operation."""
    
    def __init__(
        self,
        format: ExportFormat,
        content: Union[str, bytes],
        filename: str,
        mime_type: str,
        size: int,
        summary: Dict[str, Any]
    ):
        self.format = format
        self.content = content
        self.filename = filename
        self.mime_type = mime_type
        self.size = size
        self.summary = summary


class DependencyExportService:
    """Service for exporting dependency data in various formats."""
    
    def __init__(self):
        self.temp_dir = Path(tempfile.gettempdir()) / "dependency_exports"
        self.temp_dir.mkdir(exist_ok=True)
        
        # Maximum file size for exports (100MB)
        self.max_export_size = 100 * 1024 * 1024
        
        # Maximum number of dependencies to export
        self.max_dependencies = 10000
    
    async def export_dependency_tree(
        self,
        tree: DependencyTree,
        format: ExportFormat,
        options: Optional[ExportOptions] = None,
        jar_name: str = "dependencies"
    ) -> ExportResult:
        """
        Export dependency tree in the specified format.
        
        Args:
            tree: The dependency tree to export
            format: The export format (JSON, CSV, or TEXT_TREE)
            options: Export options
            jar_name: Name of the JAR file (used for filename generation)
            
        Returns:
            ExportResult containing the exported data
            
        Raises:
            ValueError: If format is unsupported or validation fails
            RuntimeError: If export size exceeds limits
        """
        if options is None:
            options = ExportOptions()
        
        # Validate inputs
        self._validate_export_request(tree, format, options, jar_name)
        
        logger.info("Exporting dependency tree", 
                   jar_id=tree.jar_id, 
                   format=format,
                   dependencies=tree.total_dependencies)
        
        try:
            # Filter dependencies based on options
            filtered_tree = self._filter_dependencies(tree, options)
            
            # Check if filtered tree is empty
            if filtered_tree.total_dependencies == 0:
                logger.warning("Export resulted in empty dependency tree", 
                             jar_id=tree.jar_id, format=format)
            
            # Export based on format
            if format == ExportFormat.JSON:
                result = await self._export_json(filtered_tree, options, jar_name)
            elif format == ExportFormat.CSV:
                result = await self._export_csv(filtered_tree, options, jar_name)
            elif format == ExportFormat.TEXT_TREE:
                result = await self._export_text_tree(filtered_tree, options, jar_name)
            else:
                raise ValueError(f"Unsupported export format: {format}")
            
            # Validate export size
            if result.size > self.max_export_size:
                raise RuntimeError(f"Export size ({result.size} bytes) exceeds maximum allowed size ({self.max_export_size} bytes)")
            
            logger.info("Export completed successfully", 
                       jar_id=tree.jar_id, 
                       format=format,
                       size=result.size,
                       filename=result.filename)
            
            return result
            
        except Exception as e:
            logger.error("Export failed", 
                        jar_id=tree.jar_id, 
                        format=format, 
                        error=str(e))
            raise
    
    def _filter_dependencies(
        self,
        tree: DependencyTree,
        options: ExportOptions
    ) -> DependencyTree:
        """
        Filter dependencies based on export options.
        
        Args:
            tree: Original dependency tree
            options: Export options
            
        Returns:
            Filtered dependency tree
        """
        # Create a new tree with the same jar_id
        filtered_tree = DependencyTree(jar_id=tree.jar_id)
        
        # Helper function to check if a dependency should be included
        def should_include(dep: DependencyNode) -> bool:
            # Check depth
            if options.max_depth is not None and dep.depth > options.max_depth:
                return False
            
            # Check transitive
            if not options.include_transitive and dep.is_transitive:
                return False
            
            # Check scope
            if options.filter_scope and dep.scope not in options.filter_scope:
                return False
            
            return True
        
        # Helper function to check if a dependency or its descendants have conflicts
        def has_conflicts_in_subtree(dep: DependencyNode) -> bool:
            if dep.has_conflicts:
                return True
            for child in dep.children:
                if has_conflicts_in_subtree(child):
                    return True
            return False
        
        # Helper function to check if a dependency should be included based on conflict filtering
        def should_include_for_conflicts(dep: DependencyNode) -> bool:
            if options.filter_conflicts is None:
                return True
            
            if options.filter_conflicts:
                # Include if this dependency or any of its descendants have conflicts
                return has_conflicts_in_subtree(dep)
            else:
                # Include if this dependency and all its descendants have no conflicts
                return not has_conflicts_in_subtree(dep)
        
        # First pass: collect all dependencies that should be included
        def collect_dependencies(dep: DependencyNode, parent_id: Optional[str] = None) -> Optional[DependencyNode]:
            # Check basic filters first
            if not should_include(dep):
                return None
            
            # Create a copy of the dependency
            dep_copy = DependencyNode(
                id=dep.id,  # Keep the same ID for now
                group_id=dep.group_id,
                artifact_id=dep.artifact_id,
                version=dep.version,
                scope=dep.scope,
                source=dep.source,
                optional=dep.optional,
                parent_id=parent_id,
                dependency_path=dep.dependency_path.copy(),
                description=dep.description,
                license=dep.license,
                size_bytes=dep.size_bytes,
                file_path=dep.file_path,
                is_transitive=dep.is_transitive,
                depth=dep.depth,
                resolved_version=dep.resolved_version,
                has_conflicts=dep.has_conflicts,
                conflict_severity=dep.conflict_severity,
                conflict_ids=dep.conflict_ids.copy(),
                resolution_strategy=dep.resolution_strategy,
                usage_context=dep.usage_context.copy(),
                license_compatibility=dep.license_compatibility
            )
            
            # Process children first
            for child in dep.children:
                child_copy = collect_dependencies(child, dep.id)
                if child_copy:
                    dep_copy.children.append(child_copy)
            
            # Now check if this dependency should be included based on conflict filtering
            if not should_include_for_conflicts(dep_copy):
                # If this dependency shouldn't be included but has children that should,
                # return the children promoted to this level
                if dep_copy.children:
                    # This is a complex case - for now, we'll include the parent
                    # to maintain tree structure
                    pass
                else:
                    return None
            
            return dep_copy
        
        # Process root dependencies
        for root_dep in tree.root_dependencies:
            dep_copy = collect_dependencies(root_dep)
            if dep_copy:
                filtered_tree.all_dependencies[dep_copy.id] = dep_copy
                filtered_tree.root_dependencies.append(dep_copy)
                
                # Add all descendants to all_dependencies
                def add_descendants(dep: DependencyNode):
                    for child in dep.children:
                        filtered_tree.all_dependencies[child.id] = child
                        add_descendants(child)
                
                add_descendants(dep_copy)
        
        # Update statistics
        filtered_tree._update_statistics()
        
        # Copy conflicts if needed
        if options.include_conflicts:
            filtered_tree.conflicts = tree.conflicts
            filtered_tree.update_all_conflict_status(tree.conflicts)
        
        return filtered_tree
    
    def _validate_export_request(
        self,
        tree: DependencyTree,
        format: ExportFormat,
        options: ExportOptions,
        jar_name: str
    ) -> None:
        """
        Validate export request parameters.
        
        Args:
            tree: Dependency tree to export
            format: Export format
            options: Export options
            jar_name: JAR name
            
        Raises:
            ValueError: If validation fails
        """
        # Validate tree
        if not tree:
            raise ValueError("Dependency tree cannot be None")
        
        if not tree.jar_id:
            raise ValueError("Dependency tree must have a jar_id")
        
        # Validate format
        if not isinstance(format, ExportFormat):
            raise ValueError(f"Invalid export format: {format}")
        
        # Validate jar_name
        if not jar_name or not isinstance(jar_name, str):
            raise ValueError("jar_name must be a non-empty string")
        
        # Sanitize jar_name for filename safety
        invalid_chars = '<>:"/\\|?*'
        if any(char in jar_name for char in invalid_chars):
            raise ValueError(f"jar_name contains invalid characters: {invalid_chars}")
        
        # Validate dependency count
        if tree.total_dependencies > self.max_dependencies:
            raise ValueError(f"Too many dependencies ({tree.total_dependencies}). Maximum allowed: {self.max_dependencies}")
        
        # Validate options
        if options.max_depth is not None and options.max_depth < 0:
            raise ValueError("max_depth must be non-negative")
        
        if options.filter_scope:
            for scope in options.filter_scope:
                if not isinstance(scope, DependencyScope):
                    raise ValueError(f"Invalid scope in filter_scope: {scope}")
    
    async def _export_json(
        self,
        tree: DependencyTree,
        options: ExportOptions,
        jar_name: str
    ) -> ExportResult:
        """
        Export dependency tree as JSON.
        
        Args:
            tree: Dependency tree to export
            options: Export options
            jar_name: Name of the JAR file
            
        Returns:
            ExportResult with JSON content
        """
        # Create JSON structure
        export_data = {
            "jar_id": tree.jar_id,
            "statistics": {
                "total_dependencies": tree.total_dependencies,
                "direct_dependencies": tree.direct_dependencies,
                "transitive_dependencies": tree.transitive_dependencies,
                "max_depth": tree.max_depth,
                "scope_counts": {scope.value: count for scope, count in tree.scope_counts.items()},
                "source_counts": {source.value: count for source, count in tree.source_counts.items()}
            },
            "dependencies": []
        }
        
        # Add conflicts if included
        if options.include_conflicts:
            export_data["conflicts"] = [
                {
                    "id": conflict.id,
                    "conflict_type": conflict.conflict_type.value,
                    "description": conflict.description,
                    "severity": conflict.severity.value,
                    "affected_dependencies": conflict.affected_dependencies,
                    "conflicting_versions": conflict.conflicting_versions,
                    "winning_version": conflict.winning_version,
                    "resolution_suggestion": conflict.resolution_suggestion
                }
                for conflict in tree.conflicts
            ]
        
        # Helper function to convert a node to JSON
        def node_to_json(node: DependencyNode, include_children: bool = True) -> Dict[str, Any]:
            node_data = {
                "id": node.id,
                "group_id": node.group_id,
                "artifact_id": node.artifact_id,
                "name": node.name,
                "version": node.version,
                "scope": node.scope.value,
                "source": node.source.value,
                "is_transitive": node.is_transitive,
                "depth": node.depth,
                "path": node.dependency_path
            }
            
            # Add conflict information if included
            if options.include_conflicts:
                node_data["has_conflicts"] = node.has_conflicts
                if node.has_conflicts:
                    node_data["conflict_severity"] = node.conflict_severity.value if node.conflict_severity else None
                    node_data["conflict_ids"] = node.conflict_ids
            
            # Add metadata if included
            if options.include_metadata:
                node_data["description"] = node.description
                node_data["license"] = node.license
                node_data["size_bytes"] = node.size_bytes
                node_data["file_path"] = node.file_path
                node_data["resolved_version"] = node.resolved_version
                node_data["resolution_strategy"] = node.resolution_strategy
                node_data["usage_context"] = node.usage_context
                node_data["license_compatibility"] = node.license_compatibility
            
            # Add children if included
            if include_children and node.children:
                node_data["children"] = [
                    node_to_json(child) for child in node.children
                ]
            
            return node_data
        
        # Add root dependencies
        for root_dep in tree.root_dependencies:
            export_data["dependencies"].append(node_to_json(root_dep))
        
        # Convert to JSON string
        json_content = json.dumps(export_data, indent=2)
        
        # Generate filename
        filename = f"{jar_name}_dependencies.json"
        
        # Create summary
        summary = {
            "format": ExportFormat.JSON.value,
            "total_dependencies": tree.total_dependencies,
            "filename": filename,
            "size": len(json_content)
        }
        
        return ExportResult(
            format=ExportFormat.JSON,
            content=json_content,
            filename=filename,
            mime_type="application/json",
            size=len(json_content),
            summary=summary
        )
    
    async def _export_csv(
        self,
        tree: DependencyTree,
        options: ExportOptions,
        jar_name: str
    ) -> ExportResult:
        """
        Export dependency tree as CSV.
        
        Args:
            tree: Dependency tree to export
            options: Export options
            jar_name: Name of the JAR file
            
        Returns:
            ExportResult with CSV content
        """
        # Create CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Define headers based on options
        headers = [
            "Group ID", "Artifact ID", "Version", "Scope", "Source", 
            "Is Transitive", "Depth", "Dependency Path"
        ]
        
        if options.include_conflicts:
            headers.extend(["Has Conflicts", "Conflict Severity", "Conflict IDs"])
        
        if options.include_metadata:
            headers.extend([
                "Description", "License", "Size (bytes)", "File Path",
                "Resolved Version", "Resolution Strategy", "License Compatibility"
            ])
        
        writer.writerow(headers)
        
        # Helper function to add a node to CSV
        def add_node_to_csv(node: DependencyNode) -> None:
            # Basic information
            row = [
                node.group_id,
                node.artifact_id,
                node.version or "",
                node.scope.value,
                node.source.value,
                "Yes" if node.is_transitive else "No",
                node.depth,
                " -> ".join(node.dependency_path) if node.dependency_path else ""
            ]
            
            # Add conflict information if included
            if options.include_conflicts:
                row.extend([
                    "Yes" if node.has_conflicts else "No",
                    node.conflict_severity.value if node.has_conflicts and node.conflict_severity else "",
                    ", ".join(node.conflict_ids) if node.has_conflicts else ""
                ])
            
            # Add metadata if included
            if options.include_metadata:
                row.extend([
                    node.description or "",
                    node.license or "",
                    node.size_bytes or "",
                    node.file_path or "",
                    node.resolved_version or "",
                    node.resolution_strategy or "",
                    node.license_compatibility or ""
                ])
            
            writer.writerow(row)
        
        # Process all dependencies in a flat structure
        for dep_id, dep in tree.all_dependencies.items():
            add_node_to_csv(dep)
        
        # Get CSV content
        csv_content = output.getvalue()
        output.close()
        
        # Generate filename
        filename = f"{jar_name}_dependencies.csv"
        
        # Create summary
        summary = {
            "format": ExportFormat.CSV.value,
            "total_dependencies": tree.total_dependencies,
            "filename": filename,
            "size": len(csv_content)
        }
        
        return ExportResult(
            format=ExportFormat.CSV,
            content=csv_content,
            filename=filename,
            mime_type="text/csv",
            size=len(csv_content),
            summary=summary
        )
    
    async def _export_text_tree(
        self,
        tree: DependencyTree,
        options: ExportOptions,
        jar_name: str
    ) -> ExportResult:
        """
        Export dependency tree as text tree.
        
        Args:
            tree: Dependency tree to export
            options: Export options
            jar_name: Name of the JAR file
            
        Returns:
            ExportResult with text tree content
        """
        output = []
        
        # Add header
        output.append(f"Dependency Tree for {jar_name}")
        output.append(f"Total Dependencies: {tree.total_dependencies}")
        output.append(f"Direct Dependencies: {tree.direct_dependencies}")
        output.append(f"Transitive Dependencies: {tree.transitive_dependencies}")
        output.append("")
        
        # Helper function to recursively print tree
        def print_node(node: DependencyNode, indent: int = 0) -> None:
            # Create indentation
            prefix = "│  " * (indent - 1) + "├─ " if indent > 0 else ""
            
            # Basic node information
            node_text = f"{prefix}{node.name}"
            if node.version:
                node_text += f" ({node.version})"
            
            # Add scope if not default
            if node.scope != DependencyScope.COMPILE:
                node_text += f" [{node.scope.value}]"
            
            # Add conflict indicator if included
            if options.include_conflicts and node.has_conflicts:
                severity = node.conflict_severity.value if node.conflict_severity else "unknown"
                node_text += f" [CONFLICT: {severity}]"
            
            output.append(node_text)
            
            # Add metadata if included
            if options.include_metadata:
                meta_prefix = "│  " * indent
                if node.description:
                    output.append(f"{meta_prefix}Description: {node.description}")
                if node.license:
                    output.append(f"{meta_prefix}License: {node.license}")
                if node.resolution_strategy:
                    output.append(f"{meta_prefix}Resolution: {node.resolution_strategy}")
            
            # Process children
            for child in node.children:
                print_node(child, indent + 1)
        
        # Print all root dependencies
        for root_dep in tree.root_dependencies:
            print_node(root_dep)
            output.append("")  # Add blank line between root dependencies
        
        # Add conflicts section if included
        if options.include_conflicts and tree.conflicts:
            output.append("")
            output.append("Conflicts:")
            output.append("-" * 50)
            
            for conflict in tree.conflicts:
                output.append(f"Conflict: {conflict.description}")
                output.append(f"Type: {conflict.conflict_type.value}")
                output.append(f"Severity: {conflict.severity.value}")
                if conflict.resolution_suggestion:
                    output.append(f"Resolution: {conflict.resolution_suggestion}")
                output.append("")
        
        # Join all lines
        text_content = "\n".join(output)
        
        # Generate filename
        filename = f"{jar_name}_dependencies.txt"
        
        # Create summary
        summary = {
            "format": ExportFormat.TEXT_TREE.value,
            "total_dependencies": tree.total_dependencies,
            "filename": filename,
            "size": len(text_content)
        }
        
        return ExportResult(
            format=ExportFormat.TEXT_TREE,
            content=text_content,
            filename=filename,
            mime_type="text/plain",
            size=len(text_content),
            summary=summary
        )
    
    async def save_export_to_file(self, export_result: ExportResult) -> Path:
        """
        Save export result to a temporary file.
        
        Args:
            export_result: The export result to save
            
        Returns:
            Path to the saved file
        """
        # Create a unique filename
        file_path = self.temp_dir / export_result.filename
        
        # Write content to file
        mode = "w" if isinstance(export_result.content, str) else "wb"
        with open(file_path, mode) as f:
            f.write(export_result.content)
        
        logger.info("Saved export to file", 
                   filename=export_result.filename,
                   size=export_result.size)
        
        return file_path
    
    def cleanup_export_file(self, file_path: Path) -> None:
        """
        Clean up a temporary export file.
        
        Args:
            file_path: Path to the file to clean up
        """
        try:
            if file_path.exists():
                os.remove(file_path)
                logger.info("Cleaned up export file", file_path=str(file_path))
        except Exception as e:
            logger.warning("Failed to clean up export file", 
                          file_path=str(file_path), error=str(e))


# Global service instance
dependency_export_service = DependencyExportService()
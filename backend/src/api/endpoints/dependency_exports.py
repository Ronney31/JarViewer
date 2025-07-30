"""
API endpoints for dependency exports
"""

from typing import Dict, List, Any, Optional
from fastapi import APIRouter, HTTPException, Query, Depends, Response
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
import structlog

from ...models.jar import DependencyScope, DependencyTree, DependencyNode
from ...services.jar_service import jar_service
from ...services.dependency_export_service import (
    dependency_export_service, ExportFormat, ExportOptions, ExportResult
)

logger = structlog.get_logger()
router = APIRouter()


@router.get("/jars/{jar_id}/exports/formats", response_model=Dict[str, Any])
async def get_export_formats() -> Dict[str, Any]:
    """Get available export formats."""
    formats = {
        "formats": [
            {
                "id": ExportFormat.JSON.value,
                "name": "JSON",
                "description": "Structured JSON format with complete dependency information",
                "mime_type": "application/json",
                "extension": ".json"
            },
            {
                "id": ExportFormat.CSV.value,
                "name": "CSV",
                "description": "Tabular CSV format for spreadsheet applications",
                "mime_type": "text/csv",
                "extension": ".csv"
            },
            {
                "id": ExportFormat.TEXT_TREE.value,
                "name": "Text Tree",
                "description": "Human-readable hierarchical text representation",
                "mime_type": "text/plain",
                "extension": ".txt"
            }
        ]
    }
    
    return formats


@router.get("/jars/{jar_id}/exports/preview", response_model=Dict[str, Any])
async def preview_dependency_export(
    jar_id: str,
    format: ExportFormat = Query(ExportFormat.JSON, description="Export format"),
    include_transitive: bool = Query(True, description="Include transitive dependencies"),
    include_conflicts: bool = Query(True, description="Include conflict information"),
    include_metadata: bool = Query(True, description="Include detailed metadata"),
    max_depth: Optional[int] = Query(None, description="Maximum dependency depth"),
    scope: Optional[List[str]] = Query(None, description="Filter by dependency scope")
) -> Dict[str, Any]:
    """
    Preview dependency export without generating the full export.
    
    Args:
        jar_id: JAR identifier
        format: Export format (json, csv, text_tree)
        include_transitive: Whether to include transitive dependencies
        include_conflicts: Whether to include conflict information
        include_metadata: Whether to include detailed metadata
        max_depth: Maximum dependency depth to include
        scope: Filter by dependency scope
        
    Returns:
        Export preview information
    """
    try:
        # Check if JAR exists
        if jar_id not in jar_service.active_jars:
            raise HTTPException(status_code=404, detail="JAR not found")
        
        jar_file = jar_service.active_jars[jar_id]
        
        # Get comprehensive dependency analysis
        comprehensive_data = await jar_service.analyze_comprehensive_dependencies(jar_id)
        
        # Transform to dependency tree format
        tree = _transform_to_dependency_tree(comprehensive_data, jar_id)
        
        # Convert scope strings to enum values if provided
        filter_scope = None
        if scope:
            try:
                filter_scope = [DependencyScope(s) for s in scope]
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid scope: {str(e)}")
        
        # Create export options
        options = ExportOptions(
            include_transitive=include_transitive,
            include_conflicts=include_conflicts,
            include_metadata=include_metadata,
            max_depth=max_depth,
            filter_scope=filter_scope
        )
        
        # Generate a small preview (limit to first few dependencies)
        preview_tree = tree
        if tree.total_dependencies > 10:
            # Create a smaller tree for preview by limiting dependencies
            limited_deps = comprehensive_data.get('dependencies', [])[:10]
            preview_data = {**comprehensive_data, 'dependencies': limited_deps}
            preview_tree = _transform_to_dependency_tree(preview_data, jar_id)
        
        # Get export result for preview
        export_result = await dependency_export_service.export_dependency_tree(
            tree=preview_tree,
            format=format,
            options=options,
            jar_name=jar_file.name
        )
        
        # Create preview response
        preview = {
            "format": format.value,
            "filename": export_result.filename,
            "mime_type": export_result.mime_type,
            "estimated_size": export_result.size * (tree.total_dependencies / max(preview_tree.total_dependencies, 1)),
            "total_dependencies": tree.total_dependencies,
            "preview": export_result.content[:1000] if isinstance(export_result.content, str) else "[Binary content]",
            "is_truncated": len(export_result.content) > 1000 if isinstance(export_result.content, str) else True
        }
        
        return preview
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to preview dependency export", 
                    jar_id=jar_id, format=format, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to preview export: {str(e)}")


@router.get("/jars/{jar_id}/exports", response_class=Response)
async def export_dependencies(
    jar_id: str,
    format: ExportFormat = Query(ExportFormat.JSON, description="Export format"),
    include_transitive: bool = Query(True, description="Include transitive dependencies"),
    include_conflicts: bool = Query(True, description="Include conflict information"),
    include_metadata: bool = Query(True, description="Include detailed metadata"),
    max_depth: Optional[int] = Query(None, description="Maximum dependency depth"),
    scope: Optional[List[str]] = Query(None, description="Filter by dependency scope"),
    filter_conflicts: Optional[bool] = Query(None, description="Filter by conflict status")
) -> Response:
    """
    Export dependency tree in the specified format.
    
    Args:
        jar_id: JAR identifier
        format: Export format (json, csv, text_tree)
        include_transitive: Whether to include transitive dependencies
        include_conflicts: Whether to include conflict information
        include_metadata: Whether to include detailed metadata
        max_depth: Maximum dependency depth to include
        scope: Filter by dependency scope
        filter_conflicts: Filter by conflict status
        
    Returns:
        Downloadable file response
    """
    try:
        # Check if JAR exists
        if jar_id not in jar_service.active_jars:
            raise HTTPException(status_code=404, detail="JAR not found")
        
        jar_file = jar_service.active_jars[jar_id]
        
        # Get comprehensive dependency analysis
        comprehensive_data = await jar_service.analyze_comprehensive_dependencies(jar_id)
        
        # Transform to dependency tree format
        tree = _transform_to_dependency_tree(comprehensive_data, jar_id)
        
        # Convert scope strings to enum values if provided
        filter_scope = None
        if scope:
            try:
                filter_scope = [DependencyScope(s) for s in scope]
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid scope: {str(e)}")
        
        # Create export options
        options = ExportOptions(
            include_transitive=include_transitive,
            include_conflicts=include_conflicts,
            include_metadata=include_metadata,
            max_depth=max_depth,
            filter_scope=filter_scope,
            filter_conflicts=filter_conflicts
        )
        
        # Generate export
        try:
            export_result = await dependency_export_service.export_dependency_tree(
                tree=tree,
                format=format,
                options=options,
                jar_name=jar_file.name
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid export parameters: {str(e)}")
        except RuntimeError as e:
            raise HTTPException(status_code=413, detail=f"Export too large: {str(e)}")
        
        # Save to temporary file
        file_path = await dependency_export_service.save_export_to_file(export_result)
        
        # Return file response
        response = FileResponse(
            path=file_path,
            filename=export_result.filename,
            media_type=export_result.mime_type,
            background=lambda: dependency_export_service.cleanup_export_file(file_path)
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to export dependencies", 
                    jar_id=jar_id, format=format, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to export dependencies: {str(e)}")


@router.post("/jars/{jar_id}/exports", response_model=Dict[str, Any])
async def create_dependency_export(
    jar_id: str,
    export_options: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Create a dependency export with advanced options.
    
    Args:
        jar_id: JAR identifier
        export_options: Export options
        
    Returns:
        Export result summary
    """
    try:
        # Check if JAR exists
        if jar_id not in jar_service.active_jars:
            raise HTTPException(status_code=404, detail="JAR not found")
        
        jar_file = jar_service.active_jars[jar_id]
        
        # Extract options
        format_str = export_options.get("format", "json")
        try:
            format = ExportFormat(format_str)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid format: {format_str}")
        
        # Create export options
        options = ExportOptions(
            include_transitive=export_options.get("include_transitive", True),
            include_conflicts=export_options.get("include_conflicts", True),
            include_metadata=export_options.get("include_metadata", True),
            max_depth=export_options.get("max_depth"),
            filter_conflicts=export_options.get("filter_conflicts")
        )
        
        # Handle scope filtering
        if "scope" in export_options:
            try:
                options.filter_scope = [DependencyScope(s) for s in export_options["scope"]]
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid scope: {str(e)}")
        
        # Get comprehensive dependency analysis
        comprehensive_data = await jar_service.analyze_comprehensive_dependencies(jar_id)
        
        # Transform to dependency tree format
        tree = _transform_to_dependency_tree(comprehensive_data, jar_id)
        
        # Generate export
        try:
            export_result = await dependency_export_service.export_dependency_tree(
                tree=tree,
                format=format,
                options=options,
                jar_name=jar_file.name
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid export parameters: {str(e)}")
        except RuntimeError as e:
            raise HTTPException(status_code=413, detail=f"Export too large: {str(e)}")
        
        # Save to temporary file
        file_path = await dependency_export_service.save_export_to_file(export_result)
        
        # Create download URL
        download_url = f"/api/v1/jars/{jar_id}/exports/download?filename={export_result.filename}"
        
        # Return summary with download link
        return {
            "format": format.value,
            "filename": export_result.filename,
            "mime_type": export_result.mime_type,
            "size": export_result.size,
            "total_dependencies": tree.total_dependencies,
            "download_url": download_url,
            "summary": export_result.summary
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create dependency export", 
                    jar_id=jar_id, options=export_options, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to create export: {str(e)}")


@router.get("/jars/{jar_id}/exports/download", response_class=FileResponse)
async def download_dependency_export(
    jar_id: str,
    filename: str
) -> FileResponse:
    """
    Download a previously created dependency export.
    
    Args:
        jar_id: JAR identifier
        filename: Export filename
        
    Returns:
        File download response
    """
    try:
        # Check if file exists
        file_path = dependency_export_service.temp_dir / filename
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Export file not found")
        
        # Determine MIME type based on extension
        mime_type = "application/octet-stream"
        if filename.endswith(".json"):
            mime_type = "application/json"
        elif filename.endswith(".csv"):
            mime_type = "text/csv"
        elif filename.endswith(".txt"):
            mime_type = "text/plain"
        
        # Return file response
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type=mime_type,
            background=lambda: dependency_export_service.cleanup_export_file(file_path)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to download dependency export", 
                    jar_id=jar_id, filename=filename, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to download export: {str(e)}")


def _transform_to_dependency_tree(comprehensive_data: Dict[str, Any], jar_id: str) -> DependencyTree:
    """
    Transform comprehensive dependency analysis data to DependencyTree format.
    
    Args:
        comprehensive_data: Data from jar_service.analyze_comprehensive_dependencies()
        jar_id: JAR identifier
        
    Returns:
        DependencyTree object
    """
    # Create dependency tree
    tree = DependencyTree(jar_id=jar_id)
    
    # Get dependencies from comprehensive data
    dependencies = comprehensive_data.get('dependencies', [])
    direct_dependencies = comprehensive_data.get('direct_dependencies', [])
    transitive_dependencies = comprehensive_data.get('transitive_dependencies', [])
    
    # Transform dependencies to DependencyNode objects
    all_dependencies = {}
    root_dependencies = []
    
    # Process direct dependencies first
    for dep_data in direct_dependencies:
        node = _create_dependency_node(dep_data, is_transitive=False, depth=0)
        all_dependencies[node.id] = node
        root_dependencies.append(node)
    
    # Process transitive dependencies
    for dep_data in transitive_dependencies:
        node = _create_dependency_node(dep_data, is_transitive=True, depth=1)
        all_dependencies[node.id] = node
        
        # Try to find a parent in direct dependencies
        # This is a simplified approach - in reality we'd need more sophisticated parent-child mapping
        if root_dependencies:
            # For now, add transitive dependencies as children of the first direct dependency
            parent = root_dependencies[0]
            parent.children.append(node)
            node.parent_id = parent.id
            node.dependency_path = parent.dependency_path + [node.id]
        else:
            root_dependencies.append(node)
    
    # Set tree properties
    tree.root_dependencies = root_dependencies
    tree.all_dependencies = all_dependencies
    tree.total_dependencies = len(all_dependencies)
    tree.direct_dependencies = len(direct_dependencies)
    tree.transitive_dependencies = len(transitive_dependencies)
    tree.max_depth = max([dep.depth for dep in all_dependencies.values()], default=0)
    
    # Calculate scope and source counts
    scope_counts = {}
    source_counts = {}
    for dep in all_dependencies.values():
        scope_counts[dep.scope] = scope_counts.get(dep.scope, 0) + 1
        source_counts[dep.source] = source_counts.get(dep.source, 0) + 1
    
    tree.scope_counts = scope_counts
    tree.source_counts = source_counts
    
    return tree


def _create_dependency_node(dep_data: Dict[str, Any], is_transitive: bool, depth: int) -> DependencyNode:
    """
    Create a DependencyNode from dependency data.
    
    Args:
        dep_data: Dependency data from comprehensive analysis
        is_transitive: Whether this is a transitive dependency
        depth: Depth in the dependency tree
        
    Returns:
        DependencyNode object
    """
    # Extract basic information
    name = dep_data.get('name', '')
    group_id = dep_data.get('group_id', '')
    artifact_id = dep_data.get('artifact_id', '')
    
    # Handle cases where group_id or artifact_id might be None or empty
    if not group_id or not artifact_id:
        # Try to parse from name if it's in format "group:artifact"
        if ':' in name:
            parts = name.split(':')
            if len(parts) >= 2:
                group_id = group_id or parts[0]
                artifact_id = artifact_id or parts[1]
        else:
            # Use name as both group and artifact if we can't parse
            group_id = group_id or name or 'unknown'
            artifact_id = artifact_id or name or 'unknown'
    
    # Ensure we have non-empty strings
    group_id = group_id or 'unknown'
    artifact_id = artifact_id or 'unknown'
    
    # Create unique ID
    node_id = f"{group_id}:{artifact_id}"
    
    # Create the node
    node = DependencyNode(
        id=node_id,
        group_id=group_id,
        artifact_id=artifact_id,
        version=dep_data.get('version'),
        scope=dep_data.get('scope', 'compile'),
        source=dep_data.get('source', 'detected'),
        is_transitive=is_transitive,
        depth=depth,
        children=[],
        dependency_path=[node_id],
        has_conflicts=False,  # We'll need to implement conflict detection
        conflict_ids=[],
        description=dep_data.get('description'),
        license=dep_data.get('license'),
        confidence=dep_data.get('confidence', 1.0),
        package_imports=dep_data.get('package_imports', []),
        package_exports=dep_data.get('package_exports', []),
        optional=dep_data.get('optional', False)
    )
    
    return node
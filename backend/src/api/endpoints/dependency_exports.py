"""
API endpoints for dependency exports
"""

from typing import Dict, List, Any, Optional
from fastapi import APIRouter, HTTPException, Query, Depends, Response
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
import structlog

from ...models.jar import DependencyScope
from ...services.jar_service import jar_service
from ...services.dependency_tree_service import dependency_tree_service
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
        
        # Get dependency tree
        tree = await dependency_tree_service.build_dependency_tree(
            jar_id=jar_id,
            jar_path=Path(jar_file.temp_path)
        )
        
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
            # Create a smaller tree for preview
            preview_tree = dependency_tree_service.build_tree_from_flat_list(
                jar_id=tree.jar_id,
                dependencies=list(tree.all_dependencies.values())[:10]
            )
        
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
        
        # Get dependency tree
        tree = await dependency_tree_service.build_dependency_tree(
            jar_id=jar_id,
            jar_path=Path(jar_file.temp_path)
        )
        
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
        
        # Get dependency tree
        tree = await dependency_tree_service.build_dependency_tree(
            jar_id=jar_id,
            jar_path=Path(jar_file.temp_path)
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
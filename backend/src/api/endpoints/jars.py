"""
JAR file processing endpoints
"""

import tempfile
from pathlib import Path
from typing import Optional
import structlog

from fastapi import APIRouter, HTTPException, UploadFile, File, Query, BackgroundTasks
from fastapi.responses import JSONResponse

from ...models.jar import JarFile, JarMetadata, FileContent, SearchResult, ProcessingProgress
from ...services.jar_service import jar_service, JarProcessingError, SecurityError
from ...core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()
router = APIRouter()


@router.post("/upload")
async def upload_jar(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
) -> JSONResponse:
    """Upload and process a JAR file."""
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    if not file.filename.lower().endswith(('.jar', '.war', '.ear')):
        raise HTTPException(
            status_code=400, 
            detail="Invalid file type. Only JAR, WAR, and EAR files are supported."
        )
    
    # Check file size
    if file.size and file.size > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {settings.MAX_FILE_SIZE // 1024 // 1024}MB"
        )
    
    logger.info("JAR upload started", filename=file.filename, size=file.size)
    
    try:
        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jar') as temp_file:
            temp_path = Path(temp_file.name)
            
            # Stream file content
            content = await file.read()
            temp_file.write(content)
        
        # Process the JAR file
        progress_updates = []
        
        async def progress_callback(progress: ProcessingProgress):
            progress_updates.append(progress)
            logger.info("Processing progress", 
                       stage=progress.stage, 
                       progress=progress.progress,
                       message=progress.message)
        
        jar_file = await jar_service.process_jar_file(
            temp_path, 
            file.filename,
            progress_callback
        )
        
        # Schedule cleanup of temporary upload file
        background_tasks.add_task(cleanup_temp_file, temp_path)
        
        logger.info("JAR upload completed", 
                   jar_id=jar_file.id, 
                   filename=file.filename)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": {
                    "jarFile": jar_file.model_dump(mode='json'),
                    "metadata": jar_file.metadata.model_dump(mode='json')
                },
                "message": "JAR file processed successfully"
            }
        )
        
    except SecurityError as e:
        logger.error("Security error during JAR processing", 
                    filename=file.filename, error=str(e))
        raise HTTPException(status_code=400, detail=f"Security error: {str(e)}")
        
    except JarProcessingError as e:
        logger.error("JAR processing error", 
                    filename=file.filename, error=str(e))
        raise HTTPException(status_code=422, detail=str(e))
        
    except Exception as e:
        logger.error("Unexpected error during JAR processing", 
                    filename=file.filename, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{jar_id}/files/content")
async def get_file_content(
    jar_id: str,
    path: str = Query(..., description="File path within the JAR")
) -> JSONResponse:
    """Get file content from a JAR."""
    
    try:
        content = await jar_service.get_file_content(jar_id, path)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": content.model_dump(mode='json')
            }
        )
        
    except JarProcessingError as e:
        logger.error("Failed to get file content", 
                    jar_id=jar_id, path=path, error=str(e))
        raise HTTPException(status_code=404, detail=str(e))
        
    except Exception as e:
        logger.error("Unexpected error getting file content", 
                    jar_id=jar_id, path=path, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{jar_id}/decompile")
async def decompile_class(jar_id: str, path: str = Query(...)) -> JSONResponse:
    """Decompile a class file using CFR decompiler."""
    
    logger.info("Decompilation requested", jar_id=jar_id, path=path)
    
    try:
        # Check if JAR exists
        if jar_id not in jar_service.active_jars:
            raise HTTPException(status_code=404, detail="JAR not found")
        
        if not path.endswith('.class'):
            raise HTTPException(status_code=400, detail="File is not a class file")
        
        # Perform actual decompilation
        result = await jar_service.decompile_class_file(jar_id, path)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": result.model_dump(mode='json')
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Decompilation error", jar_id=jar_id, path=path, error=str(e))
        raise HTTPException(status_code=500, detail="Decompilation failed")


@router.get("/{jar_id}/search")
async def search_files(
    jar_id: str,
    q: str = Query(..., description="Search query")
) -> JSONResponse:
    """Search files in a JAR."""
    
    try:
        results = await jar_service.search_files(jar_id, q)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": {
                    "results": [result.file.model_dump(mode='json') for result in results],
                    "total": len(results),
                    "query": q
                }
            }
        )
        
    except JarProcessingError as e:
        logger.error("Search failed", jar_id=jar_id, query=q, error=str(e))
        raise HTTPException(status_code=404, detail=str(e))
        
    except Exception as e:
        logger.error("Search error", jar_id=jar_id, query=q, error=str(e))
        raise HTTPException(status_code=500, detail="Search failed")


@router.get("/{jar_id}/metadata")
async def get_metadata(jar_id: str) -> JSONResponse:
    """Get JAR metadata."""
    
    try:
        if jar_id not in jar_service.active_jars:
            raise HTTPException(status_code=404, detail="JAR not found")
        
        jar_file = jar_service.active_jars[jar_id]
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": jar_file.metadata.model_dump(mode='json')
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get metadata", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get metadata")


@router.get("/{jar_id}/search/advanced")
async def advanced_search_files(
    jar_id: str,
    q: str = Query(..., description="Search query"),
    search_type: str = Query("combined", description="Search type: filename, content, regex, combined"),
    case_sensitive: bool = Query(False, description="Case sensitive search"),
    include_binary: bool = Query(False, description="Include binary files in search"),
    max_results: int = Query(50, description="Maximum number of results")
) -> JSONResponse:
    """Perform advanced search with content matching."""
    
    try:
        results = await jar_service.advanced_search_files(
            jar_id=jar_id,
            query=q,
            search_type=search_type,
            case_sensitive=case_sensitive,
            include_binary=include_binary,
            max_results=max_results
        )
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": {
                    "results": results,
                    "total": len(results),
                    "query": q,
                    "search_type": search_type,
                    "case_sensitive": case_sensitive,
                    "include_binary": include_binary
                }
            }
        )
        
    except JarProcessingError as e:
        logger.error("Advanced search failed", jar_id=jar_id, query=q, error=str(e))
        raise HTTPException(status_code=404, detail=str(e))
        
    except Exception as e:
        logger.error("Advanced search error", jar_id=jar_id, query=q, error=str(e))
        raise HTTPException(status_code=500, detail="Advanced search failed")


@router.get("/{jar_id}/analysis/dependencies")
async def analyze_dependencies(jar_id: str) -> JSONResponse:
    """Perform comprehensive dependency and security analysis."""
    
    try:
        analysis_result = await jar_service.analyze_dependencies(jar_id)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": analysis_result
            }
        )
        
    except JarProcessingError as e:
        logger.error("Dependency analysis failed", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=404, detail=str(e))
        
    except Exception as e:
        logger.error("Dependency analysis error", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=500, detail="Dependency analysis failed")


@router.get("/{jar_id}/analysis/comprehensive")
async def analyze_comprehensive_dependencies(jar_id: str) -> JSONResponse:
    """Get comprehensive dependency analysis for project decision-making with enhanced error handling."""
    
    from ...utils.error_handling import (
        AnalysisError, ErrorType, ErrorSeverity, AnalysisErrorBuilder,
        PartialAnalysisResult, handle_partial_analysis_failure,
        with_error_handling, RetryConfig
    )
    
    @with_error_handling(
        "comprehensive_dependency_analysis",
        RetryConfig(max_attempts=2, base_delay=1.0)
    )
    async def perform_analysis():
        return await jar_service.analyze_comprehensive_dependencies(jar_id)
    
    try:
        logger.info("Starting comprehensive dependency analysis", jar_id=jar_id)
        
        # Check if JAR exists first
        if jar_id not in jar_service.active_jars:
            error = AnalysisErrorBuilder.create()\
                .type(ErrorType.JAR_NOT_FOUND)\
                .severity(ErrorSeverity.HIGH)\
                .message("JAR file not found or has been removed")\
                .suggested_action("Please upload the JAR file again")\
                .retryable(False)\
                .context({"jar_id": jar_id, "operation": "comprehensive_analysis"})\
                .build()
            
            return JSONResponse(
                status_code=404,
                content={
                    "success": False,
                    "error": error.to_dict(),
                    "partial_result": None
                }
            )
        
        # Perform comprehensive analysis with error handling
        comprehensive_result = await perform_analysis()
        
        # Check for partial failures
        errors = []
        available_data = {
            'dependency_tree': bool(comprehensive_result.get('dependencyTree')),
            'conflicts': bool(comprehensive_result.get('conflicts')),
            'summary': bool(comprehensive_result.get('summary')),
            'search_index': True,  # We can build this from available data
            'export': bool(comprehensive_result.get('dependencyTree'))
        }
        
        # Validate critical components
        if not comprehensive_result.get('dependencyTree'):
            errors.append(
                AnalysisErrorBuilder.create()
                .type(ErrorType.DEPENDENCY_EXTRACTION_FAILED)
                .severity(ErrorSeverity.HIGH)
                .message("Could not extract dependency tree structure")
                .suggested_action("The JAR may not contain standard dependency information")
                .retryable(True)
                .context({"jar_id": jar_id, "operation": "dependency_extraction"})
                .build()
            )
        
        if not comprehensive_result.get('conflicts') and comprehensive_result.get('dependencyTree', {}).get('total_dependencies', 0) > 5:
            errors.append(
                AnalysisErrorBuilder.create()
                .type(ErrorType.CONFLICT_DETECTION_FAILED)
                .severity(ErrorSeverity.MEDIUM)
                .message("Conflict detection may be incomplete")
                .suggested_action("Some dependency conflicts may not have been detected")
                .retryable(True)
                .context({"jar_id": jar_id, "operation": "conflict_detection"})
                .build()
            )
        
        if not comprehensive_result.get('summary'):
            errors.append(
                AnalysisErrorBuilder.create()
                .type(ErrorType.PARTIAL_ANALYSIS_FAILURE)
                .severity(ErrorSeverity.MEDIUM)
                .message("Analysis summary could not be generated")
                .suggested_action("Basic analysis data is available but summary is missing")
                .retryable(True)
                .context({"jar_id": jar_id, "operation": "summary_generation"})
                .build()
            )
        
        # Return results
        if errors:
            # Partial success
            partial_result = handle_partial_analysis_failure(errors, comprehensive_result)
            
            logger.warning(
                "Comprehensive analysis completed with errors",
                jar_id=jar_id,
                error_count=len(errors),
                available_features=list(k for k, v in available_data.items() if v)
            )
            
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "data": comprehensive_result,
                    "partial_result": partial_result.to_dict(),
                    "has_errors": True,
                    "errors": [error.to_dict() for error in errors]
                }
            )
        else:
            # Complete success
            logger.info("Comprehensive analysis completed successfully", jar_id=jar_id)
            
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "data": comprehensive_result,
                    "partial_result": None,
                    "has_errors": False,
                    "errors": []
                }
            )
        
    except Exception as e:
        logger.error("Comprehensive dependency analysis failed", jar_id=jar_id, error=str(e))
        
        # Create structured error response
        if isinstance(e, JarProcessingError):
            error = AnalysisErrorBuilder.create()\
                .type(ErrorType.JAR_PROCESSING_ERROR)\
                .severity(ErrorSeverity.HIGH)\
                .message(str(e))\
                .suggested_action("Please check the JAR file and try again")\
                .retryable(False)\
                .context({"jar_id": jar_id, "operation": "comprehensive_analysis"})\
                .build()
            status_code = 422
        else:
            error = AnalysisErrorBuilder.create()\
                .type(ErrorType.UNKNOWN_ERROR)\
                .severity(ErrorSeverity.HIGH)\
                .message("Comprehensive dependency analysis failed unexpectedly")\
                .suggested_action("Please try again or contact support if the problem persists")\
                .retryable(True)\
                .context({"jar_id": jar_id, "operation": "comprehensive_analysis"})\
                .details({"exception_type": type(e).__name__, "exception_message": str(e)})\
                .build()
            status_code = 500
        
        return JSONResponse(
            status_code=status_code,
            content={
                "success": False,
                "error": error.to_dict(),
                "partial_result": None,
                "has_errors": True,
                "errors": [error.to_dict()]
            }
        )


@router.get("/{jar_id}/analysis/versions")
async def extract_versions(jar_id: str) -> JSONResponse:
    """Extract comprehensive version information from JAR."""
    
    try:
        version_result = await jar_service.extract_all_versions(jar_id)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": {
                    "versions": [
                        {
                            "name": v.name,
                            "version": v.version,
                            "group_id": v.group_id,
                            "artifact_id": v.artifact_id,
                            "source": v.source,
                            "source_file": v.source_file,
                            "confidence": v.confidence
                        } for v in version_result.versions
                    ],
                    "manifest_info": version_result.manifest_info,
                    "build_info": version_result.build_info,
                    "framework_versions": version_result.framework_versions,
                    "total_versions": len(version_result.versions)
                }
            }
        )
        
    except JarProcessingError as e:
        logger.error("Version extraction failed", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=404, detail=str(e))
        
    except Exception as e:
        logger.error("Version extraction error", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=500, detail="Version extraction failed")


@router.get("/{jar_id}/analysis/conflicts")
async def analyze_conflicts(jar_id: str) -> JSONResponse:
    """Analyze dependency conflicts and provide resolution recommendations."""
    
    try:
        conflict_result = await jar_service.analyze_dependency_conflicts(jar_id)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": {
                    "conflicts": [
                        {
                            "conflict_type": c.conflict_type.value,
                            "severity": c.severity.value,
                            "title": c.title,
                            "description": c.description,
                            "conflicted_dependencies": [
                                {
                                    "name": dep.name,
                                    "version": dep.version,
                                    "source": dep.source,
                                    "source_file": dep.source_file,
                                    "confidence": dep.confidence
                                } for dep in c.conflicted_dependencies
                            ],
                            "recommended_version": c.recommended_version,
                            "resolution_steps": c.resolution_steps,
                            "impact_assessment": c.impact_assessment
                        } for c in conflict_result.conflicts
                    ],
                    "total_dependencies": conflict_result.total_dependencies,
                    "conflicted_dependencies": conflict_result.conflicted_dependencies,
                    "severity_breakdown": conflict_result.severity_breakdown,
                    "recommendations": conflict_result.recommendations
                }
            }
        )
        
    except JarProcessingError as e:
        logger.error("Conflict analysis failed", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=404, detail=str(e))
        
    except Exception as e:
        logger.error("Conflict analysis error", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=500, detail="Conflict analysis failed")


@router.post("/{jar_id}/sbom/generate")
async def generate_sbom(
    jar_id: str,
    format: str = Query("cyclonedx", description="SBOM format: cyclonedx or spdx")
) -> JSONResponse:
    """Generate Software Bill of Materials (SBOM) for the JAR."""
    
    try:
        if format.lower() not in ["cyclonedx", "spdx"]:
            raise HTTPException(
                status_code=400, 
                detail="Invalid format. Supported formats: cyclonedx, spdx"
            )
        
        sbom_result = await jar_service.generate_sbom(jar_id, format.lower())
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": {
                    "format": sbom_result.format.value,
                    "sbom": sbom_result.content,
                    "metadata": {
                        "timestamp": sbom_result.metadata.timestamp,
                        "tools": sbom_result.metadata.tools,
                        "authors": sbom_result.metadata.authors,
                        "component_name": sbom_result.metadata.component_name,
                        "component_version": sbom_result.metadata.component_version
                    },
                    "components_count": sbom_result.components_count,
                    "file_size": sbom_result.file_size
                }
            }
        )
        
    except JarProcessingError as e:
        logger.error("SBOM generation failed", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=404, detail=str(e))
        
    except Exception as e:
        logger.error("SBOM generation error", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=500, detail="SBOM generation failed")


@router.get("/{jar_id}/sbom/export")
async def export_sbom(
    jar_id: str,
    format: str = Query("cyclonedx", description="SBOM format: cyclonedx or spdx"),
    export_format: str = Query("json", description="Export format: json or xml")
) -> JSONResponse:
    """Export SBOM to downloadable file."""
    
    try:
        if format.lower() not in ["cyclonedx", "spdx"]:
            raise HTTPException(
                status_code=400, 
                detail="Invalid format. Supported formats: cyclonedx, spdx"
            )
        
        if export_format.lower() not in ["json", "xml"]:
            raise HTTPException(
                status_code=400, 
                detail="Invalid export format. Supported formats: json, xml"
            )
        
        export_result = await jar_service.export_sbom(
            jar_id, format.lower(), export_format.lower()
        )
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": {
                    "download_url": f"/api/jars/{jar_id}/sbom/download/{export_result['filename']}",
                    "filename": export_result['filename'],
                    "file_size": export_result['file_size'],
                    "format": format.lower(),
                    "export_format": export_format.lower()
                }
            }
        )
        
    except JarProcessingError as e:
        logger.error("SBOM export failed", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=404, detail=str(e))
        
    except Exception as e:
        logger.error("SBOM export error", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=500, detail="SBOM export failed")


@router.get("/{jar_id}/analysis/complete")
async def get_complete_analysis(jar_id: str) -> JSONResponse:
    """Get complete comprehensive analysis combining all analysis types."""
    
    try:
        complete_analysis = await jar_service.get_complete_analysis(jar_id)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": complete_analysis
            }
        )
        
    except JarProcessingError as e:
        logger.error("Complete analysis failed", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=404, detail=str(e))
        
    except Exception as e:
        logger.error("Complete analysis error", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=500, detail="Complete analysis failed")


@router.delete("/{jar_id}")
async def delete_jar(jar_id: str) -> JSONResponse:
    """Delete a JAR and its associated data."""
    
    try:
        if jar_id not in jar_service.active_jars:
            raise HTTPException(status_code=404, detail="JAR not found")
        
        jar_service.cleanup_jar(jar_id)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "JAR deleted successfully"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete JAR", jar_id=jar_id, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to delete JAR")


async def cleanup_temp_file(file_path: Path):
    """Background task to cleanup temporary files."""
    try:
        if file_path.exists():
            file_path.unlink()
            logger.info("Temporary file cleaned up", path=str(file_path))
    except Exception as e:
        logger.error("Failed to cleanup temporary file", path=str(file_path), error=str(e))

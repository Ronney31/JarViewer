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

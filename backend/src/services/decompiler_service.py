"""
CFR Decompiler Service
Handles Java class file decompilation using CFR
"""

import asyncio
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import Optional, Dict, Any
import structlog
import time

from ..core.config import get_settings
from ..models.jar import DecompilationResult

logger = structlog.get_logger()
settings = get_settings()


class DecompilerError(Exception):
    """Custom exception for decompilation errors."""
    pass


class CFRDecompilerService:
    """Service for decompiling Java class files using CFR."""
    
    def __init__(self):
        self.cfr_jar_path = Path(__file__).parent.parent.parent / "lib" / "cfr-0.152.jar"
        self.decompilation_cache: Dict[str, DecompilationResult] = {}
        self.max_cache_size = 100
        
        # Verify CFR JAR exists
        if not self.cfr_jar_path.exists():
            logger.error("CFR JAR not found", path=str(self.cfr_jar_path))
            raise DecompilerError(f"CFR decompiler not found at {self.cfr_jar_path}")
        
        logger.info("CFR decompiler initialized", cfr_path=str(self.cfr_jar_path))
    
    async def decompile_class(
        self, 
        class_file_path: Path, 
        class_name: Optional[str] = None
    ) -> DecompilationResult:
        """
        Decompile a Java class file to readable source code.
        
        Args:
            class_file_path: Path to the .class file
            class_name: Optional class name for metadata
            
        Returns:
            DecompilationResult with decompiled source or error
        """
        start_time = time.time()
        
        # Generate cache key
        cache_key = f"{class_file_path.stat().st_mtime}_{class_file_path.stat().st_size}_{class_file_path}"
        
        # Check cache first
        if cache_key in self.decompilation_cache:
            logger.info("Returning cached decompilation", class_file=str(class_file_path))
            return self.decompilation_cache[cache_key]
        
        logger.info("Starting class decompilation", 
                   class_file=str(class_file_path), 
                   class_name=class_name)
        
        try:
            # Validate input file
            if not class_file_path.exists():
                raise DecompilerError("Class file not found")
            
            if not class_file_path.name.endswith('.class'):
                raise DecompilerError("File is not a Java class file")
            
            # Create temporary directory for decompilation
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)
                output_dir = temp_path / "decompiled"
                output_dir.mkdir()
                
                # Build CFR command
                cmd = [
                    "java", "-jar", str(self.cfr_jar_path),
                    str(class_file_path),
                    "--outputdir", str(output_dir),
                    "--silent", "true",
                    "--recover", "true",
                    "--removeboilerplate", "true",
                    "--showversion", "false",
                    "--decodestringswitch", "true",
                    "--decodeenumswitch", "true",
                    "--arrayiter", "true",
                    "--collectioniter", "true"
                ]
                
                # Execute CFR decompilation
                try:
                    process = await asyncio.create_subprocess_exec(
                        *cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    
                    # Wait for process with timeout
                    try:
                        stdout, stderr = await asyncio.wait_for(
                            process.communicate(), 
                            timeout=settings.DECOMPILATION_TIMEOUT
                        )
                    except asyncio.TimeoutError:
                        process.kill()
                        await process.wait()
                        raise DecompilerError("Decompilation timeout")
                    
                    if process.returncode != 0:
                        error_msg = stderr.decode('utf-8', errors='ignore')
                        logger.error("CFR decompilation failed", 
                                   return_code=process.returncode,
                                   error=error_msg)
                        raise DecompilerError(f"Decompilation failed: {error_msg}")
                    
                    # Find the decompiled Java file
                    java_files = list(output_dir.rglob("*.java"))
                    if not java_files:
                        raise DecompilerError("No decompiled Java file generated")
                    
                    # Read the decompiled source
                    java_file = java_files[0]
                    with open(java_file, 'r', encoding='utf-8') as f:
                        decompiled_source = f.read()
                    
                    # Extract class information
                    package_name = self._extract_package_name(decompiled_source)
                    actual_class_name = self._extract_class_name(decompiled_source) or class_name
                    
                    decompilation_time = time.time() - start_time
                    
                    result = DecompilationResult(
                        success=True,
                        content=decompiled_source,
                        metadata={
                            "className": actual_class_name,
                            "packageName": package_name,
                            "decompiler": "CFR 0.152",
                            "decompilationTime": decompilation_time,
                            "originalFile": str(class_file_path.name),
                            "sourceLines": len(decompiled_source.split('\n'))
                        }
                    )
                    
                    # Cache the result
                    self._cache_result(cache_key, result)
                    
                    logger.info("Class decompilation completed", 
                               class_name=actual_class_name,
                               decompilation_time=decompilation_time,
                               source_lines=result.metadata["sourceLines"])
                    
                    return result
                    
                except subprocess.SubprocessError as e:
                    raise DecompilerError(f"Subprocess error: {str(e)}")
                
        except DecompilerError:
            # Re-raise decompiler errors
            raise
        except Exception as e:
            logger.error("Unexpected decompilation error", 
                        class_file=str(class_file_path), 
                        error=str(e))
            raise DecompilerError(f"Unexpected error: {str(e)}")
    
    def _extract_package_name(self, source_code: str) -> Optional[str]:
        """Extract package name from decompiled source."""
        for line in source_code.split('\n'):
            line = line.strip()
            if line.startswith('package ') and line.endswith(';'):
                return line[8:-1].strip()
        return None
    
    def _extract_class_name(self, source_code: str) -> Optional[str]:
        """Extract class name from decompiled source."""
        for line in source_code.split('\n'):
            line = line.strip()
            if 'class ' in line and not line.startswith('//'):
                # Simple extraction - could be improved
                parts = line.split()
                try:
                    class_idx = parts.index('class')
                    if class_idx + 1 < len(parts):
                        class_name = parts[class_idx + 1]
                        # Remove generic parameters if present
                        if '<' in class_name:
                            class_name = class_name.split('<')[0]
                        return class_name
                except (ValueError, IndexError):
                    continue
        return None
    
    def _cache_result(self, cache_key: str, result: DecompilationResult) -> None:
        """Cache decompilation result with size limit."""
        if len(self.decompilation_cache) >= self.max_cache_size:
            # Remove oldest entry (simple FIFO)
            oldest_key = next(iter(self.decompilation_cache))
            del self.decompilation_cache[oldest_key]
        
        self.decompilation_cache[cache_key] = result
    
    def clear_cache(self) -> None:
        """Clear the decompilation cache."""
        self.decompilation_cache.clear()
        logger.info("Decompilation cache cleared")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return {
            "cache_size": len(self.decompilation_cache),
            "max_cache_size": self.max_cache_size,
            "cache_hit_ratio": "Not implemented"  # Could be added with counters
        }


# Global service instance
cfr_decompiler = CFRDecompilerService()

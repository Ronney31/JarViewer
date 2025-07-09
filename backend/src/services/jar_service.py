"""
JAR file processing service
"""

import asyncio
import os
import tempfile
import zipfile
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple, AsyncGenerator, Any
import structlog
from datetime import datetime

from ..models.jar import (
    JarFile, FileNode, JarStats, JarMetadata, ManifestInfo,
    ProcessingProgress, FileContent, SearchResult, DecompilationResult
)
from ..core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


class JarProcessingError(Exception):
    """Custom exception for JAR processing errors."""
    pass


class SecurityError(Exception):
    """Custom exception for security-related errors."""
    pass


class JarService:
    """Service for processing JAR files."""
    
    def __init__(self):
        self.active_jars: Dict[str, JarFile] = {}
        self.temp_base_dir = Path(settings.TEMP_DIR)
        self.temp_base_dir.mkdir(parents=True, exist_ok=True)
    
    async def process_jar_file(
        self, 
        file_path: Path, 
        original_name: str,
        progress_callback: Optional[callable] = None
    ) -> JarFile:
        """
        Process a JAR file and extract its structure and metadata.
        
        Args:
            file_path: Path to the uploaded JAR file
            original_name: Original filename
            progress_callback: Optional callback for progress updates
            
        Returns:
            JarFile object with processed information
            
        Raises:
            JarProcessingError: If processing fails
            SecurityError: If security validation fails
        """
        logger.info("Starting JAR processing", filename=original_name)
        
        try:
            # Create temporary directory for extraction
            temp_dir = tempfile.mkdtemp(dir=self.temp_base_dir)
            temp_path = Path(temp_dir)
            
            if progress_callback:
                await progress_callback(ProcessingProgress(
                    stage="extracting",
                    progress=10,
                    message="Validating JAR file..."
                ))
            
            # Validate JAR file
            await self._validate_jar_file(file_path)
            
            if progress_callback:
                await progress_callback(ProcessingProgress(
                    stage="extracting",
                    progress=20,
                    message="Extracting JAR contents..."
                ))
            
            # Extract JAR contents
            extracted_files = await self._extract_jar_safely(file_path, temp_path)
            
            if progress_callback:
                await progress_callback(ProcessingProgress(
                    stage="analyzing",
                    progress=50,
                    message="Analyzing file structure..."
                ))
            
            # Analyze file structure
            structure = await self._analyze_structure(temp_path)
            
            if progress_callback:
                await progress_callback(ProcessingProgress(
                    stage="analyzing",
                    progress=70,
                    message="Extracting metadata..."
                ))
            
            # Extract metadata
            metadata = await self._extract_metadata(temp_path)
            
            if progress_callback:
                await progress_callback(ProcessingProgress(
                    stage="indexing",
                    progress=90,
                    message="Building file index..."
                ))
            
            # Calculate statistics
            stats = await self._calculate_stats(structure, file_path.stat().st_size)
            
            # Create JarFile object
            jar_file = JarFile(
                name=original_name,
                size=file_path.stat().st_size,
                structure=structure,
                stats=stats,
                metadata=metadata,
                temp_path=str(temp_path)
            )
            
            # Store in active jars
            self.active_jars[jar_file.id] = jar_file
            
            if progress_callback:
                await progress_callback(ProcessingProgress(
                    stage="complete",
                    progress=100,
                    message="Processing complete!"
                ))
            
            logger.info("JAR processing completed", 
                       jar_id=jar_file.id, 
                       files_count=stats.total_files)
            
            return jar_file
            
        except Exception as e:
            logger.error("JAR processing failed", error=str(e), filename=original_name)
            # Cleanup on error
            if 'temp_path' in locals():
                shutil.rmtree(temp_path, ignore_errors=True)
            raise JarProcessingError(f"Failed to process JAR file: {str(e)}")
    
    async def _validate_jar_file(self, file_path: Path) -> None:
        """Validate that the file is a valid JAR/ZIP file."""
        try:
            with zipfile.ZipFile(file_path, 'r') as zip_file:
                # Test the ZIP file integrity
                bad_file = zip_file.testzip()
                if bad_file:
                    raise JarProcessingError(f"Corrupted file in archive: {bad_file}")
                
                # Check for suspicious files
                for info in zip_file.infolist():
                    # Check for path traversal attempts
                    if '..' in info.filename or info.filename.startswith('/'):
                        raise SecurityError(f"Suspicious file path detected: {info.filename}")
                    
                    # Check for excessively large files
                    if info.file_size > settings.MAX_EXTRACTION_SIZE:
                        raise SecurityError(f"File too large: {info.filename}")
                
        except zipfile.BadZipFile:
            raise JarProcessingError("Invalid ZIP/JAR file format")
        except Exception as e:
            if isinstance(e, (JarProcessingError, SecurityError)):
                raise
            raise JarProcessingError(f"File validation failed: {str(e)}")
    
    async def _extract_jar_safely(self, jar_path: Path, extract_path: Path) -> List[str]:
        """Safely extract JAR contents with security checks."""
        extracted_files = []
        
        try:
            with zipfile.ZipFile(jar_path, 'r') as zip_file:
                for member in zip_file.infolist():
                    # Security check: ensure safe extraction path
                    safe_path = extract_path / member.filename
                    if not str(safe_path.resolve()).startswith(str(extract_path.resolve())):
                        raise SecurityError(f"Path traversal attempt: {member.filename}")
                    
                    # Extract file
                    zip_file.extract(member, extract_path)
                    extracted_files.append(member.filename)
                    
                    # Yield control to allow other operations
                    if len(extracted_files) % 100 == 0:
                        await asyncio.sleep(0)
            
            return extracted_files
            
        except Exception as e:
            if isinstance(e, SecurityError):
                raise
            raise JarProcessingError(f"Extraction failed: {str(e)}")
    
    async def _analyze_structure(self, base_path: Path) -> List[FileNode]:
        """Analyze the extracted file structure."""
        
        def build_tree(path: Path, base: Path) -> FileNode:
            """Recursively build file tree."""
            relative_path = path.relative_to(base)
            
            if path.is_file():
                return FileNode(
                    name=path.name,
                    path=str(relative_path),
                    type="file",
                    size=path.stat().st_size,
                    extension=path.suffix.lower() if path.suffix else None
                )
            else:
                children = []
                try:
                    for child in sorted(path.iterdir()):
                        children.append(build_tree(child, base))
                except PermissionError:
                    pass  # Skip inaccessible directories
                
                return FileNode(
                    name=path.name,
                    path=str(relative_path),
                    type="directory",
                    children=children
                )
        
        # Build tree structure
        root_children = []
        try:
            for item in sorted(base_path.iterdir()):
                root_children.append(build_tree(item, base_path))
                # Yield control periodically
                await asyncio.sleep(0)
        except Exception as e:
            logger.error("Structure analysis failed", error=str(e))
            raise JarProcessingError(f"Failed to analyze structure: {str(e)}")
        
        return root_children
    
    async def _extract_metadata(self, base_path: Path) -> JarMetadata:
        """Extract metadata from the JAR file."""
        metadata = JarMetadata()
        
        # Extract MANIFEST.MF
        manifest_path = base_path / "META-INF" / "MANIFEST.MF"
        if manifest_path.exists():
            try:
                manifest_info = await self._parse_manifest(manifest_path)
                metadata.manifest = manifest_info
            except Exception as e:
                logger.warning("Failed to parse manifest", error=str(e))
        
        # Look for common framework indicators
        frameworks = []
        
        # Spring Framework
        if (base_path / "org" / "springframework").exists():
            frameworks.append("Spring Framework")
        
        # Hibernate
        if (base_path / "org" / "hibernate").exists():
            frameworks.append("Hibernate")
        
        # Apache Commons
        if (base_path / "org" / "apache" / "commons").exists():
            frameworks.append("Apache Commons")
        
        metadata.frameworks = frameworks
        
        return metadata
    
    async def _parse_manifest(self, manifest_path: Path) -> ManifestInfo:
        """Parse MANIFEST.MF file."""
        manifest_info = ManifestInfo()
        
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Parse manifest attributes
            attributes = {}
            for line in content.split('\n'):
                line = line.strip()
                if ':' in line:
                    key, value = line.split(':', 1)
                    key = key.strip()
                    value = value.strip()
                    attributes[key] = value
            
            # Map common attributes
            manifest_info.version = attributes.get('Manifest-Version')
            manifest_info.main_class = attributes.get('Main-Class')
            manifest_info.implementation_title = attributes.get('Implementation-Title')
            manifest_info.implementation_version = attributes.get('Implementation-Version')
            manifest_info.implementation_vendor = attributes.get('Implementation-Vendor')
            manifest_info.specification_title = attributes.get('Specification-Title')
            manifest_info.specification_version = attributes.get('Specification-Version')
            manifest_info.specification_vendor = attributes.get('Specification-Vendor')
            manifest_info.build_jdk = attributes.get('Build-Jdk')
            manifest_info.built_by = attributes.get('Built-By')
            manifest_info.build_time = attributes.get('Build-Time')
            
            # Handle Class-Path
            if 'Class-Path' in attributes:
                manifest_info.class_path = attributes['Class-Path'].split()
            
            manifest_info.attributes = attributes
            
        except Exception as e:
            logger.error("Manifest parsing failed", error=str(e))
            raise
        
        return manifest_info
    
    async def _calculate_stats(self, structure: List[FileNode], compressed_size: int) -> JarStats:
        """Calculate statistics about the JAR file."""
        
        def count_nodes(nodes: List[FileNode]) -> Tuple[int, int, int, Dict[str, int]]:
            """Recursively count files and directories."""
            files = 0
            dirs = 0
            total_size = 0
            file_types = {}
            
            for node in nodes:
                if node.type == "file":
                    files += 1
                    total_size += node.size or 0
                    
                    # Count file types
                    ext = node.extension or "no_extension"
                    file_types[ext] = file_types.get(ext, 0) + 1
                    
                elif node.type == "directory":
                    dirs += 1
                    if node.children:
                        child_files, child_dirs, child_size, child_types = count_nodes(node.children)
                        files += child_files
                        dirs += child_dirs
                        total_size += child_size
                        
                        # Merge file types
                        for ext, count in child_types.items():
                            file_types[ext] = file_types.get(ext, 0) + count
            
            return files, dirs, total_size, file_types
        
        total_files, total_dirs, total_size, file_types = count_nodes(structure)
        
        compression_ratio = (1 - compressed_size / total_size) if total_size > 0 else 0
        
        return JarStats(
            total_files=total_files,
            total_directories=total_dirs,
            total_size=total_size,
            compressed_size=compressed_size,
            compression_ratio=compression_ratio,
            file_types=file_types
        )
    
    async def get_file_content(self, jar_id: str, file_path: str) -> FileContent:
        """Get content of a specific file from the JAR."""
        if jar_id not in self.active_jars:
            raise JarProcessingError("JAR not found")
        
        jar_file = self.active_jars[jar_id]
        full_path = Path(jar_file.temp_path) / file_path
        
        if not full_path.exists():
            raise JarProcessingError("File not found")
        
        try:
            # Determine file type and encoding
            file_size = full_path.stat().st_size
            
            # Read file content
            try:
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                file_type = "text"
                encoding = "utf-8"
            except UnicodeDecodeError:
                # Try binary read for non-text files
                with open(full_path, 'rb') as f:
                    binary_content = f.read()
                
                # Check if it's an image
                if file_path.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                    import base64
                    content = base64.b64encode(binary_content).decode('ascii')
                    file_type = "image"
                    encoding = "base64"
                else:
                    content = binary_content.hex()
                    file_type = "binary"
                    encoding = "hex"
            
            # Determine language for syntax highlighting
            language = self._detect_language(file_path)
            
            return FileContent(
                content=content,
                type=file_type,
                encoding=encoding,
                language=language,
                size=file_size
            )
            
        except Exception as e:
            logger.error("Failed to read file content", 
                        jar_id=jar_id, file_path=file_path, error=str(e))
            raise JarProcessingError(f"Failed to read file: {str(e)}")
    
    def _detect_language(self, file_path: str) -> Optional[str]:
        """Detect programming language from file extension."""
        ext = Path(file_path).suffix.lower()
        
        language_map = {
            '.java': 'java',
            '.class': 'java',  # Will be decompiled
            '.json': 'json',
            '.xml': 'xml',
            '.properties': 'properties',
            '.yml': 'yaml',
            '.yaml': 'yaml',
            '.md': 'markdown',
            '.txt': 'text',
            '.html': 'html',
            '.css': 'css',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.sql': 'sql'
        }
        
        return language_map.get(ext)
    
    async def search_files(self, jar_id: str, query: str) -> List[SearchResult]:
        """Search for files in the JAR."""
        if jar_id not in self.active_jars:
            raise JarProcessingError("JAR not found")
        
        jar_file = self.active_jars[jar_id]
        results = []
        
        def search_nodes(nodes: List[FileNode], query_lower: str):
            """Recursively search through file nodes."""
            for node in nodes:
                # Search in filename
                if query_lower in node.name.lower():
                    score = 1.0 if query_lower == node.name.lower() else 0.5
                    results.append(SearchResult(file=node, score=score))
                
                # Search in children
                if node.children:
                    search_nodes(node.children, query_lower)
        
        query_lower = query.lower()
        search_nodes(jar_file.structure, query_lower)
        
        # Sort by score (highest first)
        results.sort(key=lambda x: x.score, reverse=True)
        
        return results[:50]  # Limit results
    
    async def decompile_class_file(self, jar_id: str, class_path: str) -> DecompilationResult:
        """Decompile a class file from the JAR."""
        if jar_id not in self.active_jars:
            raise JarProcessingError("JAR not found")
        
        jar_file = self.active_jars[jar_id]
        full_path = Path(jar_file.temp_path) / class_path
        
        if not full_path.exists():
            raise JarProcessingError("Class file not found")
        
        if not class_path.endswith('.class'):
            raise JarProcessingError("File is not a Java class file")
        
        try:
            # Import here to avoid circular imports
            from .decompiler_service import cfr_decompiler
            
            # Extract class name from path
            class_name = Path(class_path).stem
            
            # Decompile the class file
            result = await cfr_decompiler.decompile_class(full_path, class_name)
            
            logger.info("Class decompilation completed", 
                       jar_id=jar_id, 
                       class_path=class_path,
                       success=result.success)
            
            return result
            
        except Exception as e:
            logger.error("Class decompilation failed", 
                        jar_id=jar_id, 
                        class_path=class_path, 
                        error=str(e))
            
            return DecompilationResult(
                success=False,
                error=f"Decompilation failed: {str(e)}"
            )
    
    async def advanced_search_files(
        self, 
        jar_id: str, 
        query: str,
        search_type: str = "combined",
        case_sensitive: bool = False,
        include_binary: bool = False,
        max_results: int = 50
    ) -> List[Dict[str, Any]]:
        """Perform advanced search on JAR files."""
        if jar_id not in self.active_jars:
            raise JarProcessingError("JAR not found")
        
        jar_file = self.active_jars[jar_id]
        
        try:
            # Import here to avoid circular imports
            from .search_service import advanced_search_service, SearchType
            
            # Convert string search type to enum
            search_type_enum = SearchType(search_type)
            
            # Perform advanced search
            results = await advanced_search_service.search_jar(
                jar_temp_path=Path(jar_file.temp_path),
                file_structure=jar_file.structure,
                query=query,
                search_type=search_type_enum,
                case_sensitive=case_sensitive,
                max_results=max_results,
                include_binary=include_binary
            )
            
            # Convert results to serializable format
            serialized_results = []
            for result in results:
                matches_data = []
                for match in result.matches:
                    matches_data.append({
                        "line_number": match.line_number,
                        "line_content": match.line_content,
                        "match_start": match.match_start,
                        "match_end": match.match_end,
                        "context_before": match.context_before,
                        "context_after": match.context_after
                    })
                
                serialized_results.append({
                    "file": result.file.model_dump(mode='json'),
                    "search_type": result.search_type.value,
                    "matches": matches_data,
                    "score": result.score,
                    "total_matches": result.total_matches,
                    "file_content_preview": result.file_content_preview
                })
            
            logger.info("Advanced search completed", 
                       jar_id=jar_id, 
                       query=query,
                       results_count=len(serialized_results))
            
            return serialized_results
            
        except Exception as e:
            logger.error("Advanced search failed", 
                        jar_id=jar_id, 
                        query=query, 
                        error=str(e))
            raise JarProcessingError(f"Search failed: {str(e)}")
    
    async def analyze_dependencies(self, jar_id: str) -> Dict[str, Any]:
        """Perform comprehensive dependency analysis on a JAR."""
        if jar_id not in self.active_jars:
            raise JarProcessingError("JAR not found")
        
        jar_file = self.active_jars[jar_id]
        
        try:
            # Import here to avoid circular imports
            from .dependency_service import dependency_analysis_service
            
            # Perform dependency analysis
            analysis_result = await dependency_analysis_service.analyze_jar(
                jar_temp_path=Path(jar_file.temp_path),
                file_structure=jar_file.structure
            )
            
            # Convert to serializable format
            serialized_result = {
                "dependencies": [
                    {
                        "name": dep.name,
                        "version": dep.version,
                        "group_id": dep.group_id,
                        "artifact_id": dep.artifact_id,
                        "dependency_type": dep.dependency_type.value,
                        "source_file": dep.source_file,
                        "description": dep.description
                    }
                    for dep in analysis_result.dependencies
                ],
                "frameworks": [
                    {
                        "name": fw.name,
                        "version": fw.version,
                        "confidence": fw.confidence,
                        "indicators": fw.indicators,
                        "description": fw.description
                    }
                    for fw in analysis_result.frameworks
                ],
                "security_issues": [
                    {
                        "title": issue.title,
                        "description": issue.description,
                        "severity": issue.severity.value,
                        "file_path": issue.file_path,
                        "recommendation": issue.recommendation,
                        "cve_id": issue.cve_id
                    }
                    for issue in analysis_result.security_issues
                ],
                "package_structure": analysis_result.package_structure,
                "entry_points": analysis_result.entry_points,
                "build_info": analysis_result.build_info,
                "summary": {
                    "total_dependencies": len(analysis_result.dependencies),
                    "total_frameworks": len(analysis_result.frameworks),
                    "security_issues_count": len(analysis_result.security_issues),
                    "critical_issues": len([
                        issue for issue in analysis_result.security_issues 
                        if issue.severity.value == "critical"
                    ]),
                    "high_issues": len([
                        issue for issue in analysis_result.security_issues 
                        if issue.severity.value == "high"
                    ])
                }
            }
            
            logger.info("Dependency analysis completed", 
                       jar_id=jar_id,
                       dependencies=len(analysis_result.dependencies),
                       frameworks=len(analysis_result.frameworks),
                       security_issues=len(analysis_result.security_issues))
            
            return serialized_result
            
        except Exception as e:
            logger.error("Dependency analysis failed", 
                        jar_id=jar_id, 
                        error=str(e))
            raise JarProcessingError(f"Dependency analysis failed: {str(e)}")

    def cleanup_jar(self, jar_id: str) -> None:
        if jar_id in self.active_jars:
            jar_file = self.active_jars[jar_id]
            temp_path = Path(jar_file.temp_path)
            
            if temp_path.exists():
                shutil.rmtree(temp_path, ignore_errors=True)
            
            del self.active_jars[jar_id]
            logger.info("JAR cleanup completed", jar_id=jar_id)


# Global service instance
jar_service = JarService()

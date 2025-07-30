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
from .enhanced_dependency_service import enhanced_dependency_service, EnhancedDependencyReport
from .version_extraction_service import version_extraction_service, ExtractedVersions
from .sbom_service import sbom_service, SBOMFormat, GeneratedSBOM

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
            # Perform enhanced dependency analysis
            analysis_result = await enhanced_dependency_service.analyze_jar_dependencies(
                jar_path=Path(jar_file.temp_path)
            )
            
            # Convert to serializable format
            serialized_result = {
                "jar_info": {
                    "name": analysis_result.jar_info.name,
                    "version": analysis_result.jar_info.version,
                    "group_id": analysis_result.jar_info.group_id,
                    "artifact_id": analysis_result.jar_info.artifact_id,
                    "bundle_name": analysis_result.jar_info.bundle_name,
                    "bundle_symbolic_name": analysis_result.jar_info.bundle_symbolic_name,
                    "bundle_version": analysis_result.jar_info.bundle_version,
                    "bundle_vendor": analysis_result.jar_info.bundle_vendor,
                    "bundle_description": analysis_result.jar_info.bundle_description,
                    "built_by": analysis_result.jar_info.built_by,
                    "build_jdk": analysis_result.jar_info.build_jdk,
                    "build_time": analysis_result.jar_info.build_time,
                    "created_by": analysis_result.jar_info.created_by,
                    "specification_title": analysis_result.jar_info.specification_title,
                    "specification_version": analysis_result.jar_info.specification_version,
                    "specification_vendor": analysis_result.jar_info.specification_vendor,
                    "implementation_title": analysis_result.jar_info.implementation_title,
                    "implementation_version": analysis_result.jar_info.implementation_version,
                    "implementation_vendor": analysis_result.jar_info.implementation_vendor,
                    "main_class": analysis_result.jar_info.main_class,
                    "class_path": analysis_result.jar_info.class_path
                },
                "dependencies": [
                    {
                        "name": dep.name,
                        "version": dep.version,
                        "group_id": dep.group_id,
                        "artifact_id": dep.artifact_id,
                        "scope": dep.scope,
                        "source": dep.source,
                        "source_file": dep.source_file,
                        "optional": dep.optional,
                        "description": dep.description,
                        "license": dep.license,
                        "bundle_symbolic_name": dep.bundle_symbolic_name,
                        "bundle_version": dep.bundle_version,
                        "resolution": dep.resolution,
                        "package_imports": dep.package_imports,
                        "package_exports": dep.package_exports,
                        "confidence": dep.confidence
                    }
                    for dep in analysis_result.dependencies
                ],
                "direct_dependencies": [
                    {
                        "name": dep.name,
                        "version": dep.version,
                        "group_id": dep.group_id,
                        "artifact_id": dep.artifact_id,
                        "scope": dep.scope,
                        "source": dep.source,
                        "description": dep.description,
                        "confidence": dep.confidence
                    }
                    for dep in analysis_result.direct_dependencies
                ],
                "transitive_dependencies": [
                    {
                        "name": dep.name,
                        "version": dep.version,
                        "group_id": dep.group_id,
                        "artifact_id": dep.artifact_id,
                        "source": dep.source,
                        "description": dep.description,
                        "confidence": dep.confidence
                    }
                    for dep in analysis_result.transitive_dependencies
                ],
                "optional_dependencies": [
                    {
                        "name": dep.name,
                        "version": dep.version,
                        "group_id": dep.group_id,
                        "artifact_id": dep.artifact_id,
                        "source": dep.source,
                        "description": dep.description,
                        "confidence": dep.confidence
                    }
                    for dep in analysis_result.optional_dependencies
                ],
                "imported_packages": analysis_result.imported_packages,
                "exported_packages": analysis_result.exported_packages,
                "detected_frameworks": analysis_result.detected_frameworks,
                "security_risks": analysis_result.security_risks,
                "license_conflicts": analysis_result.license_conflicts,
                "version_conflicts": analysis_result.version_conflicts,
                "statistics": {
                    "total_dependencies": analysis_result.total_dependencies,
                    "maven_dependencies": analysis_result.maven_dependencies,
                    "osgi_dependencies": analysis_result.osgi_dependencies,
                    "gradle_dependencies": analysis_result.gradle_dependencies,
                    "direct_dependencies": len(analysis_result.direct_dependencies),
                    "transitive_dependencies": len(analysis_result.transitive_dependencies),
                    "optional_dependencies": len(analysis_result.optional_dependencies),
                    "security_risks": len(analysis_result.security_risks),
                    "license_conflicts": len(analysis_result.license_conflicts),
                    "version_conflicts": len(analysis_result.version_conflicts),
                    "detected_frameworks": len(analysis_result.detected_frameworks)
                }
            }
            
            logger.info("Enhanced dependency analysis completed", 
                       jar_id=jar_id,
                       total_dependencies=analysis_result.total_dependencies,
                       direct_dependencies=len(analysis_result.direct_dependencies),
                       frameworks=len(analysis_result.detected_frameworks),
                       security_risks=len(analysis_result.security_risks))
            
            return serialized_result
            
        except Exception as e:
            logger.error("Dependency analysis failed", 
                        jar_id=jar_id, 
                        error=str(e))
            raise JarProcessingError(f"Dependency analysis failed: {str(e)}")
    

    async def extract_all_versions(self, jar_id: str) -> ExtractedVersions:
        """Extract comprehensive version information from JAR."""
        if jar_id not in self.active_jars:
            raise JarProcessingError(f"JAR {jar_id} not found")
        
        jar_file = self.active_jars[jar_id]
        temp_path = Path(jar_file.temp_path)
        
        logger.info("Starting comprehensive version extraction", jar_id=jar_id)
        
        try:
            extracted_versions = await version_extraction_service.extract_all_versions(temp_path)
            
            logger.info("Version extraction completed", 
                       jar_id=jar_id,
                       total_versions=len(extracted_versions.versions),
                       frameworks=len(extracted_versions.framework_versions))
            
            return extracted_versions
            
        except Exception as e:
            logger.error("Version extraction failed", 
                        jar_id=jar_id, 
                        error=str(e))
            raise JarProcessingError(f"Version extraction failed: {str(e)}")



    async def generate_sbom(self, jar_id: str, format: str = "cyclonedx") -> GeneratedSBOM:
        """Generate Software Bill of Materials (SBOM) for the JAR."""
        if jar_id not in self.active_jars:
            raise JarProcessingError(f"JAR {jar_id} not found")
        
        jar_file = self.active_jars[jar_id]
        
        logger.info("Starting SBOM generation", jar_id=jar_id, format=format)
        
        try:
            # Get comprehensive analysis data
            extracted_versions = await self.extract_all_versions(jar_id)
            dependency_analysis = await self._get_dependency_analysis_result(jar_id)
            
            # Determine SBOM format
            sbom_format = SBOMFormat.CYCLONE_DX if format.lower() == "cyclonedx" else SBOMFormat.SPDX
            
            # Generate SBOM
            sbom_result = await sbom_service.generate_sbom(
                jar_file.name,
                extracted_versions,
                dependency_analysis,
                sbom_format
            )
            
            logger.info("SBOM generation completed", 
                       jar_id=jar_id,
                       format=format,
                       components=sbom_result.components_count,
                       size=sbom_result.file_size)
            
            return sbom_result
            
        except Exception as e:
            logger.error("SBOM generation failed", 
                        jar_id=jar_id, 
                        error=str(e))
            raise JarProcessingError(f"SBOM generation failed: {str(e)}")

    async def export_sbom(
        self, 
        jar_id: str, 
        format: str = "cyclonedx", 
        export_format: str = "json"
    ) -> Dict[str, Any]:
        """Export SBOM to downloadable file."""
        if jar_id not in self.active_jars:
            raise JarProcessingError(f"JAR {jar_id} not found")
        
        logger.info("Starting SBOM export", 
                   jar_id=jar_id, 
                   format=format, 
                   export_format=export_format)
        
        try:
            # Generate SBOM
            sbom_result = await self.generate_sbom(jar_id, format)
            
            # Create export directory
            export_dir = self.temp_base_dir / "exports" / jar_id
            export_dir.mkdir(parents=True, exist_ok=True)
            
            # Export SBOM
            export_path = await sbom_service.export_sbom(
                sbom_result, export_dir, export_format
            )
            
            # Calculate file size
            file_size = export_path.stat().st_size
            
            logger.info("SBOM export completed", 
                       jar_id=jar_id,
                       export_path=str(export_path),
                       file_size=file_size)
            
            return {
                "filename": export_path.name,
                "file_path": str(export_path),
                "file_size": file_size,
                "format": format,
                "export_format": export_format
            }
            
        except Exception as e:
            logger.error("SBOM export failed", 
                        jar_id=jar_id, 
                        error=str(e))
            raise JarProcessingError(f"SBOM export failed: {str(e)}")

    async def analyze_comprehensive_dependencies(self, jar_id: str) -> Dict[str, Any]:
        """Perform comprehensive dependency analysis for project decision-making."""
        if jar_id not in self.active_jars:
            raise JarProcessingError(f"JAR {jar_id} not found")
        
        jar_file = self.active_jars[jar_id]
        temp_path = Path(jar_file.temp_path)
        
        logger.info("Starting comprehensive dependency analysis", jar_id=jar_id)
        
        try:
            # Use enhanced dependency service for comprehensive analysis
            report = await enhanced_dependency_service.analyze_jar_dependencies(
                jar_path=temp_path
            )
            
            # Convert to serializable format matching enhanced service
            result = {
                "jar_info": {
                    "name": report.jar_info.name,
                    "version": report.jar_info.version,
                    "group_id": report.jar_info.group_id,
                    "artifact_id": report.jar_info.artifact_id,
                    "bundle_name": report.jar_info.bundle_name,
                    "bundle_symbolic_name": report.jar_info.bundle_symbolic_name,
                    "bundle_version": report.jar_info.bundle_version,
                    "bundle_vendor": report.jar_info.bundle_vendor,
                    "bundle_description": report.jar_info.bundle_description,
                    "built_by": report.jar_info.built_by,
                    "build_jdk": report.jar_info.build_jdk,
                    "build_time": report.jar_info.build_time,
                    "created_by": report.jar_info.created_by,
                    "specification_title": report.jar_info.specification_title,
                    "specification_version": report.jar_info.specification_version,
                    "specification_vendor": report.jar_info.specification_vendor,
                    "implementation_title": report.jar_info.implementation_title,
                    "implementation_version": report.jar_info.implementation_version,
                    "implementation_vendor": report.jar_info.implementation_vendor,
                    "main_class": report.jar_info.main_class,
                    "class_path": report.jar_info.class_path
                },
                "dependencies": [
                    {
                        "name": dep.name,
                        "version": dep.version,
                        "group_id": dep.group_id,
                        "artifact_id": dep.artifact_id,
                        "scope": dep.scope,
                        "source": dep.source,
                        "optional": dep.optional,
                        "description": dep.description,
                        "license": dep.license,
                        "bundle_symbolic_name": dep.bundle_symbolic_name,
                        "bundle_version": dep.bundle_version,
                        "resolution": dep.resolution,
                        "package_imports": dep.package_imports,
                        "package_exports": dep.package_exports,
                        "confidence": dep.confidence
                    }
                    for dep in report.dependencies
                ],
                "direct_dependencies": [
                    {
                        "name": dep.name,
                        "version": dep.version,
                        "group_id": dep.group_id,
                        "artifact_id": dep.artifact_id,
                        "scope": dep.scope,
                        "source": dep.source,
                        "description": dep.description,
                        "confidence": dep.confidence
                    }
                    for dep in report.direct_dependencies
                ],
                "transitive_dependencies": [
                    {
                        "name": dep.name,
                        "version": dep.version,
                        "group_id": dep.group_id,
                        "artifact_id": dep.artifact_id,
                        "source": dep.source,
                        "description": dep.description,
                        "confidence": dep.confidence
                    }
                    for dep in report.transitive_dependencies
                ],
                "optional_dependencies": [
                    {
                        "name": dep.name,
                        "version": dep.version,
                        "group_id": dep.group_id,
                        "artifact_id": dep.artifact_id,
                        "source": dep.source,
                        "description": dep.description,
                        "confidence": dep.confidence
                    }
                    for dep in report.optional_dependencies
                ],
                "imported_packages": report.imported_packages,
                "exported_packages": report.exported_packages,
                "detected_frameworks": report.detected_frameworks,
                "security_risks": report.security_risks,
                "license_conflicts": report.license_conflicts,
                "version_conflicts": report.version_conflicts,
                "statistics": {
                    "total_dependencies": report.total_dependencies,
                    "maven_dependencies": report.maven_dependencies,
                    "osgi_dependencies": report.osgi_dependencies,
                    "gradle_dependencies": report.gradle_dependencies,
                    "direct_dependencies": len(report.direct_dependencies),
                    "transitive_dependencies": len(report.transitive_dependencies),
                    "optional_dependencies": len(report.optional_dependencies),
                    "security_risks": len(report.security_risks),
                    "license_conflicts": len(report.license_conflicts),
                    "version_conflicts": len(report.version_conflicts),
                    "detected_frameworks": len(report.detected_frameworks)
                }
            }
            
            logger.info("Comprehensive dependency analysis completed", 
                       jar_id=jar_id,
                       total_dependencies=report.total_dependencies,
                       frameworks=len(report.detected_frameworks))
            
            return result
            
        except Exception as e:
            logger.error("Comprehensive dependency analysis failed", 
                        jar_id=jar_id, 
                        error=str(e))
            raise JarProcessingError(f"Comprehensive dependency analysis failed: {str(e)}")

    def _generate_decision_factors(self, report: EnhancedDependencyReport) -> List[str]:
        """Generate decision factors for using this JAR."""
        factors = []
        
        # Positive factors
        if report.detected_frameworks:
            framework_names = list(report.detected_frameworks.keys())[:3]
            factors.append(f"✅ Uses established frameworks: {', '.join(framework_names)}")
        
        if report.jar_info.build_jdk:
            factors.append(f"✅ Built with Java {report.jar_info.build_jdk}")
        
        if report.total_dependencies < 20:
            factors.append("✅ Lightweight - few external dependencies")
        
        # Warning factors
        if report.security_risks:
            factors.append(f"⚠️ {len(report.security_risks)} potential security concerns")
        
        if report.license_conflicts:
            factors.append(f"⚠️ {len(report.license_conflicts)} license conflicts detected")
        
        if report.version_conflicts:
            factors.append(f"⚠️ {len(report.version_conflicts)} version conflicts detected")
        
        if report.total_dependencies > 50:
            factors.append("⚠️ Heavy - many external dependencies")
        
        return factors

    def _calculate_compatibility_score(self, report: EnhancedDependencyReport) -> int:
        """Calculate compatibility score (0-100)."""
        score = 70  # Base score
        
        # Positive factors
        if report.maven_dependencies > 0 or report.gradle_dependencies > 0:
            score += 10  # Uses standard build tools
        
        if report.detected_frameworks:
            score += 5  # Uses established frameworks
        
        if len(report.security_risks) == 0:
            score += 10  # No security risks
        
        if len(report.license_conflicts) == 0:
            score += 5  # No license conflicts
        
        if len(report.version_conflicts) == 0:
            score += 5  # No version conflicts
        
        # Negative factors
        if len(report.security_risks) > 0:
            score -= 20  # Security risks present
        
        if len(report.license_conflicts) > 0:
            score -= 10  # License conflicts
        
        if len(report.version_conflicts) > 0:
            score -= 10  # Version conflicts
        
        if report.total_dependencies > 100:
            score -= 10  # Too many dependencies
        
        return max(0, min(100, score))

    def _generate_recommendation(self, report: EnhancedDependencyReport) -> str:
        """Generate usage recommendation."""
        score = self._calculate_compatibility_score(report)
        
        if score >= 80:
            return "✅ RECOMMENDED - This JAR appears safe and well-maintained for use in projects"
        elif score >= 60:
            return "⚠️ USE WITH CAUTION - Review the warnings before using in production"
        else:
            return "❌ NOT RECOMMENDED - Significant concerns found, consider alternatives"

    async def get_complete_analysis(self, jar_id: str) -> Dict[str, Any]:
        """Get complete comprehensive analysis combining all analysis types."""
        if jar_id not in self.active_jars:
            raise JarProcessingError(f"JAR {jar_id} not found")
        
        jar_file = self.active_jars[jar_id]
        
        logger.info("Starting complete comprehensive analysis", jar_id=jar_id)
        
        try:
            # Run all analyses in parallel for better performance
            import asyncio
            
            # Gather all analysis results using enhanced service
            results = await asyncio.gather(
                self.analyze_comprehensive_dependencies(jar_id),
                self.extract_all_versions(jar_id),
                self.analyze_dependencies(jar_id),
                self.generate_sbom(jar_id, "cyclonedx"),
                return_exceptions=True
            )
            
            # Extract results and handle any exceptions
            comprehensive_deps = results[0] if not isinstance(results[0], Exception) else None
            version_analysis = results[1] if not isinstance(results[1], Exception) else None
            dependency_analysis = results[2] if not isinstance(results[2], Exception) else None
            sbom_result = results[3] if not isinstance(results[3], Exception) else None
            
            # Build complete analysis response
            complete_analysis = {
                "jar_info": {
                    "id": jar_file.id,
                    "name": jar_file.name,
                    "size": jar_file.size,
                    "uploaded_at": jar_file.uploaded_at.isoformat(),
                    "stats": jar_file.stats.model_dump(mode='json')
                },
                "comprehensive_dependencies": comprehensive_deps,
                "version_analysis": self._serialize_version_analysis(version_analysis) if version_analysis else None,
                "dependency_analysis": dependency_analysis,
                "sbom": self._serialize_sbom_result(sbom_result) if sbom_result else None,
                "analysis_summary": self._generate_analysis_summary(
                    comprehensive_deps, version_analysis, dependency_analysis
                ),
                "recommendations": self._generate_complete_recommendations(
                    comprehensive_deps, version_analysis, dependency_analysis
                ),
                "risk_assessment": self._generate_risk_assessment(
                    comprehensive_deps, version_analysis, dependency_analysis
                )
            }
            
            logger.info("Complete comprehensive analysis completed", jar_id=jar_id)
            
            return complete_analysis
            
        except Exception as e:
            logger.error("Complete comprehensive analysis failed", 
                        jar_id=jar_id, 
                        error=str(e))
            raise JarProcessingError(f"Complete comprehensive analysis failed: {str(e)}")

    def _serialize_version_analysis(self, version_analysis) -> Dict[str, Any]:
        """Serialize version analysis result."""
        return {
            "versions": [
                {
                    "name": v.name,
                    "version": v.version,
                    "group_id": v.group_id,
                    "artifact_id": v.artifact_id,
                    "source": v.source,
                    "source_file": v.source_file,
                    "confidence": v.confidence
                } for v in version_analysis.versions
            ],
            "manifest_info": version_analysis.manifest_info,
            "build_info": version_analysis.build_info,
            "framework_versions": version_analysis.framework_versions,
            "total_versions": len(version_analysis.versions)
        }

    def _serialize_conflict_analysis(self, conflict_analysis) -> Dict[str, Any]:
        """Serialize conflict analysis result."""
        return {
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
                } for c in conflict_analysis.conflicts
            ],
            "total_dependencies": conflict_analysis.total_dependencies,
            "conflicted_dependencies": conflict_analysis.conflicted_dependencies,
            "severity_breakdown": conflict_analysis.severity_breakdown,
            "recommendations": conflict_analysis.recommendations
        }

    def _serialize_sbom_result(self, sbom_result) -> Dict[str, Any]:
        """Serialize SBOM result."""
        return {
            "format": sbom_result.format.value,
            "components_count": sbom_result.components_count,
            "file_size": sbom_result.file_size,
            "metadata": {
                "timestamp": sbom_result.metadata.timestamp,
                "tools": sbom_result.metadata.tools,
                "authors": sbom_result.metadata.authors,
                "component_name": sbom_result.metadata.component_name,
                "component_version": sbom_result.metadata.component_version
            }
        }

    def _generate_analysis_summary(self, comprehensive_deps, version_analysis, conflict_analysis, dependency_analysis) -> Dict[str, Any]:
        """Generate high-level analysis summary."""
        summary = {
            "total_dependencies": 0,
            "total_frameworks": 0,
            "total_versions": 0,
            "total_conflicts": 0,
            "security_issues": 0,
            "analysis_completeness": 0
        }
        
        completeness_score = 0
        
        if comprehensive_deps:
            summary["total_dependencies"] = comprehensive_deps.get("statistics", {}).get("total_dependencies", 0)
            summary["total_frameworks"] = len(comprehensive_deps.get("frameworks", []))
            completeness_score += 25
        
        if version_analysis:
            summary["total_versions"] = len(version_analysis.versions)
            completeness_score += 25
        
        if conflict_analysis:
            summary["total_conflicts"] = len(conflict_analysis.conflicts)
            completeness_score += 25
        
        if dependency_analysis:
            summary["security_issues"] = dependency_analysis.get("summary", {}).get("security_issues_count", 0)
            completeness_score += 25
        
        summary["analysis_completeness"] = completeness_score
        
        return summary

    def _generate_complete_recommendations(self, comprehensive_deps, version_analysis, conflict_analysis, dependency_analysis) -> List[str]:
        """Generate comprehensive recommendations based on all analyses."""
        recommendations = []
        
        # From comprehensive dependency analysis
        if comprehensive_deps and comprehensive_deps.get("summary", {}).get("recommendation"):
            recommendations.append(comprehensive_deps["summary"]["recommendation"])
        
        # From conflict analysis
        if conflict_analysis and conflict_analysis.recommendations:
            recommendations.extend(conflict_analysis.recommendations[:3])  # Top 3 conflict recommendations
        
        # Security-focused recommendations
        if dependency_analysis:
            security_count = dependency_analysis.get("summary", {}).get("security_issues_count", 0)
            if security_count > 0:
                recommendations.append(f"🔒 Address {security_count} security issues before production use")
        
        # Version-based recommendations
        if version_analysis and len(version_analysis.versions) > 50:
            recommendations.append("📦 Consider dependency consolidation - high number of versions detected")
        
        # General recommendations
        recommendations.extend([
            "📋 Review all analysis sections for detailed insights",
            "🔄 Re-run analysis after making dependency changes",
            "📊 Use SBOM for compliance and supply chain security"
        ])
        
        return recommendations[:8]  # Limit to top 8 recommendations

    def _generate_risk_assessment(self, comprehensive_deps, version_analysis, conflict_analysis, dependency_analysis) -> Dict[str, Any]:
        """Generate overall risk assessment."""
        risk_score = 0  # 0-100, higher is riskier
        risk_factors = []
        
        # Security risks
        if dependency_analysis:
            security_count = dependency_analysis.get("summary", {}).get("security_issues_count", 0)
            critical_count = dependency_analysis.get("summary", {}).get("critical_issues", 0)
            high_count = dependency_analysis.get("summary", {}).get("high_issues", 0)
            
            if critical_count > 0:
                risk_score += 40
                risk_factors.append(f"🚨 {critical_count} critical security vulnerabilities")
            
            if high_count > 0:
                risk_score += 20
                risk_factors.append(f"⚠️ {high_count} high-severity security issues")
        
        # Conflict risks
        if conflict_analysis:
            critical_conflicts = len([c for c in conflict_analysis.conflicts if c.severity.value == "critical"])
            high_conflicts = len([c for c in conflict_analysis.conflicts if c.severity.value == "high"])
            
            if critical_conflicts > 0:
                risk_score += 25
                risk_factors.append(f"💥 {critical_conflicts} critical dependency conflicts")
            
            if high_conflicts > 0:
                risk_score += 15
                risk_factors.append(f"⚡ {high_conflicts} high-severity conflicts")
        
        # Dependency risks
        if comprehensive_deps:
            outdated_count = len(comprehensive_deps.get("risk_assessment", {}).get("outdated_dependencies", []))
            security_concerns = len(comprehensive_deps.get("risk_assessment", {}).get("security_concerns", []))
            
            if outdated_count > 5:
                risk_score += 10
                risk_factors.append(f"📅 {outdated_count} potentially outdated dependencies")
            
            if security_concerns > 0:
                risk_score += 15
                risk_factors.append(f"🔍 {security_concerns} security concerns identified")
        
        # Determine risk level
        if risk_score >= 70:
            risk_level = "HIGH"
            risk_color = "red"
        elif risk_score >= 40:
            risk_level = "MEDIUM"
            risk_color = "orange"
        elif risk_score >= 20:
            risk_level = "LOW"
            risk_color = "yellow"
        else:
            risk_level = "MINIMAL"
            risk_color = "green"
        
        return {
            "risk_score": min(100, risk_score),
            "risk_level": risk_level,
            "risk_color": risk_color,
            "risk_factors": risk_factors,
            "overall_assessment": self._get_risk_assessment_text(risk_level, risk_score)
        }

    def _get_risk_assessment_text(self, risk_level: str, risk_score: int) -> str:
        """Get risk assessment text based on level and score."""
        if risk_level == "HIGH":
            return "⛔ HIGH RISK - Significant security and compatibility issues detected. Immediate attention required."
        elif risk_level == "MEDIUM":
            return "⚠️ MEDIUM RISK - Some concerns identified. Review and address issues before production use."
        elif risk_level == "LOW":
            return "⚡ LOW RISK - Minor issues detected. Generally safe for use with some precautions."
        else:
            return "✅ MINIMAL RISK - No significant issues detected. Safe for production use."


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

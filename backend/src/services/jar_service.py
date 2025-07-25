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
from .version_extraction_service import version_extraction_service, ExtractedVersions
from .sbom_service import sbom_service, SBOMFormat, GeneratedSBOM
from .conflict_detection_service import conflict_detection_service, ConflictAnalysisResult
from .comprehensive_dependency_service import comprehensive_dependency_service, ComprehensiveDependencyReport
from .dependency_tree_service import dependency_tree_service

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
    
    async def build_dependency_tree(self, jar_id: str) -> Dict[str, Any]:
        """Build hierarchical dependency tree for the JAR."""
        if jar_id not in self.active_jars:
            raise JarProcessingError("JAR not found")
        
        jar_file = self.active_jars[jar_id]
        
        try:
            logger.info("Building dependency tree", jar_id=jar_id)
            
            # Build dependency tree
            dependency_tree = await dependency_tree_service.build_dependency_tree(
                jar_id=jar_id,
                jar_path=Path(jar_file.temp_path)
            )
            
            # Create analysis report
            analysis_report = dependency_tree_service.create_analysis_report(dependency_tree)
            
            # Convert to serializable format
            serialized_result = {
                "tree": {
                    "id": dependency_tree.id,
                    "jar_id": dependency_tree.jar_id,
                    "total_dependencies": dependency_tree.total_dependencies,
                    "direct_dependencies": dependency_tree.direct_dependencies,
                    "transitive_dependencies": dependency_tree.transitive_dependencies,
                    "max_depth": dependency_tree.max_depth,
                    "scope_counts": {scope.value: count for scope, count in dependency_tree.scope_counts.items()},
                    "source_counts": {source.value: count for source, count in dependency_tree.source_counts.items()},
                    "root_dependencies": [
                        self._serialize_dependency_node(dep) for dep in dependency_tree.root_dependencies
                    ],
                    "conflicts": [
                        {
                            "id": conflict.id,
                            "conflict_type": conflict.conflict_type.value,
                            "affected_dependencies": conflict.affected_dependencies,
                            "description": conflict.description,
                            "severity": conflict.severity,
                            "resolution_suggestion": conflict.resolution_suggestion,
                            "conflicting_versions": conflict.conflicting_versions,
                            "winning_version": conflict.winning_version,
                            "paths": conflict.paths
                        }
                        for conflict in dependency_tree.conflicts
                    ],
                    "paths": [
                        {
                            "target_dependency_id": path.target_dependency_id,
                            "path": path.path,
                            "depth": path.depth,
                            "path_string": path.path_string
                        }
                        for path in dependency_tree.paths
                    ]
                },
                "analysis": {
                    "id": analysis_report.id,
                    "created_at": analysis_report.created_at.isoformat(),
                    "summary": analysis_report.summary,
                    "security_risks": analysis_report.security_risks,
                    "license_risks": analysis_report.license_risks,
                    "outdated_dependencies": analysis_report.outdated_dependencies,
                    "recommendations": analysis_report.recommendations
                }
            }
            
            logger.info("Dependency tree built successfully", 
                       jar_id=jar_id,
                       total_deps=dependency_tree.total_dependencies,
                       conflicts=len(dependency_tree.conflicts))
            
            return serialized_result
            
        except Exception as e:
            logger.error("Dependency tree building failed", 
                        jar_id=jar_id, 
                        error=str(e))
            raise JarProcessingError(f"Dependency tree building failed: {str(e)}")
    
    def _serialize_dependency_node(self, node) -> Dict[str, Any]:
        """Serialize a dependency node to dictionary format."""
        return {
            "id": node.id,
            "group_id": node.group_id,
            "artifact_id": node.artifact_id,
            "version": node.version,
            "scope": node.scope.value,
            "source": node.source.value,
            "optional": node.optional,
            "parent_id": node.parent_id,
            "description": node.description,
            "license": node.license,
            "size_bytes": node.size_bytes,
            "file_path": node.file_path,
            "is_transitive": node.is_transitive,
            "depth": node.depth,
            "resolved_version": node.resolved_version,
            "coordinate": node.coordinate,
            "name": node.name,
            "children": [
                self._serialize_dependency_node(child) for child in node.children
            ]
        }

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

    async def analyze_dependency_conflicts(self, jar_id: str) -> ConflictAnalysisResult:
        """Analyze dependency conflicts and provide resolution recommendations."""
        if jar_id not in self.active_jars:
            raise JarProcessingError(f"JAR {jar_id} not found")
        
        logger.info("Starting dependency conflict analysis", jar_id=jar_id)
        
        try:
            # Get comprehensive version information
            extracted_versions = await self.extract_all_versions(jar_id)
            
            # Get dependency analysis
            dependency_analysis = await self._get_dependency_analysis_result(jar_id)
            
            # Perform conflict analysis
            conflict_result = await conflict_detection_service.analyze_conflicts(
                extracted_versions, dependency_analysis
            )
            
            logger.info("Conflict analysis completed", 
                       jar_id=jar_id,
                       total_conflicts=len(conflict_result.conflicts),
                       conflicted_dependencies=conflict_result.conflicted_dependencies)
            
            return conflict_result
            
        except Exception as e:
            logger.error("Conflict analysis failed", 
                        jar_id=jar_id, 
                        error=str(e))
            raise JarProcessingError(f"Conflict analysis failed: {str(e)}")

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
            # Get comprehensive analysis
            report = await comprehensive_dependency_service.analyze_comprehensive_dependencies(
                temp_path, jar_file.size
            )
            
            # Convert to serializable format
            result = {
                "maven_dependencies": [
                    {
                        "name": dep.name,
                        "version": dep.version,
                        "group_id": dep.group_id,
                        "artifact_id": dep.artifact_id,
                        "type": dep.type,
                        "source": dep.source,
                        "description": dep.description,
                        "license": dep.license,
                        "class_count": dep.class_count
                    }
                    for dep in report.maven_dependencies
                ],
                "gradle_dependencies": [
                    {
                        "name": dep.name,
                        "version": dep.version,
                        "group_id": dep.group_id,
                        "artifact_id": dep.artifact_id,
                        "type": dep.type,
                        "source": dep.source,
                        "description": dep.description,
                        "license": dep.license,
                        "class_count": dep.class_count
                    }
                    for dep in report.gradle_dependencies
                ],
                "detected_libraries": [
                    {
                        "name": dep.name,
                        "version": dep.version,
                        "group_id": dep.group_id,
                        "artifact_id": dep.artifact_id,
                        "type": dep.type,
                        "source": dep.source,
                        "description": dep.description,
                        "license": dep.license,
                        "class_count": dep.class_count
                    }
                    for dep in report.detected_libraries
                ],
                "frameworks": [
                    {
                        "name": fw.name,
                        "version": fw.version,
                        "confidence": fw.confidence,
                        "components": fw.components,
                        "description": fw.description
                    }
                    for fw in report.frameworks
                ],
                "java_version": report.java_version,
                "build_tool": report.build_tool,
                "top_packages": report.top_packages,
                "external_packages": report.external_packages,
                "statistics": {
                    "total_dependencies": report.total_dependencies,
                    "total_classes": report.total_classes,
                    "total_packages": report.total_packages,
                    "jar_size_mb": report.jar_size_mb
                },
                "risk_assessment": {
                    "outdated_dependencies": report.outdated_dependencies,
                    "security_concerns": report.security_concerns,
                    "license_info": report.license_info
                },
                "summary": {
                    "decision_factors": self._generate_decision_factors(report),
                    "compatibility_score": self._calculate_compatibility_score(report),
                    "recommendation": self._generate_recommendation(report)
                }
            }
            
            logger.info("Comprehensive dependency analysis completed", 
                       jar_id=jar_id,
                       total_dependencies=report.total_dependencies,
                       frameworks=len(report.frameworks))
            
            return result
            
        except Exception as e:
            logger.error("Comprehensive dependency analysis failed", 
                        jar_id=jar_id, 
                        error=str(e))
            raise JarProcessingError(f"Comprehensive dependency analysis failed: {str(e)}")

    def _generate_decision_factors(self, report: ComprehensiveDependencyReport) -> List[str]:
        """Generate decision factors for using this JAR."""
        factors = []
        
        # Positive factors
        if report.frameworks:
            factors.append(f"✅ Uses established frameworks: {', '.join([fw.name for fw in report.frameworks[:3]])}")
        
        if report.build_tool:
            factors.append(f"✅ Built with {report.build_tool} (standard build tool)")
        
        if report.java_version:
            factors.append(f"✅ Built with Java {report.java_version}")
        
        if report.total_dependencies < 20:
            factors.append("✅ Lightweight - few external dependencies")
        
        # Warning factors
        if report.outdated_dependencies:
            factors.append(f"⚠️ Contains {len(report.outdated_dependencies)} potentially outdated dependencies")
        
        if report.security_concerns:
            factors.append(f"⚠️ {len(report.security_concerns)} potential security concerns")
        
        if report.total_dependencies > 50:
            factors.append("⚠️ Heavy - many external dependencies")
        
        if report.jar_size_mb > 50:
            factors.append(f"⚠️ Large JAR size ({report.jar_size_mb} MB)")
        
        return factors

    def _calculate_compatibility_score(self, report: ComprehensiveDependencyReport) -> int:
        """Calculate compatibility score (0-100)."""
        score = 70  # Base score
        
        # Positive factors
        if report.build_tool in ['Maven', 'Gradle']:
            score += 10
        
        if report.frameworks:
            score += 5
        
        if len(report.outdated_dependencies) == 0:
            score += 10
        
        if len(report.security_concerns) == 0:
            score += 10
        
        # Negative factors
        if len(report.outdated_dependencies) > 5:
            score -= 15
        
        if len(report.security_concerns) > 0:
            score -= 20
        
        if report.total_dependencies > 100:
            score -= 10
        
        return max(0, min(100, score))

    def _generate_recommendation(self, report: ComprehensiveDependencyReport) -> str:
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
            
            # Gather all analysis results
            results = await asyncio.gather(
                self.analyze_comprehensive_dependencies(jar_id),
                self.extract_all_versions(jar_id),
                self.analyze_dependency_conflicts(jar_id),
                self.analyze_dependencies(jar_id),
                self.generate_sbom(jar_id, "cyclonedx"),
                return_exceptions=True
            )
            
            # Extract results and handle any exceptions
            comprehensive_deps = results[0] if not isinstance(results[0], Exception) else None
            version_analysis = results[1] if not isinstance(results[1], Exception) else None
            conflict_analysis = results[2] if not isinstance(results[2], Exception) else None
            dependency_analysis = results[3] if not isinstance(results[3], Exception) else None
            sbom_result = results[4] if not isinstance(results[4], Exception) else None
            
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
                "conflict_analysis": self._serialize_conflict_analysis(conflict_analysis) if conflict_analysis else None,
                "dependency_analysis": dependency_analysis,
                "sbom": self._serialize_sbom_result(sbom_result) if sbom_result else None,
                "analysis_summary": self._generate_analysis_summary(
                    comprehensive_deps, version_analysis, conflict_analysis, dependency_analysis
                ),
                "recommendations": self._generate_complete_recommendations(
                    comprehensive_deps, version_analysis, conflict_analysis, dependency_analysis
                ),
                "risk_assessment": self._generate_risk_assessment(
                    comprehensive_deps, version_analysis, conflict_analysis, dependency_analysis
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

    async def _get_dependency_analysis_result(self, jar_id: str):
        """Get dependency analysis result for internal use."""
        from .dependency_service import dependency_analysis_service
        
        jar_file = self.active_jars[jar_id]
        temp_path = Path(jar_file.temp_path)
        
        # Get dependency analysis
        analysis_result = await dependency_analysis_service.analyze_jar(
            temp_path, jar_file.structure
        )
        
        return analysis_result

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

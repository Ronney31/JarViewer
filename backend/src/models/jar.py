"""
Pydantic models for JAR file processing
"""

from datetime import datetime
from typing import Dict, List, Optional, Any, Set
from pydantic import BaseModel, Field
from enum import Enum
import uuid


class DependencyScope(str, Enum):
    """Dependency scopes."""
    COMPILE = "compile"
    RUNTIME = "runtime"
    TEST = "test"
    PROVIDED = "provided"
    SYSTEM = "system"
    IMPORT = "import"


class DependencySource(str, Enum):
    """Source of dependency detection."""
    MAVEN_POM = "maven_pom"
    GRADLE_BUILD = "gradle_build"
    MANIFEST = "manifest"
    IMPORTS = "imports"
    CLASSPATH = "classpath"
    DETECTED = "detected"


class ConflictType(str, Enum):
    """Types of dependency conflicts."""
    VERSION_CONFLICT = "version_conflict"
    SCOPE_CONFLICT = "scope_conflict"
    DUPLICATE = "duplicate"
    MISSING = "missing"


class ConflictSeverity(str, Enum):
    """Severity levels for dependency conflicts."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class DependencyNode(BaseModel):
    """Represents a single dependency in the dependency tree."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    group_id: str
    artifact_id: str
    version: Optional[str] = None
    scope: DependencyScope = DependencyScope.COMPILE
    source: DependencySource = DependencySource.DETECTED
    optional: bool = False
    
    # Tree structure
    parent_id: Optional[str] = None
    children: List['DependencyNode'] = Field(default_factory=list)
    dependency_path: List[str] = Field(default_factory=list)  # Path from root to this dependency
    
    # Metadata
    description: Optional[str] = None
    license: Optional[str] = None
    size_bytes: Optional[int] = None
    file_path: Optional[str] = None
    
    # Analysis data
    is_transitive: bool = False
    depth: int = 0
    resolved_version: Optional[str] = None
    
    # Conflict status indicators
    has_conflicts: bool = False
    conflict_severity: Optional[ConflictSeverity] = None
    conflict_ids: List[str] = Field(default_factory=list)  # IDs of conflicts affecting this dependency
    resolution_strategy: Optional[str] = None  # How version conflicts are resolved
    usage_context: List[str] = Field(default_factory=list)  # Where this dependency is used
    license_compatibility: Optional[str] = None  # License compatibility status
    
    @property
    def coordinate(self) -> str:
        """Get Maven coordinate string."""
        return f"{self.group_id}:{self.artifact_id}:{self.version or 'unknown'}"
    
    @property
    def name(self) -> str:
        """Get display name."""
        return f"{self.group_id}:{self.artifact_id}"
    
    @property
    def path_string(self) -> str:
        """Get human-readable dependency path string."""
        if not self.dependency_path:
            return self.name
        return " -> ".join(self.dependency_path)
    
    def add_child(self, child: 'DependencyNode') -> None:
        """Add a child dependency and update its tree properties."""
        child.parent_id = self.id
        child.depth = self.depth + 1
        child.is_transitive = True
        child.dependency_path = self.dependency_path + [self.name]
        self.children.append(child)
    
    def update_conflict_status(self, conflicts: List['DependencyConflict']) -> None:
        """Update conflict status based on provided conflicts."""
        affecting_conflicts = [c for c in conflicts if self.id in c.affected_dependencies]
        
        if affecting_conflicts:
            self.has_conflicts = True
            self.conflict_ids = [c.id for c in affecting_conflicts]
            
            # Determine highest severity
            severities = [ConflictSeverity(c.severity) for c in affecting_conflicts]
            severity_order = [ConflictSeverity.LOW, ConflictSeverity.MEDIUM, ConflictSeverity.HIGH, ConflictSeverity.CRITICAL]
            
            for severity in reversed(severity_order):
                if severity in severities:
                    self.conflict_severity = severity
                    break
        else:
            self.has_conflicts = False
            self.conflict_severity = None
            self.conflict_ids = []


class DependencyConflict(BaseModel):
    """Represents a dependency conflict."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conflict_type: ConflictType
    affected_dependencies: List[str]  # List of dependency IDs
    description: str
    severity: ConflictSeverity = ConflictSeverity.MEDIUM
    resolution_suggestion: Optional[str] = None
    
    # Conflict details
    conflicting_versions: List[str] = Field(default_factory=list)
    winning_version: Optional[str] = None
    paths: List[List[str]] = Field(default_factory=list)  # Dependency paths leading to conflict
    
    def calculate_severity(self) -> ConflictSeverity:
        """Calculate conflict severity based on conflict details."""
        if self.conflict_type == ConflictType.VERSION_CONFLICT:
            # Check version differences
            if len(self.conflicting_versions) >= 2:
                versions = [v for v in self.conflicting_versions if v]
                if len(versions) >= 2:
                    # Simple heuristic: major version differences are critical
                    major_versions = set()
                    for version in versions:
                        parts = version.split('.')
                        if parts and parts[0].isdigit():
                            major_versions.add(int(parts[0]))
                    
                    if len(major_versions) > 1:
                        return ConflictSeverity.CRITICAL
                    else:
                        return ConflictSeverity.HIGH
            return ConflictSeverity.MEDIUM
        elif self.conflict_type == ConflictType.MISSING:
            return ConflictSeverity.HIGH
        elif self.conflict_type == ConflictType.DUPLICATE:
            return ConflictSeverity.LOW
        else:
            return ConflictSeverity.MEDIUM


class DependencyPath(BaseModel):
    """Represents a path from root to a dependency."""
    target_dependency_id: str
    path: List[str]  # List of dependency IDs from root to target
    depth: int
    
    @property
    def path_string(self) -> str:
        """Get human-readable path string."""
        return " -> ".join(self.path)


class DependencyTree(BaseModel):
    """Complete dependency tree structure."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    jar_id: str
    
    # Tree structure
    root_dependencies: List[DependencyNode] = Field(default_factory=list)
    all_dependencies: Dict[str, DependencyNode] = Field(default_factory=dict)
    
    # Analysis results
    conflicts: List[DependencyConflict] = Field(default_factory=list)
    paths: List[DependencyPath] = Field(default_factory=list)
    
    # Statistics
    total_dependencies: int = 0
    direct_dependencies: int = 0
    transitive_dependencies: int = 0
    max_depth: int = 0
    
    # Scope breakdown
    scope_counts: Dict[DependencyScope, int] = Field(default_factory=dict)
    source_counts: Dict[DependencySource, int] = Field(default_factory=dict)
    
    def add_dependency(self, dependency: DependencyNode, parent_id: Optional[str] = None) -> None:
        """Add a dependency to the tree."""
        dependency.parent_id = parent_id
        self.all_dependencies[dependency.id] = dependency
        
        if parent_id is None:
            # Root dependency
            self.root_dependencies.append(dependency)
            dependency.depth = 0
            dependency.is_transitive = False
            dependency.dependency_path = []
        else:
            # Child dependency
            parent = self.all_dependencies.get(parent_id)
            if parent:
                parent.add_child(dependency)
        
        self._update_statistics()
    
    def build_from_flat_list(self, dependencies: List[DependencyNode]) -> None:
        """Build hierarchical tree from flat list of dependencies."""
        # First pass: Add all dependencies to the tree
        for dep in dependencies:
            self.all_dependencies[dep.id] = dep
        
        # Second pass: Build parent-child relationships
        for dep in dependencies:
            if dep.parent_id and dep.parent_id in self.all_dependencies:
                parent = self.all_dependencies[dep.parent_id]
                parent.add_child(dep)
            else:
                # Root dependency
                if dep not in self.root_dependencies:
                    self.root_dependencies.append(dep)
                    dep.depth = 0
                    dep.is_transitive = False
                    dep.dependency_path = []
        
        # Third pass: Update conflict status for all nodes
        conflicts = self.detect_conflicts()
        self.update_all_conflict_status(conflicts)
        
        self._update_statistics()
    
    def update_all_conflict_status(self, conflicts: Optional[List[DependencyConflict]] = None) -> None:
        """Update conflict status for all dependencies in the tree."""
        if conflicts is None:
            conflicts = self.conflicts
        
        for dependency in self.all_dependencies.values():
            dependency.update_conflict_status(conflicts)
    
    def find_dependency(self, group_id: str, artifact_id: str) -> List[DependencyNode]:
        """Find dependencies by group and artifact ID."""
        return [
            dep for dep in self.all_dependencies.values()
            if dep.group_id == group_id and dep.artifact_id == artifact_id
        ]
    
    def get_dependency_path(self, dependency_id: str) -> Optional[DependencyPath]:
        """Get the path from root to a specific dependency."""
        dependency = self.all_dependencies.get(dependency_id)
        if not dependency:
            return None
        
        path = []
        current = dependency
        
        while current:
            path.insert(0, current.id)
            if current.parent_id:
                current = self.all_dependencies.get(current.parent_id)
            else:
                break
        
        return DependencyPath(
            target_dependency_id=dependency_id,
            path=path,
            depth=len(path) - 1
        )
    
    def detect_conflicts(self) -> List[DependencyConflict]:
        """Detect conflicts in the dependency tree."""
        conflicts = []
        
        # Group dependencies by name (group:artifact)
        dependency_groups = {}
        for dep in self.all_dependencies.values():
            key = f"{dep.group_id}:{dep.artifact_id}"
            if key not in dependency_groups:
                dependency_groups[key] = []
            dependency_groups[key].append(dep)
        
        # Check for version conflicts
        for name, deps in dependency_groups.items():
            if len(deps) > 1:
                versions = set(dep.version for dep in deps if dep.version)
                if len(versions) > 1:
                    # Version conflict detected
                    paths = []
                    for dep in deps:
                        path = self.get_dependency_path(dep.id)
                        if path:
                            paths.append(path.path)
                    
                    conflict = DependencyConflict(
                        conflict_type=ConflictType.VERSION_CONFLICT,
                        affected_dependencies=[dep.id for dep in deps],
                        description=f"Multiple versions of {name} found: {', '.join(versions)}",
                        conflicting_versions=list(versions),
                        paths=paths,
                        resolution_suggestion="Consider using dependency management to enforce a single version"
                    )
                    # Calculate and set severity
                    conflict.severity = conflict.calculate_severity()
                    conflicts.append(conflict)
        
        self.conflicts = conflicts
        return conflicts
    
    def _update_statistics(self) -> None:
        """Update tree statistics."""
        self.total_dependencies = len(self.all_dependencies)
        self.direct_dependencies = len(self.root_dependencies)
        self.transitive_dependencies = self.total_dependencies - self.direct_dependencies
        
        if self.all_dependencies:
            self.max_depth = max(dep.depth for dep in self.all_dependencies.values())
        
        # Update scope counts
        scope_counts = {}
        for scope in DependencyScope:
            scope_counts[scope] = sum(1 for dep in self.all_dependencies.values() if dep.scope == scope)
        self.scope_counts = scope_counts
        
        # Update source counts
        source_counts = {}
        for source in DependencySource:
            source_counts[source] = sum(1 for dep in self.all_dependencies.values() if dep.source == source)
        self.source_counts = source_counts


class DependencyAnalysisReport(BaseModel):
    """Complete dependency analysis report."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    jar_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Core analysis
    dependency_tree: DependencyTree
    
    # Summary statistics
    summary: Dict[str, Any] = Field(default_factory=dict)
    
    # Risk assessment
    security_risks: List[Dict[str, Any]] = Field(default_factory=list)
    license_risks: List[Dict[str, Any]] = Field(default_factory=list)
    outdated_dependencies: List[str] = Field(default_factory=list)
    
    # Recommendations
    recommendations: List[str] = Field(default_factory=list)
    
    def generate_summary(self) -> Dict[str, Any]:
        """Generate analysis summary."""
        tree = self.dependency_tree
        
        summary = {
            "total_dependencies": tree.total_dependencies,
            "direct_dependencies": tree.direct_dependencies,
            "transitive_dependencies": tree.transitive_dependencies,
            "max_depth": tree.max_depth,
            "conflicts_count": len(tree.conflicts),
            "scope_breakdown": dict(tree.scope_counts),
            "source_breakdown": dict(tree.source_counts),
            "has_conflicts": len(tree.conflicts) > 0,
            "risk_level": self._calculate_risk_level()
        }
        
        self.summary = summary
        return summary
    
    def _calculate_risk_level(self) -> str:
        """Calculate overall risk level."""
        risk_score = 0
        
        # Add points for conflicts
        risk_score += len(self.dependency_tree.conflicts) * 2
        
        # Add points for security risks
        risk_score += len(self.security_risks) * 3
        
        # Add points for license risks
        risk_score += len(self.license_risks) * 1
        
        # Add points for outdated dependencies
        risk_score += len(self.outdated_dependencies) * 1
        
        if risk_score >= 10:
            return "high"
        elif risk_score >= 5:
            return "medium"
        else:
            return "low"


class FileNode(BaseModel):
    """Represents a file or directory in the JAR structure."""
    name: str
    path: str
    type: str = Field(..., pattern="^(file|directory)$")
    size: Optional[int] = None
    extension: Optional[str] = None
    children: Optional[List['FileNode']] = None
    metadata: Optional[Dict[str, Any]] = None


class JarStats(BaseModel):
    """Statistics about the JAR file."""
    total_files: int
    total_directories: int
    total_size: int
    compressed_size: int
    compression_ratio: float
    file_types: Dict[str, int]


class ManifestInfo(BaseModel):
    """Information extracted from MANIFEST.MF."""
    version: Optional[str] = None
    main_class: Optional[str] = None
    class_path: Optional[List[str]] = None
    implementation_title: Optional[str] = None
    implementation_version: Optional[str] = None
    implementation_vendor: Optional[str] = None
    specification_title: Optional[str] = None
    specification_version: Optional[str] = None
    specification_vendor: Optional[str] = None
    build_jdk: Optional[str] = None
    built_by: Optional[str] = None
    build_time: Optional[str] = None
    attributes: Dict[str, str] = Field(default_factory=dict)


class JarMetadata(BaseModel):
    """Metadata extracted from the JAR file."""
    manifest: Optional[ManifestInfo] = None
    dependencies: List[str] = Field(default_factory=list)
    frameworks: List[str] = Field(default_factory=list)


class JarFile(BaseModel):
    """Represents a processed JAR file."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    size: int
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    structure: List[FileNode]
    stats: JarStats
    metadata: JarMetadata
    temp_path: str  # Internal use only


class ProcessingProgress(BaseModel):
    """Progress information for JAR processing."""
    stage: str = Field(..., pattern="^(uploading|extracting|analyzing|indexing|complete)$")
    progress: int = Field(..., ge=0, le=100)
    message: str
    details: Optional[str] = None


class FileContent(BaseModel):
    """Content of a file from the JAR."""
    content: str
    type: str = Field(..., pattern="^(text|binary|image)$")
    encoding: Optional[str] = None
    language: Optional[str] = None
    size: int


class DecompilationResult(BaseModel):
    """Result of class file decompilation."""
    success: bool
    content: Optional[str] = None
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class SearchResult(BaseModel):
    """Search result for file search."""
    file: FileNode
    matches: List[Dict[str, Any]] = Field(default_factory=list)
    score: float


# Update forward references
FileNode.model_rebuild()
DependencyNode.model_rebuild()

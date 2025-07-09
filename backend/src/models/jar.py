"""
Pydantic models for JAR file processing
"""

from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
import uuid


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

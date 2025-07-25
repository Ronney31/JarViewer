"""
SBOM (Software Bill of Materials) Generation Service
Generates SBOM in CycloneDX and SPDX formats from JAR analysis
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any
import structlog
from dataclasses import dataclass, asdict
from enum import Enum

from .version_extraction_service import VersionInfo, ExtractedVersions
from .dependency_service import Dependency, DependencyAnalysisResult

logger = structlog.get_logger()


class SBOMFormat(Enum):
    """Supported SBOM formats."""
    CYCLONE_DX = "cyclonedx"
    SPDX = "spdx"


@dataclass
class SBOMComponent:
    """Represents a component in the SBOM."""
    name: str
    version: Optional[str]
    purl: Optional[str]  # Package URL
    component_type: str = "library"
    supplier: Optional[str] = None
    description: Optional[str] = None
    licenses: List[str] = None
    hashes: Dict[str, str] = None
    external_references: List[Dict[str, str]] = None
    
    def __post_init__(self):
        if self.licenses is None:
            self.licenses = []
        if self.hashes is None:
            self.hashes = {}
        if self.external_references is None:
            self.external_references = []


@dataclass
class SBOMMetadata:
    """SBOM metadata information."""
    timestamp: str
    tools: List[str]
    authors: List[str]
    supplier: Optional[str] = None
    component_name: Optional[str] = None
    component_version: Optional[str] = None


@dataclass
class GeneratedSBOM:
    """Generated SBOM result."""
    format: SBOMFormat
    content: Dict[str, Any]
    metadata: SBOMMetadata
    components_count: int
    file_size: int


class SBOMGenerationService:
    """Service for generating Software Bill of Materials (SBOM)."""
    
    def __init__(self):
        self.cyclone_dx_version = "1.5"
        self.spdx_version = "SPDX-2.3"
    
    async def generate_sbom(
        self,
        jar_name: str,
        extracted_versions: ExtractedVersions,
        dependency_analysis: DependencyAnalysisResult,
        format: SBOMFormat = SBOMFormat.CYCLONE_DX
    ) -> GeneratedSBOM:
        """Generate SBOM in specified format."""
        logger.info("Generating SBOM", jar_name=jar_name, format=format.value)
        
        # Convert analysis results to SBOM components
        components = await self._create_sbom_components(
            extracted_versions, dependency_analysis
        )
        
        # Create metadata
        metadata = SBOMMetadata(
            timestamp=datetime.now(timezone.utc).isoformat(),
            tools=["JarViewer", "CFR Decompiler"],
            authors=["JarViewer Analysis Engine"],
            component_name=jar_name,
            component_version=self._extract_main_version(extracted_versions)
        )
        
        # Generate SBOM content based on format
        if format == SBOMFormat.CYCLONE_DX:
            content = await self._generate_cyclone_dx(components, metadata, jar_name)
        elif format == SBOMFormat.SPDX:
            content = await self._generate_spdx(components, metadata, jar_name)
        else:
            raise ValueError(f"Unsupported SBOM format: {format}")
        
        # Calculate content size
        content_json = json.dumps(content, indent=2)
        file_size = len(content_json.encode('utf-8'))
        
        logger.info("SBOM generation completed", 
                   format=format.value,
                   components=len(components),
                   size_bytes=file_size)
        
        return GeneratedSBOM(
            format=format,
            content=content,
            metadata=metadata,
            components_count=len(components),
            file_size=file_size
        )
    
    async def _create_sbom_components(
        self,
        extracted_versions: ExtractedVersions,
        dependency_analysis: DependencyAnalysisResult
    ) -> List[SBOMComponent]:
        """Create SBOM components from analysis results."""
        components = []
        seen_components = set()
        
        # Add components from version extraction
        for version_info in extracted_versions.versions:
            component = await self._version_info_to_component(version_info)
            component_key = (component.name, component.version)
            
            if component_key not in seen_components:
                components.append(component)
                seen_components.add(component_key)
        
        # Add components from dependency analysis
        for dependency in dependency_analysis.dependencies:
            component = await self._dependency_to_component(dependency)
            component_key = (component.name, component.version)
            
            if component_key not in seen_components:
                components.append(component)
                seen_components.add(component_key)
        
        # Add framework components
        for framework in dependency_analysis.frameworks:
            component = SBOMComponent(
                name=framework.name,
                version=framework.version,
                purl=self._create_purl(framework.name, framework.version),
                component_type="framework",
                description=framework.description
            )
            
            component_key = (component.name, component.version)
            if component_key not in seen_components:
                components.append(component)
                seen_components.add(component_key)
        
        return components
    
    async def _version_info_to_component(self, version_info: VersionInfo) -> SBOMComponent:
        """Convert VersionInfo to SBOMComponent."""
        return SBOMComponent(
            name=version_info.name,
            version=version_info.version,
            purl=self._create_purl(
                version_info.group_id or version_info.name,
                version_info.version,
                version_info.artifact_id
            ),
            component_type="library",
            external_references=[
                {
                    "type": "build-meta",
                    "url": f"source:{version_info.source}",
                    "comment": f"Found in {version_info.source_file or 'N/A'}"
                }
            ]
        )
    
    async def _dependency_to_component(self, dependency: Dependency) -> SBOMComponent:
        """Convert Dependency to SBOMComponent."""
        return SBOMComponent(
            name=dependency.name,
            version=dependency.version,
            purl=self._create_purl(
                dependency.group_id or dependency.name,
                dependency.version,
                dependency.artifact_id
            ),
            component_type="library",
            description=dependency.description,
            external_references=[
                {
                    "type": "build-meta",
                    "url": f"source:{dependency.dependency_type.value}",
                    "comment": f"Found in {dependency.source_file or 'N/A'}"
                }
            ]
        )
    
    async def _generate_cyclone_dx(
        self,
        components: List[SBOMComponent],
        metadata: SBOMMetadata,
        jar_name: str
    ) -> Dict[str, Any]:
        """Generate CycloneDX format SBOM."""
        
        # Convert components to CycloneDX format
        cyclone_components = []
        for component in components:
            cyclone_component = {
                "type": component.component_type,
                "name": component.name,
                "bom-ref": f"{component.name}@{component.version or 'unknown'}"
            }
            
            if component.version:
                cyclone_component["version"] = component.version
            
            if component.purl:
                cyclone_component["purl"] = component.purl
            
            if component.description:
                cyclone_component["description"] = component.description
            
            if component.supplier:
                cyclone_component["supplier"] = {"name": component.supplier}
            
            if component.licenses:
                cyclone_component["licenses"] = [
                    {"license": {"name": license_name}} 
                    for license_name in component.licenses
                ]
            
            if component.hashes:
                cyclone_component["hashes"] = [
                    {"alg": alg, "content": hash_value}
                    for alg, hash_value in component.hashes.items()
                ]
            
            if component.external_references:
                cyclone_component["externalReferences"] = component.external_references
            
            cyclone_components.append(cyclone_component)
        
        # Create CycloneDX SBOM structure
        cyclone_dx_sbom = {
            "bomFormat": "CycloneDX",
            "specVersion": self.cyclone_dx_version,
            "serialNumber": f"urn:uuid:{str(uuid.uuid4())}",
            "version": 1,
            "metadata": {
                "timestamp": metadata.timestamp,
                "tools": [
                    {
                        "vendor": "JarViewer",
                        "name": "JarViewer Analysis Engine",
                        "version": "1.0.0"
                    }
                ],
                "authors": [
                    {"name": author} for author in metadata.authors
                ],
                "component": {
                    "type": "application",
                    "name": jar_name,
                    "version": metadata.component_version or "unknown"
                }
            },
            "components": cyclone_components
        }
        
        return cyclone_dx_sbom
    
    async def _generate_spdx(
        self,
        components: List[SBOMComponent],
        metadata: SBOMMetadata,
        jar_name: str
    ) -> Dict[str, Any]:
        """Generate SPDX format SBOM."""
        
        # Create SPDX packages
        spdx_packages = []
        
        # Add main package (the JAR itself)
        main_package = {
            "SPDXID": "SPDXRef-Package-Main",
            "name": jar_name,
            "downloadLocation": "NOASSERTION",
            "filesAnalyzed": True,
            "copyrightText": "NOASSERTION"
        }
        
        if metadata.component_version:
            main_package["versionInfo"] = metadata.component_version
        
        spdx_packages.append(main_package)
        
        # Add component packages
        for i, component in enumerate(components):
            package_id = f"SPDXRef-Package-{i+1}"
            spdx_package = {
                "SPDXID": package_id,
                "name": component.name,
                "downloadLocation": "NOASSERTION",
                "filesAnalyzed": False,
                "copyrightText": "NOASSERTION"
            }
            
            if component.version:
                spdx_package["versionInfo"] = component.version
            
            if component.supplier:
                spdx_package["supplier"] = f"Organization: {component.supplier}"
            
            if component.description:
                spdx_package["description"] = component.description
            
            if component.purl:
                spdx_package["externalRefs"] = [
                    {
                        "referenceCategory": "PACKAGE-MANAGER",
                        "referenceType": "purl",
                        "referenceLocator": component.purl
                    }
                ]
            
            spdx_packages.append(spdx_package)
        
        # Create SPDX relationships
        relationships = [
            {
                "spdxElementId": "SPDXRef-DOCUMENT",
                "relationshipType": "DESCRIBES",
                "relatedSpdxElement": "SPDXRef-Package-Main"
            }
        ]
        
        # Add dependency relationships
        for i in range(len(components)):
            relationships.append({
                "spdxElementId": "SPDXRef-Package-Main",
                "relationshipType": "DEPENDS_ON",
                "relatedSpdxElement": f"SPDXRef-Package-{i+1}"
            })
        
        # Create SPDX document
        spdx_document = {
            "spdxVersion": self.spdx_version,
            "dataLicense": "CC0-1.0",
            "SPDXID": "SPDXRef-DOCUMENT",
            "name": f"{jar_name}-SBOM",
            "documentNamespace": f"https://jarviewer.example.com/{jar_name}/{str(uuid.uuid4())}",
            "creationInfo": {
                "created": metadata.timestamp,
                "creators": [
                    "Tool: JarViewer-1.0.0"
                ] + [f"Person: {author}" for author in metadata.authors]
            },
            "packages": spdx_packages,
            "relationships": relationships
        }
        
        return spdx_document
    
    def _create_purl(
        self,
        name: str,
        version: Optional[str],
        artifact_id: Optional[str] = None
    ) -> str:
        """Create Package URL (PURL) for a component."""
        # Simplified PURL generation
        # Format: pkg:type/namespace/name@version
        
        # Determine package type and namespace
        if ':' in name:
            # Maven-style group:artifact
            parts = name.split(':')
            if len(parts) >= 2:
                namespace = parts[0]
                package_name = parts[1]
                package_type = "maven"
            else:
                namespace = ""
                package_name = name
                package_type = "generic"
        else:
            namespace = ""
            package_name = name
            package_type = "generic"
        
        # Build PURL
        purl = f"pkg:{package_type}/"
        if namespace:
            purl += f"{namespace}/"
        purl += package_name
        
        if version:
            purl += f"@{version}"
        
        return purl
    
    def _extract_main_version(self, extracted_versions: ExtractedVersions) -> Optional[str]:
        """Extract the main application version from extracted versions."""
        # Look for common main version indicators
        main_version_keys = [
            'Implementation-Version',
            'Specification-Version',
            'Bundle-Version',
            'Version'
        ]
        
        for version_info in extracted_versions.versions:
            if any(key in version_info.name for key in main_version_keys):
                return version_info.version
        
        # If no main version found, return the first version with highest confidence
        if extracted_versions.versions:
            sorted_versions = sorted(
                extracted_versions.versions,
                key=lambda v: v.confidence,
                reverse=True
            )
            return sorted_versions[0].version
        
        return None
    
    async def export_sbom(
        self,
        sbom: GeneratedSBOM,
        output_path: Path,
        format_type: str = "json"
    ) -> Path:
        """Export SBOM to file."""
        
        if format_type.lower() == "json":
            content = json.dumps(sbom.content, indent=2)
            file_extension = ".json"
        elif format_type.lower() == "xml":
            # For XML export, we'd need additional XML serialization
            # For now, we'll export as JSON
            content = json.dumps(sbom.content, indent=2)
            file_extension = ".json"
        else:
            raise ValueError(f"Unsupported export format: {format_type}")
        
        # Create filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"sbom_{sbom.format.value}_{timestamp}{file_extension}"
        export_path = output_path / filename
        
        # Write file
        with open(export_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        logger.info("SBOM exported", 
                   path=str(export_path),
                   format=sbom.format.value,
                   size=len(content))
        
        return export_path


# Global service instance
sbom_service = SBOMGenerationService()

"""
Advanced Version Extraction Service
Extracts version information from multiple sources within JAR files
"""

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple, Any
import structlog
from dataclasses import dataclass
import json
from packaging import version as pkg_version

logger = structlog.get_logger()


@dataclass
class VersionInfo:
    """Represents version information for a component."""
    name: str
    version: Optional[str]
    group_id: Optional[str] = None
    artifact_id: Optional[str] = None
    source: str = ""  # Where this version was found
    source_file: Optional[str] = None
    confidence: float = 1.0  # 0.0 to 1.0


@dataclass
class ExtractedVersions:
    """Complete version extraction result."""
    versions: List[VersionInfo]
    manifest_info: Dict[str, str]
    build_info: Dict[str, Any]
    framework_versions: Dict[str, str]


class VersionExtractionService:
    """Service for extracting comprehensive version information from JARs."""
    
    def __init__(self):
        self.version_patterns = self._load_version_patterns()
        self.framework_version_extractors = self._load_framework_extractors()
    
    async def extract_all_versions(self, jar_path: Path) -> ExtractedVersions:
        """Extract all version information from a JAR file."""
        logger.info("Starting comprehensive version extraction", jar_path=str(jar_path))
        
        versions = []
        manifest_info = {}
        build_info = {}
        framework_versions = {}
        
        # Extract from different sources
        manifest_versions = await self._extract_from_manifest(jar_path)
        versions.extend(manifest_versions.versions)
        manifest_info = manifest_versions.manifest_info
        
        maven_versions = await self._extract_from_maven_files(jar_path)
        versions.extend(maven_versions)
        
        gradle_versions = await self._extract_from_gradle_files(jar_path)
        versions.extend(gradle_versions)
        
        properties_versions = await self._extract_from_properties(jar_path)
        versions.extend(properties_versions)
        
        meta_inf_versions = await self._extract_from_meta_inf(jar_path)
        versions.extend(meta_inf_versions)
        
        framework_versions = await self._extract_framework_versions(jar_path)
        
        build_info = await self._extract_build_info(jar_path)
        
        # Deduplicate and sort by confidence
        unique_versions = self._deduplicate_versions(versions)
        
        logger.info("Version extraction completed", 
                   total_versions=len(unique_versions),
                   frameworks=len(framework_versions))
        
        return ExtractedVersions(
            versions=unique_versions,
            manifest_info=manifest_info,
            build_info=build_info,
            framework_versions=framework_versions
        )
    
    async def _extract_from_manifest(self, jar_path: Path) -> ExtractedVersions:
        """Extract version info from MANIFEST.MF files."""
        versions = []
        manifest_info = {}
        
        manifest_files = list(jar_path.rglob("MANIFEST.MF"))
        
        for manifest_file in manifest_files:
            try:
                with open(manifest_file, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                
                # Parse manifest entries
                for line in content.split('\n'):
                    line = line.strip()
                    if ':' in line:
                        key, value = line.split(':', 1)
                        key = key.strip()
                        value = value.strip()
                        manifest_info[key] = value
                        
                        # Extract version information
                        if self._is_version_key(key):
                            version_info = VersionInfo(
                                name=key,
                                version=value,
                                source="MANIFEST.MF",
                                source_file=str(manifest_file.relative_to(jar_path)),
                                confidence=0.9
                            )
                            versions.append(version_info)
                        
                        # Extract bundle information (OSGi)
                        if key == "Bundle-SymbolicName":
                            bundle_version = manifest_info.get("Bundle-Version")
                            if bundle_version:
                                version_info = VersionInfo(
                                    name=value.split(';')[0],  # Remove parameters
                                    version=bundle_version,
                                    source="OSGi Bundle",
                                    source_file=str(manifest_file.relative_to(jar_path)),
                                    confidence=0.95
                                )
                                versions.append(version_info)
                
            except Exception as e:
                logger.warning("Failed to parse manifest", 
                              manifest_file=str(manifest_file), error=str(e))
        
        return ExtractedVersions(
            versions=versions,
            manifest_info=manifest_info,
            build_info={},
            framework_versions={}
        )
    
    async def _extract_from_maven_files(self, jar_path: Path) -> List[VersionInfo]:
        """Extract versions from Maven POM files and metadata."""
        versions = []
        
        # Find POM files
        pom_files = list(jar_path.rglob("pom.xml"))
        pom_properties = list(jar_path.rglob("pom.properties"))
        
        # Process POM XML files
        for pom_file in pom_files:
            try:
                tree = ET.parse(pom_file)
                root = tree.getroot()
                
                # Handle namespace
                ns = self._get_xml_namespace(root)
                
                # Extract project info
                group_id = self._get_element_text(root.find('.//maven:groupId', ns))
                artifact_id = self._get_element_text(root.find('.//maven:artifactId', ns))
                version = self._get_element_text(root.find('.//maven:version', ns))
                
                if group_id and artifact_id:
                    version_info = VersionInfo(
                        name=f"{group_id}:{artifact_id}",
                        version=version,
                        group_id=group_id,
                        artifact_id=artifact_id,
                        source="Maven POM",
                        source_file=str(pom_file.relative_to(jar_path)),
                        confidence=0.95
                    )
                    versions.append(version_info)
                
                # Extract dependencies with versions
                deps = root.findall('.//maven:dependency', ns)
                for dep in deps:
                    dep_group = self._get_element_text(dep.find('maven:groupId', ns))
                    dep_artifact = self._get_element_text(dep.find('maven:artifactId', ns))
                    dep_version = self._get_element_text(dep.find('maven:version', ns))
                    
                    if dep_group and dep_artifact and dep_version:
                        version_info = VersionInfo(
                            name=f"{dep_group}:{dep_artifact}",
                            version=dep_version,
                            group_id=dep_group,
                            artifact_id=dep_artifact,
                            source="Maven Dependency",
                            source_file=str(pom_file.relative_to(jar_path)),
                            confidence=0.9
                        )
                        versions.append(version_info)
                
            except Exception as e:
                logger.warning("Failed to parse POM file", 
                              pom_file=str(pom_file), error=str(e))
        
        # Process POM properties files
        for props_file in pom_properties:
            try:
                with open(props_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                props = {}
                for line in content.split('\n'):
                    line = line.strip()
                    if '=' in line and not line.startswith('#'):
                        key, value = line.split('=', 1)
                        props[key.strip()] = value.strip()
                
                group_id = props.get('groupId')
                artifact_id = props.get('artifactId')
                version = props.get('version')
                
                if group_id and artifact_id and version:
                    version_info = VersionInfo(
                        name=f"{group_id}:{artifact_id}",
                        version=version,
                        group_id=group_id,
                        artifact_id=artifact_id,
                        source="Maven Properties",
                        source_file=str(props_file.relative_to(jar_path)),
                        confidence=0.95
                    )
                    versions.append(version_info)
                
            except Exception as e:
                logger.warning("Failed to parse POM properties", 
                              props_file=str(props_file), error=str(e))
        
        return versions
    
    async def _extract_from_gradle_files(self, jar_path: Path) -> List[VersionInfo]:
        """Extract versions from Gradle build files."""
        versions = []
        
        gradle_files = list(jar_path.rglob("build.gradle*"))
        gradle_files.extend(list(jar_path.rglob("gradle.properties")))
        
        for gradle_file in gradle_files:
            try:
                with open(gradle_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                if gradle_file.name == "gradle.properties":
                    # Parse properties file
                    for line in content.split('\n'):
                        line = line.strip()
                        if '=' in line and not line.startswith('#'):
                            key, value = line.split('=', 1)
                            key = key.strip()
                            value = value.strip()
                            
                            if 'version' in key.lower():
                                version_info = VersionInfo(
                                    name=key,
                                    version=value,
                                    source="Gradle Properties",
                                    source_file=str(gradle_file.relative_to(jar_path)),
                                    confidence=0.8
                                )
                                versions.append(version_info)
                else:
                    # Parse build.gradle
                    versions.extend(await self._parse_gradle_dependencies(
                        content, gradle_file, jar_path
                    ))
                
            except Exception as e:
                logger.warning("Failed to parse Gradle file", 
                              gradle_file=str(gradle_file), error=str(e))
        
        return versions
    
    async def _extract_from_properties(self, jar_path: Path) -> List[VersionInfo]:
        """Extract versions from various properties files."""
        versions = []
        
        # Find version-related properties files
        version_files = []
        version_files.extend(list(jar_path.rglob("version.properties")))
        version_files.extend(list(jar_path.rglob("*version*.properties")))
        version_files.extend(list(jar_path.rglob("application.properties")))
        
        for props_file in version_files:
            try:
                with open(props_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                for line in content.split('\n'):
                    line = line.strip()
                    if '=' in line and not line.startswith('#'):
                        key, value = line.split('=', 1)
                        key = key.strip()
                        value = value.strip()
                        
                        if self._is_version_property(key, value):
                            version_info = VersionInfo(
                                name=key,
                                version=value,
                                source="Properties File",
                                source_file=str(props_file.relative_to(jar_path)),
                                confidence=0.7
                            )
                            versions.append(version_info)
                
            except Exception as e:
                logger.warning("Failed to parse properties file", 
                              props_file=str(props_file), error=str(e))
        
        return versions
    
    async def _extract_from_meta_inf(self, jar_path: Path) -> List[VersionInfo]:
        """Extract versions from META-INF directory files."""
        versions = []
        
        meta_inf_path = jar_path / "META-INF"
        if not meta_inf_path.exists():
            return versions
        
        # Check for Spring Boot info
        spring_files = list(meta_inf_path.rglob("spring*"))
        for spring_file in spring_files:
            if spring_file.is_file():
                try:
                    with open(spring_file, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Extract Spring Boot version
                    version_match = re.search(r'Spring-Boot-Version:\s*([^\s]+)', content)
                    if version_match:
                        version_info = VersionInfo(
                            name="Spring Boot",
                            version=version_match.group(1),
                            source="Spring Boot META-INF",
                            source_file=str(spring_file.relative_to(jar_path)),
                            confidence=0.95
                        )
                        versions.append(version_info)
                
                except Exception:
                    continue
        
        # Check for other framework info files
        info_files = list(meta_inf_path.rglob("*.info"))
        info_files.extend(list(meta_inf_path.rglob("*.version")))
        
        for info_file in info_files:
            try:
                with open(info_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Try to extract version information
                version_patterns = [
                    r'version[:\s=]+([^\s\n]+)',
                    r'Version[:\s=]+([^\s\n]+)',
                    r'VERSION[:\s=]+([^\s\n]+)'
                ]
                
                for pattern in version_patterns:
                    match = re.search(pattern, content, re.IGNORECASE)
                    if match:
                        version_info = VersionInfo(
                            name=info_file.stem,
                            version=match.group(1),
                            source="META-INF Info",
                            source_file=str(info_file.relative_to(jar_path)),
                            confidence=0.8
                        )
                        versions.append(version_info)
                        break
                
            except Exception:
                continue
        
        return versions
    
    async def _extract_framework_versions(self, jar_path: Path) -> Dict[str, str]:
        """Extract specific framework versions using specialized extractors."""
        framework_versions = {}
        
        for framework, extractor in self.framework_version_extractors.items():
            try:
                version = await extractor(jar_path)
                if version:
                    framework_versions[framework] = version
            except Exception as e:
                logger.warning("Failed to extract framework version", 
                              framework=framework, error=str(e))
        
        return framework_versions
    
    async def _extract_build_info(self, jar_path: Path) -> Dict[str, Any]:
        """Extract comprehensive build information."""
        build_info = {}
        
        # Check for Maven build info
        maven_metadata = jar_path / "META-INF" / "maven"
        if maven_metadata.exists():
            build_info['build_system'] = 'Maven'
            # Extract Maven metadata
            for metadata_file in maven_metadata.rglob("*.xml"):
                try:
                    tree = ET.parse(metadata_file)
                    root = tree.getroot()
                    
                    # Extract build timestamp, etc.
                    for elem in root.iter():
                        if elem.tag in ['lastUpdated', 'timestamp', 'buildNumber']:
                            build_info[f'maven_{elem.tag}'] = elem.text
                
                except Exception:
                    continue
        
        # Check for Gradle build info
        if list(jar_path.rglob("build.gradle*")):
            build_info['build_system'] = 'Gradle'
        
        return build_info
    
    # Helper methods
    def _load_version_patterns(self) -> Dict[str, List[str]]:
        """Load patterns for version detection."""
        return {
            'version_keys': [
                'Implementation-Version', 'Specification-Version', 'Bundle-Version',
                'Version', 'Build-Version', 'Release-Version', 'Product-Version'
            ],
            'version_properties': [
                'version', 'app.version', 'project.version', 'build.version',
                'release.version', 'implementation.version'
            ]
        }
    
    def _load_framework_extractors(self) -> Dict[str, Any]:
        """Load framework-specific version extractors."""
        return {
            'Spring Framework': self._extract_spring_version,
            'Spring Boot': self._extract_spring_boot_version,
            'Hibernate': self._extract_hibernate_version,
            'Log4j': self._extract_log4j_version,
            'Jackson': self._extract_jackson_version,
            'Apache Commons': self._extract_commons_version
        }
    
    def _is_version_key(self, key: str) -> bool:
        """Check if a key represents version information."""
        version_indicators = ['version', 'Version', 'VERSION']
        return any(indicator in key for indicator in version_indicators)
    
    def _is_version_property(self, key: str, value: str) -> bool:
        """Check if a property represents version information."""
        if not value or len(value) > 50:  # Skip very long values
            return False
        
        # Check if key indicates version
        if 'version' in key.lower():
            return True
        
        # Check if value looks like a version
        version_pattern = r'^\d+(\.\d+)*([.-]\w+)*$'
        return bool(re.match(version_pattern, value))
    
    def _get_xml_namespace(self, root) -> Dict[str, str]:
        """Get XML namespace for Maven POM parsing."""
        ns = {'maven': 'http://maven.apache.org/POM/4.0.0'}
        if root.tag.startswith('{'):
            ns_uri = root.tag.split('}')[0][1:]
            ns = {'maven': ns_uri}
        return ns
    
    def _get_element_text(self, element) -> Optional[str]:
        """Safely get text from XML element."""
        return element.text.strip() if element is not None and element.text else None
    
    def _deduplicate_versions(self, versions: List[VersionInfo]) -> List[VersionInfo]:
        """Remove duplicate versions and sort by confidence."""
        seen = set()
        unique_versions = []
        
        # Sort by confidence (highest first)
        sorted_versions = sorted(versions, key=lambda v: v.confidence, reverse=True)
        
        for version in sorted_versions:
            key = (version.name, version.version)
            if key not in seen:
                seen.add(key)
                unique_versions.append(version)
        
        return unique_versions
    
    async def _parse_gradle_dependencies(
        self, content: str, gradle_file: Path, jar_path: Path
    ) -> List[VersionInfo]:
        """Parse Gradle dependencies from build file content."""
        versions = []
        
        # Gradle dependency patterns
        patterns = [
            r"implementation\s+['\"]([^'\"]+)['\"]",
            r"compile\s+['\"]([^'\"]+)['\"]",
            r"api\s+['\"]([^'\"]+)['\"]",
            r"testImplementation\s+['\"]([^'\"]+)['\"]",
            r"runtimeOnly\s+['\"]([^'\"]+)['\"]"
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, content)
            for match in matches:
                parts = match.split(':')
                if len(parts) >= 2:
                    group_id = parts[0]
                    artifact_id = parts[1]
                    version = parts[2] if len(parts) > 2 else None
                    
                    version_info = VersionInfo(
                        name=match,
                        version=version,
                        group_id=group_id,
                        artifact_id=artifact_id,
                        source="Gradle Dependency",
                        source_file=str(gradle_file.relative_to(jar_path)),
                        confidence=0.85
                    )
                    versions.append(version_info)
        
        return versions
    
    # Framework-specific version extractors
    async def _extract_spring_version(self, jar_path: Path) -> Optional[str]:
        """Extract Spring Framework version."""
        spring_files = list(jar_path.rglob("*spring-core*.jar"))
        if spring_files:
            # Extract from JAR filename
            for spring_file in spring_files:
                match = re.search(r'spring-core-([0-9.]+)', spring_file.name)
                if match:
                    return match.group(1)
        return None
    
    async def _extract_spring_boot_version(self, jar_path: Path) -> Optional[str]:
        """Extract Spring Boot version."""
        # Check MANIFEST.MF for Spring-Boot-Version
        manifest_files = list(jar_path.rglob("MANIFEST.MF"))
        for manifest_file in manifest_files:
            try:
                with open(manifest_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    match = re.search(r'Spring-Boot-Version:\s*([^\s]+)', content)
                    if match:
                        return match.group(1)
            except Exception:
                continue
        return None
    
    async def _extract_hibernate_version(self, jar_path: Path) -> Optional[str]:
        """Extract Hibernate version."""
        hibernate_files = list(jar_path.rglob("*hibernate*.jar"))
        for hibernate_file in hibernate_files:
            match = re.search(r'hibernate-core-([0-9.]+)', hibernate_file.name)
            if match:
                return match.group(1)
        return None
    
    async def _extract_log4j_version(self, jar_path: Path) -> Optional[str]:
        """Extract Log4j version."""
        log4j_files = list(jar_path.rglob("*log4j*.jar"))
        for log4j_file in log4j_files:
            match = re.search(r'log4j-core-([0-9.]+)', log4j_file.name)
            if match:
                return match.group(1)
        return None
    
    async def _extract_jackson_version(self, jar_path: Path) -> Optional[str]:
        """Extract Jackson version."""
        jackson_files = list(jar_path.rglob("*jackson*.jar"))
        for jackson_file in jackson_files:
            match = re.search(r'jackson-core-([0-9.]+)', jackson_file.name)
            if match:
                return match.group(1)
        return None
    
    async def _extract_commons_version(self, jar_path: Path) -> Optional[str]:
        """Extract Apache Commons version."""
        commons_files = list(jar_path.rglob("*commons*.jar"))
        for commons_file in commons_files:
            match = re.search(r'commons-[a-z]+-([0-9.]+)', commons_file.name)
            if match:
                return match.group(1)
        return None


# Global service instance
version_extraction_service = VersionExtractionService()

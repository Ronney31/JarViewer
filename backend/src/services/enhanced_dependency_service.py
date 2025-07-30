"""
Enhanced Dependency Extraction Service
Professional-grade dependency analysis like Eclipse, IntelliJ, or VSCode
"""

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Set, Optional, Any, Tuple
import structlog
from dataclasses import dataclass, field
from collections import defaultdict
import zipfile
import json
from packaging import version as pkg_version

logger = structlog.get_logger()


@dataclass
class DependencyInfo:
    """Comprehensive dependency information."""
    name: str
    version: Optional[str] = None
    group_id: Optional[str] = None
    artifact_id: Optional[str] = None
    scope: str = "compile"  # compile, runtime, test, provided, system
    source: str = "detected"  # manifest, maven, gradle, osgi, imports, etc.
    source_file: Optional[str] = None
    optional: bool = False
    description: Optional[str] = None
    license: Optional[str] = None
    
    # OSGi specific
    bundle_symbolic_name: Optional[str] = None
    bundle_version: Optional[str] = None
    resolution: str = "mandatory"  # mandatory, optional
    
    # Additional metadata
    package_imports: List[str] = field(default_factory=list)
    package_exports: List[str] = field(default_factory=list)
    confidence: float = 1.0


@dataclass
class JarVersionInfo:
    """Complete version information for the JAR itself."""
    name: Optional[str] = None
    version: Optional[str] = None
    group_id: Optional[str] = None
    artifact_id: Optional[str] = None
    
    # OSGi Bundle info
    bundle_name: Optional[str] = None
    bundle_symbolic_name: Optional[str] = None
    bundle_version: Optional[str] = None
    bundle_vendor: Optional[str] = None
    bundle_description: Optional[str] = None
    
    # Build info
    built_by: Optional[str] = None
    build_jdk: Optional[str] = None
    build_time: Optional[str] = None
    created_by: Optional[str] = None
    
    # Specification info
    specification_title: Optional[str] = None
    specification_version: Optional[str] = None
    specification_vendor: Optional[str] = None
    
    # Implementation info
    implementation_title: Optional[str] = None
    implementation_version: Optional[str] = None
    implementation_vendor: Optional[str] = None
    
    main_class: Optional[str] = None
    class_path: List[str] = field(default_factory=list)


@dataclass
class EnhancedDependencyReport:
    """Professional-grade dependency analysis report."""
    jar_info: JarVersionInfo
    dependencies: List[DependencyInfo]
    
    # Categorized dependencies
    direct_dependencies: List[DependencyInfo] = field(default_factory=list)
    transitive_dependencies: List[DependencyInfo] = field(default_factory=list)
    optional_dependencies: List[DependencyInfo] = field(default_factory=list)
    
    # Package analysis
    imported_packages: Dict[str, List[str]] = field(default_factory=dict)  # package -> sources
    exported_packages: Dict[str, str] = field(default_factory=dict)  # package -> version
    
    # Framework detection
    detected_frameworks: Dict[str, str] = field(default_factory=dict)  # name -> version
    
    # Statistics
    total_dependencies: int = 0
    maven_dependencies: int = 0
    osgi_dependencies: int = 0
    gradle_dependencies: int = 0
    
    # Risk assessment
    security_risks: List[str] = field(default_factory=list)
    license_conflicts: List[str] = field(default_factory=list)
    version_conflicts: List[str] = field(default_factory=list)


class EnhancedDependencyService:
    """Professional-grade dependency extraction service."""
    
    def __init__(self):
        self.known_packages = self._load_known_packages()
        self.framework_patterns = self._load_framework_patterns()
        self.security_patterns = self._load_security_patterns()
        self.license_patterns = self._load_license_patterns()
        self.file_discovery_patterns = self._load_file_discovery_patterns()
    
    async def analyze_jar_dependencies(self, jar_path: Path) -> EnhancedDependencyReport:
        """
        Perform comprehensive dependency analysis like professional IDEs.
        
        This method extracts dependencies from:
        1. MANIFEST.MF (OSGi Import-Package, Export-Package)
        2. Maven POM files and metadata
        3. Gradle build files
        4. Package imports from Java source/class files
        5. Framework-specific configuration files
        """
        logger.info("Starting enhanced dependency analysis", jar_path=str(jar_path))
        
        # Extract JAR version information
        jar_info = await self._extract_jar_version_info(jar_path)
        
        # Extract dependencies from all sources
        dependencies = []
        
        # 1. OSGi MANIFEST.MF analysis (most comprehensive for many JARs)
        osgi_deps = await self._extract_osgi_dependencies(jar_path)
        dependencies.extend(osgi_deps)
        
        # 2. Maven metadata analysis
        maven_deps = await self._extract_maven_dependencies(jar_path)
        dependencies.extend(maven_deps)
        
        # 3. Gradle build files analysis
        gradle_deps = await self._extract_gradle_dependencies(jar_path)
        dependencies.extend(gradle_deps)
        
        # 3.5. SBT build files analysis
        sbt_deps = await self._extract_sbt_dependencies(jar_path)
        dependencies.extend(sbt_deps)
        
        # 4. Package import analysis from code
        import_deps = await self._extract_import_dependencies(jar_path)
        dependencies.extend(import_deps)
        
        # 5. Framework-specific dependency extraction
        framework_deps = await self._extract_framework_dependencies(jar_path)
        dependencies.extend(framework_deps)
        
        # Deduplicate and enhance dependencies
        unique_dependencies = self._deduplicate_and_enhance_dependencies(dependencies)
        
        # Categorize dependencies
        direct_deps, transitive_deps, optional_deps = self._categorize_dependencies(unique_dependencies)
        
        # Extract package information
        imported_packages, exported_packages = await self._extract_package_info(jar_path)
        
        # Detect frameworks
        frameworks = await self._detect_frameworks(jar_path, unique_dependencies)
        
        # Perform risk assessment
        security_risks = await self._assess_security_risks(unique_dependencies)
        license_conflicts = await self._assess_license_conflicts(unique_dependencies)
        version_conflicts = self._detect_version_conflicts(unique_dependencies)
        
        # Create comprehensive report
        report = EnhancedDependencyReport(
            jar_info=jar_info,
            dependencies=unique_dependencies,
            direct_dependencies=direct_deps,
            transitive_dependencies=transitive_deps,
            optional_dependencies=optional_deps,
            imported_packages=imported_packages,
            exported_packages=exported_packages,
            detected_frameworks=frameworks,
            total_dependencies=len(unique_dependencies),
            maven_dependencies=len([d for d in unique_dependencies if d.source == "maven"]),
            osgi_dependencies=len([d for d in unique_dependencies if d.source == "osgi"]),
            gradle_dependencies=len([d for d in unique_dependencies if d.source == "gradle"]),
            security_risks=security_risks,
            license_conflicts=license_conflicts,
            version_conflicts=version_conflicts
        )
        
        logger.info("Enhanced dependency analysis completed",
                   total_dependencies=len(unique_dependencies),
                   direct=len(direct_deps),
                   transitive=len(transitive_deps),
                   frameworks=len(frameworks))
        
        return report
    
    async def _extract_jar_version_info(self, jar_path: Path) -> JarVersionInfo:
        """Extract comprehensive version information about the JAR itself."""
        jar_info = JarVersionInfo()
        
        # Parse MANIFEST.MF using generic file discovery
        manifest_files = await self._discover_files(jar_path, 'manifest')
        for manifest_path in manifest_files:
            try:
                content = await self._safe_read_file(manifest_path)
                if not content:
                    continue
                
                # Parse manifest attributes
                attributes = self._parse_manifest_attributes(content)
                
                # Map standard attributes
                jar_info.name = attributes.get('Implementation-Title') or attributes.get('Bundle-Name')
                jar_info.version = (attributes.get('Implementation-Version') or 
                                  attributes.get('Bundle-Version') or 
                                  attributes.get('Specification-Version'))
                
                # OSGi Bundle information
                jar_info.bundle_name = attributes.get('Bundle-Name')
                jar_info.bundle_symbolic_name = attributes.get('Bundle-SymbolicName', '').split(';')[0]
                jar_info.bundle_version = attributes.get('Bundle-Version')
                jar_info.bundle_vendor = attributes.get('Bundle-Vendor')
                jar_info.bundle_description = attributes.get('Bundle-Description')
                
                # Build information
                jar_info.built_by = attributes.get('Built-By')
                jar_info.build_jdk = attributes.get('Build-Jdk')
                jar_info.build_time = attributes.get('Build-Time')
                jar_info.created_by = attributes.get('Created-By')
                
                # Specification information
                jar_info.specification_title = attributes.get('Specification-Title')
                jar_info.specification_version = attributes.get('Specification-Version')
                jar_info.specification_vendor = attributes.get('Specification-Vendor')
                
                # Implementation information
                jar_info.implementation_title = attributes.get('Implementation-Title')
                jar_info.implementation_version = attributes.get('Implementation-Version')
                jar_info.implementation_vendor = attributes.get('Implementation-Vendor')
                
                # Main class and classpath
                jar_info.main_class = attributes.get('Main-Class')
                if 'Class-Path' in attributes:
                    jar_info.class_path = attributes['Class-Path'].split()
                
                break  # Use first valid manifest found
                
            except Exception as e:
                logger.warning("Failed to parse JAR manifest", manifest_file=str(manifest_path), error=str(e))
        
        # Try to extract from Maven metadata if not found in manifest
        if not jar_info.group_id or not jar_info.artifact_id:
            maven_info = await self._extract_maven_jar_info(jar_path)
            if maven_info:
                jar_info.group_id = maven_info.get('groupId')
                jar_info.artifact_id = maven_info.get('artifactId')
                if not jar_info.version:
                    jar_info.version = maven_info.get('version')
        
        return jar_info
    
    async def _extract_osgi_dependencies(self, jar_path: Path) -> List[DependencyInfo]:
        """Extract dependencies from OSGi MANIFEST.MF Import-Package header."""
        dependencies = []
        
        # Use generic file discovery for manifest files
        manifest_files = await self._discover_files(jar_path, 'manifest')
        if not manifest_files:
            return dependencies
        
        # Process all found manifest files (usually just one)
        for manifest_path in manifest_files:
        
            try:
                content = await self._safe_read_file(manifest_path)
                if not content:
                    continue
                
                attributes = self._parse_manifest_attributes(content)
                
                # Parse Import-Package header
                import_package = attributes.get('Import-Package', '')
                if import_package:
                    imported_packages = self._parse_osgi_package_header(import_package)
                    
                    # Group packages by library
                    library_packages = defaultdict(list)
                    
                    for package_info in imported_packages:
                        package_name = package_info['package']
                        version = package_info.get('version')
                        resolution = package_info.get('resolution', 'mandatory')
                        
                        # Skip standard Java packages
                        if package_name.startswith(('java.', 'javax.', 'sun.', 'com.sun.')):
                            continue
                        
                        # Map package to known library
                        library_info = self._map_package_to_library(package_name)
                        
                        if library_info:
                            library_key = library_info['name']
                            library_packages[library_key].append({
                                'package': package_name,
                                'version': version,
                                'resolution': resolution,
                                'library_info': library_info
                            })
                        else:
                            # Create a generic dependency for unmapped packages
                            root_package = self._get_root_package(package_name)
                            if root_package:
                                library_key = f"Unknown Library ({root_package})"
                                library_packages[library_key].append({
                                    'package': package_name,
                                    'version': version,
                                    'resolution': resolution,
                                    'library_info': {
                                        'name': library_key,
                                        'description': f'Library containing package {root_package}',
                                        'group_id': root_package
                                    }
                                })
                    
                    # Create dependencies from grouped packages
                    for library_name, packages in library_packages.items():
                        first_package = packages[0]
                        library_info = first_package['library_info']
                        
                        # Determine if any package is optional
                        is_optional = any(pkg['resolution'] == 'optional' for pkg in packages)
                        
                        # Get version (prefer non-None versions)
                        version = None
                        for pkg in packages:
                            if pkg['version']:
                                version = pkg['version']
                                break
                        
                        dependency = DependencyInfo(
                            name=library_info['name'],
                            version=version or library_info.get('version'),
                            group_id=library_info.get('group_id'),
                            artifact_id=library_info.get('artifact_id'),
                            source="osgi",
                            source_file="META-INF/MANIFEST.MF",
                            optional=is_optional,
                            resolution='optional' if is_optional else 'mandatory',
                            package_imports=[pkg['package'] for pkg in packages],
                            description=library_info.get('description'),
                            confidence=0.9 if library_info.get('group_id') else 0.6
                        )
                        dependencies.append(dependency)
                
                # Parse Require-Bundle header (OSGi bundle dependencies)
                require_bundle = attributes.get('Require-Bundle', '')
                if require_bundle:
                    required_bundles = self._parse_osgi_bundle_header(require_bundle)
                    
                    for bundle_info in required_bundles:
                        bundle_name = bundle_info['bundle']
                        version = bundle_info.get('bundle-version')
                        resolution = bundle_info.get('resolution', 'mandatory')
                        
                        dependency = DependencyInfo(
                            name=bundle_name,
                            version=version,
                            bundle_symbolic_name=bundle_name,
                            bundle_version=version,
                            source="osgi",
                            source_file="META-INF/MANIFEST.MF",
                            optional=(resolution == 'optional'),
                            resolution=resolution,
                            confidence=0.95
                        )
                        dependencies.append(dependency) 
            
            except Exception as e:
                logger.warning("Failed to parse OSGi dependencies", manifest_file=str(manifest_path), error=str(e))
        
        return dependencies
    
    async def _extract_maven_dependencies(self, jar_path: Path) -> List[DependencyInfo]:
        """Extract dependencies from Maven POM files and metadata."""
        dependencies = []
        
        # Use generic file discovery for Maven files
        pom_files = await self._discover_files(jar_path, 'maven_pom')
        pom_properties = await self._discover_files(jar_path, 'maven_properties')
        
        # Process POM XML files
        for pom_file in pom_files:
            try:
                # Use safe file reading
                content = await self._safe_read_file(pom_file)
                if not content:
                    continue
                
                tree = ET.fromstring(content)
                root = tree
                
                # Handle namespace
                ns = self._get_xml_namespace(root)
                
                # Extract dependencies
                deps_element = root.find('.//maven:dependencies', ns)
                if deps_element is not None:
                    for dep in deps_element.findall('.//maven:dependency', ns):
                        group_id = self._get_element_text(dep.find('maven:groupId', ns))
                        artifact_id = self._get_element_text(dep.find('maven:artifactId', ns))
                        version = self._get_element_text(dep.find('maven:version', ns))
                        scope = self._get_element_text(dep.find('maven:scope', ns)) or "compile"
                        optional = self._get_element_text(dep.find('maven:optional', ns)) == "true"
                        
                        if group_id and artifact_id:
                            # Get additional library information
                            lib_info = self._get_library_metadata(group_id, artifact_id)
                            
                            dependency = DependencyInfo(
                                name=f"{group_id}:{artifact_id}",
                                version=version,
                                group_id=group_id,
                                artifact_id=artifact_id,
                                scope=scope,
                                source="maven",
                                source_file=str(pom_file.relative_to(jar_path)),
                                optional=optional,
                                description=lib_info.get('description'),
                                license=lib_info.get('license'),
                                confidence=0.95
                            )
                            dependencies.append(dependency)
                
            except Exception as e:
                logger.warning("Failed to parse POM file", pom_file=str(pom_file), error=str(e))
        
        return dependencies
    
    async def _extract_gradle_dependencies(self, jar_path: Path) -> List[DependencyInfo]:
        """Extract dependencies from Gradle build files."""
        dependencies = []
        
        # Use generic file discovery for Gradle files
        gradle_files = await self._discover_files(jar_path, 'gradle_build')
        gradle_properties = await self._discover_files(jar_path, 'gradle_properties')
        
        # Process Gradle build files
        for gradle_file in gradle_files:
            try:
                content = await self._safe_read_file(gradle_file)
                if not content:
                    continue
                
                # Parse Gradle dependencies using regex patterns
                patterns = [
                    (r"implementation\s+['\"]([^'\"]+)['\"]", "compile"),
                    (r"compile\s+['\"]([^'\"]+)['\"]", "compile"),
                    (r"api\s+['\"]([^'\"]+)['\"]", "compile"),
                    (r"runtimeOnly\s+['\"]([^'\"]+)['\"]", "runtime"),
                    (r"testImplementation\s+['\"]([^'\"]+)['\"]", "test"),
                    (r"testCompile\s+['\"]([^'\"]+)['\"]", "test"),
                    (r"compileOnly\s+['\"]([^'\"]+)['\"]", "provided")
                ]
                
                for pattern, scope in patterns:
                    matches = re.findall(pattern, content)
                    for match in matches:
                        parts = match.split(':')
                        if len(parts) >= 2:
                            group_id = parts[0]
                            artifact_id = parts[1]
                            version = parts[2] if len(parts) > 2 else None
                            
                            lib_info = self._get_library_metadata(group_id, artifact_id)
                            
                            dependency = DependencyInfo(
                                name=match,
                                version=version,
                                group_id=group_id,
                                artifact_id=artifact_id,
                                scope=scope,
                                source="gradle",
                                source_file=str(gradle_file.relative_to(jar_path)),
                                description=lib_info.get('description'),
                                license=lib_info.get('license'),
                                confidence=0.9
                            )
                            dependencies.append(dependency)
                
            except Exception as e:
                logger.warning("Failed to parse Gradle file", gradle_file=str(gradle_file), error=str(e))
        
        # Process Gradle properties files
        for props_file in gradle_properties:
            try:
                content = await self._safe_read_file(props_file)
                if not content:
                    continue
                
                for line in content.split('\n'):
                    line = line.strip()
                    if '=' in line and not line.startswith('#'):
                        key, value = line.split('=', 1)
                        key = key.strip()
                        value = value.strip()
                        
                        if 'version' in key.lower() and value:
                            dependency = DependencyInfo(
                                name=key,
                                version=value,
                                source="gradle_properties",
                                source_file=str(props_file.relative_to(jar_path)),
                                description=f"Gradle property: {key}",
                                confidence=0.8
                            )
                            dependencies.append(dependency)
                            
            except Exception as e:
                logger.warning("Failed to parse Gradle properties file", props_file=str(props_file), error=str(e))
        
        return dependencies
    
    async def _extract_sbt_dependencies(self, jar_path: Path) -> List[DependencyInfo]:
        """Extract dependencies from SBT build files."""
        dependencies = []
        
        # Use generic file discovery for SBT files
        sbt_files = await self._discover_files(jar_path, 'sbt_build')
        
        for sbt_file in sbt_files:
            try:
                content = await self._safe_read_file(sbt_file)
                if not content:
                    continue
                
                # Parse SBT dependencies using regex patterns
                # SBT uses format: "group" % "artifact" % "version"
                patterns = [
                    r'"([^"]+)"\s*%\s*"([^"]+)"\s*%\s*"([^"]+)"',  # Standard format
                    r"'([^']+)'\s*%\s*'([^']+)'\s*%\s*'([^']+)'",  # Single quotes
                ]
                
                for pattern in patterns:
                    matches = re.findall(pattern, content)
                    for match in matches:
                        if len(match) == 3:
                            group_id, artifact_id, version = match
                            
                            lib_info = self._get_library_metadata(group_id, artifact_id)
                            
                            dependency = DependencyInfo(
                                name=f"{group_id}:{artifact_id}",
                                version=version,
                                group_id=group_id,
                                artifact_id=artifact_id,
                                scope="compile",  # SBT default
                                source="sbt",
                                source_file=str(sbt_file.relative_to(jar_path)),
                                description=lib_info.get('description', f"SBT dependency: {artifact_id}"),
                                license=lib_info.get('license'),
                                confidence=0.9
                            )
                            dependencies.append(dependency)
                
            except Exception as e:
                logger.warning("Failed to parse SBT file", sbt_file=str(sbt_file), error=str(e))
        
        return dependencies
    
    async def _extract_import_dependencies(self, jar_path: Path) -> List[DependencyInfo]:
        """Extract dependencies by analyzing Java imports and package usage."""
        dependencies = []
        package_usage = defaultdict(int)
        
        # Analyze Java source files
        java_files = list(jar_path.rglob("*.java"))
        for java_file in java_files[:100]:  # Limit for performance
            try:
                with open(java_file, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                
                # Find import statements
                import_pattern = r'import\s+([a-zA-Z][a-zA-Z0-9_.]*);'
                imports = re.findall(import_pattern, content)
                
                for imp in imports:
                    # Extract root package
                    parts = imp.split('.')
                    if len(parts) >= 2:
                        root_package = '.'.join(parts[:3]) if len(parts) >= 3 and parts[0] in ['org', 'com', 'net'] else '.'.join(parts[:2])
                        if not root_package.startswith(('java.', 'javax.', 'sun.', 'com.sun.')):
                            package_usage[root_package] += 1
                
            except Exception:
                continue
        
        # Analyze class files for package structure and bytecode imports
        class_files = list(jar_path.rglob("*.class"))
        for class_file in class_files[:200]:  # Limit for performance
            try:
                relative_path = class_file.relative_to(jar_path)
                package_path = str(relative_path.parent).replace('/', '.')
                
                # Extract package from class file path
                if package_path and package_path != '.':
                    parts = package_path.split('.')
                    if len(parts) >= 2:
                        root_package = '.'.join(parts[:3]) if len(parts) >= 3 and parts[0] in ['org', 'com', 'net'] else '.'.join(parts[:2])
                        if not root_package.startswith(('java.', 'javax.', 'sun.', 'com.sun.')):
                            package_usage[root_package] += 1
                
                # Basic bytecode analysis for imports
                try:
                    with open(class_file, 'rb') as f:
                        bytecode = f.read()
                        # Look for class references in constant pool (simplified approach)
                        bytecode_str = bytecode.decode('latin-1', errors='ignore')
                        
                        # Find class references (simplified pattern matching)
                        class_refs = re.findall(r'([a-z]+(?:\.[a-z][a-zA-Z0-9_]*){2,})', bytecode_str)
                        
                        for ref in class_refs:
                            if '.' in ref and len(ref.split('.')) >= 2:
                                parts = ref.split('.')
                                if len(parts) >= 2 and not ref.startswith(('java.', 'javax.', 'sun.', 'com.sun.')):
                                    root_package = '.'.join(parts[:3]) if len(parts) >= 3 and parts[0] in ['org', 'com', 'net'] else '.'.join(parts[:2])
                                    package_usage[root_package] += 1
                
                except Exception:
                    pass  # Skip bytecode analysis if it fails
                
            except Exception:
                continue
        
        # Convert top packages to dependencies
        sorted_packages = sorted(package_usage.items(), key=lambda x: x[1], reverse=True)
        
        for package, usage_count in sorted_packages[:30]:  # Top 30 most used packages
            library_info = self._map_package_to_library(package)
            
            if library_info:
                dependency = DependencyInfo(
                    name=library_info['name'],
                    version=library_info.get('version'),
                    group_id=library_info.get('group_id'),
                    artifact_id=library_info.get('artifact_id'),
                    source="imports",
                    description=library_info.get('description', f"Detected from package usage: {package}"),
                    license=library_info.get('license'),
                    package_imports=[package],
                    confidence=0.7
                )
                dependencies.append(dependency)
        
        return dependencies
    
    async def _extract_framework_dependencies(self, jar_path: Path) -> List[DependencyInfo]:
        """Extract framework-specific dependencies."""
        dependencies = []
        
        # Spring Framework detection
        spring_deps = await self._detect_spring_dependencies(jar_path)
        dependencies.extend(spring_deps)
        
        # Hibernate detection
        hibernate_deps = await self._detect_hibernate_dependencies(jar_path)
        dependencies.extend(hibernate_deps)
        
        # Other framework detections can be added here
        
        return dependencies
    
    # Helper methods for parsing
    def _parse_manifest_attributes(self, content: str) -> Dict[str, str]:
        """Parse MANIFEST.MF attributes, handling line continuations."""
        attributes = {}
        lines = content.split('\n')
        current_key = None
        current_value = ""
        
        for line in lines:
            if line.startswith(' ') and current_key:
                # Continuation line
                current_value += line[1:]
            else:
                # Save previous attribute
                if current_key:
                    attributes[current_key] = current_value.strip()
                
                # Start new attribute
                if ':' in line:
                    key, value = line.split(':', 1)
                    current_key = key.strip()
                    current_value = value.strip()
                else:
                    current_key = None
                    current_value = ""
        
        # Save last attribute
        if current_key:
            attributes[current_key] = current_value.strip()
        
        return attributes
    
    def _parse_osgi_package_header(self, header_value: str) -> List[Dict[str, str]]:
        """Parse OSGi Import-Package or Export-Package header."""
        packages = []
        
        # Split by comma, but handle quoted strings and nested parentheses
        parts = self._split_osgi_header(header_value)
        
        for part in parts:
            part = part.strip()
            if not part:
                continue
            
            package_info = {}
            
            # Extract package name (first part before semicolon)
            if ';' in part:
                package_name, attributes = part.split(';', 1)
                package_info['package'] = package_name.strip()
                
                # Parse attributes
                attr_parts = self._split_osgi_attributes(attributes)
                for attr in attr_parts:
                    if '=' in attr:
                        key, value = attr.split('=', 1)
                        key = key.strip()
                        value = value.strip().strip('"')
                        package_info[key] = value
            else:
                package_info['package'] = part.strip()
            
            packages.append(package_info)
        
        return packages
    
    def _parse_osgi_bundle_header(self, header_value: str) -> List[Dict[str, str]]:
        """Parse OSGi Require-Bundle header."""
        bundles = []
        
        parts = self._split_osgi_header(header_value)
        
        for part in parts:
            part = part.strip()
            if not part:
                continue
            
            bundle_info = {}
            
            if ';' in part:
                bundle_name, attributes = part.split(';', 1)
                bundle_info['bundle'] = bundle_name.strip()
                
                # Parse attributes
                attr_parts = self._split_osgi_attributes(attributes)
                for attr in attr_parts:
                    if '=' in attr:
                        key, value = attr.split('=', 1)
                        key = key.strip()
                        value = value.strip().strip('"')
                        bundle_info[key] = value
            else:
                bundle_info['bundle'] = part.strip()
            
            bundles.append(bundle_info)
        
        return bundles
    
    def _split_osgi_header(self, header_value: str) -> List[str]:
        """Split OSGi header value by commas, respecting quotes and parentheses."""
        parts = []
        current_part = ""
        in_quotes = False
        paren_depth = 0
        
        for char in header_value:
            if char == '"' and not in_quotes:
                in_quotes = True
            elif char == '"' and in_quotes:
                in_quotes = False
            elif char == '(' and not in_quotes:
                paren_depth += 1
            elif char == ')' and not in_quotes:
                paren_depth -= 1
            elif char == ',' and not in_quotes and paren_depth == 0:
                parts.append(current_part.strip())
                current_part = ""
                continue
            
            current_part += char
        
        if current_part.strip():
            parts.append(current_part.strip())
        
        return parts
    
    def _split_osgi_attributes(self, attributes: str) -> List[str]:
        """Split OSGi attributes by semicolons."""
        parts = []
        current_part = ""
        in_quotes = False
        
        for char in attributes:
            if char == '"' and not in_quotes:
                in_quotes = True
            elif char == '"' and in_quotes:
                in_quotes = False
            elif char == ';' and not in_quotes:
                parts.append(current_part.strip())
                current_part = ""
                continue
            
            current_part += char
        
        if current_part.strip():
            parts.append(current_part.strip())
        
        return parts
    
    def _map_package_to_library(self, package_name: str) -> Optional[Dict[str, Any]]:
        """Map a package name to known library information."""
        # Try exact match first
        if package_name in self.known_packages:
            return self.known_packages[package_name]
        
        # Try root package matches
        parts = package_name.split('.')
        for i in range(len(parts), 0, -1):
            root_package = '.'.join(parts[:i])
            if root_package in self.known_packages:
                return self.known_packages[root_package]
        
        return None
    
    def _get_root_package(self, package_name: str) -> Optional[str]:
        """Get the root package name for grouping."""
        parts = package_name.split('.')
        if len(parts) >= 2:
            if parts[0] in ['org', 'com', 'net', 'io'] and len(parts) >= 3:
                return '.'.join(parts[:3])
            else:
                return '.'.join(parts[:2])
        return None
    
    def _get_library_metadata(self, group_id: str, artifact_id: str) -> Dict[str, Any]:
        """Get metadata for a library by group_id:artifact_id."""
        key = f"{group_id}:{artifact_id}"
        return self.known_packages.get(key, {})
    
    def _deduplicate_and_enhance_dependencies(self, dependencies: List[DependencyInfo]) -> List[DependencyInfo]:
        """Remove duplicates and enhance dependency information."""
        seen = {}
        enhanced_deps = []
        
        # Sort by confidence (highest first) to prefer better sources
        sorted_deps = sorted(dependencies, key=lambda d: d.confidence, reverse=True)
        
        for dep in sorted_deps:
            # Create key for deduplication
            key = (dep.group_id or dep.name, dep.artifact_id or dep.name)
            
            if key not in seen:
                seen[key] = dep
                enhanced_deps.append(dep)
            else:
                # Merge information from multiple sources
                existing = seen[key]
                if not existing.version and dep.version:
                    existing.version = dep.version
                if not existing.description and dep.description:
                    existing.description = dep.description
                if not existing.license and dep.license:
                    existing.license = dep.license
                
                # Merge package imports/exports
                existing.package_imports.extend(dep.package_imports)
                existing.package_exports.extend(dep.package_exports)
                
                # Update confidence if this source is better
                if dep.confidence > existing.confidence:
                    existing.confidence = dep.confidence
                    existing.source = dep.source
        
        return enhanced_deps
    
    def _categorize_dependencies(self, dependencies: List[DependencyInfo]) -> Tuple[List[DependencyInfo], List[DependencyInfo], List[DependencyInfo]]:
        """Categorize dependencies into direct, transitive, and optional."""
        direct = []
        transitive = []
        optional = []
        
        for dep in dependencies:
            if dep.optional:
                optional.append(dep)
            elif dep.source in ["maven", "gradle", "osgi"]:
                direct.append(dep)
            else:
                transitive.append(dep)
        
        return direct, transitive, optional
    
    async def _extract_package_info(self, jar_path: Path) -> Tuple[Dict[str, List[str]], Dict[str, str]]:
        """Extract imported and exported package information."""
        imported_packages = defaultdict(list)
        exported_packages = {}
        
        # Parse MANIFEST.MF for OSGi package info
        manifest_path = jar_path / "META-INF" / "MANIFEST.MF"
        if manifest_path.exists():
            try:
                with open(manifest_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                
                attributes = self._parse_manifest_attributes(content)
                
                # Parse Import-Package
                import_package = attributes.get('Import-Package', '')
                if import_package:
                    packages = self._parse_osgi_package_header(import_package)
                    for pkg_info in packages:
                        package_name = pkg_info['package']
                        imported_packages[package_name].append('OSGi Import-Package')
                
                # Parse Export-Package
                export_package = attributes.get('Export-Package', '')
                if export_package:
                    packages = self._parse_osgi_package_header(export_package)
                    for pkg_info in packages:
                        package_name = pkg_info['package']
                        version = pkg_info.get('version', '')
                        exported_packages[package_name] = version
                
            except Exception as e:
                logger.warning("Failed to parse package info", error=str(e))
        
        return dict(imported_packages), exported_packages
    
    async def _detect_frameworks(self, jar_path: Path, dependencies: List[DependencyInfo]) -> Dict[str, str]:
        """Detect frameworks and their versions."""
        frameworks = {}
        
        # Detect from dependencies
        for dep in dependencies:
            if dep.group_id:
                if 'springframework' in dep.group_id:
                    frameworks['Spring Framework'] = dep.version or 'Unknown'
                elif 'hibernate' in dep.group_id:
                    frameworks['Hibernate'] = dep.version or 'Unknown'
                elif 'jackson' in dep.group_id:
                    frameworks['Jackson'] = dep.version or 'Unknown'
                elif 'log4j' in dep.group_id:
                    frameworks['Log4j'] = dep.version or 'Unknown'
        
        # Detect from file patterns
        for framework, patterns in self.framework_patterns.items():
            for pattern in patterns.get('files', []):
                if list(jar_path.rglob(pattern)):
                    if framework not in frameworks:
                        frameworks[framework] = 'Detected'
        
        return frameworks
    
    async def _assess_security_risks(self, dependencies: List[DependencyInfo]) -> List[str]:
        """Assess security risks in dependencies."""
        risks = []
        
        for dep in dependencies:
            if dep.name and dep.version:
                # Check against known vulnerabilities
                for pattern, risk_info in self.security_patterns.items():
                    if pattern in dep.name.lower():
                        for vuln_version in risk_info.get('vulnerable_versions', []):
                            if dep.version and dep.version.startswith(vuln_version):
                                risks.append(f"Security risk: {dep.name} v{dep.version} - {risk_info['description']}")
                                break
        
        return risks
    
    async def _assess_license_conflicts(self, dependencies: List[DependencyInfo]) -> List[str]:
        """Assess potential license conflicts."""
        conflicts = []
        licenses = defaultdict(list)
        
        for dep in dependencies:
            if dep.license:
                licenses[dep.license].append(dep.name)
        
        # Check for conflicting licenses
        if 'GPL' in licenses and 'Apache' in licenses:
            conflicts.append("Potential GPL/Apache license conflict detected")
        
        return conflicts
    
    def _detect_version_conflicts(self, dependencies: List[DependencyInfo]) -> List[str]:
        """Detect version conflicts in dependencies."""
        conflicts = []
        versions = defaultdict(list)
        
        for dep in dependencies:
            if dep.group_id and dep.artifact_id and dep.version:
                key = f"{dep.group_id}:{dep.artifact_id}"
                versions[key].append(dep.version)
        
        for lib, lib_versions in versions.items():
            unique_versions = list(set(lib_versions))
            if len(unique_versions) > 1:
                conflicts.append(f"Version conflict: {lib} has versions {', '.join(unique_versions)}")
        
        return conflicts
    
    # Framework-specific detection methods
    async def _detect_spring_dependencies(self, jar_path: Path) -> List[DependencyInfo]:
        """Detect Spring Framework dependencies."""
        dependencies = []
        
        # Use generic file discovery for Spring configuration files
        spring_configs = await self._discover_files(jar_path, 'spring_config')
        version_files = await self._discover_files(jar_path, 'version_files')
        
        all_spring_files = spring_configs + version_files
        if all_spring_files:
            dependency = DependencyInfo(
                name="org.springframework:spring-framework",
                group_id="org.springframework",
                artifact_id="spring-framework",
                source="framework_detection",
                source_file=str(all_spring_files[0].relative_to(jar_path)),
                description="Spring Framework detected from configuration files",
                confidence=0.8
            )
            dependencies.append(dependency)
        
        return dependencies
    
    async def _detect_hibernate_dependencies(self, jar_path: Path) -> List[DependencyInfo]:
        """Detect Hibernate dependencies."""
        dependencies = []
        
        # Use generic file discovery for Hibernate configuration files
        hibernate_configs = await self._discover_files(jar_path, 'hibernate_config')
        
        if hibernate_configs:
            dependency = DependencyInfo(
                name="org.hibernate:hibernate-core",
                group_id="org.hibernate",
                artifact_id="hibernate-core",
                source="framework_detection",
                source_file=str(hibernate_configs[0].relative_to(jar_path)),
                description="Hibernate ORM detected from configuration files",
                confidence=0.8
            )
            dependencies.append(dependency)
        
        return dependencies
    
    async def _extract_maven_jar_info(self, jar_path: Path) -> Optional[Dict[str, str]]:
        """Extract Maven information about the JAR itself."""
        pom_properties = await self._discover_files(jar_path, 'maven_properties')
        
        for props_file in pom_properties:
            try:
                content = await self._safe_read_file(props_file)
                if not content:
                    continue
                
                props = {}
                for line in content.split('\n'):
                    line = line.strip()
                    if '=' in line and not line.startswith('#'):
                        key, value = line.split('=', 1)
                        props[key.strip()] = value.strip()
                
                if 'groupId' in props and 'artifactId' in props:
                    return props
                
            except Exception:
                continue
        
        return None
    
    # Data loading methods
    def _load_known_packages(self) -> Dict[str, Dict[str, Any]]:
        """Load database of known packages and their library mappings."""
        return {
            # Apache Commons
            'org.apache.commons': {
                'name': 'Apache Commons',
                'group_id': 'org.apache.commons',
                'description': 'Apache Commons Utilities',
                'license': 'Apache 2.0'
            },
            'commons-cli': {
                'name': 'commons-cli:commons-cli',
                'group_id': 'commons-cli',
                'artifact_id': 'commons-cli',
                'description': 'Apache Commons CLI',
                'license': 'Apache 2.0'
            },
            'commons-cli:commons-cli': {
                'name': 'commons-cli:commons-cli',
                'group_id': 'commons-cli',
                'artifact_id': 'commons-cli',
                'description': 'Apache Commons CLI',
                'license': 'Apache 2.0'
            },
            
            # Apache Ivy (used by Groovy for dependency management)
            'org.apache.ivy': {
                'name': 'org.apache.ivy:ivy',
                'group_id': 'org.apache.ivy',
                'artifact_id': 'ivy',
                'description': 'Apache Ivy Dependency Manager',
                'license': 'Apache 2.0'
            },
            
            # Apache Ant (build tool)
            'org.apache.tools.ant': {
                'name': 'org.apache.ant:ant',
                'group_id': 'org.apache.ant',
                'artifact_id': 'ant',
                'description': 'Apache Ant Build Tool',
                'license': 'Apache 2.0'
            },
            
            # JLine (console input library)
            'jline': {
                'name': 'jline:jline',
                'group_id': 'jline',
                'artifact_id': 'jline',
                'description': 'JLine Console Input Library',
                'license': 'BSD'
            },
            
            # Apache BSF (Bean Scripting Framework)
            'org.apache.bsf': {
                'name': 'org.apache.bsf:bsf',
                'group_id': 'org.apache.bsf',
                'artifact_id': 'bsf',
                'description': 'Apache Bean Scripting Framework',
                'license': 'Apache 2.0'
            },
            
            # Jansi (ANSI escape sequences)
            'org.fusesource.jansi': {
                'name': 'org.fusesource.jansi:jansi',
                'group_id': 'org.fusesource.jansi',
                'artifact_id': 'jansi',
                'description': 'Jansi ANSI Escape Sequences',
                'license': 'Apache 2.0'
            },
            
            # Spring Framework
            'org.springframework': {
                'name': 'org.springframework:spring-framework',
                'group_id': 'org.springframework',
                'artifact_id': 'spring-framework',
                'description': 'Spring Framework',
                'license': 'Apache 2.0'
            },
            
            # Hibernate
            'org.hibernate': {
                'name': 'org.hibernate:hibernate-core',
                'group_id': 'org.hibernate',
                'artifact_id': 'hibernate-core',
                'description': 'Hibernate ORM',
                'license': 'LGPL'
            },
            
            # Jackson
            'com.fasterxml.jackson': {
                'name': 'com.fasterxml.jackson.core:jackson-core',
                'group_id': 'com.fasterxml.jackson.core',
                'artifact_id': 'jackson-core',
                'description': 'Jackson JSON Processing',
                'license': 'Apache 2.0'
            },
            
            # JUnit
            'junit': {
                'name': 'junit:junit',
                'group_id': 'junit',
                'artifact_id': 'junit',
                'description': 'JUnit Testing Framework',
                'license': 'EPL'
            },
            'org.junit': {
                'name': 'org.junit:junit-jupiter',
                'group_id': 'org.junit.jupiter',
                'artifact_id': 'junit-jupiter',
                'description': 'JUnit 5 Testing Framework',
                'license': 'EPL'
            },
            
            # SLF4J
            'org.slf4j': {
                'name': 'org.slf4j:slf4j-api',
                'group_id': 'org.slf4j',
                'artifact_id': 'slf4j-api',
                'description': 'Simple Logging Facade for Java',
                'license': 'MIT'
            },
            
            # Log4j
            'org.apache.log4j': {
                'name': 'log4j:log4j',
                'group_id': 'log4j',
                'artifact_id': 'log4j',
                'description': 'Apache Log4j 1.x',
                'license': 'Apache 2.0'
            },
            'org.apache.logging.log4j': {
                'name': 'org.apache.logging.log4j:log4j-core',
                'group_id': 'org.apache.logging.log4j',
                'artifact_id': 'log4j-core',
                'description': 'Apache Log4j 2.x',
                'license': 'Apache 2.0'
            },
            
            # Groovy
            'groovy': {
                'name': 'org.codehaus.groovy:groovy',
                'group_id': 'org.codehaus.groovy',
                'artifact_id': 'groovy',
                'description': 'Groovy Programming Language',
                'license': 'Apache 2.0'
            },
            'org.codehaus.groovy': {
                'name': 'org.codehaus.groovy:groovy-all',
                'group_id': 'org.codehaus.groovy',
                'artifact_id': 'groovy-all',
                'description': 'Groovy Programming Language',
                'license': 'Apache 2.0'
            }
        }
    
    def _load_framework_patterns(self) -> Dict[str, Dict[str, List[str]]]:
        """Load framework detection patterns."""
        return {
            'Spring Framework': {
                'files': ['*spring*.xml', '*spring*.properties', 'application*.properties', 'application*.yml']
            },
            'Hibernate': {
                'files': ['hibernate*.xml', 'hibernate*.cfg.xml', 'persistence.xml']
            },
            'Log4j': {
                'files': ['log4j*.xml', 'log4j*.properties']
            },
            'Logback': {
                'files': ['logback*.xml']
            }
        }
    
    def _load_security_patterns(self) -> Dict[str, Dict[str, Any]]:
        """Load security vulnerability patterns."""
        return {
            'log4j': {
                'description': 'Log4j vulnerability (Log4Shell)',
                'vulnerable_versions': ['1.', '2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9', '2.10', '2.11', '2.12', '2.13', '2.14', '2.15', '2.16']
            },
            'jackson': {
                'description': 'Jackson deserialization vulnerabilities',
                'vulnerable_versions': ['2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9']
            }
        }
    
    def _load_license_patterns(self) -> Dict[str, List[str]]:
        """Load license detection patterns."""
        return {
            'Apache 2.0': ['apache license', 'apache 2.0'],
            'MIT': ['mit license'],
            'GPL': ['gnu general public license', 'gpl'],
            'LGPL': ['gnu lesser general public license', 'lgpl'],
            'BSD': ['bsd license'],
            'EPL': ['eclipse public license']
        }
    
    def _load_file_discovery_patterns(self) -> Dict[str, Dict[str, Any]]:
        """Load file discovery patterns for different dependency sources."""
        return {
            'manifest': {
                'patterns': [
                    'META-INF/MANIFEST.MF',
                    '**/META-INF/MANIFEST.MF',
                    'MANIFEST.MF'
                ],
                'required': False,
                'encoding': 'utf-8'
            },
            'maven_pom': {
                'patterns': [
                    'pom.xml',
                    '**/pom.xml',
                    'META-INF/maven/**/pom.xml'
                ],
                'required': False,
                'encoding': 'utf-8'
            },
            'maven_properties': {
                'patterns': [
                    'pom.properties',
                    '**/pom.properties',
                    'META-INF/maven/**/pom.properties'
                ],
                'required': False,
                'encoding': 'utf-8'
            },
            'gradle_build': {
                'patterns': [
                    'build.gradle',
                    'build.gradle.kts',
                    '**/build.gradle',
                    '**/build.gradle.kts'
                ],
                'required': False,
                'encoding': 'utf-8'
            },
            'gradle_properties': {
                'patterns': [
                    'gradle.properties',
                    '**/gradle.properties'
                ],
                'required': False,
                'encoding': 'utf-8'
            },
            'sbt_build': {
                'patterns': [
                    'build.sbt',
                    '**/build.sbt',
                    'project/build.properties',
                    '**/project/build.properties'
                ],
                'required': False,
                'encoding': 'utf-8'
            },
            'ivy_xml': {
                'patterns': [
                    'ivy.xml',
                    '**/ivy.xml'
                ],
                'required': False,
                'encoding': 'utf-8'
            },
            'version_files': {
                'patterns': [
                    'version.properties',
                    '*version*.properties',
                    'application.properties',
                    'application*.properties',
                    'application.yml',
                    'application*.yml',
                    'application.yaml',
                    'application*.yaml'
                ],
                'required': False,
                'encoding': 'utf-8'
            },
            'spring_config': {
                'patterns': [
                    '*spring*.xml',
                    '**/spring*.xml',
                    'applicationContext.xml',
                    '**/applicationContext.xml'
                ],
                'required': False,
                'encoding': 'utf-8'
            },
            'hibernate_config': {
                'patterns': [
                    'hibernate.cfg.xml',
                    '**/hibernate.cfg.xml',
                    'hibernate*.xml',
                    '**/hibernate*.xml',
                    'persistence.xml',
                    '**/persistence.xml'
                ],
                'required': False,
                'encoding': 'utf-8'
            },
            'license_files': {
                'patterns': [
                    'LICENSE*',
                    'NOTICE*',
                    'COPYRIGHT*',
                    '*license*',
                    '*LICENSE*',
                    '**/LICENSE*',
                    '**/NOTICE*'
                ],
                'required': False,
                'encoding': 'utf-8'
            }
        }
    
    async def _discover_files(self, jar_path: Path, file_type: str) -> List[Path]:
        """
        Generic file discovery method that searches for files using multiple patterns.
        
        Args:
            jar_path: Path to the extracted JAR contents
            file_type: Type of files to discover (from file_discovery_patterns)
            
        Returns:
            List of discovered file paths
        """
        if file_type not in self.file_discovery_patterns:
            logger.warning(f"Unknown file type for discovery: {file_type}")
            return []
        
        patterns = self.file_discovery_patterns[file_type]['patterns']
        discovered_files = []
        
        for pattern in patterns:
            try:
                # Use rglob for recursive patterns, glob for non-recursive
                if '**' in pattern:
                    matches = list(jar_path.rglob(pattern.replace('**/', '')))
                else:
                    matches = list(jar_path.glob(pattern))
                
                # Filter to only existing files (not directories)
                file_matches = [f for f in matches if f.is_file()]
                discovered_files.extend(file_matches)
                
                if file_matches:
                    logger.debug(f"Found {len(file_matches)} files for pattern '{pattern}' in {file_type}")
                
            except Exception as e:
                logger.warning(f"Error searching for pattern '{pattern}' in {file_type}: {e}")
                continue
        
        # Remove duplicates while preserving order
        unique_files = []
        seen = set()
        for file_path in discovered_files:
            if file_path not in seen:
                unique_files.append(file_path)
                seen.add(file_path)
        
        logger.info(f"Discovered {len(unique_files)} unique files for {file_type}")
        return unique_files
    
    async def _safe_read_file(self, file_path: Path, encoding: str = 'utf-8') -> Optional[str]:
        """
        Safely read a file with fallback encoding options.
        
        Args:
            file_path: Path to the file to read
            encoding: Primary encoding to try
            
        Returns:
            File content as string, or None if reading fails
        """
        encodings_to_try = [encoding, 'utf-8', 'latin-1', 'cp1252']
        
        for enc in encodings_to_try:
            try:
                with open(file_path, 'r', encoding=enc, errors='ignore') as f:
                    content = f.read()
                    if content.strip():  # Only return non-empty content
                        return content
            except Exception as e:
                logger.debug(f"Failed to read {file_path} with encoding {enc}: {e}")
                continue
        
        logger.warning(f"Could not read file {file_path} with any encoding")
        return None
    
    # Utility methods
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


# Global service instance
enhanced_dependency_service = EnhancedDependencyService()
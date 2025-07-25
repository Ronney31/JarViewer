"""
Comprehensive Dependency Analysis Service
Extracts all dependencies, libraries, and frameworks used within a JAR file
for project decision-making
"""

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Set, Optional, Any, Tuple
import structlog
from dataclasses import dataclass
from collections import defaultdict
import zipfile

logger = structlog.get_logger()


@dataclass
class LibraryDependency:
    """Represents a library/dependency found in the JAR."""
    name: str
    version: Optional[str] = None
    group_id: Optional[str] = None
    artifact_id: Optional[str] = None
    type: str = "library"  # library, framework, tool, etc.
    source: str = "detected"  # maven, gradle, manifest, imports, etc.
    description: Optional[str] = None
    license: Optional[str] = None
    size_kb: Optional[int] = None
    class_count: int = 0
    package_count: int = 0


@dataclass
class FrameworkInfo:
    """Represents a framework detected in the JAR."""
    name: str
    version: Optional[str] = None
    confidence: float = 1.0
    components: List[str] = None
    description: str = ""
    
    def __post_init__(self):
        if self.components is None:
            self.components = []


@dataclass
class ComprehensiveDependencyReport:
    """Complete dependency report for decision-making."""
    # Core dependencies
    maven_dependencies: List[LibraryDependency]
    gradle_dependencies: List[LibraryDependency]
    detected_libraries: List[LibraryDependency]
    
    # Framework information
    frameworks: List[FrameworkInfo]
    
    # Java ecosystem info
    java_version: Optional[str]
    build_tool: Optional[str]
    
    # Package analysis
    top_packages: List[Dict[str, Any]]  # Most used packages
    external_packages: List[str]  # Non-JDK packages
    
    # Statistics for decision making
    total_dependencies: int
    total_classes: int
    total_packages: int
    jar_size_mb: float
    
    # Risk assessment
    outdated_dependencies: List[str]
    security_concerns: List[str]
    license_info: Dict[str, List[str]]


class ComprehensiveDependencyService:
    """Service for comprehensive dependency analysis for project decision-making."""
    
    def __init__(self):
        self.known_libraries = self._load_known_libraries()
        self.framework_signatures = self._load_framework_signatures()
        self.license_patterns = self._load_license_patterns()
    
    async def analyze_comprehensive_dependencies(
        self, 
        jar_path: Path, 
        jar_size: int
    ) -> ComprehensiveDependencyReport:
        """
        Perform comprehensive dependency analysis for project decision-making.
        """
        logger.info("Starting comprehensive dependency analysis", jar_path=str(jar_path))
        
        # Initialize collections
        maven_deps = []
        gradle_deps = []
        detected_libs = []
        frameworks = []
        
        # Extract from build files
        maven_deps = await self._extract_maven_dependencies(jar_path)
        gradle_deps = await self._extract_gradle_dependencies(jar_path)
        
        # Detect libraries from imports and packages
        detected_libs = await self._detect_libraries_from_code(jar_path)
        
        # Detect frameworks
        frameworks = await self._detect_frameworks(jar_path)
        
        # Analyze packages
        package_analysis = await self._analyze_packages(jar_path)
        
        # Get Java and build info
        java_version = await self._detect_java_version(jar_path)
        build_tool = await self._detect_build_tool(jar_path)
        
        # Risk assessment
        outdated_deps = await self._check_outdated_dependencies(maven_deps + gradle_deps + detected_libs)
        security_concerns = await self._assess_security_risks(maven_deps + gradle_deps + detected_libs)
        license_info = await self._extract_license_information(jar_path)
        
        # Calculate statistics
        total_deps = len(maven_deps) + len(gradle_deps) + len(detected_libs)
        
        report = ComprehensiveDependencyReport(
            maven_dependencies=maven_deps,
            gradle_dependencies=gradle_deps,
            detected_libraries=detected_libs,
            frameworks=frameworks,
            java_version=java_version,
            build_tool=build_tool,
            top_packages=package_analysis['top_packages'],
            external_packages=package_analysis['external_packages'],
            total_dependencies=total_deps,
            total_classes=package_analysis['total_classes'],
            total_packages=package_analysis['total_packages'],
            jar_size_mb=round(jar_size / (1024 * 1024), 2),
            outdated_dependencies=outdated_deps,
            security_concerns=security_concerns,
            license_info=license_info
        )
        
        logger.info("Comprehensive dependency analysis completed",
                   total_dependencies=total_deps,
                   frameworks=len(frameworks),
                   packages=len(package_analysis['external_packages']))
        
        return report
    
    async def _extract_maven_dependencies(self, jar_path: Path) -> List[LibraryDependency]:
        """Extract dependencies from Maven POM files."""
        dependencies = []
        
        pom_files = list(jar_path.rglob("pom.xml"))
        
        for pom_file in pom_files:
            try:
                tree = ET.parse(pom_file)
                root = tree.getroot()
                
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
                        
                        if group_id and artifact_id:
                            lib_info = self._get_library_info(group_id, artifact_id)
                            
                            dependency = LibraryDependency(
                                name=f"{group_id}:{artifact_id}",
                                version=version,
                                group_id=group_id,
                                artifact_id=artifact_id,
                                type=lib_info.get('type', 'library'),
                                source="maven",
                                description=lib_info.get('description', f"Maven dependency: {artifact_id}"),
                                license=lib_info.get('license')
                            )
                            dependencies.append(dependency)
                            
            except Exception as e:
                logger.warning("Failed to parse POM file", pom_file=str(pom_file), error=str(e))
        
        return dependencies
    
    async def _extract_gradle_dependencies(self, jar_path: Path) -> List[LibraryDependency]:
        """Extract dependencies from Gradle build files."""
        dependencies = []
        
        gradle_files = list(jar_path.rglob("build.gradle*"))
        
        for gradle_file in gradle_files:
            try:
                with open(gradle_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Parse Gradle dependencies
                dep_patterns = [
                    r"implementation\s+['\"]([^'\"]+)['\"]",
                    r"compile\s+['\"]([^'\"]+)['\"]",
                    r"api\s+['\"]([^'\"]+)['\"]",
                    r"runtimeOnly\s+['\"]([^'\"]+)['\"]",
                    r"testImplementation\s+['\"]([^'\"]+)['\"]"
                ]
                
                for pattern in dep_patterns:
                    matches = re.findall(pattern, content)
                    for match in matches:
                        parts = match.split(':')
                        if len(parts) >= 2:
                            group_id = parts[0]
                            artifact_id = parts[1]
                            version = parts[2] if len(parts) > 2 else None
                            
                            lib_info = self._get_library_info(group_id, artifact_id)
                            
                            dependency = LibraryDependency(
                                name=match,
                                version=version,
                                group_id=group_id,
                                artifact_id=artifact_id,
                                type=lib_info.get('type', 'library'),
                                source="gradle",
                                description=lib_info.get('description', f"Gradle dependency: {artifact_id}"),
                                license=lib_info.get('license')
                            )
                            dependencies.append(dependency)
                            
            except Exception as e:
                logger.warning("Failed to parse Gradle file", gradle_file=str(gradle_file), error=str(e))
        
        return dependencies
    
    async def _detect_libraries_from_code(self, jar_path: Path) -> List[LibraryDependency]:
        """Detect libraries by analyzing imports and package usage."""
        dependencies = []
        package_usage = defaultdict(int)
        
        # Analyze Java files for imports
        java_files = list(jar_path.rglob("*.java"))
        class_files = list(jar_path.rglob("*.class"))
        
        # Count package usage from imports
        for java_file in java_files:
            try:
                with open(java_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Find import statements
                import_pattern = r'import\s+([a-zA-Z][a-zA-Z0-9_.]*);'
                imports = re.findall(import_pattern, content)
                
                for imp in imports:
                    # Extract root package
                    parts = imp.split('.')
                    if len(parts) >= 2:
                        root_package = '.'.join(parts[:2])
                        if len(parts) >= 3 and parts[0] in ['org', 'com', 'net', 'io']:
                            root_package = '.'.join(parts[:3])
                        
                        if not root_package.startswith(('java.', 'javax.', 'sun.', 'com.sun.')):
                            package_usage[root_package] += 1
                            
            except Exception:
                continue
        
        # Analyze class files for package structure
        for class_file in class_files[:100]:  # Limit to avoid performance issues
            try:
                relative_path = class_file.relative_to(jar_path)
                package_path = str(relative_path.parent).replace('/', '.')
                
                if package_path and package_path != '.':
                    parts = package_path.split('.')
                    if len(parts) >= 2:
                        root_package = '.'.join(parts[:2])
                        if len(parts) >= 3 and parts[0] in ['org', 'com', 'net', 'io']:
                            root_package = '.'.join(parts[:3])
                        
                        if not root_package.startswith(('java.', 'javax.', 'sun.', 'com.sun.')):
                            package_usage[root_package] += 1
                            
            except Exception:
                continue
        
        # Convert top packages to library dependencies
        sorted_packages = sorted(package_usage.items(), key=lambda x: x[1], reverse=True)
        
        for package, usage_count in sorted_packages[:50]:  # Top 50 most used packages
            lib_info = self._get_library_info_by_package(package)
            
            if lib_info:
                dependency = LibraryDependency(
                    name=lib_info['name'],
                    version=lib_info.get('version'),
                    group_id=lib_info.get('group_id'),
                    artifact_id=lib_info.get('artifact_id'),
                    type=lib_info.get('type', 'library'),
                    source="code_analysis",
                    description=lib_info.get('description', f"Detected from package usage: {package}"),
                    license=lib_info.get('license'),
                    class_count=usage_count
                )
                dependencies.append(dependency)
        
        return dependencies
    
    async def _detect_frameworks(self, jar_path: Path) -> List[FrameworkInfo]:
        """Detect frameworks used in the JAR."""
        frameworks = []
        
        for framework_name, signatures in self.framework_signatures.items():
            components = []
            confidence = 0.0
            
            # Check for framework files
            for file_pattern in signatures.get('files', []):
                matching_files = list(jar_path.rglob(file_pattern))
                if matching_files:
                    components.extend([str(f.relative_to(jar_path)) for f in matching_files[:5]])
                    confidence += 0.3
            
            # Check for framework packages
            for package_pattern in signatures.get('packages', []):
                if await self._has_package_pattern(jar_path, package_pattern):
                    components.append(f"Package: {package_pattern}")
                    confidence += 0.4
            
            # Check for framework annotations/content
            for content_pattern in signatures.get('content', []):
                if await self._has_content_pattern(jar_path, content_pattern):
                    components.append(f"Content: {content_pattern}")
                    confidence += 0.3
            
            if confidence > 0.3:  # Minimum confidence threshold
                version = await self._detect_framework_version(jar_path, framework_name)
                
                framework = FrameworkInfo(
                    name=framework_name,
                    version=version,
                    confidence=min(confidence, 1.0),
                    components=components,
                    description=signatures.get('description', f"{framework_name} framework")
                )
                frameworks.append(framework)
        
        return frameworks
    
    async def _analyze_packages(self, jar_path: Path) -> Dict[str, Any]:
        """Analyze package structure and usage."""
        package_counts = defaultdict(int)
        external_packages = set()
        total_classes = 0
        
        class_files = list(jar_path.rglob("*.class"))
        total_classes = len(class_files)
        
        for class_file in class_files:
            try:
                relative_path = class_file.relative_to(jar_path)
                package_path = str(relative_path.parent).replace('/', '.')
                
                if package_path and package_path != '.':
                    package_counts[package_path] += 1
                    
                    # Check if it's an external package
                    parts = package_path.split('.')
                    if len(parts) >= 2:
                        root_package = '.'.join(parts[:2])
                        if not root_package.startswith(('java.', 'javax.', 'sun.', 'com.sun.')):
                            external_packages.add(root_package)
                            
            except Exception:
                continue
        
        # Get top packages
        top_packages = [
            {
                'name': package,
                'class_count': count,
                'percentage': round((count / total_classes) * 100, 1) if total_classes > 0 else 0
            }
            for package, count in sorted(package_counts.items(), key=lambda x: x[1], reverse=True)[:20]
        ]
        
        return {
            'top_packages': top_packages,
            'external_packages': list(external_packages),
            'total_packages': len(package_counts),
            'total_classes': total_classes
        }
    
    async def _detect_java_version(self, jar_path: Path) -> Optional[str]:
        """Detect Java version used to build the JAR."""
        # Check MANIFEST.MF
        manifest_path = jar_path / "META-INF" / "MANIFEST.MF"
        if manifest_path.exists():
            try:
                with open(manifest_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                    # Look for Build-Jdk or similar
                    patterns = [
                        r'Build-Jdk:\s*([^\s]+)',
                        r'Built-By-Java:\s*([^\s]+)',
                        r'Java-Version:\s*([^\s]+)'
                    ]
                    
                    for pattern in patterns:
                        match = re.search(pattern, content)
                        if match:
                            return match.group(1)
                            
            except Exception:
                pass
        
        return None
    
    async def _detect_build_tool(self, jar_path: Path) -> Optional[str]:
        """Detect build tool used."""
        if list(jar_path.rglob("pom.xml")):
            return "Maven"
        elif list(jar_path.rglob("build.gradle*")):
            return "Gradle"
        elif list(jar_path.rglob("build.sbt")):
            return "SBT"
        return None
    
    async def _check_outdated_dependencies(self, dependencies: List[LibraryDependency]) -> List[str]:
        """Check for potentially outdated dependencies."""
        outdated = []
        
        # Simple heuristic - check for very old versions
        for dep in dependencies:
            if dep.version:
                try:
                    # Check for obviously old versions
                    if any(old_version in dep.version for old_version in ['1.0', '1.1', '1.2', '2.0', '2.1']):
                        if dep.name not in ['junit:junit', 'log4j:log4j']:  # Some libraries legitimately use these versions
                            outdated.append(f"{dep.name} v{dep.version}")
                except Exception:
                    continue
        
        return outdated
    
    async def _assess_security_risks(self, dependencies: List[LibraryDependency]) -> List[str]:
        """Assess security risks in dependencies."""
        risks = []
        
        # Check for known vulnerable libraries
        vulnerable_patterns = {
            'log4j': ['1.', '2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9', '2.10', '2.11', '2.12', '2.13', '2.14', '2.15', '2.16'],
            'jackson': ['2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9'],
            'spring': ['3.', '4.0', '4.1', '4.2']
        }
        
        for dep in dependencies:
            for vuln_lib, vuln_versions in vulnerable_patterns.items():
                if vuln_lib in dep.name.lower() and dep.version:
                    for vuln_version in vuln_versions:
                        if dep.version.startswith(vuln_version):
                            risks.append(f"Potentially vulnerable: {dep.name} v{dep.version}")
                            break
        
        return risks
    
    async def _extract_license_information(self, jar_path: Path) -> Dict[str, List[str]]:
        """Extract license information."""
        licenses = defaultdict(list)
        
        # Check for license files
        license_files = []
        for pattern in ['LICENSE*', 'NOTICE*', 'COPYRIGHT*', '*license*', '*LICENSE*']:
            license_files.extend(list(jar_path.rglob(pattern)))
        
        for license_file in license_files:
            try:
                with open(license_file, 'r', encoding='utf-8') as f:
                    content = f.read()[:1000]  # First 1000 chars
                    
                    # Detect license type
                    license_type = self._detect_license_type(content)
                    licenses[license_type].append(str(license_file.relative_to(jar_path)))
                    
            except Exception:
                continue
        
        return dict(licenses)
    
    def _detect_license_type(self, content: str) -> str:
        """Detect license type from content."""
        content_lower = content.lower()
        
        if 'apache license' in content_lower or 'apache 2.0' in content_lower:
            return 'Apache 2.0'
        elif 'mit license' in content_lower:
            return 'MIT'
        elif 'gpl' in content_lower:
            return 'GPL'
        elif 'bsd' in content_lower:
            return 'BSD'
        elif 'lgpl' in content_lower:
            return 'LGPL'
        else:
            return 'Unknown'
    
    # Helper methods
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
    
    def _get_library_info(self, group_id: str, artifact_id: str) -> Dict[str, Any]:
        """Get library information from known libraries database."""
        key = f"{group_id}:{artifact_id}"
        return self.known_libraries.get(key, {})
    
    def _get_library_info_by_package(self, package: str) -> Optional[Dict[str, Any]]:
        """Get library information by package name."""
        for lib_key, lib_info in self.known_libraries.items():
            if 'packages' in lib_info and package in lib_info['packages']:
                return lib_info
        return None
    
    async def _has_package_pattern(self, jar_path: Path, pattern: str) -> bool:
        """Check if package pattern exists."""
        package_dirs = [d for d in jar_path.rglob("*") if d.is_dir()]
        for package_dir in package_dirs:
            if pattern.replace('.', '/') in str(package_dir):
                return True
        return False
    
    async def _has_content_pattern(self, jar_path: Path, pattern: str) -> bool:
        """Check if content pattern exists in files."""
        java_files = list(jar_path.rglob("*.java"))
        xml_files = list(jar_path.rglob("*.xml"))
        
        for file_path in (java_files + xml_files)[:50]:  # Limit for performance
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    if pattern in content:
                        return True
            except Exception:
                continue
        return False
    
    async def _detect_framework_version(self, jar_path: Path, framework_name: str) -> Optional[str]:
        """Detect framework version."""
        # This would be enhanced with more sophisticated version detection
        return None
    
    def _load_known_libraries(self) -> Dict[str, Dict[str, Any]]:
        """Load database of known libraries."""
        return {
            'org.springframework:spring-core': {
                'type': 'framework',
                'description': 'Spring Framework Core',
                'license': 'Apache 2.0',
                'packages': ['org.springframework']
            },
            'org.springframework:spring-boot': {
                'type': 'framework',
                'description': 'Spring Boot Framework',
                'license': 'Apache 2.0',
                'packages': ['org.springframework.boot']
            },
            'org.hibernate:hibernate-core': {
                'type': 'framework',
                'description': 'Hibernate ORM Framework',
                'license': 'LGPL',
                'packages': ['org.hibernate']
            },
            'junit:junit': {
                'type': 'testing',
                'description': 'JUnit Testing Framework',
                'license': 'EPL',
                'packages': ['junit', 'org.junit']
            },
            'org.apache.commons:commons-lang3': {
                'type': 'utility',
                'description': 'Apache Commons Lang Utilities',
                'license': 'Apache 2.0',
                'packages': ['org.apache.commons.lang3']
            },
            'com.fasterxml.jackson.core:jackson-core': {
                'type': 'library',
                'description': 'Jackson JSON Processing Library',
                'license': 'Apache 2.0',
                'packages': ['com.fasterxml.jackson']
            },
            'org.slf4j:slf4j-api': {
                'type': 'logging',
                'description': 'SLF4J Logging API',
                'license': 'MIT',
                'packages': ['org.slf4j']
            },
            'org.apache.logging.log4j:log4j-core': {
                'type': 'logging',
                'description': 'Apache Log4j Logging Framework',
                'license': 'Apache 2.0',
                'packages': ['org.apache.logging.log4j']
            }
        }
    
    def _load_framework_signatures(self) -> Dict[str, Dict[str, Any]]:
        """Load framework detection signatures."""
        return {
            'Spring Framework': {
                'files': ['**/spring*.jar', '**/spring*.xml', '**/applicationContext.xml'],
                'packages': ['org.springframework'],
                'content': ['@Component', '@Service', '@Repository', '@Controller', '@SpringBootApplication'],
                'description': 'Spring Framework for dependency injection and web applications'
            },
            'Hibernate': {
                'files': ['**/hibernate*.jar', '**/hibernate.cfg.xml'],
                'packages': ['org.hibernate'],
                'content': ['@Entity', '@Table', 'SessionFactory', 'hibernate.cfg.xml'],
                'description': 'Hibernate ORM framework for database operations'
            },
            'Apache Struts': {
                'files': ['**/struts*.jar', '**/struts.xml'],
                'packages': ['org.apache.struts'],
                'content': ['struts-config', 'ActionForm', 'struts.xml'],
                'description': 'Apache Struts web application framework'
            },
            'JSF (JavaServer Faces)': {
                'files': ['**/jsf*.jar', '**/faces-config.xml'],
                'packages': ['javax.faces', 'jakarta.faces'],
                'content': ['faces-config', '@ManagedBean', 'h:form'],
                'description': 'JavaServer Faces web framework'
            },
            'Apache Wicket': {
                'files': ['**/wicket*.jar'],
                'packages': ['org.apache.wicket'],
                'content': ['WebApplication', 'WebPage'],
                'description': 'Apache Wicket web framework'
            },
            'JUnit': {
                'files': ['**/junit*.jar'],
                'packages': ['junit', 'org.junit'],
                'content': ['@Test', 'TestCase', 'Assert'],
                'description': 'JUnit testing framework'
            },
            'TestNG': {
                'files': ['**/testng*.jar'],
                'packages': ['org.testng'],
                'content': ['@Test', 'TestNG'],
                'description': 'TestNG testing framework'
            },
            'Apache Commons': {
                'files': ['**/commons*.jar'],
                'packages': ['org.apache.commons'],
                'content': [],
                'description': 'Apache Commons utility libraries'
            },
            'Jackson': {
                'files': ['**/jackson*.jar'],
                'packages': ['com.fasterxml.jackson'],
                'content': ['@JsonProperty', 'ObjectMapper'],
                'description': 'Jackson JSON processing library'
            },
            'Gson': {
                'files': ['**/gson*.jar'],
                'packages': ['com.google.gson'],
                'content': ['Gson', '@SerializedName'],
                'description': 'Google Gson JSON library'
            }
        }
    
    def _load_license_patterns(self) -> Dict[str, List[str]]:
        """Load license detection patterns."""
        return {
            'Apache 2.0': ['apache license', 'apache 2.0', 'apache software foundation'],
            'MIT': ['mit license', 'permission is hereby granted'],
            'GPL': ['gnu general public license', 'gpl'],
            'LGPL': ['gnu lesser general public license', 'lgpl'],
            'BSD': ['bsd license', 'berkeley software distribution']
        }


# Global service instance
comprehensive_dependency_service = ComprehensiveDependencyService()

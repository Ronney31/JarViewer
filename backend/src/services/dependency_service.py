"""
Dependency Analysis Service
Analyzes JAR files for dependencies, frameworks, and security issues
"""

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Set, Optional, Any, Tuple
import structlog
from dataclasses import dataclass
from enum import Enum

logger = structlog.get_logger()


class DependencyType(Enum):
    """Types of dependencies."""
    MAVEN = "maven"
    GRADLE = "gradle"
    RUNTIME = "runtime"
    FRAMEWORK = "framework"


class SecurityLevel(Enum):
    """Security risk levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class Dependency:
    """Represents a dependency found in the JAR."""
    name: str
    version: Optional[str]
    group_id: Optional[str]
    artifact_id: Optional[str]
    dependency_type: DependencyType
    source_file: Optional[str]
    description: Optional[str] = None


@dataclass
class Framework:
    """Represents a detected framework."""
    name: str
    version: Optional[str]
    confidence: float  # 0.0 to 1.0
    indicators: List[str]  # Files/patterns that indicate this framework
    description: Optional[str] = None


@dataclass
class SecurityIssue:
    """Represents a potential security issue."""
    title: str
    description: str
    severity: SecurityLevel
    file_path: Optional[str]
    recommendation: str
    cve_id: Optional[str] = None


@dataclass
class DependencyAnalysisResult:
    """Complete dependency analysis result."""
    dependencies: List[Dependency]
    frameworks: List[Framework]
    security_issues: List[SecurityIssue]
    package_structure: Dict[str, int]  # Package name -> file count
    entry_points: List[str]  # Main classes, servlets, etc.
    build_info: Dict[str, Any]  # Build system information


class DependencyAnalysisService:
    """Service for analyzing JAR dependencies and structure."""
    
    def __init__(self):
        self.framework_patterns = self._load_framework_patterns()
        self.security_patterns = self._load_security_patterns()
        self.known_vulnerabilities = self._load_vulnerability_database()
    
    async def analyze_jar(
        self, 
        jar_temp_path: Path, 
        file_structure: List[Any]
    ) -> DependencyAnalysisResult:
        """
        Perform comprehensive dependency analysis on a JAR file.
        
        Args:
            jar_temp_path: Path to extracted JAR contents
            file_structure: File structure from JAR service
            
        Returns:
            Complete dependency analysis result
        """
        logger.info("Starting dependency analysis", jar_path=str(jar_temp_path))
        
        # Initialize result
        result = DependencyAnalysisResult(
            dependencies=[],
            frameworks=[],
            security_issues=[],
            package_structure={},
            entry_points=[],
            build_info={}
        )
        
        # Analyze different aspects
        result.dependencies = await self._analyze_dependencies(jar_temp_path)
        result.frameworks = await self._detect_frameworks(jar_temp_path, file_structure)
        result.security_issues = await self._analyze_security(jar_temp_path, file_structure)
        result.package_structure = await self._analyze_package_structure(file_structure)
        result.entry_points = await self._find_entry_points(jar_temp_path)
        result.build_info = await self._extract_build_info(jar_temp_path)
        
        logger.info("Dependency analysis completed", 
                   dependencies=len(result.dependencies),
                   frameworks=len(result.frameworks),
                   security_issues=len(result.security_issues))
        
        return result
    
    async def _analyze_dependencies(self, jar_path: Path) -> List[Dependency]:
        """Analyze dependencies from various sources."""
        dependencies = []
        
        # Check Maven POM files
        pom_deps = await self._analyze_maven_dependencies(jar_path)
        dependencies.extend(pom_deps)
        
        # Check Gradle build files
        gradle_deps = await self._analyze_gradle_dependencies(jar_path)
        dependencies.extend(gradle_deps)
        
        # Analyze runtime dependencies from imports
        runtime_deps = await self._analyze_runtime_dependencies(jar_path)
        dependencies.extend(runtime_deps)
        
        # Remove duplicates
        unique_deps = self._deduplicate_dependencies(dependencies)
        
        return unique_deps
    
    async def _analyze_maven_dependencies(self, jar_path: Path) -> List[Dependency]:
        """Analyze Maven POM files for dependencies."""
        dependencies = []
        
        # Look for pom.xml files
        pom_files = list(jar_path.rglob("pom.xml"))
        
        for pom_file in pom_files:
            try:
                tree = ET.parse(pom_file)
                root = tree.getroot()
                
                # Handle namespace
                ns = {'maven': 'http://maven.apache.org/POM/4.0.0'}
                if root.tag.startswith('{'):
                    ns_uri = root.tag.split('}')[0][1:]
                    ns = {'maven': ns_uri}
                
                # Find dependencies
                deps_element = root.find('.//maven:dependencies', ns)
                if deps_element is not None:
                    for dep in deps_element.findall('.//maven:dependency', ns):
                        group_id = self._get_element_text(dep.find('maven:groupId', ns))
                        artifact_id = self._get_element_text(dep.find('maven:artifactId', ns))
                        version = self._get_element_text(dep.find('maven:version', ns))
                        
                        if group_id and artifact_id:
                            dependency = Dependency(
                                name=f"{group_id}:{artifact_id}",
                                version=version,
                                group_id=group_id,
                                artifact_id=artifact_id,
                                dependency_type=DependencyType.MAVEN,
                                source_file=str(pom_file.relative_to(jar_path))
                            )
                            dependencies.append(dependency)
                            
            except Exception as e:
                logger.warning("Failed to parse POM file", 
                              pom_file=str(pom_file), error=str(e))
        
        return dependencies
    
    async def _analyze_gradle_dependencies(self, jar_path: Path) -> List[Dependency]:
        """Analyze Gradle build files for dependencies."""
        dependencies = []
        
        # Look for build.gradle files
        gradle_files = list(jar_path.rglob("build.gradle*"))
        
        for gradle_file in gradle_files:
            try:
                with open(gradle_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Parse Gradle dependencies using regex
                # This is a simplified parser - real Gradle parsing is complex
                dep_patterns = [
                    r"implementation\s+['\"]([^'\"]+)['\"]",
                    r"compile\s+['\"]([^'\"]+)['\"]",
                    r"api\s+['\"]([^'\"]+)['\"]",
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
                            
                            dependency = Dependency(
                                name=match,
                                version=version,
                                group_id=group_id,
                                artifact_id=artifact_id,
                                dependency_type=DependencyType.GRADLE,
                                source_file=str(gradle_file.relative_to(jar_path))
                            )
                            dependencies.append(dependency)
                            
            except Exception as e:
                logger.warning("Failed to parse Gradle file", 
                              gradle_file=str(gradle_file), error=str(e))
        
        return dependencies
    
    async def _analyze_runtime_dependencies(self, jar_path: Path) -> List[Dependency]:
        """Analyze runtime dependencies from Java imports."""
        dependencies = []
        
        # Look for Java files
        java_files = list(jar_path.rglob("*.java"))
        
        # Track imported packages
        imported_packages = set()
        
        for java_file in java_files:
            try:
                with open(java_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Find import statements
                import_pattern = r'import\s+([a-zA-Z][a-zA-Z0-9_.]*);'
                imports = re.findall(import_pattern, content)
                
                for imp in imports:
                    # Extract root package (first 2-3 parts)
                    parts = imp.split('.')
                    if len(parts) >= 2:
                        root_package = '.'.join(parts[:2])
                        if len(parts) >= 3 and parts[0] in ['org', 'com', 'net']:
                            root_package = '.'.join(parts[:3])
                        imported_packages.add(root_package)
                        
            except Exception as e:
                logger.warning("Failed to analyze Java file", 
                              java_file=str(java_file), error=str(e))
        
        # Convert packages to dependencies
        for package in imported_packages:
            # Skip standard Java packages
            if not package.startswith(('java.', 'javax.', 'sun.', 'com.sun.')):
                dependency = Dependency(
                    name=package,
                    version=None,
                    group_id=package,
                    artifact_id=None,
                    dependency_type=DependencyType.RUNTIME,
                    source_file=None,
                    description=f"Runtime dependency detected from imports"
                )
                dependencies.append(dependency)
        
        return dependencies
    
    async def _detect_frameworks(self, jar_path: Path, file_structure: List[Any]) -> List[Framework]:
        """Detect frameworks used in the JAR."""
        frameworks = []
        
        for framework_name, patterns in self.framework_patterns.items():
            indicators = []
            confidence = 0.0
            
            # Check file patterns
            for pattern in patterns.get('files', []):
                matching_files = list(jar_path.rglob(pattern))
                if matching_files:
                    indicators.extend([str(f.relative_to(jar_path)) for f in matching_files])
                    confidence += patterns.get('file_weight', 0.3)
            
            # Check package patterns
            for pattern in patterns.get('packages', []):
                if self._has_package_pattern(file_structure, pattern):
                    indicators.append(f"Package: {pattern}")
                    confidence += patterns.get('package_weight', 0.4)
            
            # Check content patterns
            for pattern in patterns.get('content', []):
                if await self._has_content_pattern(jar_path, pattern):
                    indicators.append(f"Content: {pattern}")
                    confidence += patterns.get('content_weight', 0.3)
            
            if confidence > 0.3:  # Minimum confidence threshold
                framework = Framework(
                    name=framework_name,
                    version=await self._detect_framework_version(jar_path, framework_name),
                    confidence=min(confidence, 1.0),
                    indicators=indicators,
                    description=patterns.get('description')
                )
                frameworks.append(framework)
        
        return frameworks
    
    async def _analyze_security(self, jar_path: Path, file_structure: List[Any]) -> List[SecurityIssue]:
        """Analyze for potential security issues."""
        security_issues = []
        
        # Check for known vulnerable patterns
        for pattern_name, pattern_info in self.security_patterns.items():
            if await self._check_security_pattern(jar_path, pattern_info):
                issue = SecurityIssue(
                    title=pattern_info['title'],
                    description=pattern_info['description'],
                    severity=SecurityLevel(pattern_info['severity']),
                    file_path=None,  # Could be enhanced to show specific files
                    recommendation=pattern_info['recommendation']
                )
                security_issues.append(issue)
        
        # Check for hardcoded credentials
        credential_issues = await self._check_hardcoded_credentials(jar_path)
        security_issues.extend(credential_issues)
        
        # Check for insecure configurations
        config_issues = await self._check_insecure_configurations(jar_path)
        security_issues.extend(config_issues)
        
        return security_issues
    
    async def _analyze_package_structure(self, file_structure: List[Any]) -> Dict[str, int]:
        """Analyze package structure and count files per package."""
        package_counts = {}
        
        def count_packages(nodes, current_path=""):
            for node in nodes:
                if hasattr(node, 'type'):
                    if node.type == "directory":
                        new_path = f"{current_path}.{node.name}" if current_path else node.name
                        if hasattr(node, 'children') and node.children:
                            count_packages(node.children, new_path)
                    elif node.type == "file" and current_path:
                        package_counts[current_path] = package_counts.get(current_path, 0) + 1
        
        count_packages(file_structure)
        return package_counts
    
    async def _find_entry_points(self, jar_path: Path) -> List[str]:
        """Find potential entry points (main methods, servlets, etc.)."""
        entry_points = []
        
        # Check MANIFEST.MF for Main-Class
        manifest_path = jar_path / "META-INF" / "MANIFEST.MF"
        if manifest_path.exists():
            try:
                with open(manifest_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    main_class_match = re.search(r'Main-Class:\s*(.+)', content)
                    if main_class_match:
                        entry_points.append(f"Main-Class: {main_class_match.group(1).strip()}")
            except Exception:
                pass
        
        # Look for servlet configurations
        web_xml_files = list(jar_path.rglob("web.xml"))
        for web_xml in web_xml_files:
            try:
                tree = ET.parse(web_xml)
                root = tree.getroot()
                servlets = root.findall('.//servlet-class')
                for servlet in servlets:
                    if servlet.text:
                        entry_points.append(f"Servlet: {servlet.text}")
            except Exception:
                pass
        
        return entry_points
    
    async def _extract_build_info(self, jar_path: Path) -> Dict[str, Any]:
        """Extract build system information."""
        build_info = {}
        
        # Check for Maven info
        if (jar_path / "META-INF" / "maven").exists():
            build_info['build_system'] = 'Maven'
            # Could extract more Maven-specific info
        
        # Check for Gradle info
        if list(jar_path.rglob("build.gradle*")):
            build_info['build_system'] = 'Gradle'
        
        # Check build timestamp from MANIFEST.MF
        manifest_path = jar_path / "META-INF" / "MANIFEST.MF"
        if manifest_path.exists():
            try:
                with open(manifest_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    for line in content.split('\n'):
                        if ':' in line:
                            key, value = line.split(':', 1)
                            key = key.strip()
                            value = value.strip()
                            if key in ['Built-By', 'Build-Jdk', 'Build-Time', 'Created-By']:
                                build_info[key.lower().replace('-', '_')] = value
            except Exception:
                pass
        
        return build_info
    
    def _load_framework_patterns(self) -> Dict[str, Dict[str, Any]]:
        """Load framework detection patterns."""
        return {
            'Spring Framework': {
                'files': ['**/spring*.jar', '**/spring*.xml'],
                'packages': ['org.springframework'],
                'content': ['@Component', '@Service', '@Repository', '@Controller'],
                'file_weight': 0.4,
                'package_weight': 0.5,
                'content_weight': 0.3,
                'description': 'Spring Framework for Java'
            },
            'Hibernate': {
                'files': ['**/hibernate*.jar', '**/hibernate.cfg.xml'],
                'packages': ['org.hibernate'],
                'content': ['@Entity', '@Table', 'SessionFactory'],
                'file_weight': 0.4,
                'package_weight': 0.5,
                'content_weight': 0.3,
                'description': 'Hibernate ORM framework'
            },
            'Apache Struts': {
                'files': ['**/struts*.jar', '**/struts.xml'],
                'packages': ['org.apache.struts'],
                'content': ['struts-config', 'ActionForm'],
                'file_weight': 0.5,
                'package_weight': 0.4,
                'content_weight': 0.3,
                'description': 'Apache Struts web framework'
            },
            'Log4j': {
                'files': ['**/log4j*.jar', '**/log4j*.xml', '**/log4j*.properties'],
                'packages': ['org.apache.log4j', 'org.apache.logging.log4j'],
                'content': ['log4j.logger', 'log4j.appender'],
                'file_weight': 0.5,
                'package_weight': 0.4,
                'content_weight': 0.2,
                'description': 'Apache Log4j logging framework'
            }
        }
    
    def _load_security_patterns(self) -> Dict[str, Dict[str, Any]]:
        """Load security issue detection patterns."""
        return {
            'log4j_vulnerability': {
                'title': 'Potential Log4j Vulnerability',
                'description': 'This JAR may contain vulnerable Log4j versions (CVE-2021-44228)',
                'severity': 'critical',
                'recommendation': 'Update Log4j to version 2.17.0 or later',
                'patterns': ['org.apache.logging.log4j']
            },
            'hardcoded_passwords': {
                'title': 'Potential Hardcoded Credentials',
                'description': 'Found potential hardcoded passwords or API keys',
                'severity': 'high',
                'recommendation': 'Use environment variables or secure configuration',
                'patterns': ['password=', 'apikey=', 'secret=']
            }
        }
    
    def _load_vulnerability_database(self) -> Dict[str, Any]:
        """Load known vulnerability database (simplified)."""
        return {
            'log4j-core': {
                'vulnerable_versions': ['2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9', '2.10', '2.11', '2.12', '2.13', '2.14', '2.15', '2.16'],
                'cve': 'CVE-2021-44228',
                'severity': 'critical'
            }
        }
    
    # Helper methods
    def _get_element_text(self, element) -> Optional[str]:
        """Safely get text from XML element."""
        return element.text.strip() if element is not None and element.text else None
    
    def _deduplicate_dependencies(self, dependencies: List[Dependency]) -> List[Dependency]:
        """Remove duplicate dependencies."""
        seen = set()
        unique_deps = []
        
        for dep in dependencies:
            key = (dep.name, dep.version, dep.dependency_type)
            if key not in seen:
                seen.add(key)
                unique_deps.append(dep)
        
        return unique_deps
    
    def _has_package_pattern(self, file_structure: List[Any], pattern: str) -> bool:
        """Check if package pattern exists in file structure."""
        # Simplified implementation
        return any(pattern in str(node) for node in file_structure if hasattr(node, 'path'))
    
    async def _has_content_pattern(self, jar_path: Path, pattern: str) -> bool:
        """Check if content pattern exists in any file."""
        java_files = list(jar_path.rglob("*.java"))
        xml_files = list(jar_path.rglob("*.xml"))
        
        for file_path in java_files + xml_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    if pattern in content:
                        return True
            except Exception:
                continue
        
        return False
    
    async def _detect_framework_version(self, jar_path: Path, framework_name: str) -> Optional[str]:
        """Detect framework version (simplified implementation)."""
        # This would be enhanced with more sophisticated version detection
        return None
    
    async def _check_security_pattern(self, jar_path: Path, pattern_info: Dict[str, Any]) -> bool:
        """Check if security pattern exists."""
        for pattern in pattern_info.get('patterns', []):
            if await self._has_content_pattern(jar_path, pattern):
                return True
        return False
    
    async def _check_hardcoded_credentials(self, jar_path: Path) -> List[SecurityIssue]:
        """Check for hardcoded credentials."""
        issues = []
        
        credential_patterns = [
            r'password\s*=\s*["\'][^"\']{3,}["\']',
            r'apikey\s*=\s*["\'][^"\']{10,}["\']',
            r'secret\s*=\s*["\'][^"\']{8,}["\']'
        ]
        
        java_files = list(jar_path.rglob("*.java"))
        properties_files = list(jar_path.rglob("*.properties"))
        
        for file_path in java_files + properties_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                    for pattern in credential_patterns:
                        if re.search(pattern, content, re.IGNORECASE):
                            issue = SecurityIssue(
                                title="Hardcoded Credentials Detected",
                                description=f"Potential hardcoded credentials found in {file_path.name}",
                                severity=SecurityLevel.HIGH,
                                file_path=str(file_path.relative_to(jar_path)),
                                recommendation="Use environment variables or secure configuration management"
                            )
                            issues.append(issue)
                            break  # One issue per file
                            
            except Exception:
                continue
        
        return issues
    
    async def _check_insecure_configurations(self, jar_path: Path) -> List[SecurityIssue]:
        """Check for insecure configurations."""
        issues = []
        
        # Check for insecure SSL/TLS configurations
        java_files = list(jar_path.rglob("*.java"))
        
        insecure_patterns = [
            (r'TrustManager.*trustAllCerts', 'Insecure TrustManager', 'Use proper certificate validation'),
            (r'setHostnameVerifier.*ALLOW_ALL', 'Disabled hostname verification', 'Enable proper hostname verification'),
            (r'SSLContext.*TLS.*v1\.0', 'Weak TLS version', 'Use TLS 1.2 or higher')
        ]
        
        for file_path in java_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                    for pattern, title, recommendation in insecure_patterns:
                        if re.search(pattern, content, re.IGNORECASE):
                            issue = SecurityIssue(
                                title=title,
                                description=f"Insecure configuration found in {file_path.name}",
                                severity=SecurityLevel.MEDIUM,
                                file_path=str(file_path.relative_to(jar_path)),
                                recommendation=recommendation
                            )
                            issues.append(issue)
                            
            except Exception:
                continue
        
        return issues


# Global service instance
dependency_analysis_service = DependencyAnalysisService()

"""
Dependency Tree Service
Builds hierarchical dependency trees from JAR analysis results
"""

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Set, Optional, Any, Tuple
import structlog
from collections import defaultdict

from ..models.jar import (
    DependencyNode, DependencyTree, DependencyConflict, DependencyPath,
    DependencyScope, DependencySource, ConflictType, ConflictSeverity, DependencyAnalysisReport
)

logger = structlog.get_logger()


class DependencyTreeService:
    """Service for building and analyzing dependency trees."""
    
    def __init__(self):
        self.known_transitive_deps = self._load_known_transitive_dependencies()
    
    async def build_dependency_tree(
        self, 
        jar_id: str,
        jar_path: Path
    ) -> DependencyTree:
        """
        Build a complete dependency tree from JAR analysis.
        
        Args:
            jar_id: Unique identifier for the JAR
            jar_path: Path to extracted JAR contents
            
        Returns:
            Complete dependency tree with conflicts and paths
        """
        logger.info("Building dependency tree", jar_id=jar_id, jar_path=str(jar_path))
        
        # Initialize tree
        tree = DependencyTree(jar_id=jar_id)
        
        # Extract direct dependencies from build files
        direct_deps = await self._extract_direct_dependencies(jar_path)
        
        # Add direct dependencies to tree
        for dep in direct_deps:
            tree.add_dependency(dep)
        
        # Build transitive dependency relationships
        await self._build_transitive_dependencies(tree, jar_path)
        
        # Detect and analyze conflicts
        tree.detect_conflicts()
        
        # Generate dependency paths
        await self._generate_dependency_paths(tree)
        
        logger.info("Dependency tree built successfully", 
                   total_deps=tree.total_dependencies,
                   conflicts=len(tree.conflicts),
                   max_depth=tree.max_depth)
        
        return tree
    
    def build_tree_from_flat_list(
        self, 
        jar_id: str, 
        dependencies: List[DependencyNode],
        parent_child_relationships: Optional[Dict[str, List[str]]] = None
    ) -> DependencyTree:
        """
        Build hierarchical dependency tree from flat list of dependencies.
        
        Args:
            jar_id: Unique identifier for the JAR
            dependencies: Flat list of dependency nodes
            parent_child_relationships: Optional mapping of parent_id -> [child_ids]
            
        Returns:
            Complete dependency tree with hierarchical structure
        """
        logger.info("Building tree from flat list", 
                   jar_id=jar_id, 
                   dependency_count=len(dependencies))
        
        # Initialize tree
        tree = DependencyTree(jar_id=jar_id)
        
        # If relationships are provided, use them to set parent_id
        if parent_child_relationships:
            self._apply_parent_child_relationships(dependencies, parent_child_relationships)
        
        # Build the tree using the enhanced method
        tree.build_from_flat_list(dependencies)
        
        # Generate dependency paths
        self._generate_dependency_paths_sync(tree)
        
        logger.info("Tree built from flat list successfully", 
                   total_deps=tree.total_dependencies,
                   conflicts=len(tree.conflicts),
                   max_depth=tree.max_depth)
        
        return tree
    
    def _apply_parent_child_relationships(
        self, 
        dependencies: List[DependencyNode], 
        relationships: Dict[str, List[str]]
    ) -> None:
        """Apply parent-child relationships to dependency nodes."""
        # Create lookup map for dependencies
        dep_map = {dep.id: dep for dep in dependencies}
        
        # Apply relationships
        for parent_id, child_ids in relationships.items():
            if parent_id in dep_map:
                for child_id in child_ids:
                    if child_id in dep_map:
                        dep_map[child_id].parent_id = parent_id
    
    def _generate_dependency_paths_sync(self, tree: DependencyTree) -> None:
        """Generate all dependency paths in the tree (synchronous version)."""
        paths = []
        
        for dep_id in tree.all_dependencies:
            path = tree.get_dependency_path(dep_id)
            if path:
                paths.append(path)
        
        tree.paths = paths
    
    async def _extract_direct_dependencies(self, jar_path: Path) -> List[DependencyNode]:
        """Extract direct dependencies from build files."""
        dependencies = []
        
        # Extract from Maven POM files
        maven_deps = await self._extract_maven_dependencies(jar_path)
        dependencies.extend(maven_deps)
        
        # Extract from Gradle build files
        gradle_deps = await self._extract_gradle_dependencies(jar_path)
        dependencies.extend(gradle_deps)
        
        # Extract from MANIFEST.MF
        manifest_deps = await self._extract_manifest_dependencies(jar_path)
        dependencies.extend(manifest_deps)
        
        return dependencies
    
    async def _extract_maven_dependencies(self, jar_path: Path) -> List[DependencyNode]:
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
                        optional = self._get_element_text(dep.find('maven:optional', ns)) == "true"
                        
                        if group_id and artifact_id:
                            dependency = DependencyNode(
                                group_id=group_id,
                                artifact_id=artifact_id,
                                version=version,
                                scope=DependencyScope(scope.lower()) if scope.lower() in [s.value for s in DependencyScope] else DependencyScope.COMPILE,
                                source=DependencySource.MAVEN_POM,
                                optional=optional,
                                file_path=str(pom_file.relative_to(jar_path)),
                                description=f"Maven dependency from {pom_file.name}"
                            )
                            dependencies.append(dependency)
                            
            except Exception as e:
                logger.warning("Failed to parse POM file", 
                              pom_file=str(pom_file), error=str(e))
        
        return dependencies
    
    async def _extract_gradle_dependencies(self, jar_path: Path) -> List[DependencyNode]:
        """Extract dependencies from Gradle build files."""
        dependencies = []
        
        gradle_files = list(jar_path.rglob("build.gradle*"))
        
        for gradle_file in gradle_files:
            try:
                with open(gradle_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Parse Gradle dependencies with scope mapping
                dep_patterns = {
                    r"implementation\s+['\"]([^'\"]+)['\"]": DependencyScope.COMPILE,
                    r"compile\s+['\"]([^'\"]+)['\"]": DependencyScope.COMPILE,
                    r"api\s+['\"]([^'\"]+)['\"]": DependencyScope.COMPILE,
                    r"runtimeOnly\s+['\"]([^'\"]+)['\"]": DependencyScope.RUNTIME,
                    r"testImplementation\s+['\"]([^'\"]+)['\"]": DependencyScope.TEST,
                    r"testCompile\s+['\"]([^'\"]+)['\"]": DependencyScope.TEST,
                    r"providedCompile\s+['\"]([^'\"]+)['\"]": DependencyScope.PROVIDED
                }
                
                for pattern, scope in dep_patterns.items():
                    matches = re.findall(pattern, content)
                    for match in matches:
                        parts = match.split(':')
                        if len(parts) >= 2:
                            group_id = parts[0]
                            artifact_id = parts[1]
                            version = parts[2] if len(parts) > 2 else None
                            
                            dependency = DependencyNode(
                                group_id=group_id,
                                artifact_id=artifact_id,
                                version=version,
                                scope=scope,
                                source=DependencySource.GRADLE_BUILD,
                                file_path=str(gradle_file.relative_to(jar_path)),
                                description=f"Gradle dependency from {gradle_file.name}"
                            )
                            dependencies.append(dependency)
                            
            except Exception as e:
                logger.warning("Failed to parse Gradle file", 
                              gradle_file=str(gradle_file), error=str(e))
        
        return dependencies
    
    async def _extract_manifest_dependencies(self, jar_path: Path) -> List[DependencyNode]:
        """Extract dependencies from MANIFEST.MF Class-Path."""
        dependencies = []
        
        manifest_path = jar_path / "META-INF" / "MANIFEST.MF"
        if not manifest_path.exists():
            return dependencies
        
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Look for Class-Path entries
            class_path_match = re.search(r'Class-Path:\s*(.+?)(?=\n[A-Z]|\n\n|$)', content, re.DOTALL)
            if class_path_match:
                class_path = class_path_match.group(1).replace('\n ', '').strip()
                
                # Parse JAR files from classpath
                jar_pattern = r'([^/\s]+\.jar)'
                jar_files = re.findall(jar_pattern, class_path)
                
                for jar_file in jar_files:
                    # Try to extract group/artifact from filename
                    name_parts = jar_file.replace('.jar', '').split('-')
                    if len(name_parts) >= 2:
                        # Assume last part with numbers is version
                        version = None
                        artifact_parts = []
                        
                        for part in reversed(name_parts):
                            if re.match(r'.*\d+.*', part):
                                version = part
                                break
                            artifact_parts.insert(0, part)
                        
                        if artifact_parts:
                            artifact_id = '-'.join(artifact_parts)
                            group_id = "unknown"  # Can't determine from manifest
                            
                            dependency = DependencyNode(
                                group_id=group_id,
                                artifact_id=artifact_id,
                                version=version,
                                scope=DependencyScope.RUNTIME,
                                source=DependencySource.MANIFEST,
                                file_path="META-INF/MANIFEST.MF",
                                description=f"Runtime dependency from manifest classpath: {jar_file}"
                            )
                            dependencies.append(dependency)
                            
        except Exception as e:
            logger.warning("Failed to parse MANIFEST.MF", error=str(e))
        
        return dependencies
    
    async def _build_transitive_dependencies(self, tree: DependencyTree, jar_path: Path) -> None:
        """Build transitive dependency relationships."""
        
        # Analyze imports to detect transitive dependencies
        transitive_deps = await self._detect_transitive_from_imports(jar_path)
        
        # Add transitive dependencies to existing direct dependencies
        for direct_dep in tree.root_dependencies:
            related_transitives = self._find_related_transitive_deps(direct_dep, transitive_deps)
            
            for transitive_dep in related_transitives:
                transitive_dep.is_transitive = True
                tree.add_dependency(transitive_dep, direct_dep.id)
    
    async def _detect_transitive_from_imports(self, jar_path: Path) -> List[DependencyNode]:
        """Detect transitive dependencies by analyzing import statements."""
        transitive_deps = []
        package_usage = defaultdict(int)
        
        # Analyze Java files for imports
        java_files = list(jar_path.rglob("*.java"))
        
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
                        
                        # Skip standard Java packages
                        if not root_package.startswith(('java.', 'javax.', 'sun.', 'com.sun.')):
                            package_usage[root_package] += 1
                            
            except Exception:
                continue
        
        # Convert top packages to transitive dependencies
        for package, usage_count in package_usage.items():
            if usage_count >= 3:  # Minimum usage threshold
                dep_info = self._get_dependency_info_from_package(package)
                if dep_info:
                    dependency = DependencyNode(
                        group_id=dep_info['group_id'],
                        artifact_id=dep_info['artifact_id'],
                        version=dep_info.get('version'),
                        scope=DependencyScope.COMPILE,
                        source=DependencySource.IMPORTS,
                        description=f"Transitive dependency detected from imports: {package} (used {usage_count} times)"
                    )
                    transitive_deps.append(dependency)
        
        return transitive_deps
    
    def _find_related_transitive_deps(
        self, 
        direct_dep: DependencyNode, 
        transitive_deps: List[DependencyNode]
    ) -> List[DependencyNode]:
        """Find transitive dependencies related to a direct dependency."""
        related = []
        
        # Get known transitive relationships
        dep_key = f"{direct_dep.group_id}:{direct_dep.artifact_id}"
        known_transitives = self.known_transitive_deps.get(dep_key, [])
        
        for transitive_dep in transitive_deps:
            transitive_key = f"{transitive_dep.group_id}:{transitive_dep.artifact_id}"
            
            # Check if this transitive is known to be related to the direct dependency
            if any(pattern in transitive_key for pattern in known_transitives):
                related.append(transitive_dep)
            # Or if they share a common group prefix
            elif (direct_dep.group_id.split('.')[0] == transitive_dep.group_id.split('.')[0] and
                  direct_dep.group_id != transitive_dep.group_id):
                related.append(transitive_dep)
        
        return related
    
    async def _generate_dependency_paths(self, tree: DependencyTree) -> None:
        """Generate all dependency paths in the tree."""
        paths = []
        
        for dep_id in tree.all_dependencies:
            path = tree.get_dependency_path(dep_id)
            if path:
                paths.append(path)
        
        tree.paths = paths
    
    def _get_dependency_info_from_package(self, package: str) -> Optional[Dict[str, str]]:
        """Get dependency information from package name."""
        # Common package to dependency mappings
        package_mappings = {
            'org.springframework': {'group_id': 'org.springframework', 'artifact_id': 'spring-core'},
            'org.hibernate': {'group_id': 'org.hibernate', 'artifact_id': 'hibernate-core'},
            'org.apache.commons': {'group_id': 'org.apache.commons', 'artifact_id': 'commons-lang3'},
            'com.fasterxml.jackson': {'group_id': 'com.fasterxml.jackson.core', 'artifact_id': 'jackson-core'},
            'org.slf4j': {'group_id': 'org.slf4j', 'artifact_id': 'slf4j-api'},
            'org.apache.logging.log4j': {'group_id': 'org.apache.logging.log4j', 'artifact_id': 'log4j-core'},
            'junit': {'group_id': 'junit', 'artifact_id': 'junit'},
            'org.junit': {'group_id': 'org.junit.jupiter', 'artifact_id': 'junit-jupiter'},
            'org.testng': {'group_id': 'org.testng', 'artifact_id': 'testng'},
            'com.google.gson': {'group_id': 'com.google.code.gson', 'artifact_id': 'gson'},
            'org.apache.httpcomponents': {'group_id': 'org.apache.httpcomponents', 'artifact_id': 'httpclient'},
        }
        
        # Try exact match first
        if package in package_mappings:
            return package_mappings[package]
        
        # Try prefix match
        for pkg_prefix, info in package_mappings.items():
            if package.startswith(pkg_prefix):
                return info
        
        # Fallback: create generic mapping
        parts = package.split('.')
        if len(parts) >= 2:
            return {
                'group_id': package,
                'artifact_id': parts[-1]
            }
        
        return None
    
    def _load_known_transitive_dependencies(self) -> Dict[str, List[str]]:
        """Load known transitive dependency relationships."""
        return {
            'org.springframework:spring-core': [
                'org.springframework:spring-beans',
                'org.springframework:spring-context',
                'org.springframework:spring-aop',
                'commons-logging'
            ],
            'org.springframework:spring-boot': [
                'org.springframework:spring-core',
                'org.springframework:spring-context',
                'org.springframework:spring-web',
                'org.springframework:spring-webmvc'
            ],
            'org.hibernate:hibernate-core': [
                'org.hibernate:hibernate-commons-annotations',
                'javax.persistence:javax.persistence-api',
                'org.jboss.logging',
                'antlr'
            ],
            'com.fasterxml.jackson.core:jackson-core': [
                'com.fasterxml.jackson.core:jackson-databind',
                'com.fasterxml.jackson.core:jackson-annotations'
            ],
            'org.apache.logging.log4j:log4j-core': [
                'org.apache.logging.log4j:log4j-api'
            ]
        }
    
    def create_analysis_report(self, tree: DependencyTree) -> DependencyAnalysisReport:
        """Create a comprehensive analysis report from a dependency tree."""
        report = DependencyAnalysisReport(
            jar_id=tree.jar_id,
            dependency_tree=tree
        )
        
        # Generate summary
        report.generate_summary()
        
        # Add basic recommendations
        recommendations = []
        
        if len(tree.conflicts) > 0:
            recommendations.append("Resolve dependency version conflicts to avoid runtime issues")
        
        if tree.max_depth > 5:
            recommendations.append("Consider reducing dependency depth to improve maintainability")
        
        if tree.total_dependencies > 50:
            recommendations.append("Large number of dependencies detected - consider dependency cleanup")
        
        # Check for test dependencies in compile scope
        test_in_compile = [
            dep for dep in tree.all_dependencies.values()
            if dep.scope == DependencyScope.COMPILE and 
            any(test_keyword in dep.artifact_id.lower() for test_keyword in ['junit', 'test', 'mock'])
        ]
        
        if test_in_compile:
            recommendations.append("Move test dependencies to test scope to reduce runtime footprint")
        
        report.recommendations = recommendations
        
        return report
    
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


# Global service instance
dependency_tree_service = DependencyTreeService()
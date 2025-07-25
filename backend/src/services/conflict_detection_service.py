"""
Dependency Conflict Detection Service
Detects version conflicts and provides resolution recommendations
"""

import re
from typing import Dict, List, Optional, Set, Tuple, Any
import structlog
from dataclasses import dataclass
from enum import Enum
from packaging import version as pkg_version

from .version_extraction_service import VersionInfo, ExtractedVersions
from .dependency_service import Dependency, DependencyAnalysisResult

logger = structlog.get_logger()


class ConflictSeverity(Enum):
    """Severity levels for dependency conflicts."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ConflictType(Enum):
    """Types of dependency conflicts."""
    VERSION_MISMATCH = "version_mismatch"
    DUPLICATE_DEPENDENCY = "duplicate_dependency"
    INCOMPATIBLE_VERSIONS = "incompatible_versions"
    TRANSITIVE_CONFLICT = "transitive_conflict"
    SECURITY_VULNERABILITY = "security_vulnerability"


@dataclass
class ConflictedDependency:
    """Represents a dependency involved in a conflict."""
    name: str
    version: str
    source: str
    source_file: Optional[str] = None
    confidence: float = 1.0


@dataclass
class DependencyConflict:
    """Represents a dependency conflict."""
    conflict_type: ConflictType
    severity: ConflictSeverity
    title: str
    description: str
    conflicted_dependencies: List[ConflictedDependency]
    recommended_version: Optional[str] = None
    resolution_steps: List[str] = None
    impact_assessment: str = ""
    
    def __post_init__(self):
        if self.resolution_steps is None:
            self.resolution_steps = []


@dataclass
class ConflictAnalysisResult:
    """Complete conflict analysis result."""
    conflicts: List[DependencyConflict]
    total_dependencies: int
    conflicted_dependencies: int
    severity_breakdown: Dict[str, int]
    recommendations: List[str]


class ConflictDetectionService:
    """Service for detecting dependency conflicts and providing resolutions."""
    
    def __init__(self):
        self.known_incompatibilities = self._load_known_incompatibilities()
        self.version_compatibility_rules = self._load_compatibility_rules()
        self.security_advisories = self._load_security_advisories()
    
    async def analyze_conflicts(
        self,
        extracted_versions: ExtractedVersions,
        dependency_analysis: DependencyAnalysisResult
    ) -> ConflictAnalysisResult:
        """Perform comprehensive conflict analysis."""
        logger.info("Starting dependency conflict analysis")
        
        conflicts = []
        all_dependencies = self._collect_all_dependencies(
            extracted_versions, dependency_analysis
        )
        
        # Detect different types of conflicts
        version_conflicts = await self._detect_version_conflicts(all_dependencies)
        conflicts.extend(version_conflicts)
        
        duplicate_conflicts = await self._detect_duplicate_dependencies(all_dependencies)
        conflicts.extend(duplicate_conflicts)
        
        incompatibility_conflicts = await self._detect_incompatibilities(all_dependencies)
        conflicts.extend(incompatibility_conflicts)
        
        security_conflicts = await self._detect_security_conflicts(all_dependencies)
        conflicts.extend(security_conflicts)
        
        # Calculate statistics
        conflicted_deps = set()
        for conflict in conflicts:
            for dep in conflict.conflicted_dependencies:
                conflicted_deps.add(dep.name)
        
        severity_breakdown = {
            "low": len([c for c in conflicts if c.severity == ConflictSeverity.LOW]),
            "medium": len([c for c in conflicts if c.severity == ConflictSeverity.MEDIUM]),
            "high": len([c for c in conflicts if c.severity == ConflictSeverity.HIGH]),
            "critical": len([c for c in conflicts if c.severity == ConflictSeverity.CRITICAL])
        }
        
        # Generate general recommendations
        recommendations = await self._generate_recommendations(conflicts, all_dependencies)
        
        logger.info("Conflict analysis completed",
                   total_conflicts=len(conflicts),
                   conflicted_dependencies=len(conflicted_deps))
        
        return ConflictAnalysisResult(
            conflicts=conflicts,
            total_dependencies=len(all_dependencies),
            conflicted_dependencies=len(conflicted_deps),
            severity_breakdown=severity_breakdown,
            recommendations=recommendations
        )
    
    async def _detect_version_conflicts(
        self, dependencies: List[ConflictedDependency]
    ) -> List[DependencyConflict]:
        """Detect version conflicts between dependencies."""
        conflicts = []
        
        # Group dependencies by name
        dep_groups = {}
        for dep in dependencies:
            base_name = self._normalize_dependency_name(dep.name)
            if base_name not in dep_groups:
                dep_groups[base_name] = []
            dep_groups[base_name].append(dep)
        
        # Check for version conflicts within groups
        for dep_name, dep_list in dep_groups.items():
            if len(dep_list) > 1:
                # Check if versions are different
                versions = set(dep.version for dep in dep_list if dep.version)
                if len(versions) > 1:
                    # Determine severity based on version differences
                    severity = await self._assess_version_conflict_severity(
                        dep_name, list(versions)
                    )
                    
                    # Find recommended version
                    recommended_version = await self._find_recommended_version(
                        dep_name, list(versions)
                    )
                    
                    conflict = DependencyConflict(
                        conflict_type=ConflictType.VERSION_MISMATCH,
                        severity=severity,
                        title=f"Version conflict for {dep_name}",
                        description=f"Multiple versions of {dep_name} detected: {', '.join(sorted(versions))}",
                        conflicted_dependencies=dep_list,
                        recommended_version=recommended_version,
                        resolution_steps=await self._generate_version_resolution_steps(
                            dep_name, dep_list, recommended_version
                        ),
                        impact_assessment=await self._assess_version_conflict_impact(
                            dep_name, list(versions)
                        )
                    )
                    conflicts.append(conflict)
        
        return conflicts
    
    async def _detect_duplicate_dependencies(
        self, dependencies: List[ConflictedDependency]
    ) -> List[DependencyConflict]:
        """Detect duplicate dependencies from different sources."""
        conflicts = []
        
        # Group by exact name and version
        exact_matches = {}
        for dep in dependencies:
            key = (dep.name, dep.version)
            if key not in exact_matches:
                exact_matches[key] = []
            exact_matches[key].append(dep)
        
        # Find duplicates
        for (name, version), dep_list in exact_matches.items():
            if len(dep_list) > 1:
                # Check if they come from different sources
                sources = set(dep.source for dep in dep_list)
                if len(sources) > 1:
                    conflict = DependencyConflict(
                        conflict_type=ConflictType.DUPLICATE_DEPENDENCY,
                        severity=ConflictSeverity.LOW,
                        title=f"Duplicate dependency: {name}",
                        description=f"Dependency {name} v{version} found in multiple sources: {', '.join(sources)}",
                        conflicted_dependencies=dep_list,
                        resolution_steps=[
                            "Review dependency sources",
                            "Consolidate to single source if possible",
                            "Verify no functionality differences between sources"
                        ],
                        impact_assessment="Low impact - may cause classpath bloat but typically no functional issues"
                    )
                    conflicts.append(conflict)
        
        return conflicts
    
    async def _detect_incompatibilities(
        self, dependencies: List[ConflictedDependency]
    ) -> List[DependencyConflict]:
        """Detect known incompatibilities between dependencies."""
        conflicts = []
        
        dep_names = set(self._normalize_dependency_name(dep.name) for dep in dependencies)
        
        for incompatibility in self.known_incompatibilities:
            conflicting_deps = []
            for dep_pattern in incompatibility['dependencies']:
                matching_deps = [
                    dep for dep in dependencies
                    if self._matches_pattern(dep.name, dep_pattern)
                ]
                conflicting_deps.extend(matching_deps)
            
            if len(conflicting_deps) >= 2:
                conflict = DependencyConflict(
                    conflict_type=ConflictType.INCOMPATIBLE_VERSIONS,
                    severity=ConflictSeverity(incompatibility['severity']),
                    title=incompatibility['title'],
                    description=incompatibility['description'],
                    conflicted_dependencies=conflicting_deps,
                    resolution_steps=incompatibility['resolution_steps'],
                    impact_assessment=incompatibility['impact']
                )
                conflicts.append(conflict)
        
        return conflicts
    
    async def _detect_security_conflicts(
        self, dependencies: List[ConflictedDependency]
    ) -> List[DependencyConflict]:
        """Detect security vulnerabilities in dependencies."""
        conflicts = []
        
        for dep in dependencies:
            for advisory in self.security_advisories:
                if self._matches_pattern(dep.name, advisory['dependency_pattern']):
                    if dep.version and self._is_vulnerable_version(
                        dep.version, advisory['vulnerable_versions']
                    ):
                        conflict = DependencyConflict(
                            conflict_type=ConflictType.SECURITY_VULNERABILITY,
                            severity=ConflictSeverity(advisory['severity']),
                            title=f"Security vulnerability in {dep.name}",
                            description=f"{advisory['description']} (CVE: {advisory.get('cve', 'N/A')})",
                            conflicted_dependencies=[dep],
                            recommended_version=advisory.get('fixed_version'),
                            resolution_steps=[
                                f"Update {dep.name} to version {advisory.get('fixed_version', 'latest')} or later",
                                "Review security advisory for additional mitigation steps",
                                "Test application thoroughly after update"
                            ],
                            impact_assessment=advisory['impact']
                        )
                        conflicts.append(conflict)
        
        return conflicts
    
    def _collect_all_dependencies(
        self,
        extracted_versions: ExtractedVersions,
        dependency_analysis: DependencyAnalysisResult
    ) -> List[ConflictedDependency]:
        """Collect all dependencies from analysis results."""
        dependencies = []
        
        # Add from version extraction
        for version_info in extracted_versions.versions:
            dep = ConflictedDependency(
                name=version_info.name,
                version=version_info.version or "unknown",
                source=version_info.source,
                source_file=version_info.source_file,
                confidence=version_info.confidence
            )
            dependencies.append(dep)
        
        # Add from dependency analysis
        for dependency in dependency_analysis.dependencies:
            dep = ConflictedDependency(
                name=dependency.name,
                version=dependency.version or "unknown",
                source=dependency.dependency_type.value,
                source_file=dependency.source_file,
                confidence=1.0
            )
            dependencies.append(dep)
        
        return dependencies
    
    def _normalize_dependency_name(self, name: str) -> str:
        """Normalize dependency name for comparison."""
        # Remove version suffixes and normalize format
        name = re.sub(r'-\d+(\.\d+)*.*$', '', name)  # Remove version suffix
        name = name.replace('_', '-').lower()  # Normalize separators
        
        # Handle Maven group:artifact format
        if ':' in name:
            parts = name.split(':')
            if len(parts) >= 2:
                return f"{parts[0]}:{parts[1]}"
        
        return name
    
    async def _assess_version_conflict_severity(
        self, dep_name: str, versions: List[str]
    ) -> ConflictSeverity:
        """Assess the severity of a version conflict."""
        try:
            # Parse versions and check differences
            parsed_versions = []
            for v in versions:
                try:
                    parsed_versions.append(pkg_version.parse(v))
                except Exception:
                    continue
            
            if len(parsed_versions) < 2:
                return ConflictSeverity.LOW
            
            # Sort versions
            parsed_versions.sort()
            oldest = parsed_versions[0]
            newest = parsed_versions[-1]
            
            # Check major version differences
            if hasattr(oldest, 'major') and hasattr(newest, 'major'):
                if newest.major - oldest.major >= 2:
                    return ConflictSeverity.HIGH
                elif newest.major - oldest.major == 1:
                    return ConflictSeverity.MEDIUM
            
            return ConflictSeverity.LOW
            
        except Exception:
            return ConflictSeverity.MEDIUM
    
    async def _find_recommended_version(
        self, dep_name: str, versions: List[str]
    ) -> Optional[str]:
        """Find the recommended version to resolve conflicts."""
        try:
            # Parse and sort versions
            version_pairs = []
            for v in versions:
                try:
                    parsed = pkg_version.parse(v)
                    version_pairs.append((v, parsed))
                except Exception:
                    continue
            
            if not version_pairs:
                return None
            
            # Sort by parsed version (newest first)
            version_pairs.sort(key=lambda x: x[1], reverse=True)
            
            # Return the newest stable version
            for original, parsed in version_pairs:
                if not parsed.is_prerelease:
                    return original
            
            # If no stable version, return the newest
            return version_pairs[0][0]
            
        except Exception:
            return None
    
    async def _generate_version_resolution_steps(
        self, dep_name: str, conflicted_deps: List[ConflictedDependency], 
        recommended_version: Optional[str]
    ) -> List[str]:
        """Generate resolution steps for version conflicts."""
        steps = []
        
        if recommended_version:
            steps.append(f"Update all instances of {dep_name} to version {recommended_version}")
        else:
            steps.append(f"Choose a single version for {dep_name} across all sources")
        
        # Add source-specific steps
        sources = set(dep.source for dep in conflicted_deps)
        if "Maven POM" in sources:
            steps.append("Update version in pom.xml dependency management section")
        if "Gradle Dependency" in sources:
            steps.append("Update version in build.gradle dependencies block")
        if "MANIFEST.MF" in sources:
            steps.append("Update version in MANIFEST.MF if manually managed")
        
        steps.extend([
            "Run dependency resolution to check for transitive conflicts",
            "Test application functionality after version update",
            "Update documentation to reflect version changes"
        ])
        
        return steps
    
    async def _assess_version_conflict_impact(
        self, dep_name: str, versions: List[str]
    ) -> str:
        """Assess the impact of version conflicts."""
        try:
            parsed_versions = []
            for v in versions:
                try:
                    parsed_versions.append(pkg_version.parse(v))
                except Exception:
                    continue
            
            if len(parsed_versions) < 2:
                return "Low impact - minimal version differences"
            
            parsed_versions.sort()
            oldest = parsed_versions[0]
            newest = parsed_versions[-1]
            
            if hasattr(oldest, 'major') and hasattr(newest, 'major'):
                major_diff = newest.major - oldest.major
                if major_diff >= 2:
                    return "High impact - major version differences may cause API incompatibilities"
                elif major_diff == 1:
                    return "Medium impact - major version change may introduce breaking changes"
            
            return "Low to medium impact - minor version differences, review changelog for breaking changes"
            
        except Exception:
            return "Unknown impact - unable to parse version information"
    
    def _matches_pattern(self, name: str, pattern: str) -> bool:
        """Check if dependency name matches a pattern."""
        # Simple pattern matching - could be enhanced with regex
        normalized_name = self._normalize_dependency_name(name)
        normalized_pattern = pattern.lower()
        
        return (normalized_pattern in normalized_name or 
                normalized_name.startswith(normalized_pattern) or
                normalized_name.endswith(normalized_pattern))
    
    def _is_vulnerable_version(self, version: str, vulnerable_ranges: List[str]) -> bool:
        """Check if version is in vulnerable range."""
        try:
            parsed_version = pkg_version.parse(version)
            
            for range_spec in vulnerable_ranges:
                # Simple range checking - could be enhanced
                if '<' in range_spec:
                    max_version = pkg_version.parse(range_spec.replace('<', '').strip())
                    if parsed_version < max_version:
                        return True
                elif '=' in range_spec:
                    exact_version = pkg_version.parse(range_spec.replace('=', '').strip())
                    if parsed_version == exact_version:
                        return True
            
            return False
            
        except Exception:
            return False
    
    async def _generate_recommendations(
        self, conflicts: List[DependencyConflict], 
        all_dependencies: List[ConflictedDependency]
    ) -> List[str]:
        """Generate general recommendations for conflict resolution."""
        recommendations = []
        
        if not conflicts:
            recommendations.append("✅ No dependency conflicts detected")
            return recommendations
        
        # Count conflicts by severity
        critical_count = len([c for c in conflicts if c.severity == ConflictSeverity.CRITICAL])
        high_count = len([c for c in conflicts if c.severity == ConflictSeverity.HIGH])
        medium_count = len([c for c in conflicts if c.severity == ConflictSeverity.MEDIUM])
        
        if critical_count > 0:
            recommendations.append(f"🚨 Address {critical_count} critical security vulnerabilities immediately")
        
        if high_count > 0:
            recommendations.append(f"⚠️ Resolve {high_count} high-severity conflicts to prevent runtime issues")
        
        if medium_count > 0:
            recommendations.append(f"📋 Review {medium_count} medium-severity conflicts for optimization")
        
        # General recommendations
        recommendations.extend([
            "🔍 Use dependency management tools to enforce consistent versions",
            "📚 Maintain a centralized dependency version catalog",
            "🧪 Implement automated dependency vulnerability scanning",
            "📊 Regular dependency audits and updates",
            "🔒 Subscribe to security advisories for critical dependencies"
        ])
        
        return recommendations
    
    def _load_known_incompatibilities(self) -> List[Dict[str, Any]]:
        """Load known dependency incompatibilities."""
        return [
            {
                'dependencies': ['log4j-core', 'logback-classic'],
                'title': 'Logging Framework Conflict',
                'description': 'Multiple logging frameworks detected - may cause configuration conflicts',
                'severity': 'medium',
                'resolution_steps': [
                    'Choose a single logging framework',
                    'Use SLF4J as facade with single implementation',
                    'Remove conflicting logging dependencies'
                ],
                'impact': 'May cause logging configuration issues and performance overhead'
            },
            {
                'dependencies': ['spring-boot-starter-web', 'spring-webmvc'],
                'title': 'Spring Web Dependency Conflict',
                'description': 'Conflicting Spring web dependencies detected',
                'severity': 'high',
                'resolution_steps': [
                    'Use Spring Boot starters instead of individual dependencies',
                    'Remove redundant spring-webmvc if using spring-boot-starter-web'
                ],
                'impact': 'May cause Spring context initialization failures'
            }
        ]
    
    def _load_compatibility_rules(self) -> Dict[str, Any]:
        """Load version compatibility rules."""
        return {
            'spring-framework': {
                'compatible_ranges': {
                    '5.x': ['5.0', '5.1', '5.2', '5.3'],
                    '6.x': ['6.0', '6.1']
                }
            }
        }
    
    def _load_security_advisories(self) -> List[Dict[str, Any]]:
        """Load security advisory database."""
        return [
            {
                'dependency_pattern': 'log4j-core',
                'vulnerable_versions': ['< 2.17.0'],
                'cve': 'CVE-2021-44228',
                'severity': 'critical',
                'description': 'Log4j Remote Code Execution vulnerability (Log4Shell)',
                'fixed_version': '2.17.0',
                'impact': 'Critical - Remote code execution possible'
            },
            {
                'dependency_pattern': 'jackson-databind',
                'vulnerable_versions': ['< 2.13.4'],
                'cve': 'CVE-2022-42003',
                'severity': 'high',
                'description': 'Jackson deserialization vulnerability',
                'fixed_version': '2.13.4',
                'impact': 'High - Potential for remote code execution through deserialization'
            },
            {
                'dependency_pattern': 'spring-core',
                'vulnerable_versions': ['< 5.3.21'],
                'cve': 'CVE-2022-22965',
                'severity': 'critical',
                'description': 'Spring Framework RCE vulnerability (Spring4Shell)',
                'fixed_version': '5.3.21',
                'impact': 'Critical - Remote code execution in specific configurations'
            }
        ]


# Global service instance
conflict_detection_service = ConflictDetectionService()

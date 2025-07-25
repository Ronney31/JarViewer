"""
Dependency Search and Filtering Service
Provides search indexing and filtering capabilities for dependency trees
"""

import re
from typing import Dict, List, Set, Optional, Any, Tuple
from enum import Enum
import structlog
from collections import defaultdict

from ..models.jar import (
    DependencyNode, DependencyTree, DependencyConflict,
    DependencyScope, DependencySource, ConflictSeverity
)

logger = structlog.get_logger()


class SearchField(str, Enum):
    """Fields that can be searched."""
    NAME = "name"
    GROUP_ID = "group_id"
    ARTIFACT_ID = "artifact_id"
    VERSION = "version"
    DESCRIPTION = "description"
    ALL = "all"


class FilterType(str, Enum):
    """Types of filters that can be applied."""
    SCOPE = "scope"
    SOURCE = "source"
    CONFLICT_STATUS = "conflict_status"
    CONFLICT_SEVERITY = "conflict_severity"
    DEPTH = "depth"
    TRANSITIVE = "transitive"


class SearchResult:
    """Represents a search result with highlighting."""
    
    def __init__(self, dependency: DependencyNode, matches: List[Dict[str, Any]], score: float):
        self.dependency = dependency
        self.matches = matches  # List of {field: str, match: str, position: int}
        self.score = score
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "dependency": self.dependency.model_dump(),
            "matches": self.matches,
            "score": self.score
        }


class DependencySearchService:
    """Service for searching and filtering dependency trees."""
    
    def __init__(self):
        self.search_cache: Dict[str, List[SearchResult]] = {}
        self.index_cache: Dict[str, Dict[str, Set[str]]] = {}
    
    def build_search_index(self, tree: DependencyTree) -> Dict[str, Set[str]]:
        """
        Build search index for fast dependency lookup.
        
        Args:
            tree: Dependency tree to index
            
        Returns:
            Search index mapping terms to dependency IDs
        """
        logger.info("Building search index", jar_id=tree.jar_id, total_deps=tree.total_dependencies)
        
        # Check cache first
        cache_key = f"{tree.jar_id}_{tree.total_dependencies}"
        if cache_key in self.index_cache:
            return self.index_cache[cache_key]
        
        index = defaultdict(set)
        
        for dep_id, dependency in tree.all_dependencies.items():
            # Index searchable fields
            searchable_terms = []
            
            # Add basic fields
            if dependency.group_id:
                searchable_terms.extend(self._tokenize(dependency.group_id))
            if dependency.artifact_id:
                searchable_terms.extend(self._tokenize(dependency.artifact_id))
            if dependency.version:
                searchable_terms.extend(self._tokenize(dependency.version))
            if dependency.description:
                searchable_terms.extend(self._tokenize(dependency.description))
            
            # Add composite terms
            searchable_terms.append(dependency.name.lower())  # group:artifact
            searchable_terms.append(dependency.coordinate.lower())  # group:artifact:version
            
            # Add scope and source
            searchable_terms.append(dependency.scope.value.lower())
            searchable_terms.append(dependency.source.value.lower())
            
            # Add conflict status terms
            if dependency.has_conflicts:
                searchable_terms.append("conflict")
                searchable_terms.append("conflicts")
                if dependency.conflict_severity:
                    searchable_terms.append(dependency.conflict_severity.value.lower())
            
            # Add transitive status
            if dependency.is_transitive:
                searchable_terms.append("transitive")
            else:
                searchable_terms.append("direct")
            
            # Index all terms
            for term in searchable_terms:
                if term:
                    index[term.lower()].add(dep_id)
        
        # Cache the index
        self.index_cache[cache_key] = dict(index)
        
        logger.info("Search index built", 
                   jar_id=tree.jar_id, 
                   indexed_terms=len(index),
                   total_deps=tree.total_dependencies)
        
        return dict(index)
    
    def search_dependencies(
        self,
        tree: DependencyTree,
        query: str,
        fields: List[SearchField] = None,
        max_results: int = 100,
        highlight: bool = True
    ) -> List[SearchResult]:
        """
        Search dependencies with result highlighting.
        
        Args:
            tree: Dependency tree to search
            query: Search query string
            fields: Fields to search in (default: all)
            max_results: Maximum number of results
            highlight: Whether to highlight matches
            
        Returns:
            List of search results with scores and highlighting
        """
        if not query.strip():
            return []
        
        logger.info("Searching dependencies", 
                   jar_id=tree.jar_id, 
                   query=query, 
                   fields=fields)
        
        # Check cache
        cache_key = f"{tree.jar_id}_{query}_{fields}_{max_results}"
        if cache_key in self.search_cache:
            return self.search_cache[cache_key]
        
        if fields is None:
            fields = [SearchField.ALL]
        
        # Build search index if not cached
        search_index = self.build_search_index(tree)
        
        # Find matching dependencies
        matching_deps = self._find_matching_dependencies(tree, query, fields, search_index)
        
        # Score and rank results
        results = []
        for dep_id, matches in matching_deps.items():
            dependency = tree.all_dependencies[dep_id]
            score = self._calculate_relevance_score(dependency, query, matches)
            
            if highlight:
                highlighted_matches = self._highlight_matches(dependency, query, matches)
            else:
                highlighted_matches = matches
            
            results.append(SearchResult(dependency, highlighted_matches, score))
        
        # Sort by score (descending)
        results.sort(key=lambda x: x.score, reverse=True)
        
        # Limit results
        results = results[:max_results]
        
        # Cache results
        self.search_cache[cache_key] = results
        
        logger.info("Search completed", 
                   jar_id=tree.jar_id, 
                   query=query, 
                   results_count=len(results))
        
        return results
    
    def filter_dependencies(
        self,
        tree: DependencyTree,
        filters: Dict[FilterType, Any]
    ) -> List[DependencyNode]:
        """
        Filter dependencies based on various criteria.
        
        Args:
            tree: Dependency tree to filter
            filters: Dictionary of filter type to filter value
            
        Returns:
            List of filtered dependency nodes
        """
        logger.info("Filtering dependencies", 
                   jar_id=tree.jar_id, 
                   filters=filters)
        
        filtered_deps = list(tree.all_dependencies.values())
        
        for filter_type, filter_value in filters.items():
            filtered_deps = self._apply_filter(filtered_deps, filter_type, filter_value)
        
        logger.info("Filtering completed", 
                   jar_id=tree.jar_id, 
                   original_count=tree.total_dependencies,
                   filtered_count=len(filtered_deps))
        
        return filtered_deps
    
    def search_and_filter(
        self,
        tree: DependencyTree,
        query: Optional[str] = None,
        fields: List[SearchField] = None,
        filters: Dict[FilterType, Any] = None,
        max_results: int = 100
    ) -> List[SearchResult]:
        """
        Combined search and filter operation.
        
        Args:
            tree: Dependency tree to search and filter
            query: Search query (optional)
            fields: Fields to search in
            filters: Filters to apply
            max_results: Maximum number of results
            
        Returns:
            List of search results matching query and filters
        """
        # Start with all dependencies
        candidates = list(tree.all_dependencies.values())
        
        # Apply filters first
        if filters:
            candidates = self.filter_dependencies(tree, filters)
        
        # If no search query, return filtered results as SearchResults
        if not query or not query.strip():
            results = []
            for dep in candidates[:max_results]:
                results.append(SearchResult(dep, [], 1.0))
            return results
        
        # Create temporary tree with filtered candidates for search
        temp_tree = DependencyTree(jar_id=tree.jar_id)
        for dep in candidates:
            temp_tree.all_dependencies[dep.id] = dep
        temp_tree.total_dependencies = len(candidates)
        
        # Perform search on filtered candidates
        return self.search_dependencies(temp_tree, query, fields, max_results)
    
    def clear_cache(self, jar_id: Optional[str] = None) -> None:
        """Clear search cache for specific JAR or all JARs."""
        if jar_id:
            # Clear cache entries for specific JAR
            keys_to_remove = [k for k in self.search_cache.keys() if k.startswith(jar_id)]
            for key in keys_to_remove:
                del self.search_cache[key]
            
            keys_to_remove = [k for k in self.index_cache.keys() if k.startswith(jar_id)]
            for key in keys_to_remove:
                del self.index_cache[key]
        else:
            # Clear all cache
            self.search_cache.clear()
            self.index_cache.clear()
    
    # Private helper methods
    
    def _tokenize(self, text: str) -> List[str]:
        """Tokenize text for search indexing."""
        if not text:
            return []
        
        # Split on common delimiters
        tokens = re.split(r'[.\-_:;,\s]+', text.lower())
        
        # Filter out empty tokens and very short ones
        tokens = [t for t in tokens if len(t) > 1]
        
        return tokens
    
    def _find_matching_dependencies(
        self,
        tree: DependencyTree,
        query: str,
        fields: List[SearchField],
        search_index: Dict[str, Set[str]]
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Find dependencies matching the search query."""
        query_lower = query.lower()
        query_tokens = self._tokenize(query)
        
        matching_deps = defaultdict(list)
        
        # Direct term matching using index
        for token in query_tokens:
            if token in search_index:
                for dep_id in search_index[token]:
                    matching_deps[dep_id].append({
                        "field": "indexed",
                        "match": token,
                        "type": "token"
                    })
        
        # Field-specific matching
        for dep_id, dependency in tree.all_dependencies.items():
            field_matches = []
            
            if SearchField.ALL in fields or SearchField.GROUP_ID in fields:
                if dependency.group_id and query_lower in dependency.group_id.lower():
                    field_matches.append({
                        "field": "group_id",
                        "match": query,
                        "type": "substring"
                    })
            
            if SearchField.ALL in fields or SearchField.ARTIFACT_ID in fields:
                if dependency.artifact_id and query_lower in dependency.artifact_id.lower():
                    field_matches.append({
                        "field": "artifact_id", 
                        "match": query,
                        "type": "substring"
                    })
            
            if SearchField.ALL in fields or SearchField.VERSION in fields:
                if dependency.version and query_lower in dependency.version.lower():
                    field_matches.append({
                        "field": "version",
                        "match": query,
                        "type": "substring"
                    })
            
            if SearchField.ALL in fields or SearchField.NAME in fields:
                if query_lower in dependency.name.lower():
                    field_matches.append({
                        "field": "name",
                        "match": query,
                        "type": "substring"
                    })
            
            if SearchField.ALL in fields or SearchField.DESCRIPTION in fields:
                if dependency.description and query_lower in dependency.description.lower():
                    field_matches.append({
                        "field": "description",
                        "match": query,
                        "type": "substring"
                    })
            
            if field_matches:
                matching_deps[dep_id].extend(field_matches)
        
        return dict(matching_deps)
    
    def _calculate_relevance_score(
        self,
        dependency: DependencyNode,
        query: str,
        matches: List[Dict[str, Any]]
    ) -> float:
        """Calculate relevance score for search result."""
        base_score = len(matches)
        
        # Boost for exact matches
        query_lower = query.lower()
        if dependency.artifact_id and dependency.artifact_id.lower() == query_lower:
            base_score += 10
        elif dependency.name.lower() == query_lower:
            base_score += 8
        elif dependency.group_id and dependency.group_id.lower() == query_lower:
            base_score += 6
        
        # Boost for direct dependencies
        if not dependency.is_transitive:
            base_score += 2
        
        # Penalty for conflicts
        if dependency.has_conflicts:
            base_score -= 1
        
        return float(base_score)
    
    def _highlight_matches(
        self,
        dependency: DependencyNode,
        query: str,
        matches: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Add highlighting information to matches."""
        highlighted = []
        query_lower = query.lower()
        
        for match in matches:
            field = match["field"]
            highlighted_match = dict(match)
            
            # Get field value
            field_value = ""
            if field == "group_id":
                field_value = dependency.group_id or ""
            elif field == "artifact_id":
                field_value = dependency.artifact_id or ""
            elif field == "version":
                field_value = dependency.version or ""
            elif field == "name":
                field_value = dependency.name
            elif field == "description":
                field_value = dependency.description or ""
            
            # Find match positions
            if field_value and query_lower in field_value.lower():
                start_pos = field_value.lower().find(query_lower)
                highlighted_match["start_position"] = start_pos
                highlighted_match["end_position"] = start_pos + len(query)
                highlighted_match["field_value"] = field_value
            
            highlighted.append(highlighted_match)
        
        return highlighted
    
    def _apply_filter(
        self,
        dependencies: List[DependencyNode],
        filter_type: FilterType,
        filter_value: Any
    ) -> List[DependencyNode]:
        """Apply a single filter to the dependency list."""
        if filter_type == FilterType.SCOPE:
            if isinstance(filter_value, list):
                scopes = [DependencyScope(s) for s in filter_value if s in [scope.value for scope in DependencyScope]]
                return [dep for dep in dependencies if dep.scope in scopes]
            else:
                scope = DependencyScope(filter_value) if filter_value in [s.value for s in DependencyScope] else None
                return [dep for dep in dependencies if dep.scope == scope] if scope else dependencies
        
        elif filter_type == FilterType.SOURCE:
            if isinstance(filter_value, list):
                sources = [DependencySource(s) for s in filter_value if s in [src.value for src in DependencySource]]
                return [dep for dep in dependencies if dep.source in sources]
            else:
                source = DependencySource(filter_value) if filter_value in [s.value for s in DependencySource] else None
                return [dep for dep in dependencies if dep.source == source] if source else dependencies
        
        elif filter_type == FilterType.CONFLICT_STATUS:
            has_conflicts = bool(filter_value)
            return [dep for dep in dependencies if dep.has_conflicts == has_conflicts]
        
        elif filter_type == FilterType.CONFLICT_SEVERITY:
            if isinstance(filter_value, list):
                severities = [ConflictSeverity(s) for s in filter_value if s in [sev.value for sev in ConflictSeverity]]
                return [dep for dep in dependencies if dep.conflict_severity in severities]
            else:
                severity = ConflictSeverity(filter_value) if filter_value in [s.value for s in ConflictSeverity] else None
                return [dep for dep in dependencies if dep.conflict_severity == severity] if severity else dependencies
        
        elif filter_type == FilterType.DEPTH:
            if isinstance(filter_value, dict):
                min_depth = filter_value.get("min", 0)
                max_depth = filter_value.get("max", float('inf'))
                return [dep for dep in dependencies if min_depth <= dep.depth <= max_depth]
            else:
                depth = int(filter_value)
                return [dep for dep in dependencies if dep.depth == depth]
        
        elif filter_type == FilterType.TRANSITIVE:
            is_transitive = bool(filter_value)
            return [dep for dep in dependencies if dep.is_transitive == is_transitive]
        
        return dependencies


# Global service instance
dependency_search_service = DependencySearchService()

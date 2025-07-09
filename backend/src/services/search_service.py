"""
Advanced Search Service
Provides comprehensive search functionality for JAR files
"""

import re
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import structlog
from dataclasses import dataclass
from enum import Enum

from ..models.jar import FileNode, SearchResult
from ..core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


class SearchType(Enum):
    """Types of search operations."""
    FILENAME = "filename"
    CONTENT = "content"
    REGEX = "regex"
    COMBINED = "combined"


@dataclass
class SearchMatch:
    """Represents a search match within a file."""
    line_number: int
    line_content: str
    match_start: int
    match_end: int
    context_before: List[str]
    context_after: List[str]


@dataclass
class AdvancedSearchResult:
    """Enhanced search result with detailed match information."""
    file: FileNode
    search_type: SearchType
    matches: List[SearchMatch]
    score: float
    total_matches: int
    file_content_preview: Optional[str] = None


class AdvancedSearchService:
    """Service for advanced search operations on JAR files."""
    
    def __init__(self):
        self.search_cache: Dict[str, List[AdvancedSearchResult]] = {}
        self.max_cache_size = 50
        self.max_file_size_for_content_search = 1024 * 1024  # 1MB
        self.context_lines = 2
    
    async def search_jar(
        self,
        jar_temp_path: Path,
        file_structure: List[FileNode],
        query: str,
        search_type: SearchType = SearchType.COMBINED,
        case_sensitive: bool = False,
        max_results: int = 100,
        include_binary: bool = False
    ) -> List[AdvancedSearchResult]:
        """
        Perform advanced search across JAR contents.
        
        Args:
            jar_temp_path: Path to extracted JAR contents
            file_structure: File structure tree
            query: Search query
            search_type: Type of search to perform
            case_sensitive: Whether search should be case sensitive
            max_results: Maximum number of results to return
            include_binary: Whether to include binary files in search
            
        Returns:
            List of advanced search results
        """
        cache_key = f"{query}_{search_type.value}_{case_sensitive}_{include_binary}"
        
        # Check cache
        if cache_key in self.search_cache:
            logger.info("Returning cached search results", query=query)
            return self.search_cache[cache_key][:max_results]
        
        logger.info("Starting advanced search", 
                   query=query, 
                   search_type=search_type.value,
                   case_sensitive=case_sensitive)
        
        results = []
        
        # Collect all files from structure
        all_files = self._collect_files(file_structure)
        
        # Filter files based on search criteria
        searchable_files = self._filter_searchable_files(all_files, include_binary)
        
        # Perform search based on type
        if search_type in [SearchType.FILENAME, SearchType.COMBINED]:
            filename_results = await self._search_filenames(
                searchable_files, query, case_sensitive
            )
            results.extend(filename_results)
        
        if search_type in [SearchType.CONTENT, SearchType.REGEX, SearchType.COMBINED]:
            content_results = await self._search_content(
                jar_temp_path, searchable_files, query, search_type, case_sensitive
            )
            results.extend(content_results)
        
        # Sort by relevance score
        results.sort(key=lambda x: x.score, reverse=True)
        
        # Limit results
        results = results[:max_results]
        
        # Cache results
        self._cache_results(cache_key, results)
        
        logger.info("Advanced search completed", 
                   query=query, 
                   results_count=len(results))
        
        return results
    
    def _collect_files(self, nodes: List[FileNode]) -> List[FileNode]:
        """Recursively collect all files from the structure."""
        files = []
        
        for node in nodes:
            if node.type == "file":
                files.append(node)
            elif node.type == "directory" and node.children:
                files.extend(self._collect_files(node.children))
        
        return files
    
    def _filter_searchable_files(
        self, 
        files: List[FileNode], 
        include_binary: bool
    ) -> List[FileNode]:
        """Filter files that can be searched."""
        searchable = []
        
        text_extensions = {
            '.java', '.class', '.xml', '.properties', '.txt', '.md', 
            '.json', '.yml', '.yaml', '.sql', '.js', '.ts', '.css', 
            '.html', '.htm', '.jsp', '.jspx', '.ftl', '.vm'
        }
        
        for file in files:
            # Always include text files
            if file.extension and file.extension.lower() in text_extensions:
                searchable.append(file)
            # Include binary files if requested and they're not too large
            elif include_binary and (file.size or 0) < self.max_file_size_for_content_search:
                searchable.append(file)
            # Include files without extension if they're small (likely text)
            elif not file.extension and (file.size or 0) < 10240:  # 10KB
                searchable.append(file)
        
        return searchable
    
    async def _search_filenames(
        self, 
        files: List[FileNode], 
        query: str, 
        case_sensitive: bool
    ) -> List[AdvancedSearchResult]:
        """Search in filenames."""
        results = []
        search_query = query if case_sensitive else query.lower()
        
        for file in files:
            filename = file.name if case_sensitive else file.name.lower()
            
            if search_query in filename:
                # Calculate relevance score
                score = self._calculate_filename_score(file.name, query, case_sensitive)
                
                # Create match information
                match = SearchMatch(
                    line_number=0,
                    line_content=file.name,
                    match_start=filename.find(search_query),
                    match_end=filename.find(search_query) + len(search_query),
                    context_before=[],
                    context_after=[]
                )
                
                result = AdvancedSearchResult(
                    file=file,
                    search_type=SearchType.FILENAME,
                    matches=[match],
                    score=score,
                    total_matches=1
                )
                
                results.append(result)
        
        return results
    
    async def _search_content(
        self,
        jar_temp_path: Path,
        files: List[FileNode],
        query: str,
        search_type: SearchType,
        case_sensitive: bool
    ) -> List[AdvancedSearchResult]:
        """Search within file contents."""
        results = []
        
        # Prepare regex pattern if needed
        if search_type == SearchType.REGEX:
            try:
                pattern = re.compile(query, 0 if case_sensitive else re.IGNORECASE)
            except re.error as e:
                logger.error("Invalid regex pattern", query=query, error=str(e))
                return results
        else:
            pattern = None
        
        # Process files in batches to avoid overwhelming the system
        batch_size = 10
        for i in range(0, len(files), batch_size):
            batch = files[i:i + batch_size]
            batch_results = await self._process_file_batch(
                jar_temp_path, batch, query, search_type, case_sensitive, pattern
            )
            results.extend(batch_results)
            
            # Yield control to allow other operations
            await asyncio.sleep(0)
        
        return results
    
    async def _process_file_batch(
        self,
        jar_temp_path: Path,
        files: List[FileNode],
        query: str,
        search_type: SearchType,
        case_sensitive: bool,
        pattern: Optional[re.Pattern]
    ) -> List[AdvancedSearchResult]:
        """Process a batch of files for content search."""
        results = []
        
        for file in files:
            try:
                file_path = jar_temp_path / file.path
                
                # Skip if file doesn't exist or is too large
                if not file_path.exists() or (file.size or 0) > self.max_file_size_for_content_search:
                    continue
                
                # Read file content
                content = await self._read_file_safely(file_path)
                if content is None:
                    continue
                
                # Search within content
                matches = self._find_content_matches(
                    content, query, search_type, case_sensitive, pattern
                )
                
                if matches:
                    score = self._calculate_content_score(matches, len(content))
                    
                    result = AdvancedSearchResult(
                        file=file,
                        search_type=search_type,
                        matches=matches,
                        score=score,
                        total_matches=len(matches),
                        file_content_preview=content[:500] if len(content) > 500 else content
                    )
                    
                    results.append(result)
                    
            except Exception as e:
                logger.warning("Error searching file content", 
                              file_path=file.path, error=str(e))
                continue
        
        return results
    
    async def _read_file_safely(self, file_path: Path) -> Optional[str]:
        """Safely read file content with encoding detection."""
        try:
            # Try UTF-8 first
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except UnicodeDecodeError:
            try:
                # Try latin-1 as fallback
                with open(file_path, 'r', encoding='latin-1') as f:
                    return f.read()
            except Exception:
                # Skip binary files
                return None
        except Exception as e:
            logger.warning("Failed to read file", file_path=str(file_path), error=str(e))
            return None
    
    def _find_content_matches(
        self,
        content: str,
        query: str,
        search_type: SearchType,
        case_sensitive: bool,
        pattern: Optional[re.Pattern]
    ) -> List[SearchMatch]:
        """Find matches within file content."""
        matches = []
        lines = content.split('\n')
        
        for line_num, line in enumerate(lines, 1):
            line_matches = []
            
            if search_type == SearchType.REGEX and pattern:
                # Regex search
                for match in pattern.finditer(line):
                    line_matches.append((match.start(), match.end()))
            else:
                # Simple text search
                search_line = line if case_sensitive else line.lower()
                search_query = query if case_sensitive else query.lower()
                
                start = 0
                while True:
                    pos = search_line.find(search_query, start)
                    if pos == -1:
                        break
                    line_matches.append((pos, pos + len(search_query)))
                    start = pos + 1
            
            # Create SearchMatch objects for each match in this line
            for match_start, match_end in line_matches:
                # Get context lines
                context_before = []
                context_after = []
                
                for i in range(max(0, line_num - self.context_lines), line_num - 1):
                    if i < len(lines):
                        context_before.append(lines[i])
                
                for i in range(line_num, min(len(lines), line_num + self.context_lines)):
                    if i < len(lines):
                        context_after.append(lines[i])
                
                match = SearchMatch(
                    line_number=line_num,
                    line_content=line,
                    match_start=match_start,
                    match_end=match_end,
                    context_before=context_before,
                    context_after=context_after
                )
                
                matches.append(match)
        
        return matches
    
    def _calculate_filename_score(self, filename: str, query: str, case_sensitive: bool) -> float:
        """Calculate relevance score for filename matches."""
        search_filename = filename if case_sensitive else filename.lower()
        search_query = query if case_sensitive else query.lower()
        
        # Exact match gets highest score
        if search_filename == search_query:
            return 1.0
        
        # Starts with query gets high score
        if search_filename.startswith(search_query):
            return 0.8
        
        # Contains query gets medium score
        if search_query in search_filename:
            # Score based on how much of the filename is the query
            return 0.5 + (len(search_query) / len(filename)) * 0.3
        
        return 0.1
    
    def _calculate_content_score(self, matches: List[SearchMatch], content_length: int) -> float:
        """Calculate relevance score for content matches."""
        if not matches:
            return 0.0
        
        # Base score from number of matches
        match_score = min(len(matches) / 10.0, 1.0)  # Cap at 10 matches
        
        # Bonus for matches in smaller files (more relevant)
        size_bonus = max(0.1, 1.0 - (content_length / 10000))  # Bonus for files < 10KB
        
        return match_score * 0.7 + size_bonus * 0.3
    
    def _cache_results(self, cache_key: str, results: List[AdvancedSearchResult]) -> None:
        """Cache search results with size limit."""
        if len(self.search_cache) >= self.max_cache_size:
            # Remove oldest entry (simple FIFO)
            oldest_key = next(iter(self.search_cache))
            del self.search_cache[oldest_key]
        
        self.search_cache[cache_key] = results
    
    def clear_cache(self) -> None:
        """Clear the search cache."""
        self.search_cache.clear()
        logger.info("Search cache cleared")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return {
            "cache_size": len(self.search_cache),
            "max_cache_size": self.max_cache_size,
            "cached_queries": list(self.search_cache.keys())
        }


# Global service instance
advanced_search_service = AdvancedSearchService()

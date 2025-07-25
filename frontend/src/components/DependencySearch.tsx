import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FunnelIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CubeIcon,
  LinkIcon
} from '@heroicons/react/24/outline';
import { SearchFilters, DependencyNode, DependencyTree } from '@/stores/singleJarDashboardStore';

interface DependencySearchProps {
  searchQuery: string;
  filters: SearchFilters;
  dependencyTree: DependencyTree;
  searchResults: DependencyNode[];
  onSearchChange: (query: string) => void;
  onFiltersChange: (filters: SearchFilters) => void;
  onDependencySelect: (dependencyId: string) => void;
  className?: string;
}

const DependencySearch: React.FC<DependencySearchProps> = ({
  searchQuery,
  filters,
  dependencyTree,
  searchResults,
  onSearchChange,
  onFiltersChange,
  onDependencySelect,
  className = ''
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [focusedResultIndex, setFocusedResultIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Handle search input changes with real-time filtering
  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    onSearchChange(query);
    setShowResults(query.trim().length > 0);
    setFocusedResultIndex(-1);
  }, [onSearchChange]);

  // Handle search input focus
  const handleSearchFocus = useCallback(() => {
    if (searchQuery.trim().length > 0) {
      setShowResults(true);
    }
  }, [searchQuery]);

  // Handle search input blur (with delay to allow result clicks)
  const handleSearchBlur = useCallback(() => {
    setTimeout(() => {
      setShowResults(false);
      setFocusedResultIndex(-1);
    }, 200);
  }, []);

  // Handle keyboard navigation in search results
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!showResults || searchResults.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedResultIndex(prev => 
          prev < searchResults.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedResultIndex(prev => 
          prev > 0 ? prev - 1 : searchResults.length - 1
        );
        break;
      case 'Enter':
        event.preventDefault();
        if (focusedResultIndex >= 0 && focusedResultIndex < searchResults.length) {
          const selectedDep = searchResults[focusedResultIndex];
          onDependencySelect(selectedDep.id);
          setShowResults(false);
          searchInputRef.current?.blur();
        }
        break;
      case 'Escape':
        event.preventDefault();
        setShowResults(false);
        setFocusedResultIndex(-1);
        searchInputRef.current?.blur();
        break;
    }
  }, [showResults, searchResults, focusedResultIndex, onDependencySelect]);

  // Clear search
  const clearSearch = useCallback(() => {
    onSearchChange('');
    setShowResults(false);
    setFocusedResultIndex(-1);
    searchInputRef.current?.focus();
  }, [onSearchChange]);

  // Toggle filters panel
  const toggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

  // Handle result selection
  const handleResultSelect = useCallback((dependency: DependencyNode) => {
    onDependencySelect(dependency.id);
    setShowResults(false);
    setFocusedResultIndex(-1);
  }, [onDependencySelect]);

  // Check if any filters are active
  const hasActiveFilters = Object.keys(filters).length > 0;

  // Get filter summary text
  const getFilterSummary = useCallback(() => {
    const parts: string[] = [];
    
    if (filters.scopes && filters.scopes.length > 0) {
      parts.push(`${filters.scopes.length} scope${filters.scopes.length > 1 ? 's' : ''}`);
    }
    
    if (filters.sources && filters.sources.length > 0) {
      parts.push(`${filters.sources.length} source${filters.sources.length > 1 ? 's' : ''}`);
    }
    
    if (filters.conflictStatus !== undefined) {
      parts.push(filters.conflictStatus ? 'with conflicts' : 'no conflicts');
    }
    
    if (filters.conflictSeverity && filters.conflictSeverity.length > 0) {
      parts.push(`${filters.conflictSeverity.length} severity level${filters.conflictSeverity.length > 1 ? 's' : ''}`);
    }
    
    if (filters.transitive !== undefined) {
      parts.push(filters.transitive ? 'transitive only' : 'direct only');
    }
    
    if (filters.depth) {
      const { min, max } = filters.depth;
      if (min !== undefined && max !== undefined) {
        parts.push(`depth ${min}-${max}`);
      } else if (min !== undefined) {
        parts.push(`depth ≥${min}`);
      } else if (max !== undefined) {
        parts.push(`depth ≤${max}`);
      }
    }
    
    return parts.join(', ');
  }, [filters]);

  // Scroll focused result into view
  useEffect(() => {
    if (focusedResultIndex >= 0 && resultsRef.current) {
      const resultElement = resultsRef.current.children[focusedResultIndex] as HTMLElement;
      if (resultElement) {
        resultElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [focusedResultIndex]);

  return (
    <div className={`dependency-search ${className}`}>
      <div className="relative">
        {/* Search Input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
            onKeyDown={handleKeyDown}
            placeholder="Search dependencies by name, group, or version..."
            className="block w-full pl-10 pr-20 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
          />
          
          <div className="absolute inset-y-0 right-0 flex items-center space-x-1 pr-3">
            {/* Clear button */}
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="Clear search"
              >
                <XMarkIcon className="h-4 w-4 text-gray-400" />
              </button>
            )}
            
            {/* Filter toggle button */}
            <button
              onClick={toggleFilters}
              className={`p-1 rounded-md transition-colors ${
                hasActiveFilters
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              title={showFilters ? 'Hide filters' : 'Show filters'}
            >
              <AdjustmentsHorizontalIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search Results Dropdown */}
        <AnimatePresence>
          {showResults && searchResults.length > 0 && (
            <motion.div
              ref={resultsRef}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto"
            >
              <div className="p-2">
                <div className="text-xs text-gray-500 dark:text-gray-400 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                </div>
                
                <div className="space-y-1 mt-2">
                  {searchResults.slice(0, 10).map((dependency, index) => (
                    <SearchResultItem
                      key={dependency.id}
                      dependency={dependency}
                      searchQuery={searchQuery}
                      isFocused={index === focusedResultIndex}
                      onClick={() => handleResultSelect(dependency)}
                    />
                  ))}
                  
                  {searchResults.length > 10 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 px-3 py-2 text-center border-t border-gray-200 dark:border-gray-700">
                      {searchResults.length - 10} more results available
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No Results Message */}
        <AnimatePresence>
          {showResults && searchQuery.trim() && searchResults.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4"
            >
              <div className="text-center">
                <MagnifyingGlassIcon className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  No dependencies found for "{searchQuery}"
                </p>
                {hasActiveFilters && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                    Try adjusting your filters
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Filter Summary */}
      {hasActiveFilters && (
        <div className="mt-2 flex items-center space-x-2">
          <FunnelIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm text-blue-600 dark:text-blue-400">
            Filtered by: {getFilterSummary()}
          </span>
          <button
            onClick={() => onFiltersChange({})}
            className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-4 overflow-hidden"
          >
            <DependencySearchFilter
              filters={filters}
              onFiltersChange={onFiltersChange}
              dependencyTree={dependencyTree}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Individual search result item component
interface SearchResultItemProps {
  dependency: DependencyNode;
  searchQuery: string;
  isFocused: boolean;
  onClick: () => void;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({
  dependency,
  searchQuery,
  isFocused,
  onClick
}) => {
  // Highlight search matches in text
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-800/50 px-0.5 rounded">
          {part}
        </mark>
      ) : part
    );
  };

  // Get conflict severity color
  const getConflictColor = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 dark:text-red-400';
      case 'high':
        return 'text-orange-600 dark:text-orange-400';
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'low':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  // Get scope color
  const getScopeColor = (scope: string) => {
    switch (scope) {
      case 'compile':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'runtime':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'test':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'provided':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-md transition-colors ${
        isFocused
          ? 'bg-blue-50 dark:bg-blue-900/20'
          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
      }`}
    >
      <div className="flex items-center space-x-3">
        {/* Dependency icon */}
        <div className="flex-shrink-0">
          {dependency.is_transitive ? (
            <LinkIcon className="h-5 w-5 text-gray-400" />
          ) : (
            <CubeIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          )}
        </div>

        {/* Dependency info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {highlightText(`${dependency.group_id}:${dependency.artifact_id}`, searchQuery)}
            </span>
            
            {dependency.version && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {highlightText(dependency.version, searchQuery)}
              </span>
            )}
            
            {/* Scope badge */}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getScopeColor(dependency.scope)}`}>
              {dependency.scope}
            </span>
          </div>
          
          {/* Additional info */}
          <div className="mt-1 flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Depth: {dependency.depth}</span>
            
            {dependency.has_conflicts && dependency.conflict_severity && (
              <div className="flex items-center space-x-1">
                <ExclamationTriangleIcon className={`h-3 w-3 ${getConflictColor(dependency.conflict_severity)}`} />
                <span className={getConflictColor(dependency.conflict_severity)}>
                  {dependency.conflict_severity.toUpperCase()}
                </span>
              </div>
            )}
            
            {dependency.description && (
              <span className="truncate max-w-xs">
                {highlightText(dependency.description, searchQuery)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
};

// Import the existing filter component
import DependencySearchFilter from './DependencySearchFilter';

export default DependencySearch;
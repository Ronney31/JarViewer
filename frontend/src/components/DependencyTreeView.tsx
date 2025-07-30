import React, { useMemo, useCallback, useEffect, createContext, useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRightIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CubeIcon,
  LinkIcon,
  ExclamationCircleIcon,
  ShieldExclamationIcon,
  CheckCircleIcon,
  ClockIcon,
  TagIcon
} from '@heroicons/react/24/outline';
import { 
  DependencyNode, 
  DependencyTree, 
  SearchFilters 
} from '../stores/singleJarDashboardStore';
import ProgressiveTreeLoader from './ProgressiveTreeLoader';

// Context for sharing tree state with nested components
interface DependencyTreeContextType {
  selectedDependency: string | null;
  expandedNodes: Set<string>;
  searchQuery: string;
  filters: SearchFilters;
  onDependencySelect: (dependencyId: string) => void;
  onNodeToggle: (nodeId: string) => void;
}

const DependencyTreeContext = createContext<DependencyTreeContextType | null>(null);

const useDependencyTreeContext = () => {
  const context = useContext(DependencyTreeContext);
  if (!context) {
    throw new Error('useDependencyTreeContext must be used within a DependencyTreeView');
  }
  return context;
};

interface DependencyTreeViewProps {
  dependencyTree: DependencyTree;
  searchQuery: string;
  filters: SearchFilters;
  selectedDependency: string | null;
  expandedNodes: Set<string>;
  onDependencySelect: (dependencyId: string) => void;
  onNodeToggle: (nodeId: string) => void;
  className?: string;
}

const DependencyTreeView: React.FC<DependencyTreeViewProps> = ({
  dependencyTree,
  searchQuery,
  filters,
  selectedDependency,
  expandedNodes,
  onDependencySelect,
  onNodeToggle,
  className = ''
}) => {
  // Session persistence key for this dependency tree
  const sessionKey = `dependency-tree-${dependencyTree.jar_id}`;
  
  // Use progressive loading for large dependency trees
  const [useProgressiveLoading, setUseProgressiveLoading] = useState(false);

  // Determine if we should use progressive loading
  useEffect(() => {
    const totalDeps = dependencyTree.total_dependencies;
    const shouldUseProgressive = totalDeps > 100; // Threshold for progressive loading
    setUseProgressiveLoading(shouldUseProgressive);
  }, [dependencyTree.total_dependencies]);

  // Load expanded nodes from session storage on mount
  useEffect(() => {
    const savedExpandedNodes = sessionStorage.getItem(`${sessionKey}-expanded`);
    if (savedExpandedNodes) {
      try {
        const nodeIds = JSON.parse(savedExpandedNodes);
        nodeIds.forEach((nodeId: string) => {
          if (!expandedNodes.has(nodeId)) {
            onNodeToggle(nodeId);
          }
        });
      } catch (error) {
        console.warn('Failed to load expanded nodes from session storage:', error);
      }
    }
  }, [dependencyTree.jar_id]);

  // Save expanded nodes to session storage when they change
  useEffect(() => {
    const nodeIds = Array.from(expandedNodes);
    sessionStorage.setItem(`${sessionKey}-expanded`, JSON.stringify(nodeIds));
  }, [expandedNodes, sessionKey]);

  // Save selected dependency to session storage
  useEffect(() => {
    if (selectedDependency) {
      sessionStorage.setItem(`${sessionKey}-selected`, selectedDependency);
    } else {
      sessionStorage.removeItem(`${sessionKey}-selected`);
    }
  }, [selectedDependency, sessionKey]);

  // Filter and search dependencies with highlighting support and statistics
  const { filteredDependencies, searchStats } = useMemo(() => {
    let dependencies = dependencyTree.root_dependencies;
    let totalMatches = 0;
    let directMatches = 0;
    let transitiveMatches = 0;
    let matchedSources = new Set<string>();
    let matchedScopes = new Set<string>();
    
    // Apply search query with highlighting
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      dependencies = dependencies.filter(dep => {
        const matches = matchesSearchQuery(dep, queryLower) || hasMatchingChildren(dep, queryLower);
        if (matches) {
          totalMatches++;
          if (dep.is_transitive) {
            transitiveMatches++;
          } else {
            directMatches++;
          }
          matchedSources.add(dep.source);
          matchedScopes.add(dep.scope);
        }
        return matches;
      });
      
      // Mark matching nodes for highlighting
      dependencies = dependencies.map(dep => markMatchingNodes(dep, queryLower));
    }
    
    // Apply filters
    dependencies = dependencies.filter(dep => matchesFilters(dep, filters));
    
    const stats = {
      totalMatches,
      directMatches,
      transitiveMatches,
      matchedSources: Array.from(matchedSources),
      matchedScopes: Array.from(matchedScopes),
      filteredCount: dependencies.length,
      totalCount: dependencyTree.total_dependencies
    };
    
    return { filteredDependencies: dependencies, searchStats: stats };
  }, [dependencyTree.root_dependencies, dependencyTree.total_dependencies, searchQuery, filters]);

  // Mark nodes that match search query for highlighting
  const markMatchingNodes = useCallback((dep: DependencyNode, query: string): DependencyNode => {
    const isMatch = matchesSearchQuery(dep, query);
    const updatedChildren = dep.children.map(child => markMatchingNodes(child, query));
    
    return {
      ...dep,
      children: updatedChildren,
      // Add a temporary property to indicate if this node matches
      _isSearchMatch: isMatch
    } as DependencyNode & { _isSearchMatch?: boolean };
  }, [matchesSearchQuery]);

  // Enhanced search query matching with comprehensive field coverage
  const matchesSearchQuery = useCallback((dep: DependencyNode, query: string): boolean => {
    // Basic field matching
    const basicMatch = (
      dep.group_id.toLowerCase().includes(query) ||
      dep.artifact_id.toLowerCase().includes(query) ||
      (dep.version && dep.version.toLowerCase().includes(query)) ||
      (dep.description && dep.description.toLowerCase().includes(query)) ||
      `${dep.group_id}:${dep.artifact_id}`.toLowerCase().includes(query)
    );
    
    // Package imports/exports matching
    const packageMatch = (
      (dep.package_imports && dep.package_imports.some(pkg => pkg.toLowerCase().includes(query))) ||
      (dep.package_exports && dep.package_exports.some(pkg => pkg.toLowerCase().includes(query)))
    );
    
    // License matching
    const licenseMatch = dep.license && dep.license.toLowerCase().includes(query);
    
    // File path matching
    const pathMatch = dep.file_path && dep.file_path.toLowerCase().includes(query);
    
    // Source and scope matching
    const metadataMatch = (
      dep.source.toLowerCase().includes(query) ||
      dep.scope.toLowerCase().includes(query)
    );
    
    return basicMatch || packageMatch || licenseMatch || pathMatch || metadataMatch;
  }, []);

  // Check if dependency has matching children
  const hasMatchingChildren = useCallback((dep: DependencyNode, query: string): boolean => {
    return dep.children.some(child => 
      matchesSearchQuery(child, query) || hasMatchingChildren(child, query)
    );
  }, [matchesSearchQuery]);

  // Check if dependency matches filters
  const matchesFilters = useCallback((dep: DependencyNode, filters: SearchFilters): boolean => {
    if (filters.scopes && filters.scopes.length > 0 && !filters.scopes.includes(dep.scope)) {
      return false;
    }
    
    if (filters.sources && filters.sources.length > 0 && !filters.sources.includes(dep.source)) {
      return false;
    }
    
    if (filters.conflictStatus !== undefined && dep.has_conflicts !== filters.conflictStatus) {
      return false;
    }
    
    if (filters.conflictSeverity && filters.conflictSeverity.length > 0) {
      if (!dep.conflict_severity || !filters.conflictSeverity.includes(dep.conflict_severity)) {
        return false;
      }
    }
    
    if (filters.depth) {
      const { min, max } = filters.depth;
      if (min !== undefined && dep.depth < min) return false;
      if (max !== undefined && dep.depth > max) return false;
    }
    
    if (filters.transitive !== undefined && dep.is_transitive !== filters.transitive) {
      return false;
    }
    
    return true;
  }, []);

  // Handle node click
  const handleNodeClick = useCallback((dep: DependencyNode, event: React.MouseEvent) => {
    event.stopPropagation();
    onDependencySelect(dep.id);
  }, [onDependencySelect]);

  // Handle expand/collapse
  const handleToggleExpand = useCallback((dep: DependencyNode, event: React.MouseEvent) => {
    event.stopPropagation();
    onNodeToggle(dep.id);
  }, [onNodeToggle]);

  if (filteredDependencies.length === 0) {
    return (
      <div className={`dependency-tree-view ${className}`}>
        <div className="text-center py-12">
          <CubeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
            No Dependencies Found
          </h3>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {searchQuery.trim() || Object.keys(filters).length > 0
              ? 'Try adjusting your search or filters.'
              : 'This JAR has no dependencies.'}
          </p>
        </div>
      </div>
    );
  }

  // Context value for nested components
  const contextValue: DependencyTreeContextType = {
    selectedDependency,
    expandedNodes,
    searchQuery,
    filters,
    onDependencySelect,
    onNodeToggle
  };

  // Use progressive loading for large trees
  if (useProgressiveLoading) {
    return (
      <DependencyTreeContext.Provider value={contextValue}>
        <div className={`dependency-tree-view ${className}`}>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Dependency Tree
                </h3>
                <div className="flex items-center space-x-2">
                  <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-1 rounded">
                    Progressive Loading
                  </span>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {dependencyTree.total_dependencies} dependencies
                  </div>
                </div>
              </div>
            </div>
            
            <ProgressiveTreeLoader
              dependencyTree={dependencyTree}
              searchQuery={searchQuery}
              filters={filters}
              selectedDependency={selectedDependency}
              expandedNodes={expandedNodes}
              onDependencySelect={onDependencySelect}
              onNodeToggle={onNodeToggle}
            />
          </div>
        </div>
      </DependencyTreeContext.Provider>
    );
  }

  // Get selected dependency details
  const selectedDependencyDetails = useMemo(() => {
    if (!selectedDependency) return null;
    return dependencyTree.all_dependencies[selectedDependency];
  }, [selectedDependency, dependencyTree.all_dependencies]);

  return (
    <DependencyTreeContext.Provider value={contextValue}>
      <div className={`dependency-tree-view ${className}`}>
        <div className="flex gap-4">
          {/* Main tree view */}
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Dependency Tree
                </h3>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {filteredDependencies.length} of {dependencyTree.total_dependencies} dependencies
                </div>
              </div>
              
              {/* Search Results Summary */}
              {(searchQuery.trim() || Object.keys(filters).length > 0) && (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Search & Filter Results
                    </h4>
                    <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                      {searchStats.filteredCount} matches
                    </span>
                  </div>
                  
                  {searchQuery.trim() && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="text-center">
                        <div className="font-semibold text-blue-700 dark:text-blue-300">{searchStats.totalMatches}</div>
                        <div className="text-blue-600 dark:text-blue-400">Total Matches</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-green-700 dark:text-green-300">{searchStats.directMatches}</div>
                        <div className="text-green-600 dark:text-green-400">Direct</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-yellow-700 dark:text-yellow-300">{searchStats.transitiveMatches}</div>
                        <div className="text-yellow-600 dark:text-yellow-400">Transitive</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-purple-700 dark:text-purple-300">{searchStats.matchedSources.length}</div>
                        <div className="text-purple-600 dark:text-purple-400">Sources</div>
                      </div>
                    </div>
                  )}
                  
                  {/* Active Filters Display */}
                  {Object.keys(filters).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {filters.scopes && filters.scopes.length > 0 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                          Scopes: {filters.scopes.join(', ')}
                        </span>
                      )}
                      {filters.sources && filters.sources.length > 0 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                          Sources: {filters.sources.join(', ')}
                        </span>
                      )}
                      {filters.conflictStatus !== undefined && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                          {filters.conflictStatus ? 'Has Conflicts' : 'No Conflicts'}
                        </span>
                      )}
                      {filters.transitive !== undefined && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                          {filters.transitive ? 'Transitive Only' : 'Direct Only'}
                        </span>
                      )}
                      {filters.depth && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400">
                          Depth: {filters.depth.min || 0}-{filters.depth.max || '∞'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-4">
              <div className="space-y-1">
                {filteredDependencies.map((dependency, index) => (
                  <DependencyTreeNode
                    key={dependency.id}
                    dependency={dependency}
                    isSelected={selectedDependency === dependency.id}
                    isExpanded={expandedNodes.has(dependency.id)}
                    searchQuery={searchQuery}
                    filters={filters}
                    onSelect={handleNodeClick}
                    onToggle={handleToggleExpand}
                    level={0}
                    isLast={index === filteredDependencies.length - 1}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Dependency details panel */}
          {selectedDependencyDetails && (
            <div className="w-80 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <DependencyDetailsPanel 
                dependency={selectedDependencyDetails}
                onClose={() => onDependencySelect('')}
              />
            </div>
          )}
        </div>
      </div>
    </DependencyTreeContext.Provider>
  );
};

// Individual tree node component
interface DependencyTreeNodeProps {
  dependency: DependencyNode;
  isSelected: boolean;
  isExpanded: boolean;
  searchQuery: string;
  filters: SearchFilters;
  onSelect: (dep: DependencyNode, event: React.MouseEvent) => void;
  onToggle: (dep: DependencyNode, event: React.MouseEvent) => void;
  level: number;
  isLast: boolean;
}

const DependencyTreeNode: React.FC<DependencyTreeNodeProps> = ({
  dependency,
  isSelected,
  isExpanded,
  searchQuery,
  filters,
  onSelect,
  onToggle,
  level,
  isLast
}) => {
  const hasChildren = dependency.children && dependency.children.length > 0;
  const indentWidth = level * 20; // Reduced for better visual hierarchy
  
  // Check if this node matches the search query
  const isSearchMatch = searchQuery.trim() && (
    dependency.group_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    dependency.artifact_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (dependency.version && dependency.version.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (dependency.description && dependency.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
    `${dependency.group_id}:${dependency.artifact_id}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Enhanced conflict severity color and background
  const getConflictColor = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return {
          text: 'text-red-700 dark:text-red-400',
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          icon: 'text-red-600 dark:text-red-400'
        };
      case 'high':
        return {
          text: 'text-orange-700 dark:text-orange-400',
          bg: 'bg-orange-50 dark:bg-orange-900/20',
          border: 'border-orange-200 dark:border-orange-800',
          icon: 'text-orange-600 dark:text-orange-400'
        };
      case 'medium':
        return {
          text: 'text-yellow-700 dark:text-yellow-400',
          bg: 'bg-yellow-50 dark:bg-yellow-900/20',
          border: 'border-yellow-200 dark:border-yellow-800',
          icon: 'text-yellow-600 dark:text-yellow-400'
        };
      case 'low':
        return {
          text: 'text-blue-700 dark:text-blue-400',
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-200 dark:border-blue-800',
          icon: 'text-blue-600 dark:text-blue-400'
        };
      default:
        return {
          text: 'text-gray-600 dark:text-gray-400',
          bg: '',
          border: '',
          icon: 'text-gray-600 dark:text-gray-400'
        };
    }
  };

  // Get conflict icon based on severity
  const getConflictIcon = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return ShieldExclamationIcon;
      case 'high':
        return ExclamationTriangleIcon;
      case 'medium':
        return ExclamationCircleIcon;
      case 'low':
        return InformationCircleIcon;
      default:
        return ExclamationTriangleIcon;
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

  // Highlight search matches
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-800/50 px-1 rounded">
          {part}
        </mark>
      ) : part
    );
  };

  return (
    <div className="dependency-tree-node">
      {/* Main node */}
      <div
        className={`group flex items-center py-2 px-3 rounded-md cursor-pointer transition-colors ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
        }`}
        style={{ marginLeft: `${indentWidth}px` }}
        onClick={(e) => onSelect(dependency, e)}
      >
        {/* Tree lines and expand/collapse button */}
        <div className="flex items-center mr-2">
          {hasChildren ? (
            <button
              onClick={(e) => onToggle(dependency, e)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {isExpanded ? (
                <ChevronDownIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              ) : (
                <ChevronRightIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              )}
            </button>
          ) : (
            <div className="w-6 h-6 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600"></div>
            </div>
          )}
        </div>

        {/* Dependency icon */}
        <div className="mr-3">
          {dependency.is_transitive ? (
            <LinkIcon className="h-5 w-5 text-gray-400" />
          ) : (
            <CubeIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          )}
        </div>

        {/* Search match indicator */}
        {isSearchMatch && (
          <div className="mr-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400 dark:bg-yellow-500 animate-pulse" title="Search match" />
          </div>
        )}

        {/* Dependency info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className={`font-medium truncate ${
              isSearchMatch 
                ? 'text-gray-900 dark:text-gray-100' 
                : 'text-gray-900 dark:text-gray-100'
            }`}>
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

            {/* Source badge */}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400">
              {dependency.source}
            </span>

            {/* Confidence score indicator */}
            {dependency.confidence !== undefined && (
              <div className={`flex items-center space-x-1 px-2 py-0.5 rounded-md text-xs ${
                dependency.confidence >= 0.8 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                  : dependency.confidence >= 0.6
                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
              }`}>
                {dependency.confidence >= 0.8 ? (
                  <CheckCircleIcon className="h-3 w-3" />
                ) : dependency.confidence >= 0.6 ? (
                  <ClockIcon className="h-3 w-3" />
                ) : (
                  <ExclamationTriangleIcon className="h-3 w-3" />
                )}
                <span className="font-medium">
                  {Math.round(dependency.confidence * 100)}%
                </span>
              </div>
            )}

            {/* Optional dependency indicator */}
            {dependency.optional && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                <TagIcon className="h-3 w-3 mr-1" />
                Optional
              </span>
            )}
            
            {/* Enhanced conflict indicator */}
            {dependency.has_conflicts && dependency.conflict_severity && (
              <div className={`flex items-center space-x-1 px-2 py-1 rounded-md ${getConflictColor(dependency.conflict_severity).bg} ${getConflictColor(dependency.conflict_severity).border ? `border ${getConflictColor(dependency.conflict_severity).border}` : ''}`}>
                {React.createElement(getConflictIcon(dependency.conflict_severity), {
                  className: `h-4 w-4 ${getConflictColor(dependency.conflict_severity).icon}`
                })}
                <span className={`text-xs font-medium ${getConflictColor(dependency.conflict_severity).text}`}>
                  {dependency.conflict_severity.toUpperCase()}
                </span>
              </div>
            )}
          </div>
          
          {/* Enhanced additional info */}
          <div className="mt-1 space-y-1">
            {dependency.description && (
              <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                {highlightText(dependency.description, searchQuery)}
              </div>
            )}
            
            {/* Package imports/exports summary */}
            {(dependency.package_imports?.length > 0 || dependency.package_exports?.length > 0) && (
              <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-500">
                {dependency.package_imports?.length > 0 && (
                  <span className="flex items-center space-x-1">
                    <span className="text-blue-600 dark:text-blue-400">↓</span>
                    <span>{dependency.package_imports.length} imports</span>
                  </span>
                )}
                {dependency.package_exports?.length > 0 && (
                  <span className="flex items-center space-x-1">
                    <span className="text-green-600 dark:text-green-400">↑</span>
                    <span>{dependency.package_exports.length} exports</span>
                  </span>
                )}
              </div>
            )}

            {/* License information */}
            {dependency.license && (
              <div className="text-xs text-gray-500 dark:text-gray-500">
                License: {highlightText(dependency.license, searchQuery)}
              </div>
            )}
          </div>
        </div>

        {/* Info button */}
        <button
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(dependency, e);
          }}
        >
          <InformationCircleIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
        </button>
      </div>

      {/* Children */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-1 mt-1">
              {dependency.children.map((child, index) => (
                <DependencyTreeNodeWrapper
                  key={child.id}
                  dependency={child}
                  searchQuery={searchQuery}
                  filters={filters}
                  onSelect={onSelect}
                  onToggle={onToggle}
                  level={level + 1}
                  isLast={index === dependency.children.length - 1}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Wrapper component for nested dependency nodes that handles state
interface DependencyTreeNodeWrapperProps {
  dependency: DependencyNode;
  searchQuery: string;
  filters: SearchFilters;
  onSelect: (dep: DependencyNode, event: React.MouseEvent) => void;
  onToggle: (dep: DependencyNode, event: React.MouseEvent) => void;
  level: number;
  isLast: boolean;
}

const DependencyTreeNodeWrapper: React.FC<DependencyTreeNodeWrapperProps> = (props) => {
  // We need to access the parent component's state for selection and expansion
  // Since we can't easily pass these down through the recursive structure,
  // we'll need to modify the approach to pass the required state
  
  // For now, we'll use React context or modify the parent to pass the state down
  // This is a temporary solution - in a real implementation, we'd use a more sophisticated state management
  
  return (
    <DependencyTreeNodeWithState
      {...props}
    />
  );
};

// Enhanced wrapper that connects to parent state via context
const DependencyTreeNodeWithState: React.FC<DependencyTreeNodeWrapperProps> = ({
  dependency,
  level,
  isLast
}) => {
  // Use context to get the shared state and handlers
  const {
    selectedDependency,
    expandedNodes,
    searchQuery,
    filters,
    onDependencySelect,
    onNodeToggle
  } = useDependencyTreeContext();

  // Create handlers that work with the context
  const handleSelect = useCallback((dep: DependencyNode, event: React.MouseEvent) => {
    event.stopPropagation();
    onDependencySelect(dep.id);
  }, [onDependencySelect]);

  const handleToggle = useCallback((dep: DependencyNode, event: React.MouseEvent) => {
    event.stopPropagation();
    onNodeToggle(dep.id);
  }, [onNodeToggle]);

  // Determine if this node is selected and expanded using context state
  const isSelected = selectedDependency === dependency.id;
  const isExpanded = expandedNodes.has(dependency.id);
  
  return (
    <DependencyTreeNode
      dependency={dependency}
      isSelected={isSelected}
      isExpanded={isExpanded}
      searchQuery={searchQuery}
      filters={filters}
      onSelect={handleSelect}
      onToggle={handleToggle}
      level={level}
      isLast={isLast}
    />
  );
};

// Dependency details panel component
interface DependencyDetailsPanelProps {
  dependency: DependencyNode;
  onClose: () => void;
}

const DependencyDetailsPanel: React.FC<DependencyDetailsPanelProps> = ({
  dependency,
  onClose
}) => {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Dependency Details
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <svg className="h-5 w-5 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-6">
          {/* Basic Information */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Basic Information
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Group ID:</span>
                <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                  {dependency.group_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Artifact ID:</span>
                <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                  {dependency.artifact_id}
                </span>
              </div>
              {dependency.version && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Version:</span>
                  <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                    {dependency.version}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Scope:</span>
                <span className={`text-sm px-2 py-0.5 rounded-full ${
                  dependency.scope === 'compile' 
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                    : dependency.scope === 'runtime'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                    : dependency.scope === 'test'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                }`}>
                  {dependency.scope}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Source:</span>
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {dependency.source}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Type:</span>
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {dependency.is_transitive ? 'Transitive' : 'Direct'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Depth:</span>
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {dependency.depth}
                </span>
              </div>
            </div>
          </div>

          {/* Confidence Score */}
          {dependency.confidence !== undefined && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                Detection Confidence
              </h4>
              <div className="flex items-center space-x-3">
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      dependency.confidence >= 0.8 
                        ? 'bg-green-500' 
                        : dependency.confidence >= 0.6
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${dependency.confidence * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {Math.round(dependency.confidence * 100)}%
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {dependency.confidence >= 0.8 
                  ? 'High confidence - dependency clearly identified'
                  : dependency.confidence >= 0.6
                  ? 'Medium confidence - dependency likely correct'
                  : 'Low confidence - dependency detection uncertain'
                }
              </p>
            </div>
          )}

          {/* Description */}
          {dependency.description && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                Description
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {dependency.description}
              </p>
            </div>
          )}

          {/* License */}
          {dependency.license && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                License
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {dependency.license}
              </p>
            </div>
          )}

          {/* Package Imports */}
          {dependency.package_imports && dependency.package_imports.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                Package Imports ({dependency.package_imports.length})
              </h4>
              <div className="max-h-32 overflow-y-auto">
                <div className="space-y-1">
                  {dependency.package_imports.slice(0, 10).map((pkg, index) => (
                    <div key={index} className="text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 px-2 py-1 rounded">
                      {pkg}
                    </div>
                  ))}
                  {dependency.package_imports.length > 10 && (
                    <div className="text-xs text-gray-500 dark:text-gray-500 px-2 py-1">
                      ... and {dependency.package_imports.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Package Exports */}
          {dependency.package_exports && dependency.package_exports.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                Package Exports ({dependency.package_exports.length})
              </h4>
              <div className="max-h-32 overflow-y-auto">
                <div className="space-y-1">
                  {dependency.package_exports.slice(0, 10).map((pkg, index) => (
                    <div key={index} className="text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 px-2 py-1 rounded">
                      {pkg}
                    </div>
                  ))}
                  {dependency.package_exports.length > 10 && (
                    <div className="text-xs text-gray-500 dark:text-gray-500 px-2 py-1">
                      ... and {dependency.package_exports.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Conflicts */}
          {dependency.has_conflicts && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                Conflicts
              </h4>
              <div className={`p-3 rounded-lg border ${
                dependency.conflict_severity === 'critical'
                  ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                  : dependency.conflict_severity === 'high'
                  ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
                  : dependency.conflict_severity === 'medium'
                  ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
                  : 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
              }`}>
                <div className="flex items-center space-x-2">
                  <ExclamationTriangleIcon className={`h-4 w-4 ${
                    dependency.conflict_severity === 'critical'
                      ? 'text-red-600 dark:text-red-400'
                      : dependency.conflict_severity === 'high'
                      ? 'text-orange-600 dark:text-orange-400'
                      : dependency.conflict_severity === 'medium'
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`} />
                  <span className={`text-sm font-medium ${
                    dependency.conflict_severity === 'critical'
                      ? 'text-red-800 dark:text-red-200'
                      : dependency.conflict_severity === 'high'
                      ? 'text-orange-800 dark:text-orange-200'
                      : dependency.conflict_severity === 'medium'
                      ? 'text-yellow-800 dark:text-yellow-200'
                      : 'text-blue-800 dark:text-blue-200'
                  }`}>
                    {dependency.conflict_severity?.toUpperCase()} Severity
                  </span>
                </div>
                {dependency.conflict_ids.length > 0 && (
                  <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                    Conflicts with: {dependency.conflict_ids.join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dependency Path */}
          {dependency.dependency_path.length > 1 && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                Dependency Path
              </h4>
              <div className="space-y-1">
                {dependency.dependency_path.map((pathItem, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <div className="text-xs text-gray-500 dark:text-gray-500">
                      {index + 1}.
                    </div>
                    <div className="text-xs font-mono text-gray-600 dark:text-gray-400">
                      {pathItem}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Children Count */}
          {dependency.children.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                Child Dependencies
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This dependency has {dependency.children.length} child dependencies.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DependencyTreeView;

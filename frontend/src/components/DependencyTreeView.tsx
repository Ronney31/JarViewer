import React, { useMemo, useCallback, useEffect, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRightIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CubeIcon,
  LinkIcon,
  ExclamationCircleIcon,
  ShieldExclamationIcon
} from '@heroicons/react/24/outline';
import { 
  DependencyNode, 
  DependencyTree, 
  SearchFilters 
} from '@/stores/singleJarDashboardStore';

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

  // Filter and search dependencies with highlighting support
  const filteredDependencies = useMemo(() => {
    let dependencies = dependencyTree.root_dependencies;
    
    // Apply search query with highlighting
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      dependencies = dependencies.filter(dep => 
        matchesSearchQuery(dep, queryLower) || 
        hasMatchingChildren(dep, queryLower)
      );
      
      // Mark matching nodes for highlighting
      dependencies = dependencies.map(dep => markMatchingNodes(dep, queryLower));
    }
    
    // Apply filters
    dependencies = dependencies.filter(dep => matchesFilters(dep, filters));
    
    return dependencies;
  }, [dependencyTree.root_dependencies, searchQuery, filters]);

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

  // Check if a dependency matches search query
  const matchesSearchQuery = useCallback((dep: DependencyNode, query: string): boolean => {
    return (
      dep.group_id.toLowerCase().includes(query) ||
      dep.artifact_id.toLowerCase().includes(query) ||
      (dep.version && dep.version.toLowerCase().includes(query)) ||
      (dep.description && dep.description.toLowerCase().includes(query)) ||
      `${dep.group_id}:${dep.artifact_id}`.toLowerCase().includes(query)
    );
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

  return (
    <DependencyTreeContext.Provider value={contextValue}>
      <div className={`dependency-tree-view ${className}`}>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                Dependency Tree
              </h3>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {filteredDependencies.length} of {dependencyTree.total_dependencies} dependencies
              </div>
            </div>
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
          
          {/* Additional info */}
          {(dependency.description || dependency.file_path) && (
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-400 truncate">
              {dependency.description || dependency.file_path}
            </div>
          )}
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

export default DependencyTreeView;

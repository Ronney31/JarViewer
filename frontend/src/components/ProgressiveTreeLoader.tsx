import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { DependencyNode, DependencyTree } from '../stores/singleJarDashboardStore';

interface ProgressiveTreeLoaderProps {
  dependencyTree: DependencyTree;
  searchQuery: string;
  filters: any;
  selectedDependency: string | null;
  expandedNodes: Set<string>;
  onDependencySelect: (dependencyId: string) => void;
  onNodeToggle: (nodeId: string) => void;
  className?: string;
}

interface VirtualizedNode {
  id: string;
  dependency: DependencyNode;
  level: number;
  isVisible: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  index: number;
}

const ITEM_HEIGHT = 48; // Height of each tree item in pixels
const BUFFER_SIZE = 10; // Number of items to render outside visible area
const BATCH_SIZE = 50; // Number of items to load per batch

const ProgressiveTreeLoader: React.FC<ProgressiveTreeLoaderProps> = ({
  dependencyTree,
  searchQuery,
  filters,
  selectedDependency,
  expandedNodes,
  onDependencySelect,
  onNodeToggle,
  className = ''
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [loadedBatches, setLoadedBatches] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Flatten tree into virtualized nodes
  const virtualizedNodes = useMemo(() => {
    const nodes: VirtualizedNode[] = [];
    let index = 0;

    const processNode = (
      dependency: DependencyNode, 
      level: number, 
      parentExpanded: boolean = true
    ) => {
      const isExpanded = expandedNodes.has(dependency.id);
      const hasChildren = dependency.children && dependency.children.length > 0;
      const isVisible = parentExpanded && (
        !searchQuery || 
        matchesSearch(dependency, searchQuery) ||
        hasMatchingChildren(dependency, searchQuery)
      );

      if (isVisible && matchesFilters(dependency, filters)) {
        nodes.push({
          id: dependency.id,
          dependency,
          level,
          isVisible,
          isExpanded,
          hasChildren,
          index: index++
        });
      }

      // Process children if expanded and visible
      if (isExpanded && isVisible && hasChildren) {
        dependency.children.forEach(child => {
          processNode(child, level + 1, true);
        });
      }
    };

    // Process root dependencies
    dependencyTree.root_dependencies.forEach(dep => {
      processNode(dep, 0);
    });

    return nodes;
  }, [dependencyTree, expandedNodes, searchQuery, filters]);

  // Calculate visible range based on scroll position
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_SIZE);
    const endIndex = Math.min(
      virtualizedNodes.length - 1,
      Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER_SIZE
    );
    
    return { startIndex, endIndex };
  }, [scrollTop, containerHeight, virtualizedNodes.length]);

  // Get visible nodes for current scroll position
  const visibleNodes = useMemo(() => {
    const maxLoadedIndex = loadedBatches * BATCH_SIZE - 1;
    return virtualizedNodes.slice(
      visibleRange.startIndex, 
      Math.min(visibleRange.endIndex + 1, maxLoadedIndex + 1)
    );
  }, [virtualizedNodes, visibleRange, loadedBatches]);

  // Load more batches when scrolling near the end
  const loadMoreBatches = useCallback(async () => {
    if (isLoading) return;
    
    const maxLoadedIndex = loadedBatches * BATCH_SIZE - 1;
    const needsMoreData = visibleRange.endIndex > maxLoadedIndex - BUFFER_SIZE;
    const hasMoreData = maxLoadedIndex < virtualizedNodes.length - 1;
    
    if (needsMoreData && hasMoreData) {
      setIsLoading(true);
      
      // Simulate async loading delay for smooth UX
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setLoadedBatches(prev => prev + 1);
      setIsLoading(false);
    }
  }, [visibleRange.endIndex, loadedBatches, virtualizedNodes.length, isLoading]);

  // Handle scroll events
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
    loadMoreBatches();
  }, [loadMoreBatches]);

  // Handle container resize
  const handleResize = useCallback((entries: ResizeObserverEntry[]) => {
    if (entries[0]) {
      setContainerHeight(entries[0].contentRect.height);
    }
  }, []);

  // Set up resize observer
  useEffect(() => {
    const resizeObserver = new ResizeObserver(handleResize);
    const container = document.getElementById('tree-container');
    if (container) {
      resizeObserver.observe(container);
    }
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [handleResize]);

  // Reset loaded batches when tree changes
  useEffect(() => {
    setLoadedBatches(1);
    setScrollTop(0);
  }, [dependencyTree.jar_id, searchQuery, JSON.stringify(filters)]);

  // Helper functions
  const matchesSearch = (dependency: DependencyNode, query: string): boolean => {
    if (!query.trim()) return true;
    
    const queryLower = query.toLowerCase();
    return (
      dependency.group_id.toLowerCase().includes(queryLower) ||
      dependency.artifact_id.toLowerCase().includes(queryLower) ||
      (dependency.version && dependency.version.toLowerCase().includes(queryLower)) ||
      (dependency.description && dependency.description.toLowerCase().includes(queryLower))
    );
  };

  const hasMatchingChildren = (dependency: DependencyNode, query: string): boolean => {
    if (!dependency.children || dependency.children.length === 0) return false;
    
    return dependency.children.some(child => 
      matchesSearch(child, query) || hasMatchingChildren(child, query)
    );
  };

  const matchesFilters = (dependency: DependencyNode, filters: any): boolean => {
    if (filters.scopes && filters.scopes.length > 0 && !filters.scopes.includes(dependency.scope)) {
      return false;
    }
    
    if (filters.sources && filters.sources.length > 0 && !filters.sources.includes(dependency.source)) {
      return false;
    }
    
    if (filters.conflictStatus !== undefined && dependency.has_conflicts !== filters.conflictStatus) {
      return false;
    }
    
    return true;
  };

  const totalHeight = virtualizedNodes.length * ITEM_HEIGHT;

  return (
    <div className={`progressive-tree-loader ${className}`}>
      <div 
        id="tree-container"
        className="relative overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg"
        style={{ height: containerHeight }}
        onScroll={handleScroll}
      >
        {/* Virtual scrolling container */}
        <div style={{ height: totalHeight, position: 'relative' }}>
          {/* Visible items */}
          <div
            style={{
              transform: `translateY(${visibleRange.startIndex * ITEM_HEIGHT}px)`,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0
            }}
          >
            <AnimatePresence mode="popLayout">
              {visibleNodes.map((node) => (
                <VirtualizedTreeNode
                  key={node.id}
                  node={node}
                  isSelected={selectedDependency === node.id}
                  onSelect={onDependencySelect}
                  onToggle={onNodeToggle}
                  searchQuery={searchQuery}
                />
              ))}
            </AnimatePresence>
          </div>
          
          {/* Loading indicator */}
          {isLoading && (
            <div 
              className="absolute left-0 right-0 flex items-center justify-center py-4 bg-gray-50 dark:bg-gray-800"
              style={{ 
                top: Math.min(loadedBatches * BATCH_SIZE, virtualizedNodes.length) * ITEM_HEIGHT 
              }}
            >
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span>Loading more dependencies...</span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Stats */}
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
        <span>
          Showing {visibleNodes.length} of {virtualizedNodes.length} dependencies
        </span>
        <span>
          Loaded {Math.min(loadedBatches * BATCH_SIZE, virtualizedNodes.length)} items
        </span>
      </div>
    </div>
  );
};

// Individual virtualized tree node component
interface VirtualizedTreeNodeProps {
  node: VirtualizedNode;
  isSelected: boolean;
  onSelect: (dependencyId: string) => void;
  onToggle: (nodeId: string) => void;
  searchQuery: string;
}

const VirtualizedTreeNode: React.FC<VirtualizedTreeNodeProps> = ({
  node,
  isSelected,
  onSelect,
  onToggle,
  searchQuery
}) => {
  const { dependency, level, isExpanded, hasChildren } = node;
  const indentWidth = level * 20;

  const handleClick = useCallback(() => {
    onSelect(dependency.id);
  }, [dependency.id, onSelect]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(dependency.id);
  }, [dependency.id, onToggle]);

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

  const getConflictColor = (severity?: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 dark:text-red-400';
      case 'high': return 'text-orange-600 dark:text-orange-400';
      case 'medium': return 'text-yellow-600 dark:text-yellow-400';
      case 'low': return 'text-blue-600 dark:text-blue-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getScopeColor = (scope: string) => {
    switch (scope) {
      case 'compile': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'runtime': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'test': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'provided': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15 }}
      className={`flex items-center py-2 px-3 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500'
          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
      }`}
      style={{ 
        height: ITEM_HEIGHT,
        marginLeft: `${indentWidth}px`
      }}
      onClick={handleClick}
    >
      {/* Expand/collapse button */}
      <div className="flex items-center mr-2">
        {hasChildren ? (
          <button
            onClick={handleToggle}
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

      {/* Dependency info */}
      <div className="flex-1 min-w-0 flex items-center space-x-2">
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
        
        {/* Conflict indicator */}
        {dependency.has_conflicts && dependency.conflict_severity && (
          <span className={`text-xs font-medium ${getConflictColor(dependency.conflict_severity)}`}>
            {dependency.conflict_severity.toUpperCase()}
          </span>
        )}
      </div>
    </motion.div>
  );
};

export default ProgressiveTreeLoader;
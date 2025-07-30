import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  XMarkIcon,
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';
import { SearchFilters, DependencyTree } from '../stores/singleJarDashboardStore';

interface DependencySearchFilterProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  dependencyTree: DependencyTree | undefined;
  className?: string;
}

const DependencySearchFilter: React.FC<DependencySearchFilterProps> = ({
  filters,
  onFiltersChange,
  dependencyTree,
  className = ''
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['scope', 'source']));

  // Available filter options based on dependency tree data
  const availableScopes = Object.keys(dependencyTree?.scope_counts || {});
  const availableSources = Object.keys(dependencyTree?.source_counts || {});
  const availableSeverities = ['low', 'medium', 'high', 'critical'];

  // If no dependency tree data, show a loading or empty state
  if (!dependencyTree) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${className}`}>
        <div className="flex items-center justify-center text-gray-500 dark:text-gray-400">
          <div className="text-center">
            <AdjustmentsHorizontalIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No dependency data available for filtering</p>
          </div>
        </div>
      </div>
    );
  }

  // Toggle section expansion
  const toggleSection = useCallback((section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  }, [expandedSections]);

  // Handle scope filter changes
  const handleScopeChange = useCallback((scope: string, checked: boolean) => {
    const currentScopes = filters.scopes || [];
    const newScopes = checked
      ? [...currentScopes, scope]
      : currentScopes.filter(s => s !== scope);
    
    onFiltersChange({
      ...filters,
      scopes: newScopes.length > 0 ? newScopes : undefined
    });
  }, [filters, onFiltersChange]);

  // Handle source filter changes
  const handleSourceChange = useCallback((source: string, checked: boolean) => {
    const currentSources = filters.sources || [];
    const newSources = checked
      ? [...currentSources, source]
      : currentSources.filter(s => s !== source);
    
    onFiltersChange({
      ...filters,
      sources: newSources.length > 0 ? newSources : undefined
    });
  }, [filters, onFiltersChange]);

  // Handle conflict status change
  const handleConflictStatusChange = useCallback((hasConflicts: boolean | undefined) => {
    onFiltersChange({
      ...filters,
      conflictStatus: hasConflicts
    });
  }, [filters, onFiltersChange]);

  // Handle conflict severity changes
  const handleSeverityChange = useCallback((severity: string, checked: boolean) => {
    const currentSeverities = filters.conflictSeverity || [];
    const newSeverities = checked
      ? [...currentSeverities, severity]
      : currentSeverities.filter(s => s !== severity);
    
    onFiltersChange({
      ...filters,
      conflictSeverity: newSeverities.length > 0 ? newSeverities : undefined
    });
  }, [filters, onFiltersChange]);

  // Handle depth filter changes
  const handleDepthChange = useCallback((type: 'min' | 'max', value: string) => {
    const numValue = value === '' ? undefined : parseInt(value, 10);
    const currentDepth = filters.depth || {};
    
    onFiltersChange({
      ...filters,
      depth: {
        ...currentDepth,
        [type]: numValue
      }
    });
  }, [filters, onFiltersChange]);

  // Handle transitive filter change
  const handleTransitiveChange = useCallback((isTransitive: boolean | undefined) => {
    onFiltersChange({
      ...filters,
      transitive: isTransitive
    });
  }, [filters, onFiltersChange]);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    onFiltersChange({});
  }, [onFiltersChange]);

  // Clear specific filter type
  const clearFilterType = useCallback((filterType: string) => {
    const newFilters = { ...filters };
    
    switch (filterType) {
      case 'scopes':
        delete newFilters.scopes;
        break;
      case 'sources':
        delete newFilters.sources;
        break;
      case 'conflicts':
        delete newFilters.conflictStatus;
        delete newFilters.conflictSeverity;
        break;
      case 'depth':
        delete newFilters.depth;
        break;
      case 'type':
        delete newFilters.transitive;
        break;
    }
    
    onFiltersChange(newFilters);
  }, [filters, onFiltersChange]);

  // Check if any filters are active
  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className={`dependency-search-filter ${className}`}>
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <AdjustmentsHorizontalIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Filters
            </h3>
            {hasActiveFilters && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                Active
              </span>
            )}
          </div>
          
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
            >
              <XMarkIcon className="h-4 w-4 mr-1" />
              Clear All
            </button>
          )}
        </div>

        <div className="space-y-4">
          {/* Scope Filter */}
          <FilterSection
            title="Scope"
            isExpanded={expandedSections.has('scope')}
            onToggle={() => toggleSection('scope')}
            count={dependencyTree.scope_counts ? Object.keys(dependencyTree.scope_counts).length : 0}
            hasActiveFilters={!!(filters.scopes && filters.scopes.length > 0)}
            onClear={() => clearFilterType('scopes')}
          >
            <div className="grid grid-cols-2 gap-2">
              {availableScopes.map(scope => (
                <label key={scope} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.scopes?.includes(scope) || false}
                    onChange={(e) => handleScopeChange(scope, e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                    {scope}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({dependencyTree.scope_counts?.[scope] || 0})
                  </span>
                </label>
              ))}
            </div>
          </FilterSection>

          {/* Source Filter */}
          <FilterSection
            title="Source"
            isExpanded={expandedSections.has('source')}
            onToggle={() => toggleSection('source')}
            count={dependencyTree.source_counts ? Object.keys(dependencyTree.source_counts).length : 0}
            hasActiveFilters={!!(filters.sources && filters.sources.length > 0)}
            onClear={() => clearFilterType('sources')}
          >
            <div className="grid grid-cols-1 gap-2">
              {availableSources.map(source => (
                <label key={source} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.sources?.includes(source) || false}
                    onChange={(e) => handleSourceChange(source, e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {source.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({dependencyTree.source_counts?.[source] || 0})
                  </span>
                </label>
              ))}
            </div>
          </FilterSection>

          {/* Conflict Status Filter */}
          <FilterSection
            title="Conflicts"
            isExpanded={expandedSections.has('conflicts')}
            onToggle={() => toggleSection('conflicts')}
            count={dependencyTree.conflicts?.length || 0}
            hasActiveFilters={!!(filters.conflictStatus !== undefined || (filters.conflictSeverity && filters.conflictSeverity.length > 0))}
            onClear={() => clearFilterType('conflicts')}
          >
            <div className="space-y-3">
              {/* Conflict Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Conflict Status
                </label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="conflictStatus"
                      checked={filters.conflictStatus === undefined}
                      onChange={() => handleConflictStatusChange(undefined)}
                      className="text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">All</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="conflictStatus"
                      checked={filters.conflictStatus === true}
                      onChange={() => handleConflictStatusChange(true)}
                      className="text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Has Conflicts</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="conflictStatus"
                      checked={filters.conflictStatus === false}
                      onChange={() => handleConflictStatusChange(false)}
                      className="text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">No Conflicts</span>
                  </label>
                </div>
              </div>

              {/* Conflict Severity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Conflict Severity
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {availableSeverities.map(severity => (
                    <label key={severity} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.conflictSeverity?.includes(severity) || false}
                        onChange={(e) => handleSeverityChange(severity, e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                      />
                      <span className={`text-sm capitalize ${getSeverityColor(severity)}`}>
                        {severity}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </FilterSection>

          {/* Depth Filter */}
          <FilterSection
            title="Depth"
            isExpanded={expandedSections.has('depth')}
            onToggle={() => toggleSection('depth')}
            count={dependencyTree.max_depth}
            hasActiveFilters={!!(filters.depth && (filters.depth.min !== undefined || filters.depth.max !== undefined))}
            onClear={() => clearFilterType('depth')}
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Min Depth
                </label>
                <input
                  type="number"
                  min="0"
                  max={dependencyTree.max_depth}
                  value={filters.depth?.min || ''}
                  onChange={(e) => handleDepthChange('min', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Max Depth
                </label>
                <input
                  type="number"
                  min="0"
                  max={dependencyTree.max_depth}
                  value={filters.depth?.max || ''}
                  onChange={(e) => handleDepthChange('max', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={dependencyTree.max_depth.toString()}
                />
              </div>
            </div>
          </FilterSection>

          {/* Transitive Filter */}
          <FilterSection
            title="Dependency Type"
            isExpanded={expandedSections.has('type')}
            onToggle={() => toggleSection('type')}
            hasActiveFilters={filters.transitive !== undefined}
            onClear={() => clearFilterType('type')}
          >
            <div className="space-y-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="transitive"
                  checked={filters.transitive === undefined}
                  onChange={() => handleTransitiveChange(undefined)}
                  className="text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">All</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="transitive"
                  checked={filters.transitive === false}
                  onChange={() => handleTransitiveChange(false)}
                  className="text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Direct Only</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="transitive"
                  checked={filters.transitive === true}
                  onChange={() => handleTransitiveChange(true)}
                  className="text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Transitive Only</span>
              </label>
            </div>
          </FilterSection>
        </div>
      </div>
    </div>
  );
};

// Filter section component
interface FilterSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  count?: number;
  hasActiveFilters?: boolean;
  onClear?: () => void;
  children: React.ReactNode;
}

const FilterSection: React.FC<FilterSectionProps> = ({
  title,
  isExpanded,
  onToggle,
  count,
  hasActiveFilters = false,
  onClear,
  children
}) => {
  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg">
      <div className="flex items-center">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex items-center space-x-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {title}
            </span>
            {count !== undefined && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ({count})
              </span>
            )}
            {hasActiveFilters && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                Active
              </span>
            )}
          </div>
          {isExpanded ? (
            <ChevronUpIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          )}
        </button>
        
        {hasActiveFilters && onClear && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="p-2 mr-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
            title="Clear this filter"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="border-t border-gray-200 dark:border-gray-600 p-3"
        >
          {children}
        </motion.div>
      )}
    </div>
  );
};

// Helper function to get severity color
const getSeverityColor = (severity: string): string => {
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

export default DependencySearchFilter;

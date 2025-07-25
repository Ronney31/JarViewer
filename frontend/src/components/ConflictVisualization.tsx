import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  Shield, 
  ChevronDown, 
  ChevronRight,
  Filter,
  SortAsc,
  SortDesc,
  Info,
  AlertCircle,
  XCircle,
  Zap,
  Search
} from 'lucide-react';

interface Conflict {
  id: string;
  conflict_type: string;
  affected_dependencies: string[];
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolution_suggestion?: string;
  conflicting_versions: string[];
  winning_version?: string;
  paths: string[][];
}

interface ConflictVisualizationProps {
  conflicts: Conflict[];
  onConflictSelect?: (conflict: Conflict) => void;
}

interface ConflictFilters {
  severity: string[];
  conflictType: string[];
  hasResolution: boolean | null;
  searchQuery: string;
}

type SortField = 'severity' | 'type' | 'affectedCount' | 'name';
type SortDirection = 'asc' | 'desc';

const ConflictVisualization: React.FC<ConflictVisualizationProps> = ({ 
  conflicts, 
  onConflictSelect 
}) => {
  const [filters, setFilters] = useState<ConflictFilters>({
    severity: [],
    conflictType: [],
    hasResolution: null,
    searchQuery: ''
  });
  
  const [sortField, setSortField] = useState<SortField>('severity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedConflicts, setExpandedConflicts] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Get unique values for filter options
  const filterOptions = useMemo(() => {
    const severities = [...new Set(conflicts.map(c => c.severity))];
    const types = [...new Set(conflicts.map(c => c.conflict_type))];
    return { severities, types };
  }, [conflicts]);

  // Filter and sort conflicts
  const filteredAndSortedConflicts = useMemo(() => {
    let filtered = conflicts.filter(conflict => {
      // Severity filter
      if (filters.severity.length > 0 && !filters.severity.includes(conflict.severity)) {
        return false;
      }
      
      // Conflict type filter
      if (filters.conflictType.length > 0 && !filters.conflictType.includes(conflict.conflict_type)) {
        return false;
      }
      
      // Resolution filter
      if (filters.hasResolution !== null) {
        const hasResolution = !!conflict.resolution_suggestion;
        if (filters.hasResolution !== hasResolution) {
          return false;
        }
      }
      
      // Search query filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const searchableText = [
          conflict.conflict_type,
          conflict.description,
          ...conflict.affected_dependencies,
          ...conflict.conflicting_versions,
          conflict.resolution_suggestion || ''
        ].join(' ').toLowerCase();
        
        if (!searchableText.includes(query)) {
          return false;
        }
      }
      
      return true;
    });

    // Sort conflicts
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'severity':
          const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          comparison = severityOrder[a.severity] - severityOrder[b.severity];
          break;
        case 'type':
          comparison = a.conflict_type.localeCompare(b.conflict_type);
          break;
        case 'affectedCount':
          comparison = a.affected_dependencies.length - b.affected_dependencies.length;
          break;
        case 'name':
          comparison = a.conflict_type.localeCompare(b.conflict_type);
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [conflicts, filters, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const toggleConflictExpansion = (conflictId: string) => {
    const newExpanded = new Set(expandedConflicts);
    if (newExpanded.has(conflictId)) {
      newExpanded.delete(conflictId);
    } else {
      newExpanded.add(conflictId);
    }
    setExpandedConflicts(newExpanded);
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'high':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case 'medium':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'low':
        return <Info className="h-5 w-5 text-blue-500" />;
      default:
        return <Info className="h-5 w-5 text-gray-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800';
    }
  };

  const getConflictBorderColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'border-l-red-500';
      case 'high':
        return 'border-l-orange-500';
      case 'medium':
        return 'border-l-yellow-500';
      case 'low':
        return 'border-l-blue-500';
      default:
        return 'border-l-gray-500';
    }
  };

  const clearFilters = () => {
    setFilters({
      severity: [],
      conflictType: [],
      hasResolution: null,
      searchQuery: ''
    });
  };

  const hasActiveFilters = filters.severity.length > 0 || 
                          filters.conflictType.length > 0 || 
                          filters.hasResolution !== null || 
                          filters.searchQuery.length > 0;

  if (!conflicts || conflicts.length === 0) {
    return (
      <div className="text-center py-12">
        <Shield className="mx-auto h-12 w-12 text-green-400" />
        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
          No Conflicts Found
        </h3>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          All dependencies are compatible with each other.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Dependency Conflicts ({filteredAndSortedConflicts.length}/{conflicts.length})
          </h3>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              Clear filters
            </button>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-md border ${showFilters 
              ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400' 
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      {showFilters && (
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search conflicts..."
                value={filters.searchQuery}
                onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Severity Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Severity
              </label>
              <div className="space-y-2">
                {filterOptions.severities.map(severity => (
                  <label key={severity} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.severity.includes(severity)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilters(prev => ({ ...prev, severity: [...prev.severity, severity] }));
                        } else {
                          setFilters(prev => ({ ...prev, severity: prev.severity.filter(s => s !== severity) }));
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 capitalize">
                      {severity}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Conflict Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Conflict Type
              </label>
              <div className="space-y-2">
                {filterOptions.types.map(type => (
                  <label key={type} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.conflictType.includes(type)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilters(prev => ({ ...prev, conflictType: [...prev.conflictType, type] }));
                        } else {
                          setFilters(prev => ({ ...prev, conflictType: prev.conflictType.filter(t => t !== type) }));
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      {type.replace('_', ' ')}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Resolution Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Resolution Status
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="resolution"
                    checked={filters.hasResolution === true}
                    onChange={() => setFilters(prev => ({ ...prev, hasResolution: true }))}
                    className="border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Has Resolution
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="resolution"
                    checked={filters.hasResolution === false}
                    onChange={() => setFilters(prev => ({ ...prev, hasResolution: false }))}
                    className="border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    No Resolution
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="resolution"
                    checked={filters.hasResolution === null}
                    onChange={() => setFilters(prev => ({ ...prev, hasResolution: null }))}
                    className="border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    All
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sort Controls */}
      <div className="flex items-center space-x-4 text-sm">
        <span className="text-gray-600 dark:text-gray-400">Sort by:</span>
        {(['severity', 'type', 'affectedCount'] as SortField[]).map(field => (
          <button
            key={field}
            onClick={() => handleSort(field)}
            className={`flex items-center space-x-1 px-2 py-1 rounded ${
              sortField === field 
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' 
                : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <span className="capitalize">
              {field === 'affectedCount' ? 'Affected Count' : field}
            </span>
            {sortField === field && (
              sortDirection === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />
            )}
          </button>
        ))}
      </div>

      {/* Conflicts List */}
      {filteredAndSortedConflicts.length === 0 ? (
        <div className="text-center py-8">
          <Search className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            No conflicts match your current filters.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAndSortedConflicts.map((conflict) => {
            const isExpanded = expandedConflicts.has(conflict.id);
            
            return (
              <div
                key={conflict.id}
                className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg border-l-4 ${getConflictBorderColor(conflict.severity)} overflow-hidden`}
              >
                {/* Conflict Header */}
                <div 
                  className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  onClick={() => {
                    toggleConflictExpansion(conflict.id);
                    onConflictSelect?.(conflict);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getSeverityIcon(conflict.severity)}
                      <div>
                        <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                          {conflict.conflict_type.replace('_', ' ').toUpperCase()}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {conflict.affected_dependencies.length} dependencies affected
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(conflict.severity)}`}>
                        {conflict.severity.toUpperCase()}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Conflict Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="pt-4 space-y-4">
                      {/* Description */}
                      <div>
                        <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                          Description
                        </h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {conflict.description}
                        </p>
                      </div>

                      {/* Conflicting Versions */}
                      {conflict.conflicting_versions.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                            Conflicting Versions
                          </h5>
                          <div className="flex flex-wrap gap-2">
                            {conflict.conflicting_versions.map((version, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                              >
                                {version}
                              </span>
                            ))}
                          </div>
                          {conflict.winning_version && (
                            <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                              <strong>Resolved to:</strong> {conflict.winning_version}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Affected Dependencies */}
                      {conflict.affected_dependencies.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                            Affected Dependencies
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {conflict.affected_dependencies.map((dep, index) => (
                              <div
                                key={index}
                                className="flex items-center px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-md"
                              >
                                <span className="text-xs font-mono text-gray-800 dark:text-gray-200">
                                  {dep}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Dependency Paths */}
                      {conflict.paths && conflict.paths.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                            Dependency Paths
                          </h5>
                          <div className="space-y-2">
                            {conflict.paths.slice(0, 3).map((path, index) => (
                              <div key={index} className="text-xs font-mono text-gray-600 dark:text-gray-400">
                                {path.join(' → ')}
                              </div>
                            ))}
                            {conflict.paths.length > 3 && (
                              <p className="text-xs text-gray-500 dark:text-gray-500">
                                ... and {conflict.paths.length - 3} more paths
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Resolution Suggestion */}
                      {conflict.resolution_suggestion && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                          <div className="flex items-start space-x-2">
                            <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <h5 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                                Resolution Suggestion
                              </h5>
                              <p className="text-sm text-blue-800 dark:text-blue-400">
                                {conflict.resolution_suggestion}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ConflictVisualization;
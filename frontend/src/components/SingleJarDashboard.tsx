import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart3, 
  Download, 
  Search,
  Filter,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { useJarViewerStore } from '../stores/jarViewerStore';
import { useSingleJarDashboardStore } from '../stores/singleJarDashboardStore';
import DependencyTreeView from './DependencyTreeView';
import DependencySearchFilter from './DependencySearchFilter';
import ConflictVisualization from './ConflictVisualization';
import ExportControls from './ExportControls';
import LoadingIndicator from './LoadingIndicator';
import ErrorBoundary from './ErrorBoundary';
import ErrorDisplay from './ErrorDisplay';
import OverviewSection from './OverviewSection';
import { AnalysisError } from '../types/errors';

interface SingleJarDashboardProps {
  jarId: string;
  className?: string;
}

const SingleJarDashboard: React.FC<SingleJarDashboardProps> = ({ 
  jarId, 
  className = '' 
}) => {
  const { currentJar } = useJarViewerStore();
  const {
    analysisData,
    partialResult,
    loadingState,
    error,
    errors,
    searchQuery,
    filters,
    selectedDependency,
    expandedNodes,
    canRetry,
    loadAnalysis,
    cancelAnalysis,
    retryAnalysis,
    setSearchQuery,
    setFilters,
    setSelectedDependency,
    toggleNodeExpansion,
    clearError,
    clearAllErrors,
    reset
  } = useSingleJarDashboardStore();

  const [activeSection, setActiveSection] = useState<'overview' | 'tree' | 'conflicts' | 'export'>('overview');
  const [showFilters, setShowFilters] = useState(false);

  // Load analysis data when component mounts or jarId changes
  useEffect(() => {
    if (jarId) {
      loadAnalysis(jarId);
    }
    
    return () => {
      reset();
    };
  }, [jarId, loadAnalysis, reset]);

  // Handle search with debouncing
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, [setSearchQuery]);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: any) => {
    setFilters(newFilters);
  }, [setFilters]);

  // Handle dependency selection
  const handleDependencySelect = useCallback((dependencyId: string) => {
    setSelectedDependency(dependencyId);
  }, [setSelectedDependency]);

  // Handle node expansion
  const handleNodeToggle = useCallback((nodeId: string) => {
    toggleNodeExpansion(nodeId);
  }, [toggleNodeExpansion]);

  // Handle retry
  const handleRetry = useCallback(() => {
    retryAnalysis(jarId);
  }, [retryAnalysis, jarId]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    cancelAnalysis(jarId);
  }, [cancelAnalysis, jarId]);

  // Handle tile clicks from overview
  const handleOverviewTileClick = useCallback((tileId: string) => {
    switch (tileId) {
      case 'total_dependencies':
      case 'direct_dependencies':
      case 'transitive_dependencies':
        setActiveSection('tree');
        break;
      case 'conflicts':
        setActiveSection('conflicts');
        break;
      case 'search':
        setShowFilters(true);
        break;
      case 'filter':
        setShowFilters(true);
        break;
      case 'export':
        setActiveSection('export');
        break;
      default:
        break;
    }
  }, []);

  // Transform DependencyConflict[] to Conflict[] for ConflictVisualization component
  const transformConflictsForVisualization = useCallback((conflicts: any[]) => {
    if (!conflicts) return [];
    
    return conflicts.map(conflict => ({
      ...conflict,
      severity: normalizeSeverity(conflict.severity)
    }));
  }, []);

  // Normalize severity string to expected union type
  const normalizeSeverity = (severity: string): 'low' | 'medium' | 'high' | 'critical' => {
    const normalizedSeverity = severity.toLowerCase().trim();
    switch (normalizedSeverity) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
        return 'low';
      default:
        // Default to medium for unknown severity levels
        return 'medium';
    }
  };

  // Handle error from error boundary
  const handleErrorBoundaryError = useCallback((error: AnalysisError) => {
    console.error('Error boundary caught error:', error);
  }, []);

  // Render loading state
  if (loadingState?.isLoading) {
    return (
      <div className={`single-jar-dashboard ${className}`}>
        <LoadingIndicator
          loadingState={loadingState}
          error={error}
          onCancel={loadingState.canCancel ? handleCancel : undefined}
          onRetry={canRetry ? handleRetry : undefined}
        />
      </div>
    );
  }

  // Render error state (only if no partial data available)
  if (error && !partialResult && !analysisData) {
    return (
      <div className={`single-jar-dashboard ${className}`}>
        <ErrorDisplay
          error={{
            type: 'error',
            title: 'Analysis Failed',
            message: error.message,
            details: error.details?.stack_trace || error.details?.context,
            actions: [
              ...(canRetry ? [{
                label: 'Retry Analysis',
                action: handleRetry,
                variant: 'primary' as const
              }] : []),
              {
                label: 'Dismiss',
                action: clearError,
                variant: 'secondary' as const
              }
            ]
          }}
          overlay={true}
        />
      </div>
    );
  }

  // Render empty state
  if (!analysisData && !partialResult) {
    return (
      <div className={`single-jar-dashboard ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
              No Analysis Data
            </h3>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Unable to load dependency analysis for this JAR.
            </p>
            {canRetry && (
              <button
                onClick={handleRetry}
                className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { dependencyTree, summary, conflicts } = analysisData || {};

  return (
    <ErrorBoundary onError={handleErrorBoundaryError}>
      <div className={`single-jar-dashboard ${className} space-y-4`}>
        {/* Partial Analysis Warning */}
        <AnimatePresence>
          {partialResult && partialResult.hasErrors && (
            <ErrorDisplay
              error={{
                type: 'warning',
                title: 'Partial Analysis Results',
                message: `Analysis completed with ${partialResult.errors.length} issue(s). Some features may be limited.`,
                details: partialResult.degradedFeatures.length > 0 
                  ? `Limited features: ${partialResult.degradedFeatures.join(', ')}`
                  : undefined,
                actions: [
                  {
                    label: 'Retry Full Analysis',
                    action: handleRetry,
                    variant: 'primary' as const
                  },
                  {
                    label: 'Continue with Available Data',
                    action: clearAllErrors,
                    variant: 'secondary' as const
                  }
                ]
              }}
              overlay={true}
              onDismiss={clearAllErrors}
            />
          )}
        </AnimatePresence>

        {/* Multiple Errors Display */}
        <AnimatePresence>
          {errors.length > 1 && (
            <ErrorDisplay
              error={{
                type: 'error',
                title: 'Multiple Issues Detected',
                message: errors.slice(0, 3).map(err => `• ${err.message}`).join('\n'),
                details: errors.length > 3 ? `... and ${errors.length - 3} more issues` : undefined,
                actions: [
                  {
                    label: 'Dismiss All',
                    action: clearAllErrors,
                    variant: 'secondary'
                  }
                ]
              }}
              overlay={true}
              onDismiss={clearAllErrors}
            />
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Dependency Analysis
              </h1>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {currentJar?.name || `JAR ${jarId}`}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {summary?.risk_level && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  summary.risk_level === 'high' 
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    : summary.risk_level === 'medium'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                    : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                }`}>
                  Risk: {summary.risk_level}
                </span>
              )}
            </div>
          </div>
        </div>

      {/* Navigation Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex flex-wrap sm:space-x-8 px-4 sm:px-6">
            {[
              { id: 'overview', label: 'Overview', icon: Info },
              { id: 'tree', label: 'Dependency Tree', icon: BarChart3 },
              { id: 'conflicts', label: `Conflicts (${conflicts?.length || 0})`, icon: AlertTriangle },
              { id: 'export', label: 'Export', icon: Download }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id as any)}
                  className={`group inline-flex items-center py-4 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${
                    activeSection === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="mr-1 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">
                    {tab.id === 'overview' ? 'Overview' : 
                     tab.id === 'tree' ? 'Tree' :
                     tab.id === 'conflicts' ? `Conflicts (${conflicts?.length || 0})` :
                     'Export'}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4 h-[calc(100vh-20rem)] overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeSection === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <OverviewSection 
                  analysisData={analysisData}
                  onTileClick={handleOverviewTileClick}
                />
              </motion.div>
            )}

            {activeSection === 'tree' && (
              <motion.div
                key="tree"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Search and Filter Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                  <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-4 flex-1">
                    <div className="relative flex-1 sm:max-w-md">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search dependencies..."
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`inline-flex items-center justify-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium whitespace-nowrap ${
                        showFilters
                          ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-600'
                          : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      <Filter className="mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">Filters</span>
                      <span className="sm:hidden">Filter</span>
                      {showFilters ? (
                        <ChevronDown className="ml-2 h-4 w-4" />
                      ) : (
                        <ChevronRight className="ml-2 h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Filter Panel */}
                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <DependencySearchFilter
                        filters={filters}
                        onFiltersChange={handleFilterChange}
                        dependencyTree={dependencyTree}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Dependency Tree */}
                {dependencyTree ? (
                  <DependencyTreeView
                    dependencyTree={dependencyTree}
                    searchQuery={searchQuery}
                    filters={filters}
                    selectedDependency={selectedDependency}
                    expandedNodes={expandedNodes}
                    onDependencySelect={handleDependencySelect}
                    onNodeToggle={handleNodeToggle}
                  />
                ) : (
                  <div className="text-center py-8">
                    <AlertTriangle className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
                      Dependency Tree Unavailable
                    </h3>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                      Could not build dependency tree structure.
                    </p>
                    {canRetry && (
                      <button
                        onClick={handleRetry}
                        className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry Analysis
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {activeSection === 'conflicts' && (
              <motion.div
                key="conflicts"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                {conflicts && dependencyTree ? (
                  <ConflictVisualization
                    conflicts={transformConflictsForVisualization(conflicts)}
                    dependencyTree={dependencyTree}
                  />
                ) : (
                  <div className="text-center py-8">
                    <AlertTriangle className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
                      Conflict Analysis Unavailable
                    </h3>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                      Could not analyze dependency conflicts.
                    </p>
                    {canRetry && (
                      <button
                        onClick={handleRetry}
                        className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry Analysis
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {activeSection === 'export' && (
              <motion.div
                key="export"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                {analysisData && dependencyTree ? (
                  <ExportControls
                    jarId={jarId}
                    dependencyTree={dependencyTree}
                    analysisData={analysisData}
                  />
                ) : (
                  <div className="text-center py-8">
                    <AlertTriangle className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
                      Export Unavailable
                    </h3>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                      Cannot export data without complete analysis results.
                    </p>
                    {canRetry && (
                      <button
                        onClick={handleRetry}
                        className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry Analysis
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      </div>
    </ErrorBoundary>
  );
};

export default SingleJarDashboard;

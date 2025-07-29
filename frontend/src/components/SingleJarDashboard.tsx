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
  RefreshCw,
  X
} from 'lucide-react';
import { useJarViewerStore } from '@/stores/jarViewerStore';
import { useSingleJarDashboardStore } from '@/stores/singleJarDashboardStore';
import DependencyTreeView from './DependencyTreeView';
import DependencySearchFilter from './DependencySearchFilter';
import ConflictVisualization from './ConflictVisualization';
import ExportControls from './ExportControls';
import LoadingIndicator from './LoadingIndicator';
import ErrorBoundary from './ErrorBoundary';
import { AnalysisError } from '@/types/errors';

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
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-medium text-red-800 dark:text-red-200">
                Analysis Failed
              </h3>
              <p className="mt-2 text-red-700 dark:text-red-300">
                {error.message}
              </p>
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {error.suggestedAction}
              </p>
              
              {error.details?.retryAttempt && (
                <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                  Attempt {error.details.retryAttempt} of {error.details.maxAttempts}
                </div>
              )}
              
              <div className="mt-4 flex space-x-3">
                {canRetry && (
                  <button
                    onClick={handleRetry}
                    className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry Analysis
                  </button>
                )}
                <button
                  onClick={clearError}
                  className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  <X className="h-4 w-4 mr-2" />
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
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
      <div className={`single-jar-dashboard ${className} space-y-6`}>
        {/* Partial Analysis Warning */}
        {partialResult && partialResult.hasErrors && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4"
          >
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Partial Analysis Results
                </h3>
                <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                  Analysis completed with {partialResult.errors.length} issue(s). 
                  Some features may be limited.
                </p>
                {partialResult.degradedFeatures.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      Limited features: {partialResult.degradedFeatures.join(', ')}
                    </p>
                  </div>
                )}
                <div className="mt-3 flex space-x-3">
                  <button
                    onClick={handleRetry}
                    className="text-sm bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700 transition-colors"
                  >
                    Retry Full Analysis
                  </button>
                  <button
                    onClick={clearAllErrors}
                    className="text-sm text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100"
                  >
                    Continue with Available Data
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Multiple Errors Display */}
        {errors.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
          >
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Multiple Issues Detected
                </h3>
                <div className="mt-2 space-y-1">
                  {errors.slice(0, 3).map((err, index) => (
                    <p key={index} className="text-sm text-red-700 dark:text-red-300">
                      • {err.message}
                    </p>
                  ))}
                  {errors.length > 3 && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      ... and {errors.length - 3} more issues
                    </p>
                  )}
                </div>
                <button
                  onClick={clearAllErrors}
                  className="mt-2 text-sm text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100"
                >
                  Dismiss All
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Dependency Analysis
            </h1>
            <p className="mt-1 text-gray-600 dark:text-gray-400">
              {currentJar?.name || `JAR ${jarId}`}
            </p>
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
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
        <div className="p-6">
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
                  summary={summary} 
                  dependencyTree={dependencyTree}
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
                    conflicts={conflicts}
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

// Overview Section Component
const OverviewSection: React.FC<{
  summary: any;
  dependencyTree: any;
}> = ({ summary, dependencyTree }) => {
  const stats = [
    {
      label: 'Total Dependencies',
      value: summary?.total_dependencies || 0,
      icon: BarChart3,
      color: 'blue'
    },
    {
      label: 'Direct Dependencies',
      value: summary?.direct_dependencies || 0,
      icon: BarChart3,
      color: 'green'
    },
    {
      label: 'Transitive Dependencies',
      value: summary?.transitive_dependencies || 0,
      icon: BarChart3,
      color: 'yellow'
    },
    {
      label: 'Conflicts',
      value: summary?.conflicts_count || 0,
      icon: AlertTriangle,
      color: (summary?.conflicts_count || 0) > 0 ? 'red' : 'gray'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
            >
              <div className="flex items-center">
                <div className={`p-2 rounded-md bg-${stat.color}-100 dark:bg-${stat.color}-900/20`}>
                  <Icon className={`h-6 w-6 text-${stat.color}-600 dark:text-${stat.color}-400`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {stat.value}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scope Breakdown */}
      {summary?.scope_breakdown && Object.keys(summary.scope_breakdown).length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6 border border-gray-200 dark:border-gray-600">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Scope Breakdown
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Object.entries(summary.scope_breakdown).map(([scope, count]) => (
              <div key={scope} className="text-center">
                <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  {count as number}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                  {scope}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source Breakdown */}
      {summary?.source_breakdown && Object.keys(summary.source_breakdown).length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6 border border-gray-200 dark:border-gray-600">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Source Breakdown
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(summary.source_breakdown).map(([source, count]) => (
              <div key={source} className="text-center">
                <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  {count as number}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                  {source.replace('_', ' ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Assessment */}
      {summary?.risk_level && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6 border border-gray-200 dark:border-gray-600">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Risk Assessment
          </h3>
          <div className="flex items-center space-x-4">
            <div className={`flex-shrink-0 w-4 h-4 rounded-full ${
              summary.risk_level === 'high' 
                ? 'bg-red-500'
                : summary.risk_level === 'medium'
                ? 'bg-yellow-500'
                : 'bg-green-500'
            }`}></div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Risk Level: <span className="capitalize">{summary.risk_level}</span>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {summary.risk_level === 'high' 
                  ? 'Multiple conflicts detected. Review dependencies carefully.'
                  : summary.risk_level === 'medium'
                  ? 'Some conflicts detected. Consider reviewing affected dependencies.'
                  : 'No significant conflicts detected. Dependencies appear compatible.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SingleJarDashboard;

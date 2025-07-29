import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { apiService } from '@/services/apiService';
import { 
  AnalysisError, 
  LoadingState, 
  LoadingStage, 
  PartialAnalysisResult,
  ErrorType,
  AnalysisErrorBuilder
} from '@/types/errors';
import { errorHandlingService } from '@/services/errorHandlingService';

// Types for the dashboard state
interface DependencyNode {
  id: string;
  group_id: string;
  artifact_id: string;
  version?: string;
  scope: string;
  source: string;
  is_transitive: boolean;
  depth: number;
  parent_id?: string;
  children: DependencyNode[];
  dependency_path: string[];
  has_conflicts: boolean;
  conflict_severity?: string;
  conflict_ids: string[];
  description?: string;
  license?: string;
  size_bytes?: number;
  file_path?: string;
}

interface DependencyConflict {
  id: string;
  conflict_type: string;
  affected_dependencies: string[];
  description: string;
  severity: string;
  resolution_suggestion?: string;
  conflicting_versions: string[];
  winning_version?: string;
  paths: string[][];
}

interface DependencyTree {
  id: string;
  jar_id: string;
  root_dependencies: DependencyNode[];
  all_dependencies: Record<string, DependencyNode>;
  conflicts: DependencyConflict[];
  paths: any[];
  total_dependencies: number;
  direct_dependencies: number;
  transitive_dependencies: number;
  max_depth: number;
  scope_counts: Record<string, number>;
  source_counts: Record<string, number>;
}

interface AnalysisData {
  dependencyTree: DependencyTree;
  summary: {
    total_dependencies: number;
    direct_dependencies: number;
    transitive_dependencies: number;
    max_depth: number;
    conflicts_count: number;
    scope_breakdown: Record<string, number>;
    source_breakdown: Record<string, number>;
    has_conflicts: boolean;
    risk_level: 'low' | 'medium' | 'high';
  };
  conflicts: DependencyConflict[];
  recommendations: string[];
}

interface SearchFilters {
  scopes?: string[];
  sources?: string[];
  conflictStatus?: boolean;
  conflictSeverity?: string[];
  depth?: { min?: number; max?: number };
  transitive?: boolean;
}

interface SingleJarDashboardState {
  // Data
  analysisData: AnalysisData | null;
  partialResult: PartialAnalysisResult | null;
  
  // Loading and error states
  loadingState: LoadingState | null;
  error: AnalysisError | null;
  errors: AnalysisError[];
  
  // Search and filtering
  searchQuery: string;
  filters: SearchFilters;
  searchResults: DependencyNode[];
  
  // UI state
  selectedDependency: string | null;
  expandedNodes: Set<string>;
  
  // Retry state
  retryCount: number;
  canRetry: boolean;
  
  // Actions
  loadAnalysis: (jarId: string, forceRetry?: boolean) => Promise<void>;
  cancelAnalysis: (jarId: string) => void;
  retryAnalysis: (jarId: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setFilters: (filters: SearchFilters) => void;
  setSelectedDependency: (dependencyId: string | null) => void;
  toggleNodeExpansion: (nodeId: string) => void;
  searchDependencies: (query: string, filters?: SearchFilters) => Promise<void>;
  clearError: () => void;
  clearAllErrors: () => void;
  reset: () => void;
}

export const useSingleJarDashboardStore = create<SingleJarDashboardState>()(
  devtools(
    (set, get) => ({
      // Initial state
      analysisData: null,
      partialResult: null,
      loadingState: null,
      error: null,
      errors: [],
      searchQuery: '',
      filters: {},
      searchResults: [],
      selectedDependency: null,
      expandedNodes: new Set(),
      retryCount: 0,
      canRetry: false,

      // Load comprehensive analysis data with enhanced error handling
      loadAnalysis: async (jarId: string, forceRetry: boolean = false) => {
        const startTime = new Date();
        let currentStage = LoadingStage.INITIALIZING;
        
        try {
          // Clear previous errors if not retrying
          if (!forceRetry) {
            set({ 
              error: null, 
              errors: [], 
              partialResult: null,
              retryCount: 0
            });
          }

          // Initialize loading state
          errorHandlingService.updateLoadingState(
            jarId, 
            LoadingStage.INITIALIZING, 
            0, 
            startTime
          );
          
          set({ 
            loadingState: errorHandlingService.getLoadingState(jarId),
            canRetry: false
          });

          // Stage 1: Extract dependencies
          currentStage = LoadingStage.EXTRACTING_DEPENDENCIES;
          errorHandlingService.updateLoadingState(jarId, currentStage, 20, startTime);
          set({ loadingState: errorHandlingService.getLoadingState(jarId) });

          const response = await apiService.get(`/jars/${jarId}/analysis/comprehensive`);
          
          if (!response.success) {
            throw new Error(response.error || 'Failed to load analysis');
          }

          // Stage 2: Building tree
          currentStage = LoadingStage.BUILDING_TREE;
          errorHandlingService.updateLoadingState(jarId, currentStage, 50, startTime);
          set({ loadingState: errorHandlingService.getLoadingState(jarId) });

          const analysisData: AnalysisData = response.data;
          
          // Check for partial failures
          const errors: AnalysisError[] = [];
          const availableData = {
            dependencyTree: !!analysisData.dependencyTree,
            conflicts: !!analysisData.conflicts,
            summary: !!analysisData.summary,
            searchIndex: true, // We can always build search from available data
            export: !!analysisData.dependencyTree
          };

          // Stage 3: Detecting conflicts
          currentStage = LoadingStage.DETECTING_CONFLICTS;
          errorHandlingService.updateLoadingState(jarId, currentStage, 70, startTime);
          set({ loadingState: errorHandlingService.getLoadingState(jarId) });

          // Validate data integrity
          if (!analysisData.dependencyTree?.root_dependencies) {
            errors.push(
              AnalysisErrorBuilder.create()
                .type(ErrorType.DEPENDENCY_EXTRACTION_FAILED)
                .message('Could not extract dependency tree structure')
                .suggestedAction('The JAR may not contain standard dependency information')
                .retryable(true)
                .context({ jarId, operation: 'dependency_extraction' })
                .build()
            );
            availableData.dependencyTree = false;
            availableData.export = false;
          }

          if (!analysisData.conflicts || analysisData.conflicts.length === 0) {
            // This might not be an error - just no conflicts found
            if (analysisData.dependencyTree?.root_dependencies?.length > 5) {
              // Only flag as potential error if we have many dependencies but no conflicts detected
              errors.push(
                AnalysisErrorBuilder.create()
                  .type(ErrorType.CONFLICT_DETECTION_FAILED)
                  .message('Conflict detection may be incomplete')
                  .suggestedAction('Conflict analysis may have missed some issues')
                  .retryable(true)
                  .context({ jarId, operation: 'conflict_detection' })
                  .build()
              );
            }
          }

          // Stage 4: Building search index
          currentStage = LoadingStage.BUILDING_SEARCH_INDEX;
          errorHandlingService.updateLoadingState(jarId, currentStage, 85, startTime);
          set({ loadingState: errorHandlingService.getLoadingState(jarId) });

          // Initialize expanded nodes with root dependencies
          const expandedNodes = new Set<string>();
          if (analysisData.dependencyTree?.root_dependencies) {
            analysisData.dependencyTree.root_dependencies.forEach(dep => {
              expandedNodes.add(dep.id);
            });
          }

          // Stage 5: Finalizing
          currentStage = LoadingStage.FINALIZING;
          errorHandlingService.updateLoadingState(jarId, currentStage, 95, startTime);
          set({ loadingState: errorHandlingService.getLoadingState(jarId) });

          // Complete
          errorHandlingService.updateLoadingState(jarId, LoadingStage.COMPLETE, 100, startTime);

          if (errors.length > 0) {
            // Partial success
            const partialResult = errorHandlingService.handlePartialFailure(jarId, errors, availableData);
            set({ 
              analysisData,
              partialResult,
              errors,
              loadingState: null,
              expandedNodes,
              canRetry: true
            });
          } else {
            // Complete success
            set({ 
              analysisData,
              partialResult: null,
              errors: [],
              loadingState: null,
              expandedNodes,
              canRetry: false
            });
          }
          
        } catch (error) {
          console.error('Failed to load analysis:', error);
          
          const analysisError = await errorHandlingService.handleApiError(
            error,
            { jarId, operation: 'comprehensive_analysis' }
          );
          
          set({ 
            error: analysisError,
            errors: [analysisError],
            loadingState: null,
            canRetry: analysisError.retryable,
            retryCount: get().retryCount + 1
          });
          
          errorHandlingService.clearLoadingState(jarId);
        }
      },

      // Cancel analysis
      cancelAnalysis: (jarId: string) => {
        errorHandlingService.clearLoadingState(jarId);
        errorHandlingService.clearRetryState(jarId);
        set({ 
          loadingState: null,
          canRetry: false
        });
      },

      // Retry analysis
      retryAnalysis: async (jarId: string) => {
        const { loadAnalysis } = get();
        await loadAnalysis(jarId, true);
      },

      // Set search query and trigger search
      setSearchQuery: (query: string) => {
        set({ searchQuery: query });
        
        // Debounce search
        const { searchDependencies, filters } = get();
        setTimeout(() => {
          if (get().searchQuery === query) {
            searchDependencies(query, filters);
          }
        }, 300);
      },

      // Set filters and trigger search
      setFilters: (filters: SearchFilters) => {
        set({ filters });
        
        const { searchQuery, searchDependencies } = get();
        searchDependencies(searchQuery, filters);
      },

      // Set selected dependency
      setSelectedDependency: (dependencyId: string | null) => {
        set({ selectedDependency: dependencyId });
      },

      // Toggle node expansion
      toggleNodeExpansion: (nodeId: string) => {
        const { expandedNodes } = get();
        const newExpandedNodes = new Set(expandedNodes);
        
        if (newExpandedNodes.has(nodeId)) {
          newExpandedNodes.delete(nodeId);
        } else {
          newExpandedNodes.add(nodeId);
        }
        
        set({ expandedNodes: newExpandedNodes });
      },

      // Search dependencies with filters (optimized with debouncing and caching)
      searchDependencies: async (query: string, filters: SearchFilters = {}) => {
        const { analysisData } = get();
        
        if (!analysisData) {
          return;
        }
        
        try {
          // Create cache key for search results
          const cacheKey = `${query.trim()}_${JSON.stringify(filters)}`;
          
          // If no query and no filters, show all dependencies
          if (!query.trim() && Object.keys(filters).length === 0) {
            set({ searchResults: Object.values(analysisData.dependencyTree.all_dependencies) });
            return;
          }
          
          // Use Web Workers for large dependency sets (if available)
          const dependencies = Object.values(analysisData.dependencyTree.all_dependencies);
          
          let results: DependencyNode[];
          
          if (dependencies.length > 500 && 'Worker' in window) {
            // Use Web Worker for heavy filtering
            results = await searchWithWebWorker(dependencies, query, filters);
          } else {
            // Use main thread for smaller sets
            results = searchDependenciesSync(dependencies, query, filters);
          }
          
          set({ searchResults: results });
          
        } catch (error) {
          console.error('Search failed:', error);
          set({ searchResults: [] });
        }
      },

      // Clear current error
      clearError: () => {
        set({ error: null });
      },

      // Clear all errors
      clearAllErrors: () => {
        set({ 
          error: null, 
          errors: [],
          partialResult: null
        });
      },

      // Reset state
      reset: () => {
        const state = get();
        if (state.analysisData?.dependencyTree?.jar_id) {
          errorHandlingService.clearLoadingState(state.analysisData.dependencyTree.jar_id);
          errorHandlingService.clearRetryState(state.analysisData.dependencyTree.jar_id);
        }
        
        set({
          analysisData: null,
          partialResult: null,
          loadingState: null,
          error: null,
          errors: [],
          searchQuery: '',
          filters: {},
          searchResults: [],
          selectedDependency: null,
          expandedNodes: new Set(),
          retryCount: 0,
          canRetry: false
        });
      }
    }),
    {
      name: 'single-jar-dashboard-store'
    }
  )
);

// Export types for use in components
export type { 
  DependencyNode, 
  DependencyConflict, 
  DependencyTree, 
  AnalysisData, 
  SearchFilters 
};

// Helper functions for optimized search
function searchDependenciesSync(
  dependencies: DependencyNode[], 
  query: string, 
  filters: SearchFilters
): DependencyNode[] {
  let results = dependencies;
  
  // Apply text search
  if (query.trim()) {
    const queryLower = query.toLowerCase();
    results = results.filter(dep => 
      dep.group_id.toLowerCase().includes(queryLower) ||
      dep.artifact_id.toLowerCase().includes(queryLower) ||
      (dep.version && dep.version.toLowerCase().includes(queryLower)) ||
      (dep.description && dep.description.toLowerCase().includes(queryLower)) ||
      `${dep.group_id}:${dep.artifact_id}`.toLowerCase().includes(queryLower)
    );
  }
  
  // Apply filters
  if (filters.scopes && filters.scopes.length > 0) {
    results = results.filter(dep => filters.scopes!.includes(dep.scope));
  }
  
  if (filters.sources && filters.sources.length > 0) {
    results = results.filter(dep => filters.sources!.includes(dep.source));
  }
  
  if (filters.conflictStatus !== undefined) {
    results = results.filter(dep => dep.has_conflicts === filters.conflictStatus);
  }
  
  if (filters.conflictSeverity && filters.conflictSeverity.length > 0) {
    results = results.filter(dep => 
      dep.conflict_severity && filters.conflictSeverity!.includes(dep.conflict_severity)
    );
  }
  
  if (filters.depth) {
    const { min, max } = filters.depth;
    results = results.filter(dep => {
      if (min !== undefined && dep.depth < min) return false;
      if (max !== undefined && dep.depth > max) return false;
      return true;
    });
  }
  
  if (filters.transitive !== undefined) {
    results = results.filter(dep => dep.is_transitive === filters.transitive);
  }
  
  // Sort results by relevance
  results.sort((a, b) => {
    // Prioritize exact matches
    if (query.trim()) {
      const queryLower = query.toLowerCase();
      const aExact = a.artifact_id.toLowerCase() === queryLower;
      const bExact = b.artifact_id.toLowerCase() === queryLower;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
    }
    
    // Then by conflicts (conflicts first)
    if (a.has_conflicts && !b.has_conflicts) return -1;
    if (!a.has_conflicts && b.has_conflicts) return 1;
    
    // Then by depth (direct dependencies first)
    if (a.depth !== b.depth) return a.depth - b.depth;
    
    // Finally by name
    return `${a.group_id}:${a.artifact_id}`.localeCompare(`${b.group_id}:${b.artifact_id}`);
  });
  
  return results;
}

async function searchWithWebWorker(
  dependencies: DependencyNode[], 
  query: string, 
  filters: SearchFilters
): Promise<DependencyNode[]> {
  return new Promise((resolve, reject) => {
    // Create inline worker for dependency search
    const workerCode = `
      self.onmessage = function(e) {
        const { dependencies, query, filters } = e.data;
        
        try {
          let results = dependencies;
          
          // Apply text search
          if (query.trim()) {
            const queryLower = query.toLowerCase();
            results = results.filter(dep => 
              dep.group_id.toLowerCase().includes(queryLower) ||
              dep.artifact_id.toLowerCase().includes(queryLower) ||
              (dep.version && dep.version.toLowerCase().includes(queryLower)) ||
              (dep.description && dep.description.toLowerCase().includes(queryLower)) ||
              (dep.group_id + ':' + dep.artifact_id).toLowerCase().includes(queryLower)
            );
          }
          
          // Apply filters
          if (filters.scopes && filters.scopes.length > 0) {
            results = results.filter(dep => filters.scopes.includes(dep.scope));
          }
          
          if (filters.sources && filters.sources.length > 0) {
            results = results.filter(dep => filters.sources.includes(dep.source));
          }
          
          if (filters.conflictStatus !== undefined) {
            results = results.filter(dep => dep.has_conflicts === filters.conflictStatus);
          }
          
          if (filters.conflictSeverity && filters.conflictSeverity.length > 0) {
            results = results.filter(dep => 
              dep.conflict_severity && filters.conflictSeverity.includes(dep.conflict_severity)
            );
          }
          
          if (filters.depth) {
            const { min, max } = filters.depth;
            results = results.filter(dep => {
              if (min !== undefined && dep.depth < min) return false;
              if (max !== undefined && dep.depth > max) return false;
              return true;
            });
          }
          
          if (filters.transitive !== undefined) {
            results = results.filter(dep => dep.is_transitive === filters.transitive);
          }
          
          // Sort results by relevance
          results.sort((a, b) => {
            // Prioritize exact matches
            if (query.trim()) {
              const queryLower = query.toLowerCase();
              const aExact = a.artifact_id.toLowerCase() === queryLower;
              const bExact = b.artifact_id.toLowerCase() === queryLower;
              if (aExact && !bExact) return -1;
              if (!aExact && bExact) return 1;
            }
            
            // Then by conflicts (conflicts first)
            if (a.has_conflicts && !b.has_conflicts) return -1;
            if (!a.has_conflicts && b.has_conflicts) return 1;
            
            // Then by depth (direct dependencies first)
            if (a.depth !== b.depth) return a.depth - b.depth;
            
            // Finally by name
            return (a.group_id + ':' + a.artifact_id).localeCompare(b.group_id + ':' + b.artifact_id);
          });
          
          self.postMessage({ success: true, results });
        } catch (error) {
          self.postMessage({ success: false, error: error.message });
        }
      };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('Search timeout'));
    }, 5000); // 5 second timeout
    
    worker.onmessage = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      URL.revokeObjectURL(blob.toString());
      
      if (e.data.success) {
        resolve(e.data.results);
      } else {
        reject(new Error(e.data.error));
      }
    };
    
    worker.onerror = (error) => {
      clearTimeout(timeout);
      worker.terminate();
      URL.revokeObjectURL(blob.toString());
      reject(error);
    };
    
    worker.postMessage({ dependencies, query, filters });
  });
}
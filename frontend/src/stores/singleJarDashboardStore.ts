import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { apiService } from '@/services/apiService';

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
  
  // Loading and error states
  isLoading: boolean;
  error: string | null;
  
  // Search and filtering
  searchQuery: string;
  filters: SearchFilters;
  searchResults: DependencyNode[];
  
  // UI state
  selectedDependency: string | null;
  expandedNodes: Set<string>;
  
  // Actions
  loadAnalysis: (jarId: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setFilters: (filters: SearchFilters) => void;
  setSelectedDependency: (dependencyId: string | null) => void;
  toggleNodeExpansion: (nodeId: string) => void;
  searchDependencies: (query: string, filters?: SearchFilters) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useSingleJarDashboardStore = create<SingleJarDashboardState>()(
  devtools(
    (set, get) => ({
      // Initial state
      analysisData: null,
      isLoading: false,
      error: null,
      searchQuery: '',
      filters: {},
      searchResults: [],
      selectedDependency: null,
      expandedNodes: new Set(),

      // Load comprehensive analysis data
      loadAnalysis: async (jarId: string) => {
        set({ isLoading: true, error: null });
        
        try {
          // Load comprehensive analysis
          const response = await apiService.get(`/api/v1/jars/${jarId}/analysis/comprehensive`);
          
          if (!response.success) {
            throw new Error(response.error || 'Failed to load analysis');
          }
          
          const analysisData: AnalysisData = response.data;
          
          // Initialize expanded nodes with root dependencies
          const expandedNodes = new Set<string>();
          if (analysisData.dependencyTree.root_dependencies) {
            analysisData.dependencyTree.root_dependencies.forEach(dep => {
              expandedNodes.add(dep.id);
            });
          }
          
          set({ 
            analysisData,
            isLoading: false,
            expandedNodes
          });
          
        } catch (error) {
          console.error('Failed to load analysis:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Failed to load analysis',
            isLoading: false 
          });
        }
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

      // Search dependencies with filters
      searchDependencies: async (query: string, filters: SearchFilters = {}) => {
        const { analysisData } = get();
        
        if (!analysisData) {
          return;
        }
        
        try {
          // If no query and no filters, show all dependencies
          if (!query.trim() && Object.keys(filters).length === 0) {
            set({ searchResults: Object.values(analysisData.dependencyTree.all_dependencies) });
            return;
          }
          
          // Filter dependencies based on query and filters
          let results = Object.values(analysisData.dependencyTree.all_dependencies);
          
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
          
          // Apply scope filter
          if (filters.scopes && filters.scopes.length > 0) {
            results = results.filter(dep => filters.scopes!.includes(dep.scope));
          }
          
          // Apply source filter
          if (filters.sources && filters.sources.length > 0) {
            results = results.filter(dep => filters.sources!.includes(dep.source));
          }
          
          // Apply conflict status filter
          if (filters.conflictStatus !== undefined) {
            results = results.filter(dep => dep.has_conflicts === filters.conflictStatus);
          }
          
          // Apply conflict severity filter
          if (filters.conflictSeverity && filters.conflictSeverity.length > 0) {
            results = results.filter(dep => 
              dep.conflict_severity && filters.conflictSeverity!.includes(dep.conflict_severity)
            );
          }
          
          // Apply depth filter
          if (filters.depth) {
            const { min, max } = filters.depth;
            results = results.filter(dep => {
              if (min !== undefined && dep.depth < min) return false;
              if (max !== undefined && dep.depth > max) return false;
              return true;
            });
          }
          
          // Apply transitive filter
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
          
          set({ searchResults: results });
          
        } catch (error) {
          console.error('Search failed:', error);
          set({ searchResults: [] });
        }
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },

      // Reset state
      reset: () => {
        set({
          analysisData: null,
          isLoading: false,
          error: null,
          searchQuery: '',
          filters: {},
          searchResults: [],
          selectedDependency: null,
          expandedNodes: new Set()
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

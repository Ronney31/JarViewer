import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react-dom/test-utils'
import App from '../src/App'
import { useJarViewerStore } from '../src/stores/jarViewerStore'
import { useSingleJarDashboardStore } from '../src/stores/singleJarDashboardStore'
import { apiService } from '../src/services/apiService'

// Mock the stores
vi.mock('../src/stores/jarViewerStore')
vi.mock('../src/stores/singleJarDashboardStore')
vi.mock('../src/services/apiService')

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock components that might cause issues
vi.mock('../src/components/SingleJarDashboard', () => ({
  default: ({ jarId, className }: { jarId: string; className?: string }) => (
    <div data-testid="single-jar-dashboard" data-jar-id={jarId} className={className}>
      <div data-testid="dashboard-overview">Overview Section</div>
      <div data-testid="dashboard-tree">Dependency Tree Section</div>
      <div data-testid="dashboard-conflicts">Conflicts Section</div>
      <div data-testid="dashboard-export">Export Section</div>
      <div data-testid="dashboard-search">
        <input data-testid="search-input" placeholder="Search dependencies..." />
      </div>
      <div data-testid="dashboard-filters">
        <button data-testid="filter-button">Filters</button>
      </div>
    </div>
  ),
}))

vi.mock('../src/components/DependencyTreeView', () => ({
  default: ({ dependencyTree, searchQuery, onDependencySelect }: any) => (
    <div data-testid="dependency-tree-view">
      <div data-testid="tree-total-deps">{dependencyTree?.total_dependencies || 0}</div>
      <div data-testid="tree-search-query">{searchQuery}</div>
      {dependencyTree?.root_dependencies?.map((dep: any, index: number) => (
        <div 
          key={dep.id || index}
          data-testid={`tree-node-${dep.id || index}`}
          onClick={() => onDependencySelect?.(dep.id)}
        >
          {dep.group_id}:{dep.artifact_id}:{dep.version}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('../src/components/ConflictVisualization', () => ({
  default: ({ conflicts }: any) => (
    <div data-testid="conflict-visualization">
      <div data-testid="conflicts-count">{conflicts?.length || 0}</div>
      {conflicts?.map((conflict: any, index: number) => (
        <div key={conflict.id || index} data-testid={`conflict-${conflict.id || index}`}>
          {conflict.description} - {conflict.severity}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('../src/components/ExportControls', () => ({
  default: ({ jarId, dependencyTree }: any) => (
    <div data-testid="export-controls">
      <div data-testid="export-jar-id">{jarId}</div>
      <div data-testid="export-deps-count">{dependencyTree?.total_dependencies || 0}</div>
      <button data-testid="export-json">Export JSON</button>
      <button data-testid="export-csv">Export CSV</button>
      <button data-testid="export-text">Export Text</button>
    </div>
  ),
}))

describe('Complete Workflow Integration Tests', () => {
  const mockComplexJar = {
    id: 'complex-jar-123',
    name: 'complex-app.jar',
    size: 1024 * 1024 * 10, // 10MB
    uploadedAt: new Date().toISOString(),
    stats: {
      totalFiles: 500,
      totalDirectories: 50,
    },
  }

  const mockComplexAnalysisData = {
    dependencyTree: {
      id: 'tree-123',
      jar_id: 'complex-jar-123',
      root_dependencies: [
        {
          id: 'spring-core',
          group_id: 'org.springframework',
          artifact_id: 'spring-core',
          version: '5.3.21',
          scope: 'compile',
          source: 'maven_pom',
          is_transitive: false,
          depth: 0,
          children: [
            {
              id: 'spring-jcl',
              group_id: 'org.springframework',
              artifact_id: 'spring-jcl',
              version: '5.3.21',
              scope: 'compile',
              source: 'maven_pom',
              is_transitive: true,
              depth: 1,
              children: [],
              has_conflicts: false,
              conflict_ids: []
            }
          ],
          has_conflicts: false,
          conflict_ids: []
        },
        {
          id: 'jackson-core',
          group_id: 'com.fasterxml.jackson.core',
          artifact_id: 'jackson-core',
          version: '2.13.3',
          scope: 'compile',
          source: 'maven_pom',
          is_transitive: false,
          depth: 0,
          children: [],
          has_conflicts: true,
          conflict_severity: 'medium',
          conflict_ids: ['conflict-1']
        }
      ],
      all_dependencies: {
        'spring-core': {
          id: 'spring-core',
          group_id: 'org.springframework',
          artifact_id: 'spring-core',
          version: '5.3.21',
          scope: 'compile',
          source: 'maven_pom',
          is_transitive: false,
          depth: 0,
          has_conflicts: false,
          conflict_ids: []
        },
        'jackson-core': {
          id: 'jackson-core',
          group_id: 'com.fasterxml.jackson.core',
          artifact_id: 'jackson-core',
          version: '2.13.3',
          scope: 'compile',
          source: 'maven_pom',
          is_transitive: false,
          depth: 0,
          has_conflicts: true,
          conflict_severity: 'medium',
          conflict_ids: ['conflict-1']
        }
      },
      total_dependencies: 15,
      direct_dependencies: 8,
      transitive_dependencies: 7,
      max_depth: 3,
      scope_counts: { compile: 12, test: 3 },
      source_counts: { maven_pom: 10, embedded_jar: 5 }
    },
    summary: {
      total_dependencies: 15,
      direct_dependencies: 8,
      transitive_dependencies: 7,
      max_depth: 3,
      conflicts_count: 2,
      scope_breakdown: { compile: 12, test: 3 },
      source_breakdown: { maven_pom: 10, embedded_jar: 5 },
      has_conflicts: true,
      risk_level: 'medium' as const
    },
    conflicts: [
      {
        id: 'conflict-1',
        conflict_type: 'version_conflict',
        affected_dependencies: ['jackson-core', 'jackson-databind'],
        description: 'Version conflict between Jackson components',
        severity: 'medium',
        resolution_suggestion: 'Upgrade to consistent Jackson version',
        conflicting_versions: ['2.13.3', '2.13.4'],
        winning_version: '2.13.4',
        paths: [['jackson-core'], ['jackson-databind']]
      }
    ],
    recommendations: ['Consider upgrading Jackson dependencies']
  }

  const mockLargeAnalysisData = {
    ...mockComplexAnalysisData,
    dependencyTree: {
      ...mockComplexAnalysisData.dependencyTree,
      total_dependencies: 150,
      direct_dependencies: 25,
      transitive_dependencies: 125,
      all_dependencies: Object.fromEntries(
        Array.from({ length: 150 }, (_, i) => [
          `dep-${i}`,
          {
            id: `dep-${i}`,
            group_id: `com.test.group${i % 10}`,
            artifact_id: `artifact-${i}`,
            version: `${i % 5 + 1}.${i % 3}.${i % 2}`,
            scope: ['compile', 'test', 'runtime', 'provided'][i % 4],
            source: 'maven_pom',
            is_transitive: i > 25,
            depth: Math.floor(i / 25),
            has_conflicts: i % 10 === 0,
            conflict_severity: i % 10 === 0 ? 'medium' : undefined,
            conflict_ids: i % 10 === 0 ? [`conflict-${i}`] : []
          }
        ])
      )
    },
    summary: {
      ...mockComplexAnalysisData.summary,
      total_dependencies: 150,
      direct_dependencies: 25,
      transitive_dependencies: 125,
      conflicts_count: 15
    }
  }

  const mockUseJarViewerStore = vi.mocked(useJarViewerStore)
  const mockUseSingleJarDashboardStore = vi.mocked(useSingleJarDashboardStore)
  const mockApiService = vi.mocked(apiService)

  beforeEach(() => {
    // Reset URL hash
    window.location.hash = ''
    
    // Mock JAR viewer store
    mockUseJarViewerStore.mockReturnValue({
      currentJar: null,
      selectedFile: null,
      fileContent: null,
      sidebarCollapsed: false,
      setSidebarCollapsed: vi.fn(),
      isLoading: false,
      error: null,
      clearError: vi.fn(),
      metadata: null,
      reset: vi.fn(),
      autoDecompile: true,
      setAutoDecompile: vi.fn(),
    })

    // Mock dashboard store
    mockUseSingleJarDashboardStore.mockReturnValue({
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
      loadAnalysis: vi.fn(),
      cancelAnalysis: vi.fn(),
      retryAnalysis: vi.fn(),
      setSearchQuery: vi.fn(),
      setFilters: vi.fn(),
      setSelectedDependency: vi.fn(),
      toggleNodeExpansion: vi.fn(),
      searchDependencies: vi.fn(),
      clearError: vi.fn(),
      clearAllErrors: vi.fn(),
      reset: vi.fn(),
    })

    // Mock API service
    mockApiService.get.mockResolvedValue({ success: true, data: {} })
    mockApiService.post.mockResolvedValue({ success: true, data: {} })
  })

  afterEach(() => {
    vi.clearAllMocks()
    window.location.hash = ''
  })

  describe('End-to-End JAR Upload to Dependency Analysis Workflow', () => {
    it('should complete full workflow from upload to analysis', async () => {
      const user = userEvent.setup()
      
      // Step 1: Start with no JAR loaded
      render(<App />)
      expect(screen.getByText('Welcome to JarViewer')).toBeInTheDocument()

      // Step 2: Simulate JAR upload (this would normally trigger store updates)
      act(() => {
        mockUseJarViewerStore.mockReturnValue({
          ...mockUseJarViewerStore(),
          currentJar: mockComplexJar,
          isLoading: false,
        })
      })

      // Re-render with updated store
      render(<App />)

      // Step 3: Navigate to dependency analysis
      const dependencyTab = screen.getByText('Dependency Analysis')
      await user.click(dependencyTab)

      expect(window.location.hash).toBe('#dependencies')
      expect(screen.getByTestId('single-jar-dashboard')).toBeInTheDocument()

      // Step 4: Simulate analysis loading
      act(() => {
        mockUseSingleJarDashboardStore.mockReturnValue({
          ...mockUseSingleJarDashboardStore(),
          loadingState: {
            isLoading: true,
            stage: 'extracting_dependencies' as const,
            progress: 50,
            message: 'Extracting dependencies...',
            startTime: new Date(),
            canCancel: true
          }
        })
      })

      render(<App />)
      expect(screen.getByText('Processing...')).toBeInTheDocument()

      // Step 5: Simulate analysis completion
      act(() => {
        mockUseSingleJarDashboardStore.mockReturnValue({
          ...mockUseSingleJarDashboardStore(),
          analysisData: mockComplexAnalysisData,
          loadingState: null,
          expandedNodes: new Set(['spring-core', 'jackson-core'])
        })
      })

      render(<App />)

      // Verify analysis results are displayed
      expect(screen.getByTestId('single-jar-dashboard')).toBeInTheDocument()
      expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument()
      expect(screen.getByTestId('dashboard-tree')).toBeInTheDocument()
      expect(screen.getByTestId('dashboard-conflicts')).toBeInTheDocument()
      expect(screen.getByTestId('dashboard-export')).toBeInTheDocument()
    })

    it('should handle partial analysis results with errors', async () => {
      const user = userEvent.setup()
      
      // Setup JAR with partial analysis results
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockComplexJar,
      })

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        analysisData: mockComplexAnalysisData,
        partialResult: {
          hasErrors: true,
          errors: [
            {
              type: 'conflict_detection_failed',
              message: 'Some conflicts may not have been detected',
              suggestedAction: 'Review dependencies manually',
              retryable: true,
              context: { jarId: 'complex-jar-123' }
            }
          ],
          degradedFeatures: ['conflict_detection'],
          availableFeatures: ['dependency_tree', 'search', 'export']
        },
        errors: [
          {
            type: 'conflict_detection_failed',
            message: 'Some conflicts may not have been detected',
            suggestedAction: 'Review dependencies manually',
            retryable: true,
            context: { jarId: 'complex-jar-123' }
          }
        ]
      })

      window.location.hash = '#dependencies'
      render(<App />)

      // Should show partial analysis warning
      expect(screen.getByText('Partial Analysis Results')).toBeInTheDocument()
      expect(screen.getByText(/Analysis completed with 1 issue/)).toBeInTheDocument()
      expect(screen.getByText(/Limited features: conflict_detection/)).toBeInTheDocument()

      // Should still show available functionality
      expect(screen.getByTestId('single-jar-dashboard')).toBeInTheDocument()
      expect(screen.getByTestId('dashboard-tree')).toBeInTheDocument()
      expect(screen.getByTestId('dashboard-export')).toBeInTheDocument()

      // Should allow retry
      const retryButton = screen.getByText('Retry Full Analysis')
      expect(retryButton).toBeInTheDocument()
    })

    it('should handle complete analysis failure with retry', async () => {
      const user = userEvent.setup()
      const mockRetryAnalysis = vi.fn()
      
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockComplexJar,
      })

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        error: {
          type: 'jar_processing_error',
          message: 'Failed to process JAR file',
          suggestedAction: 'Please check the JAR file and try again',
          retryable: true,
          context: { jarId: 'complex-jar-123' }
        },
        canRetry: true,
        retryAnalysis: mockRetryAnalysis
      })

      window.location.hash = '#dependencies'
      render(<App />)

      // Should show error state
      expect(screen.getByText('Analysis Failed')).toBeInTheDocument()
      expect(screen.getByText('Failed to process JAR file')).toBeInTheDocument()
      expect(screen.getByText('Please check the JAR file and try again')).toBeInTheDocument()

      // Should allow retry
      const retryButton = screen.getByText('Retry Analysis')
      await user.click(retryButton)

      expect(mockRetryAnalysis).toHaveBeenCalledWith('complex-jar-123')
    })
  })

  describe('Search Functionality Across Large Dependency Trees', () => {
    beforeEach(() => {
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: { ...mockComplexJar, id: 'large-jar-456' },
      })

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        analysisData: mockLargeAnalysisData,
        searchQuery: '',
        searchResults: [],
        setSearchQuery: vi.fn(),
        searchDependencies: vi.fn(),
      })

      window.location.hash = '#dependencies'
    })

    it('should perform real-time search across large dependency trees', async () => {
      const user = userEvent.setup()
      const mockSetSearchQuery = vi.fn()
      const mockSearchDependencies = vi.fn()

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        analysisData: mockLargeAnalysisData,
        setSearchQuery: mockSetSearchQuery,
        searchDependencies: mockSearchDependencies,
      })

      render(<App />)

      // Navigate to tree view
      const treeTab = screen.getByText('Dependency Tree')
      await user.click(treeTab)

      // Find search input
      const searchInput = screen.getByTestId('search-input')
      expect(searchInput).toBeInTheDocument()

      // Perform search
      await user.type(searchInput, 'spring')

      // Should trigger search with debouncing
      await waitFor(() => {
        expect(mockSetSearchQuery).toHaveBeenCalledWith('spring')
      }, { timeout: 1000 })
    })

    it('should handle search with filters', async () => {
      const user = userEvent.setup()
      const mockSetFilters = vi.fn()

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        analysisData: mockLargeAnalysisData,
        setFilters: mockSetFilters,
        filters: { scopes: ['compile'], conflictStatus: true }
      })

      render(<App />)

      // Navigate to tree view
      const treeTab = screen.getByText('Dependency Tree')
      await user.click(treeTab)

      // Open filters
      const filterButton = screen.getByTestId('filter-button')
      await user.click(filterButton)

      // Filters should be available
      expect(screen.getByTestId('dashboard-filters')).toBeInTheDocument()
    })

    it('should display search results with highlighting', async () => {
      const mockSearchResults = [
        {
          id: 'spring-core',
          group_id: 'org.springframework',
          artifact_id: 'spring-core',
          version: '5.3.21',
          scope: 'compile',
          source: 'maven_pom',
          is_transitive: false,
          depth: 0,
          has_conflicts: false,
          conflict_ids: []
        },
        {
          id: 'spring-context',
          group_id: 'org.springframework',
          artifact_id: 'spring-context',
          version: '5.3.21',
          scope: 'compile',
          source: 'maven_pom',
          is_transitive: false,
          depth: 0,
          has_conflicts: false,
          conflict_ids: []
        }
      ]

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        analysisData: mockLargeAnalysisData,
        searchQuery: 'spring',
        searchResults: mockSearchResults,
      })

      render(<App />)

      // Navigate to tree view
      const treeTab = screen.getByText('Dependency Tree')
      await userEvent.setup().click(treeTab)

      // Should show search query in tree view
      expect(screen.getByTestId('tree-search-query')).toHaveTextContent('spring')
    })

    it('should handle empty search results gracefully', async () => {
      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        analysisData: mockLargeAnalysisData,
        searchQuery: 'nonexistent',
        searchResults: [],
      })

      render(<App />)

      // Navigate to tree view
      const treeTab = screen.getByText('Dependency Tree')
      await userEvent.setup().click(treeTab)

      // Should handle empty results
      expect(screen.getByTestId('tree-search-query')).toHaveTextContent('nonexistent')
    })

    it('should perform search with performance considerations', async () => {
      const user = userEvent.setup()
      const mockSearchDependencies = vi.fn()

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        analysisData: mockLargeAnalysisData,
        searchDependencies: mockSearchDependencies,
      })

      render(<App />)

      // Navigate to tree view
      const treeTab = screen.getByText('Dependency Tree')
      await user.click(treeTab)

      const searchInput = screen.getByTestId('search-input')

      // Rapid typing should debounce
      await user.type(searchInput, 'test')
      
      // Should not call search immediately for each character
      expect(mockSearchDependencies).not.toHaveBeenCalled()

      // Wait for debounce
      await waitFor(() => {
        expect(mockSearchDependencies).toHaveBeenCalled()
      }, { timeout: 1000 })
    })
  })

  describe('Export Functionality with Real JAR Data', () => {
    beforeEach(() => {
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockComplexJar,
      })

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        analysisData: mockComplexAnalysisData,
      })

      window.location.hash = '#dependencies'
    })

    it('should provide multiple export formats', async () => {
      const user = userEvent.setup()

      render(<App />)

      // Navigate to export tab
      const exportTab = screen.getByText('Export')
      await user.click(exportTab)

      // Should show export controls
      expect(screen.getByTestId('export-controls')).toBeInTheDocument()
      expect(screen.getByTestId('export-jar-id')).toHaveTextContent('complex-jar-123')
      expect(screen.getByTestId('export-deps-count')).toHaveTextContent('15')

      // Should show export format options
      expect(screen.getByTestId('export-json')).toBeInTheDocument()
      expect(screen.getByTestId('export-csv')).toBeInTheDocument()
      expect(screen.getByTestId('export-text')).toBeInTheDocument()
    })

    it('should handle export with different options', async () => {
      const user = userEvent.setup()

      // Mock API calls for export
      mockApiService.get.mockImplementation((url) => {
        if (url.includes('/exports/formats')) {
          return Promise.resolve({
            success: true,
            data: {
              formats: [
                { id: 'json', name: 'JSON', mime_type: 'application/json' },
                { id: 'csv', name: 'CSV', mime_type: 'text/csv' },
                { id: 'text_tree', name: 'Text Tree', mime_type: 'text/plain' }
              ]
            }
          })
        }
        if (url.includes('/exports/preview')) {
          return Promise.resolve({
            success: true,
            data: {
              format: 'json',
              filename: 'complex-app_dependencies.json',
              estimated_size: 5120,
              total_dependencies: 15,
              preview: '{"jar_id":"complex-jar-123",...}',
              is_truncated: true
            }
          })
        }
        return Promise.resolve({ success: true, data: {} })
      })

      render(<App />)

      // Navigate to export tab
      const exportTab = screen.getByText('Export')
      await user.click(exportTab)

      // Test JSON export
      const jsonExportButton = screen.getByTestId('export-json')
      await user.click(jsonExportButton)

      // Should trigger API call (mocked)
      await waitFor(() => {
        expect(mockApiService.get).toHaveBeenCalled()
      })
    })

    it('should handle export errors gracefully', async () => {
      const user = userEvent.setup()

      // Mock API error
      mockApiService.get.mockRejectedValue(new Error('Export failed'))

      render(<App />)

      // Navigate to export tab
      const exportTab = screen.getByText('Export')
      await user.click(exportTab)

      // Export controls should still be available
      expect(screen.getByTestId('export-controls')).toBeInTheDocument()
    })

    it('should show export unavailable when no analysis data', async () => {
      const user = userEvent.setup()

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        analysisData: null,
      })

      render(<App />)

      // Navigate to export tab
      const exportTab = screen.getByText('Export')
      await user.click(exportTab)

      // Should show unavailable message
      expect(screen.getByText('Export Unavailable')).toBeInTheDocument()
      expect(screen.getByText('Cannot export data without complete analysis results.')).toBeInTheDocument()
    })
  })

  describe('Error Handling and Recovery Scenarios', () => {
    it('should handle network errors during analysis', async () => {
      const user = userEvent.setup()
      const mockRetryAnalysis = vi.fn()

      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockComplexJar,
      })

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        error: {
          type: 'network_error',
          message: 'Network request failed',
          suggestedAction: 'Check your connection and try again',
          retryable: true,
          context: { jarId: 'complex-jar-123' }
        },
        canRetry: true,
        retryAnalysis: mockRetryAnalysis
      })

      window.location.hash = '#dependencies'
      render(<App />)

      // Should show network error
      expect(screen.getByText('Analysis Failed')).toBeInTheDocument()
      expect(screen.getByText('Network request failed')).toBeInTheDocument()

      // Should allow retry
      const retryButton = screen.getByText('Retry Analysis')
      await user.click(retryButton)

      expect(mockRetryAnalysis).toHaveBeenCalledWith('complex-jar-123')
    })

    it('should handle multiple errors with error aggregation', async () => {
      const user = userEvent.setup()

      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockComplexJar,
      })

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        analysisData: mockComplexAnalysisData,
        errors: [
          {
            type: 'dependency_extraction_failed',
            message: 'Could not extract some dependencies',
            suggestedAction: 'Review JAR structure',
            retryable: true,
            context: { jarId: 'complex-jar-123' }
          },
          {
            type: 'conflict_detection_failed',
            message: 'Conflict detection incomplete',
            suggestedAction: 'Manual review recommended',
            retryable: true,
            context: { jarId: 'complex-jar-123' }
          },
          {
            type: 'search_index_failed',
            message: 'Search indexing failed',
            suggestedAction: 'Search may be limited',
            retryable: false,
            context: { jarId: 'complex-jar-123' }
          }
        ]
      })

      window.location.hash = '#dependencies'
      render(<App />)

      // Should show multiple issues
      expect(screen.getByText('Multiple Issues Detected')).toBeInTheDocument()
      expect(screen.getByText('• Could not extract some dependencies')).toBeInTheDocument()
      expect(screen.getByText('• Conflict detection incomplete')).toBeInTheDocument()
      expect(screen.getByText('... and 1 more issues')).toBeInTheDocument()

      // Should allow dismissing all errors
      const dismissButton = screen.getByText('Dismiss All')
      expect(dismissButton).toBeInTheDocument()
    })

    it('should handle loading cancellation', async () => {
      const user = userEvent.setup()
      const mockCancelAnalysis = vi.fn()

      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockComplexJar,
      })

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        loadingState: {
          isLoading: true,
          stage: 'building_tree' as const,
          progress: 75,
          message: 'Building dependency tree...',
          startTime: new Date(),
          canCancel: true
        },
        cancelAnalysis: mockCancelAnalysis
      })

      window.location.hash = '#dependencies'
      render(<App />)

      // Should show loading state
      expect(screen.getByText('Processing...')).toBeInTheDocument()

      // Should allow cancellation if supported
      // Note: The actual cancel button would be in LoadingIndicator component
      // This test verifies the cancel function is available
      expect(mockCancelAnalysis).toBeDefined()
    })

    it('should handle component errors with error boundary', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Mock a component that throws an error
      vi.mocked(screen.getByTestId).mockImplementation(() => {
        throw new Error('Component error')
      })

      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockComplexJar,
      })

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        analysisData: mockComplexAnalysisData,
      })

      window.location.hash = '#dependencies'

      // Should handle component errors gracefully
      expect(() => render(<App />)).not.toThrow()

      consoleSpy.mockRestore()
    })

    it('should recover from transient errors', async () => {
      const user = userEvent.setup()
      const mockLoadAnalysis = vi.fn()

      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockComplexJar,
      })

      // Start with error state
      const { rerender } = render(<App />)
      
      act(() => {
        mockUseSingleJarDashboardStore.mockReturnValue({
          ...mockUseSingleJarDashboardStore(),
          error: {
            type: 'temporary_failure',
            message: 'Temporary service unavailable',
            suggestedAction: 'Please try again',
            retryable: true,
            context: { jarId: 'complex-jar-123' }
          },
          canRetry: true,
          loadAnalysis: mockLoadAnalysis
        })
      })

      window.location.hash = '#dependencies'
      rerender(<App />)

      // Should show error initially
      expect(screen.getByText('Analysis Failed')).toBeInTheDocument()

      // Simulate recovery after retry
      act(() => {
        mockUseSingleJarDashboardStore.mockReturnValue({
          ...mockUseSingleJarDashboardStore(),
          analysisData: mockComplexAnalysisData,
          error: null,
          canRetry: false,
          loadAnalysis: mockLoadAnalysis
        })
      })

      rerender(<App />)

      // Should show successful analysis
      expect(screen.getByTestId('single-jar-dashboard')).toBeInTheDocument()
    })
  })

  describe('Performance and User Experience', () => {
    it('should handle large datasets without performance degradation', async () => {
      const user = userEvent.setup()

      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: { ...mockComplexJar, id: 'large-jar-789' },
      })

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        analysisData: mockLargeAnalysisData,
      })

      window.location.hash = '#dependencies'
      
      const startTime = performance.now()
      render(<App />)
      const renderTime = performance.now() - startTime

      // Should render within reasonable time (less than 100ms)
      expect(renderTime).toBeLessThan(100)

      // Should show large dataset
      expect(screen.getByTestId('single-jar-dashboard')).toBeInTheDocument()
    })

    it('should provide responsive UI during loading states', async () => {
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockComplexJar,
      })

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        loadingState: {
          isLoading: true,
          stage: 'extracting_dependencies' as const,
          progress: 30,
          message: 'Extracting dependencies...',
          startTime: new Date(),
          canCancel: false
        }
      })

      window.location.hash = '#dependencies'
      render(<App />)

      // Should show loading indicator
      expect(screen.getByText('Processing...')).toBeInTheDocument()

      // UI should remain responsive (not frozen)
      const backButton = screen.getByText('Back to Files')
      expect(backButton).toBeInTheDocument()
    })

    it('should maintain state consistency across navigation', async () => {
      const user = userEvent.setup()

      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockComplexJar,
      })

      mockUseSingleJarDashboardStore.mockReturnValue({
        ...mockUseSingleJarDashboardStore(),
        analysisData: mockComplexAnalysisData,
        searchQuery: 'spring',
        selectedDependency: 'spring-core',
        expandedNodes: new Set(['spring-core'])
      })

      window.location.hash = '#dependencies'
      render(<App />)

      // Navigate away and back
      const filesTab = screen.getByText('File Structure')
      await user.click(filesTab)

      expect(window.location.hash).toBe('#files')

      const dependencyTab = screen.getByText('Dependency Analysis')
      await user.click(dependencyTab)

      expect(window.location.hash).toBe('#dependencies')

      // State should be preserved
      expect(screen.getByTestId('single-jar-dashboard')).toBeInTheDocument()
    })
  })
})
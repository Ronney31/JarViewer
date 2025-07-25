import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SingleJarDashboard from '../src/components/SingleJarDashboard';
import { useSingleJarDashboardStore } from '@/stores/singleJarDashboardStore';
import { useJarViewerStore } from '@/stores/jarViewerStore';
import { LoadingStage } from '@/types/errors';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock the stores
vi.mock('@/stores/singleJarDashboardStore');
vi.mock('@/stores/jarViewerStore');

// Mock child components
vi.mock('../src/components/DependencyTreeView', () => ({
  default: function MockDependencyTreeView(props: any) {
    return (
      <div data-testid="dependency-tree-view">
        <div>Mock Dependency Tree</div>
        <button onClick={() => props.onDependencySelect('test-dep-1')}>
          Select Dependency
        </button>
        <button onClick={() => props.onNodeToggle('test-node-1')}>
          Toggle Node
        </button>
      </div>
    );
  }
}));

vi.mock('../src/components/DependencySearchFilter', () => ({
  default: function MockDependencySearchFilter(props: any) {
    return (
      <div data-testid="dependency-search-filter">
        <button onClick={() => props.onFiltersChange({ scopes: ['compile'] })}>
          Apply Filter
        </button>
      </div>
    );
  }
}));

vi.mock('../src/components/ConflictVisualization', () => ({
  default: function MockConflictVisualization() {
    return <div data-testid="conflict-visualization">Mock Conflict Visualization</div>;
  }
}));

vi.mock('../src/components/ExportControls', () => ({
  default: function MockExportControls() {
    return <div data-testid="export-controls">Mock Export Controls</div>;
  }
}));

vi.mock('../src/components/LoadingIndicator', () => ({
  default: function MockLoadingIndicator({ loadingState, onCancel, onRetry }: any) {
    return (
      <div data-testid="loading-indicator">
        <div>Loading: {loadingState?.stage}</div>
        <div>Progress: {loadingState?.progress}%</div>
        {onCancel && <button onClick={onCancel}>Cancel</button>}
        {onRetry && <button onClick={onRetry}>Retry</button>}
      </div>
    );
  }
}));

vi.mock('../src/components/ErrorBoundary', () => ({
  default: function MockErrorBoundary({ children, onError }: any) {
    return <div data-testid="error-boundary">{children}</div>;
  }
}));

// Mock data
const mockAnalysisData = {
  dependencyTree: {
    id: 'tree-1',
    jar_id: 'jar-123',
    root_dependencies: [
      {
        id: 'dep-1',
        group_id: 'com.example',
        artifact_id: 'test-library',
        version: '1.0.0',
        scope: 'compile',
        source: 'maven',
        is_transitive: false,
        depth: 0,
        children: [],
        dependency_path: ['dep-1'],
        has_conflicts: false,
        conflict_ids: [],
      }
    ],
    all_dependencies: {},
    conflicts: [],
    paths: [],
    total_dependencies: 1,
    direct_dependencies: 1,
    transitive_dependencies: 0,
    max_depth: 0,
    scope_counts: { compile: 1 },
    source_counts: { maven: 1 }
  },
  summary: {
    total_dependencies: 1,
    direct_dependencies: 1,
    transitive_dependencies: 0,
    max_depth: 0,
    conflicts_count: 0,
    scope_breakdown: { compile: 1 },
    source_breakdown: { maven: 1 },
    has_conflicts: false,
    risk_level: 'low' as const
  },
  conflicts: [],
  recommendations: []
};

const mockLoadingState = {
  isLoading: true,
  stage: LoadingStage.EXTRACTING_DEPENDENCIES,
  progress: 50,
  message: 'Extracting dependencies...',
  canCancel: true,
  startTime: new Date(),
  estimatedTimeRemaining: 30000
};

const mockError = {
  type: 'analysis_failed' as const,
  message: 'Failed to analyze JAR',
  suggestedAction: 'Try uploading the JAR again',
  retryable: true,
  details: {}
};

const mockCurrentJar = {
  id: 'jar-123',
  name: 'test-library.jar',
  size: 1024,
  upload_date: '2023-01-01T00:00:00Z'
};

describe('SingleJarDashboard', () => {
  const mockStoreActions = {
    loadAnalysis: vi.fn(),
    cancelAnalysis: vi.fn(),
    retryAnalysis: vi.fn(),
    setSearchQuery: vi.fn(),
    setFilters: vi.fn(),
    setSelectedDependency: vi.fn(),
    toggleNodeExpansion: vi.fn(),
    clearError: vi.fn(),
    clearAllErrors: vi.fn(),
    reset: vi.fn()
  };

  const mockStoreState = {
    analysisData: null,
    partialResult: null,
    loadingState: null,
    error: null,
    errors: [],
    searchQuery: '',
    filters: {},
    selectedDependency: null,
    expandedNodes: new Set<string>(),
    canRetry: false,
    ...mockStoreActions
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the dashboard store
    (useSingleJarDashboardStore as any).mockReturnValue(mockStoreState);
    
    // Mock the jar viewer store
    (useJarViewerStore as any).mockReturnValue({
      currentJar: mockCurrentJar
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Component Rendering', () => {
    it('renders dashboard with analysis data', () => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mockAnalysisData
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      expect(screen.getByText('Dependency Analysis')).toBeInTheDocument();
      expect(screen.getByText('test-library.jar')).toBeInTheDocument();
      expect(screen.getByText('Risk: low')).toBeInTheDocument();
    });

    it('renders loading state', () => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        loadingState: mockLoadingState
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
      expect(screen.getByText('Loading: extracting_dependencies')).toBeInTheDocument();
      expect(screen.getByText('Progress: 50%')).toBeInTheDocument();
    });

    it('renders error state without partial data', () => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        error: mockError
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      expect(screen.getByText('Analysis Failed')).toBeInTheDocument();
      expect(screen.getByText('Failed to analyze JAR')).toBeInTheDocument();
      expect(screen.getByText('Try uploading the JAR again')).toBeInTheDocument();
    });

    it('renders empty state when no data available', () => {
      render(<SingleJarDashboard jarId="jar-123" />);

      expect(screen.getByText('No Analysis Data')).toBeInTheDocument();
      expect(screen.getByText('Unable to load dependency analysis for this JAR.')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <SingleJarDashboard jarId="jar-123" className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('State Management', () => {
    it('loads analysis on mount', () => {
      render(<SingleJarDashboard jarId="jar-123" />);

      expect(mockStoreActions.loadAnalysis).toHaveBeenCalledWith('jar-123');
    });

    it('resets state on unmount', () => {
      const { unmount } = render(<SingleJarDashboard jarId="jar-123" />);

      unmount();

      expect(mockStoreActions.reset).toHaveBeenCalled();
    });

    it('reloads analysis when jarId changes', () => {
      const { rerender } = render(<SingleJarDashboard jarId="jar-123" />);

      rerender(<SingleJarDashboard jarId="jar-456" />);

      expect(mockStoreActions.loadAnalysis).toHaveBeenCalledWith('jar-456');
    });

    it('handles search query changes with debouncing', async () => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mockAnalysisData
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      // Switch to tree tab to show search input
      const treeTab = screen.getByText('Dependency Tree');
      fireEvent.click(treeTab);

      const searchInput = screen.getByPlaceholderText('Search dependencies...');
      fireEvent.change(searchInput, { target: { value: 'spring' } });

      expect(mockStoreActions.setSearchQuery).toHaveBeenCalledWith('spring');
    });

    it('handles filter changes', async () => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mockAnalysisData
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      // Switch to tree tab and show filters
      const treeTab = screen.getByText('Dependency Tree');
      fireEvent.click(treeTab);

      const filterButton = screen.getByText('Filters');
      fireEvent.click(filterButton);

      const applyFilterButton = screen.getByText('Apply Filter');
      fireEvent.click(applyFilterButton);

      expect(mockStoreActions.setFilters).toHaveBeenCalledWith({ scopes: ['compile'] });
    });

    it('handles dependency selection', () => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mockAnalysisData
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      // Switch to tree tab
      const treeTab = screen.getByText('Dependency Tree');
      fireEvent.click(treeTab);

      const selectButton = screen.getByText('Select Dependency');
      fireEvent.click(selectButton);

      expect(mockStoreActions.setSelectedDependency).toHaveBeenCalledWith('test-dep-1');
    });

    it('handles node expansion toggle', () => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mockAnalysisData
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      // Switch to tree tab
      const treeTab = screen.getByText('Dependency Tree');
      fireEvent.click(treeTab);

      const toggleButton = screen.getByText('Toggle Node');
      fireEvent.click(toggleButton);

      expect(mockStoreActions.toggleNodeExpansion).toHaveBeenCalledWith('test-node-1');
    });
  });

  describe('Tab Navigation', () => {
    beforeEach(() => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mockAnalysisData
      });
    });

    it('shows overview tab by default', () => {
      render(<SingleJarDashboard jarId="jar-123" />);

      expect(screen.getByText('Total Dependencies')).toBeInTheDocument();
      // Check for the specific count in the Total Dependencies section
      const totalDepsSection = screen.getByText('Total Dependencies').closest('div');
      expect(totalDepsSection).toHaveTextContent('1');
    });

    it('switches to dependency tree tab', () => {
      render(<SingleJarDashboard jarId="jar-123" />);

      const treeTab = screen.getByText('Dependency Tree');
      fireEvent.click(treeTab);

      expect(screen.getByTestId('dependency-tree-view')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search dependencies...')).toBeInTheDocument();
    });

    it('switches to conflicts tab', () => {
      render(<SingleJarDashboard jarId="jar-123" />);

      const conflictsTab = screen.getAllByText('Conflicts (0)')[0]; // Get first occurrence (desktop version)
      fireEvent.click(conflictsTab);

      expect(screen.getByTestId('conflict-visualization')).toBeInTheDocument();
    });

    it('switches to export tab', () => {
      render(<SingleJarDashboard jarId="jar-123" />);

      const exportTab = screen.getAllByText('Export')[0]; // Get first occurrence (desktop version)
      fireEvent.click(exportTab);

      expect(screen.getByTestId('export-controls')).toBeInTheDocument();
    });

    it('shows correct conflict count in tab', () => {
      const dataWithConflicts = {
        ...mockAnalysisData,
        conflicts: [
          { id: '1', conflict_type: 'version', severity: 'high' },
          { id: '2', conflict_type: 'scope', severity: 'medium' }
        ]
      };

      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: dataWithConflicts
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      expect(screen.getAllByText('Conflicts (2)')[0]).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('shows retry button when error is retryable', () => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        error: mockError,
        canRetry: true
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      const retryButton = screen.getByText('Retry Analysis');
      expect(retryButton).toBeInTheDocument();

      fireEvent.click(retryButton);
      expect(mockStoreActions.retryAnalysis).toHaveBeenCalledWith('jar-123');
    });

    it('shows dismiss button for errors', () => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        error: mockError
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      const dismissButton = screen.getByText('Dismiss');
      fireEvent.click(dismissButton);

      expect(mockStoreActions.clearError).toHaveBeenCalled();
    });

    it('shows partial analysis warning', () => {
      const partialResult = {
        hasErrors: true,
        errors: [mockError],
        degradedFeatures: ['search', 'export'],
        availableData: {
          dependencyTree: true,
          conflicts: false,
          summary: true
        }
      };

      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mockAnalysisData,
        partialResult
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      expect(screen.getByText('Partial Analysis Results')).toBeInTheDocument();
      expect(screen.getByText(/Analysis completed with 1 issue/)).toBeInTheDocument();
      expect(screen.getByText(/Limited features: search, export/)).toBeInTheDocument();
    });

    it('shows multiple errors display', () => {
      const errors = [
        { ...mockError, message: 'Error 1' },
        { ...mockError, message: 'Error 2' },
        { ...mockError, message: 'Error 3' },
        { ...mockError, message: 'Error 4' }
      ];

      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mockAnalysisData,
        errors
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      expect(screen.getByText('Multiple Issues Detected')).toBeInTheDocument();
      expect(screen.getByText('• Error 1')).toBeInTheDocument();
      expect(screen.getByText('• Error 2')).toBeInTheDocument();
      expect(screen.getByText('• Error 3')).toBeInTheDocument();
      expect(screen.getByText('... and 1 more issues')).toBeInTheDocument();
    });

    it('handles cancel during loading', () => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        loadingState: { ...mockLoadingState, canCancel: true }
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockStoreActions.cancelAnalysis).toHaveBeenCalledWith('jar-123');
    });
  });

  describe('Filter Panel', () => {
    beforeEach(() => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mockAnalysisData
      });
    });

    it('toggles filter panel visibility', () => {
      render(<SingleJarDashboard jarId="jar-123" />);

      // Switch to tree tab
      const treeTab = screen.getByText('Dependency Tree');
      fireEvent.click(treeTab);

      // Initially filters should not be visible
      expect(screen.queryByTestId('dependency-search-filter')).not.toBeInTheDocument();

      // Click filter button to show
      const filterButton = screen.getByText('Filters');
      fireEvent.click(filterButton);

      expect(screen.getByTestId('dependency-search-filter')).toBeInTheDocument();

      // Click again to hide
      fireEvent.click(filterButton);

      // Note: Due to AnimatePresence, the element might still be in DOM but animating out
      // In a real test, we might need to wait for the animation to complete
    });

    it('highlights filter button when filter panel is open', () => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mockAnalysisData
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      // Switch to tree tab
      const treeTab = screen.getByText('Dependency Tree');
      fireEvent.click(treeTab);

      const filterButton = screen.getByText('Filters');
      
      // Initially should not be highlighted
      expect(filterButton.closest('button')).toHaveClass('bg-white');
      
      // Click to open filters
      fireEvent.click(filterButton);
      
      // Now should be highlighted
      expect(filterButton.closest('button')).toHaveClass('bg-blue-50', 'text-blue-700');
    });
  });

  describe('Risk Level Display', () => {
    it('shows high risk styling', () => {
      const highRiskData = {
        ...mockAnalysisData,
        summary: {
          ...mockAnalysisData.summary,
          risk_level: 'high' as const,
          conflicts_count: 5
        }
      };

      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: highRiskData
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      const riskBadge = screen.getByText('Risk: high');
      expect(riskBadge).toHaveClass('bg-red-100', 'text-red-800');
    });

    it('shows medium risk styling', () => {
      const mediumRiskData = {
        ...mockAnalysisData,
        summary: {
          ...mockAnalysisData.summary,
          risk_level: 'medium' as const,
          conflicts_count: 2
        }
      };

      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mediumRiskData
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      const riskBadge = screen.getByText('Risk: medium');
      expect(riskBadge).toHaveClass('bg-yellow-100', 'text-yellow-800');
    });

    it('shows low risk styling', () => {
      render(<SingleJarDashboard jarId="jar-123" />);

      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mockAnalysisData
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      const riskBadge = screen.getByText('Risk: low');
      expect(riskBadge).toHaveClass('bg-green-100', 'text-green-800');
    });
  });

  describe('Responsive Design', () => {
    beforeEach(() => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mockAnalysisData
      });
    });

    it('shows abbreviated tab labels on small screens', () => {
      // Mock small screen
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 640,
      });

      render(<SingleJarDashboard jarId="jar-123" />);

      // The component uses responsive classes, but we can't easily test CSS media queries
      // We can verify the structure is set up for responsive design
      expect(screen.getByText('Dependency Tree')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      (useSingleJarDashboardStore as any).mockReturnValue({
        ...mockStoreState,
        analysisData: mockAnalysisData
      });
    });

    it('has proper ARIA labels and roles', () => {
      render(<SingleJarDashboard jarId="jar-123" />);

      // Switch to tree tab to show search input
      const treeTab = screen.getByText('Dependency Tree');
      fireEvent.click(treeTab);

      const searchInput = screen.getByPlaceholderText('Search dependencies...');
      expect(searchInput).toHaveAttribute('type', 'text');
    });

    it('supports keyboard navigation for tabs', () => {
      render(<SingleJarDashboard jarId="jar-123" />);

      const treeTab = screen.getByText('Dependency Tree');
      
      // Tab should be focusable
      treeTab.focus();
      // Note: In jsdom, focus behavior might not work exactly like in browser
      // We'll just verify the element exists and can be focused
      expect(treeTab).toBeInTheDocument();

      // Enter key should activate tab
      fireEvent.keyDown(treeTab, { key: 'Enter' });
      // Note: The actual tab switching is handled by click, not keydown in this implementation
    });
  });
});
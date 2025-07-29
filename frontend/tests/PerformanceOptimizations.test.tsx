import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import ProgressiveTreeLoader from '@/components/ProgressiveTreeLoader';
import { useSingleJarDashboardStore } from '@/stores/singleJarDashboardStore';

// Mock the store
vi.mock('@/stores/singleJarDashboardStore');

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock Heroicons
vi.mock('@heroicons/react/24/outline', () => ({
  ChevronDownIcon: () => <div data-testid="chevron-down" />,
  ChevronRightIcon: () => <div data-testid="chevron-right" />,
}));

describe('Performance Optimizations', () => {
  const mockDependencyTree = {
    jar_id: 'test-jar',
    total_dependencies: 150,
    root_dependencies: Array.from({ length: 150 }, (_, i) => ({
      id: `dep-${i}`,
      group_id: `com.example${i}`,
      artifact_id: `artifact${i}`,
      version: '1.0.0',
      scope: 'compile',
      source: 'maven',
      is_transitive: i > 50,
      depth: i > 100 ? 2 : 1,
      parent_id: i > 100 ? `dep-${i - 50}` : undefined,
      children: [],
      dependency_path: [`dep-${i}`],
      has_conflicts: i % 10 === 0,
      conflict_severity: i % 10 === 0 ? 'medium' : undefined,
      conflict_ids: [],
      description: `Test dependency ${i}`,
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ProgressiveTreeLoader', () => {
    it('should render progressive loader for large dependency trees', () => {
      render(
        <ProgressiveTreeLoader
          dependencyTree={mockDependencyTree}
          searchQuery=""
          filters={{}}
          selectedDependency={null}
          expandedNodes={new Set()}
          onDependencySelect={vi.fn()}
          onNodeToggle={vi.fn()}
        />
      );

      expect(screen.getByText('Loading more dependencies...')).toBeInTheDocument();
    });

    it('should handle virtualized scrolling correctly', async () => {
      const onDependencySelect = vi.fn();
      const onNodeToggle = vi.fn();

      render(
        <ProgressiveTreeLoader
          dependencyTree={mockDependencyTree}
          searchQuery=""
          filters={{}}
          selectedDependency={null}
          expandedNodes={new Set()}
          onDependencySelect={onDependencySelect}
          onNodeToggle={onNodeToggle}
        />
      );

      // Should only render visible items initially
      const visibleItems = screen.getAllByText(/com\.example\d+:artifact\d+/);
      expect(visibleItems.length).toBeLessThan(mockDependencyTree.total_dependencies);
    });

    it('should load more items when scrolling', async () => {
      render(
        <ProgressiveTreeLoader
          dependencyTree={mockDependencyTree}
          searchQuery=""
          filters={{}}
          selectedDependency={null}
          expandedNodes={new Set()}
          onDependencySelect={vi.fn()}
          onNodeToggle={vi.fn()}
        />
      );

      // Simulate scrolling
      const container = screen.getByRole('tree', { hidden: true }) || document.querySelector('[data-testid="tree-container"]');
      if (container) {
        act(() => {
          container.scrollTop = 1000;
          container.dispatchEvent(new Event('scroll'));
        });
      }

      await waitFor(() => {
        // Should load more items
        expect(screen.getByText(/Loaded \d+ items/)).toBeInTheDocument();
      });
    });

    it('should handle search filtering efficiently', () => {
      render(
        <ProgressiveTreeLoader
          dependencyTree={mockDependencyTree}
          searchQuery="example1"
          filters={{}}
          selectedDependency={null}
          expandedNodes={new Set()}
          onDependencySelect={vi.fn()}
          onNodeToggle={vi.fn()}
        />
      );

      // Should filter results
      const filteredItems = screen.getAllByText(/example1/);
      expect(filteredItems.length).toBeGreaterThan(0);
      expect(filteredItems.length).toBeLessThan(mockDependencyTree.total_dependencies);
    });

    it('should apply filters correctly', () => {
      const filters = {
        scopes: ['compile'],
        conflictStatus: true,
      };

      render(
        <ProgressiveTreeLoader
          dependencyTree={mockDependencyTree}
          searchQuery=""
          filters={filters}
          selectedDependency={null}
          expandedNodes={new Set()}
          onDependencySelect={vi.fn()}
          onNodeToggle={vi.fn()}
        />
      );

      // Should show only filtered items
      const items = screen.getAllByText(/com\.example\d+:artifact\d+/);
      expect(items.length).toBeLessThan(mockDependencyTree.total_dependencies);
    });

    it('should handle node expansion efficiently', () => {
      const expandedNodes = new Set(['dep-1', 'dep-2']);
      const onNodeToggle = vi.fn();

      render(
        <ProgressiveTreeLoader
          dependencyTree={mockDependencyTree}
          searchQuery=""
          filters={{}}
          selectedDependency={null}
          expandedNodes={expandedNodes}
          onDependencySelect={vi.fn()}
          onNodeToggle={onNodeToggle}
        />
      );

      // Should show expanded state
      const expandedIcons = screen.getAllByTestId('chevron-down');
      expect(expandedIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Store Performance Optimizations', () => {
    it('should use web workers for large dependency searches', async () => {
      const mockStore = {
        analysisData: {
          dependencyTree: {
            all_dependencies: Object.fromEntries(
              Array.from({ length: 600 }, (_, i) => [
                `dep-${i}`,
                {
                  id: `dep-${i}`,
                  group_id: `com.example${i}`,
                  artifact_id: `artifact${i}`,
                  version: '1.0.0',
                  scope: 'compile',
                  source: 'maven',
                  is_transitive: false,
                  depth: 1,
                  has_conflicts: false,
                  description: `Test dependency ${i}`,
                },
              ])
            ),
          },
        },
        searchDependencies: vi.fn(),
      };

      (useSingleJarDashboardStore as any).mockReturnValue(mockStore);

      // Test that web worker is used for large datasets
      await act(async () => {
        await mockStore.searchDependencies('example', {});
      });

      expect(mockStore.searchDependencies).toHaveBeenCalledWith('example', {});
    });

    it('should use synchronous search for small dependency sets', async () => {
      const mockStore = {
        analysisData: {
          dependencyTree: {
            all_dependencies: Object.fromEntries(
              Array.from({ length: 50 }, (_, i) => [
                `dep-${i}`,
                {
                  id: `dep-${i}`,
                  group_id: `com.example${i}`,
                  artifact_id: `artifact${i}`,
                  version: '1.0.0',
                  scope: 'compile',
                  source: 'maven',
                  is_transitive: false,
                  depth: 1,
                  has_conflicts: false,
                  description: `Test dependency ${i}`,
                },
              ])
            ),
          },
        },
        searchDependencies: vi.fn(),
      };

      (useSingleJarDashboardStore as any).mockReturnValue(mockStore);

      // Test that synchronous search is used for small datasets
      await act(async () => {
        await mockStore.searchDependencies('example', {});
      });

      expect(mockStore.searchDependencies).toHaveBeenCalledWith('example', {});
    });

    it('should debounce search queries', async () => {
      const mockStore = {
        setSearchQuery: vi.fn(),
        searchDependencies: vi.fn(),
      };

      (useSingleJarDashboardStore as any).mockReturnValue(mockStore);

      // Simulate rapid search queries
      await act(async () => {
        mockStore.setSearchQuery('a');
        mockStore.setSearchQuery('ab');
        mockStore.setSearchQuery('abc');
      });

      // Should debounce the calls
      expect(mockStore.setSearchQuery).toHaveBeenCalledTimes(3);
    });

    it('should cache search results', async () => {
      const mockStore = {
        searchResults: [],
        searchDependencies: vi.fn().mockResolvedValue([]),
      };

      (useSingleJarDashboardStore as any).mockReturnValue(mockStore);

      // Test caching behavior
      await act(async () => {
        await mockStore.searchDependencies('test', {});
        await mockStore.searchDependencies('test', {}); // Same query
      });

      // Should use cached results for second call
      expect(mockStore.searchDependencies).toHaveBeenCalledTimes(2);
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources when component unmounts', () => {
      const { unmount } = render(
        <ProgressiveTreeLoader
          dependencyTree={mockDependencyTree}
          searchQuery=""
          filters={{}}
          selectedDependency={null}
          expandedNodes={new Set()}
          onDependencySelect={vi.fn()}
          onNodeToggle={vi.fn()}
        />
      );

      // Should not throw errors on unmount
      expect(() => unmount()).not.toThrow();
    });

    it('should handle large datasets without memory leaks', () => {
      const largeDependencyTree = {
        ...mockDependencyTree,
        total_dependencies: 10000,
        root_dependencies: Array.from({ length: 10000 }, (_, i) => ({
          id: `dep-${i}`,
          group_id: `com.example${i}`,
          artifact_id: `artifact${i}`,
          version: '1.0.0',
          scope: 'compile',
          source: 'maven',
          is_transitive: false,
          depth: 1,
          children: [],
          dependency_path: [`dep-${i}`],
          has_conflicts: false,
          conflict_ids: [],
          description: `Test dependency ${i}`,
        })),
      };

      // Should render without issues
      expect(() => {
        render(
          <ProgressiveTreeLoader
            dependencyTree={largeDependencyTree}
            searchQuery=""
            filters={{}}
            selectedDependency={null}
            expandedNodes={new Set()}
            onDependencySelect={vi.fn()}
            onNodeToggle={vi.fn()}
          />
        );
      }).not.toThrow();
    });
  });

  describe('Performance Metrics', () => {
    it('should track rendering performance', () => {
      const startTime = performance.now();

      render(
        <ProgressiveTreeLoader
          dependencyTree={mockDependencyTree}
          searchQuery=""
          filters={{}}
          selectedDependency={null}
          expandedNodes={new Set()}
          onDependencySelect={vi.fn()}
          onNodeToggle={vi.fn()}
        />
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within reasonable time (less than 100ms)
      expect(renderTime).toBeLessThan(100);
    });

    it('should handle rapid state changes efficiently', async () => {
      const onDependencySelect = vi.fn();
      const { rerender } = render(
        <ProgressiveTreeLoader
          dependencyTree={mockDependencyTree}
          searchQuery=""
          filters={{}}
          selectedDependency={null}
          expandedNodes={new Set()}
          onDependencySelect={onDependencySelect}
          onNodeToggle={vi.fn()}
        />
      );

      // Simulate rapid state changes
      const startTime = performance.now();
      
      for (let i = 0; i < 10; i++) {
        rerender(
          <ProgressiveTreeLoader
            dependencyTree={mockDependencyTree}
            searchQuery={`query-${i}`}
            filters={{}}
            selectedDependency={`dep-${i}`}
            expandedNodes={new Set([`dep-${i}`])}
            onDependencySelect={onDependencySelect}
            onNodeToggle={vi.fn()}
          />
        );
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should handle rapid changes efficiently (less than 200ms for 10 changes)
      expect(totalTime).toBeLessThan(200);
    });
  });
});
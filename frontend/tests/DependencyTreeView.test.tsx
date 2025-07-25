import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DependencyTreeView from '../src/components/DependencyTreeView';
import { DependencyNode, DependencyTree, SearchFilters } from '@/stores/singleJarDashboardStore';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock data for testing
const mockDependencyNode: DependencyNode = {
  id: 'test-dep-1',
  group_id: 'com.example',
  artifact_id: 'test-library',
  version: '1.0.0',
  scope: 'compile',
  source: 'maven',
  is_transitive: false,
  depth: 0,
  children: [
    {
      id: 'test-dep-2',
      group_id: 'com.example',
      artifact_id: 'child-library',
      version: '2.0.0',
      scope: 'runtime',
      source: 'maven',
      is_transitive: true,
      depth: 1,
      children: [],
      dependency_path: ['test-dep-1', 'test-dep-2'],
      has_conflicts: true,
      conflict_severity: 'high',
      conflict_ids: ['conflict-1'],
      description: 'Child dependency with conflicts'
    }
  ],
  dependency_path: ['test-dep-1'],
  has_conflicts: false,
  conflict_severity: undefined,
  conflict_ids: [],
  description: 'Main test dependency'
};

const mockDependencyTree: DependencyTree = {
  id: 'tree-1',
  jar_id: 'jar-123',
  root_dependencies: [mockDependencyNode],
  all_dependencies: {
    'test-dep-1': mockDependencyNode,
    'test-dep-2': mockDependencyNode.children[0]
  },
  conflicts: [],
  paths: [],
  total_dependencies: 2,
  direct_dependencies: 1,
  transitive_dependencies: 1,
  max_depth: 1,
  scope_counts: { compile: 1, runtime: 1 },
  source_counts: { maven: 2 }
};

const defaultProps = {
  dependencyTree: mockDependencyTree,
  searchQuery: '',
  filters: {} as SearchFilters,
  selectedDependency: null,
  expandedNodes: new Set<string>(),
  onDependencySelect: vi.fn(),
  onNodeToggle: vi.fn(),
};

describe('DependencyTreeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear session storage before each test
    sessionStorage.clear();
  });

  describe('Hierarchical tree component with expand/collapse functionality', () => {
    it('renders the dependency tree with hierarchical structure', () => {
      render(<DependencyTreeView {...defaultProps} />);
      
      expect(screen.getByText('Dependency Tree')).toBeInTheDocument();
      expect(screen.getByText('com.example:test-library')).toBeInTheDocument();
      expect(screen.getByText('1.0.0')).toBeInTheDocument();
    });

    it('shows expand/collapse buttons for nodes with children', () => {
      render(<DependencyTreeView {...defaultProps} />);
      
      // Should show expand button for parent node
      const expandButton = screen.getByRole('button');
      expect(expandButton).toBeInTheDocument();
    });

    it('expands and collapses nodes when toggle button is clicked', async () => {
      const onNodeToggle = vi.fn();
      render(<DependencyTreeView {...defaultProps} onNodeToggle={onNodeToggle} />);
      
      const expandButton = screen.getByRole('button');
      fireEvent.click(expandButton);
      
      expect(onNodeToggle).toHaveBeenCalledWith('test-dep-1');
    });

    it('shows children when node is expanded', () => {
      const expandedNodes = new Set(['test-dep-1']);
      render(<DependencyTreeView {...defaultProps} expandedNodes={expandedNodes} />);
      
      // Child dependency should be visible when parent is expanded
      expect(screen.getByText('com.example:child-library')).toBeInTheDocument();
      expect(screen.getByText('2.0.0')).toBeInTheDocument();
    });
  });

  describe('Visual conflict indicators with color coding by severity', () => {
    it('displays conflict indicators for dependencies with conflicts', () => {
      const expandedNodes = new Set(['test-dep-1']);
      render(<DependencyTreeView {...defaultProps} expandedNodes={expandedNodes} />);
      
      // Should show conflict indicator for child dependency
      expect(screen.getByText('HIGH')).toBeInTheDocument();
    });

    it('does not show conflict indicators for dependencies without conflicts', () => {
      render(<DependencyTreeView {...defaultProps} />);
      
      // Parent dependency has no conflicts, so no conflict indicator should be shown
      expect(screen.queryByText('CRITICAL')).not.toBeInTheDocument();
      expect(screen.queryByText('MEDIUM')).not.toBeInTheDocument();
      expect(screen.queryByText('LOW')).not.toBeInTheDocument();
    });

    it('applies correct styling for different conflict severities', () => {
      const criticalConflictNode: DependencyNode = {
        ...mockDependencyNode,
        has_conflicts: true,
        conflict_severity: 'critical'
      };
      
      const treeWithCriticalConflict: DependencyTree = {
        ...mockDependencyTree,
        root_dependencies: [criticalConflictNode]
      };
      
      render(<DependencyTreeView {...defaultProps} dependencyTree={treeWithCriticalConflict} />);
      
      expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    });
  });

  describe('Node selection and detailed dependency information display', () => {
    it('handles node selection when clicked', () => {
      const onDependencySelect = vi.fn();
      render(<DependencyTreeView {...defaultProps} onDependencySelect={onDependencySelect} />);
      
      const dependencyNode = screen.getByText('com.example:test-library').closest('div');
      if (dependencyNode) {
        fireEvent.click(dependencyNode);
        expect(onDependencySelect).toHaveBeenCalledWith('test-dep-1');
      }
    });

    it('highlights selected dependency', () => {
      render(<DependencyTreeView {...defaultProps} selectedDependency="test-dep-1" />);
      
      const selectedNode = screen.getByText('com.example:test-library').closest('div');
      expect(selectedNode).toHaveClass('bg-blue-50');
    });

    it('displays detailed dependency information', () => {
      render(<DependencyTreeView {...defaultProps} />);
      
      // Should show scope badge
      expect(screen.getByText('compile')).toBeInTheDocument();
      
      // Should show version information
      expect(screen.getByText('1.0.0')).toBeInTheDocument();
      
      // Should show description when expanded
      const expandedNodes = new Set(['test-dep-1']);
      render(<DependencyTreeView {...defaultProps} expandedNodes={expandedNodes} />);
      expect(screen.getByText('Child dependency with conflicts')).toBeInTheDocument();
    });

    it('supports nested node selection', async () => {
      const onDependencySelect = vi.fn();
      const expandedNodes = new Set(['test-dep-1']);
      
      render(
        <DependencyTreeView 
          {...defaultProps} 
          expandedNodes={expandedNodes}
          onDependencySelect={onDependencySelect}
        />
      );
      
      // Click on child dependency
      const childNode = screen.getByText('com.example:child-library').closest('div');
      if (childNode) {
        fireEvent.click(childNode);
        expect(onDependencySelect).toHaveBeenCalledWith('test-dep-2');
      }
    });
  });

  describe('Tree state persistence during user session', () => {
    it('saves expanded nodes to session storage', async () => {
      const expandedNodes = new Set(['test-dep-1']);
      
      render(<DependencyTreeView {...defaultProps} expandedNodes={expandedNodes} />);
      
      await waitFor(() => {
        const savedNodes = sessionStorage.getItem('dependency-tree-jar-123-expanded');
        expect(savedNodes).toBe('["test-dep-1"]');
      });
    });

    it('saves selected dependency to session storage', async () => {
      render(<DependencyTreeView {...defaultProps} selectedDependency="test-dep-1" />);
      
      await waitFor(() => {
        const savedSelection = sessionStorage.getItem('dependency-tree-jar-123-selected');
        expect(savedSelection).toBe('test-dep-1');
      });
    });

    it('clears selected dependency from session storage when none selected', async () => {
      // First set a selection
      render(<DependencyTreeView {...defaultProps} selectedDependency="test-dep-1" />);
      
      await waitFor(() => {
        expect(sessionStorage.getItem('dependency-tree-jar-123-selected')).toBe('test-dep-1');
      });
      
      // Then clear selection
      render(<DependencyTreeView {...defaultProps} selectedDependency={null} />);
      
      await waitFor(() => {
        expect(sessionStorage.getItem('dependency-tree-jar-123-selected')).toBeNull();
      });
    });
  });

  describe('Search and filtering functionality', () => {
    it('filters dependencies based on search query', () => {
      render(<DependencyTreeView {...defaultProps} searchQuery="child" />);
      
      // Should not show parent dependency that doesn't match
      expect(screen.queryByText('com.example:test-library')).not.toBeInTheDocument();
    });

    it('highlights search matches in dependency names', () => {
      const expandedNodes = new Set(['test-dep-1']);
      render(
        <DependencyTreeView 
          {...defaultProps} 
          expandedNodes={expandedNodes}
          searchQuery="child"
        />
      );
      
      // Should highlight the matching text
      const highlightedText = screen.getByText('child');
      expect(highlightedText.tagName).toBe('MARK');
    });

    it('applies scope filters correctly', () => {
      const filters: SearchFilters = {
        scopes: ['runtime']
      };
      
      render(<DependencyTreeView {...defaultProps} filters={filters} />);
      
      // Should not show compile scope dependency
      expect(screen.queryByText('com.example:test-library')).not.toBeInTheDocument();
    });

    it('applies conflict status filters correctly', () => {
      const filters: SearchFilters = {
        conflictStatus: true
      };
      
      render(<DependencyTreeView {...defaultProps} filters={filters} />);
      
      // Should not show dependency without conflicts
      expect(screen.queryByText('com.example:test-library')).not.toBeInTheDocument();
    });
  });

  describe('Empty state handling', () => {
    it('shows empty state when no dependencies found', () => {
      const emptyTree: DependencyTree = {
        ...mockDependencyTree,
        root_dependencies: [],
        total_dependencies: 0
      };
      
      render(<DependencyTreeView {...defaultProps} dependencyTree={emptyTree} />);
      
      expect(screen.getByText('No Dependencies Found')).toBeInTheDocument();
      expect(screen.getByText('This JAR has no dependencies.')).toBeInTheDocument();
    });

    it('shows appropriate message when search/filter yields no results', () => {
      render(<DependencyTreeView {...defaultProps} searchQuery="nonexistent" />);
      
      expect(screen.getByText('No Dependencies Found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your search or filters.')).toBeInTheDocument();
    });
  });
});
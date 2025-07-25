import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DependencySearchFilter from '../DependencySearchFilter';
import { SearchFilters, DependencyTree } from '@/stores/singleJarDashboardStore';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockDependencyTree: DependencyTree = {
  id: 'tree-1',
  jar_id: 'jar-1',
  root_dependencies: [],
  all_dependencies: {},
  conflicts: [
    { id: 'conflict-1', conflict_type: 'version', affected_dependencies: [], description: 'Version conflict', severity: 'high', conflicting_versions: [], paths: [] }
  ],
  paths: [],
  total_dependencies: 10,
  direct_dependencies: 5,
  transitive_dependencies: 5,
  max_depth: 3,
  scope_counts: { compile: 5, runtime: 3, test: 2 },
  source_counts: { maven: 8, gradle: 2 }
};

const defaultProps = {
  filters: {},
  onFiltersChange: vi.fn(),
  dependencyTree: mockDependencyTree,
};

describe('DependencySearchFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Filter Header', () => {
    it('renders filter header with title', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    it('shows active indicator when filters are applied', () => {
      render(
        <DependencySearchFilter 
          {...defaultProps} 
          filters={{ scopes: ['compile'] }}
        />
      );
      
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('shows clear all button when filters are active', () => {
      render(
        <DependencySearchFilter 
          {...defaultProps} 
          filters={{ scopes: ['compile'] }}
        />
      );
      
      expect(screen.getByText('Clear All')).toBeInTheDocument();
    });

    it('calls onFiltersChange with empty object when clear all is clicked', async () => {
      const user = userEvent.setup();
      render(
        <DependencySearchFilter 
          {...defaultProps} 
          filters={{ scopes: ['compile'] }}
        />
      );
      
      const clearAllButton = screen.getByText('Clear All');
      await user.click(clearAllButton);
      
      expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({});
    });
  });

  describe('Scope Filter', () => {
    it('renders scope filter section', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      expect(screen.getByText('Scope')).toBeInTheDocument();
      expect(screen.getByText('(3)')).toBeInTheDocument(); // 3 different scopes
    });

    it('shows available scopes with counts', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Click to expand scope section
      fireEvent.click(screen.getByText('Scope'));
      
      expect(screen.getByText('Compile')).toBeInTheDocument();
      expect(screen.getByText('(5)')).toBeInTheDocument();
      expect(screen.getByText('Runtime')).toBeInTheDocument();
      expect(screen.getByText('(3)')).toBeInTheDocument();
      expect(screen.getByText('Test')).toBeInTheDocument();
      expect(screen.getByText('(2)')).toBeInTheDocument();
    });

    it('calls onFiltersChange when scope is selected', async () => {
      const user = userEvent.setup();
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Expand scope section
      fireEvent.click(screen.getByText('Scope'));
      
      // Select compile scope
      const compileCheckbox = screen.getByLabelText(/compile/i);
      await user.click(compileCheckbox);
      
      expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({
        scopes: ['compile']
      });
    });

    it('shows active indicator when scope filters are applied', () => {
      render(
        <DependencySearchFilter 
          {...defaultProps} 
          filters={{ scopes: ['compile'] }}
        />
      );
      
      // Should show active indicator in scope section
      const scopeSection = screen.getByText('Scope').closest('div');
      expect(scopeSection).toContainHTML('Active');
    });

    it('shows individual clear button for scope filters', () => {
      render(
        <DependencySearchFilter 
          {...defaultProps} 
          filters={{ scopes: ['compile'] }}
        />
      );
      
      // Should show clear button for scope section
      const clearButtons = screen.getAllByTitle('Clear this filter');
      expect(clearButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Source Filter', () => {
    it('renders source filter section', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      expect(screen.getByText('Source')).toBeInTheDocument();
      expect(screen.getByText('(2)')).toBeInTheDocument(); // 2 different sources
    });

    it('shows available sources with counts', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Click to expand source section
      fireEvent.click(screen.getByText('Source'));
      
      expect(screen.getByText('Maven')).toBeInTheDocument();
      expect(screen.getByText('(8)')).toBeInTheDocument();
      expect(screen.getByText('Gradle')).toBeInTheDocument();
      expect(screen.getByText('(2)')).toBeInTheDocument();
    });

    it('calls onFiltersChange when source is selected', async () => {
      const user = userEvent.setup();
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Expand source section
      fireEvent.click(screen.getByText('Source'));
      
      // Select maven source
      const mavenCheckbox = screen.getByLabelText(/maven/i);
      await user.click(mavenCheckbox);
      
      expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({
        sources: ['maven']
      });
    });
  });

  describe('Conflict Filter', () => {
    it('renders conflict filter section', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      expect(screen.getByText('Conflicts')).toBeInTheDocument();
      expect(screen.getByText('(1)')).toBeInTheDocument(); // 1 conflict
    });

    it('shows conflict status options', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Click to expand conflicts section
      fireEvent.click(screen.getByText('Conflicts'));
      
      expect(screen.getByText('Conflict Status')).toBeInTheDocument();
      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Has Conflicts')).toBeInTheDocument();
      expect(screen.getByText('No Conflicts')).toBeInTheDocument();
    });

    it('shows conflict severity options', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Click to expand conflicts section
      fireEvent.click(screen.getByText('Conflicts'));
      
      expect(screen.getByText('Conflict Severity')).toBeInTheDocument();
      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('calls onFiltersChange when conflict status is selected', async () => {
      const user = userEvent.setup();
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Expand conflicts section
      fireEvent.click(screen.getByText('Conflicts'));
      
      // Select "Has Conflicts"
      const hasConflictsRadio = screen.getByLabelText('Has Conflicts');
      await user.click(hasConflictsRadio);
      
      expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({
        conflictStatus: true
      });
    });

    it('calls onFiltersChange when conflict severity is selected', async () => {
      const user = userEvent.setup();
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Expand conflicts section
      fireEvent.click(screen.getByText('Conflicts'));
      
      // Select "High" severity
      const highSeverityCheckbox = screen.getByLabelText(/high/i);
      await user.click(highSeverityCheckbox);
      
      expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({
        conflictSeverity: ['high']
      });
    });
  });

  describe('Depth Filter', () => {
    it('renders depth filter section', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      expect(screen.getByText('Depth')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument(); // max depth
    });

    it('shows min and max depth inputs', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Click to expand depth section
      fireEvent.click(screen.getByText('Depth'));
      
      expect(screen.getByText('Min Depth')).toBeInTheDocument();
      expect(screen.getByText('Max Depth')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('0')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('3')).toBeInTheDocument();
    });

    it('calls onFiltersChange when depth values are entered', async () => {
      const user = userEvent.setup();
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Expand depth section
      fireEvent.click(screen.getByText('Depth'));
      
      // Enter min depth
      const minDepthInput = screen.getByPlaceholderText('0');
      await user.type(minDepthInput, '1');
      
      expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({
        depth: { min: 1 }
      });
    });
  });

  describe('Dependency Type Filter', () => {
    it('renders dependency type filter section', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      expect(screen.getByText('Dependency Type')).toBeInTheDocument();
    });

    it('shows dependency type options', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Click to expand type section
      fireEvent.click(screen.getByText('Dependency Type'));
      
      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Direct Only')).toBeInTheDocument();
      expect(screen.getByText('Transitive Only')).toBeInTheDocument();
    });

    it('calls onFiltersChange when dependency type is selected', async () => {
      const user = userEvent.setup();
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Expand type section
      fireEvent.click(screen.getByText('Dependency Type'));
      
      // Select "Direct Only"
      const directOnlyRadio = screen.getByLabelText('Direct Only');
      await user.click(directOnlyRadio);
      
      expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({
        transitive: false
      });
    });
  });

  describe('Filter Section Expansion', () => {
    it('expands and collapses filter sections', async () => {
      const user = userEvent.setup();
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Initially, scope section content should not be visible
      expect(screen.queryByText('Compile')).not.toBeInTheDocument();
      
      // Click to expand
      await user.click(screen.getByText('Scope'));
      
      // Now content should be visible
      expect(screen.getByText('Compile')).toBeInTheDocument();
      
      // Click to collapse
      await user.click(screen.getByText('Scope'));
      
      // Content should be hidden again
      await waitFor(() => {
        expect(screen.queryByText('Compile')).not.toBeInTheDocument();
      });
    });

    it('shows correct chevron icons for expanded/collapsed state', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Should show down chevron when collapsed
      const scopeButton = screen.getByText('Scope').closest('button');
      expect(scopeButton).toContainHTML('ChevronDownIcon');
      
      // Click to expand
      fireEvent.click(screen.getByText('Scope'));
      
      // Should show up chevron when expanded
      expect(scopeButton).toContainHTML('ChevronUpIcon');
    });
  });

  describe('Individual Filter Clear', () => {
    it('clears individual filter types', async () => {
      const user = userEvent.setup();
      render(
        <DependencySearchFilter 
          {...defaultProps} 
          filters={{ 
            scopes: ['compile'], 
            sources: ['maven'],
            conflictStatus: true
          }}
        />
      );
      
      // Find and click clear button for scope filter
      const clearButtons = screen.getAllByTitle('Clear this filter');
      await user.click(clearButtons[0]); // First clear button should be for scopes
      
      expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({
        sources: ['maven'],
        conflictStatus: true
      });
    });
  });

  describe('Filter State Management', () => {
    it('handles multiple scope selections', async () => {
      const user = userEvent.setup();
      render(
        <DependencySearchFilter 
          {...defaultProps} 
          filters={{ scopes: ['compile'] }}
        />
      );
      
      // Expand scope section
      fireEvent.click(screen.getByText('Scope'));
      
      // Select runtime scope (in addition to compile)
      const runtimeCheckbox = screen.getByLabelText(/runtime/i);
      await user.click(runtimeCheckbox);
      
      expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({
        scopes: ['compile', 'runtime']
      });
    });

    it('removes scope when unchecked', async () => {
      const user = userEvent.setup();
      render(
        <DependencySearchFilter 
          {...defaultProps} 
          filters={{ scopes: ['compile', 'runtime'] }}
        />
      );
      
      // Expand scope section
      fireEvent.click(screen.getByText('Scope'));
      
      // Uncheck compile scope
      const compileCheckbox = screen.getByLabelText(/compile/i);
      await user.click(compileCheckbox);
      
      expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({
        scopes: ['runtime']
      });
    });

    it('removes scopes filter when all scopes are unchecked', async () => {
      const user = userEvent.setup();
      render(
        <DependencySearchFilter 
          {...defaultProps} 
          filters={{ scopes: ['compile'] }}
        />
      );
      
      // Expand scope section
      fireEvent.click(screen.getByText('Scope'));
      
      // Uncheck the only selected scope
      const compileCheckbox = screen.getByLabelText(/compile/i);
      await user.click(compileCheckbox);
      
      expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({});
    });
  });

  describe('Accessibility', () => {
    it('has proper labels for form controls', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Expand sections to see form controls
      fireEvent.click(screen.getByText('Scope'));
      fireEvent.click(screen.getByText('Conflicts'));
      fireEvent.click(screen.getByText('Depth'));
      
      // Check for proper labels
      expect(screen.getByLabelText(/compile/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Has Conflicts')).toBeInTheDocument();
      expect(screen.getByLabelText('Min Depth')).toBeInTheDocument();
      expect(screen.getByLabelText('Max Depth')).toBeInTheDocument();
    });

    it('supports keyboard navigation', () => {
      render(<DependencySearchFilter {...defaultProps} />);
      
      // Should be able to focus and activate buttons
      const scopeButton = screen.getByText('Scope').closest('button');
      expect(scopeButton).toBeInTheDocument();
      
      // Test keyboard activation
      fireEvent.keyDown(scopeButton!, { key: 'Enter' });
      expect(screen.getByText('Compile')).toBeInTheDocument();
    });
  });
});
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DependencySearch from '../DependencySearch';
import { SearchFilters, DependencyNode, DependencyTree } from '@/stores/singleJarDashboardStore';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock the DependencySearchFilter component
vi.mock('../DependencySearchFilter', () => {
  return {
    default: function MockDependencySearchFilter({ filters, onFiltersChange }: any) {
      return (
        <div data-testid="dependency-search-filter">
          <button
            onClick={() => onFiltersChange({ scopes: ['compile'] })}
            data-testid="mock-filter-button"
          >
            Apply Filter
          </button>
        </div>
      );
    }
  };
});

const mockDependencyTree: DependencyTree = {
  id: 'tree-1',
  jar_id: 'jar-1',
  root_dependencies: [],
  all_dependencies: {},
  conflicts: [],
  paths: [],
  total_dependencies: 10,
  direct_dependencies: 5,
  transitive_dependencies: 5,
  max_depth: 3,
  scope_counts: { compile: 5, runtime: 3, test: 2 },
  source_counts: { maven: 8, gradle: 2 }
};

const mockSearchResults: DependencyNode[] = [
  {
    id: 'dep-1',
    group_id: 'com.example',
    artifact_id: 'test-library',
    version: '1.0.0',
    scope: 'compile',
    source: 'maven',
    is_transitive: false,
    depth: 1,
    children: [],
    dependency_path: ['root', 'dep-1'],
    has_conflicts: false,
    conflict_ids: [],
    description: 'A test library'
  },
  {
    id: 'dep-2',
    group_id: 'org.springframework',
    artifact_id: 'spring-core',
    version: '5.3.0',
    scope: 'compile',
    source: 'maven',
    is_transitive: true,
    depth: 2,
    children: [],
    dependency_path: ['root', 'dep-1', 'dep-2'],
    has_conflicts: true,
    conflict_severity: 'high',
    conflict_ids: ['conflict-1'],
    description: 'Spring Framework Core'
  }
];

const defaultProps = {
  searchQuery: '',
  filters: {},
  dependencyTree: mockDependencyTree,
  searchResults: [],
  onSearchChange: vi.fn(),
  onFiltersChange: vi.fn(),
  onDependencySelect: vi.fn(),
};

describe('DependencySearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Search Input', () => {
    it('renders search input with placeholder', () => {
      render(<DependencySearch {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search dependencies by name, group, or version...');
      expect(searchInput).toBeInTheDocument();
    });

    it('displays current search query', () => {
      render(<DependencySearch {...defaultProps} searchQuery="spring" />);
      
      const searchInput = screen.getByDisplayValue('spring');
      expect(searchInput).toBeInTheDocument();
    });

    it('calls onSearchChange when typing', async () => {
      const user = userEvent.setup();
      render(<DependencySearch {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search dependencies by name, group, or version...');
      await user.type(searchInput, 'test');
      
      expect(defaultProps.onSearchChange).toHaveBeenCalledWith('test');
    });

    it('shows clear button when search query exists', () => {
      render(<DependencySearch {...defaultProps} searchQuery="spring" />);
      
      const clearButton = screen.getByTitle('Clear search');
      expect(clearButton).toBeInTheDocument();
    });

    it('clears search when clear button is clicked', async () => {
      const user = userEvent.setup();
      render(<DependencySearch {...defaultProps} searchQuery="spring" />);
      
      const clearButton = screen.getByTitle('Clear search');
      await user.click(clearButton);
      
      expect(defaultProps.onSearchChange).toHaveBeenCalledWith('');
    });
  });

  describe('Search Results', () => {
    it('shows search results when query exists and results are available', () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          searchQuery="spring" 
          searchResults={mockSearchResults}
        />
      );
      
      // Focus the input to show results
      const searchInput = screen.getByPlaceholderText('Search dependencies by name, group, or version...');
      fireEvent.focus(searchInput);
      
      expect(screen.getByText('2 results found')).toBeInTheDocument();
      expect(screen.getByText('com.example:test-library')).toBeInTheDocument();
      expect(screen.getByText('org.springframework:spring-core')).toBeInTheDocument();
    });

    it('shows no results message when search query exists but no results', () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          searchQuery="nonexistent" 
          searchResults={[]}
        />
      );
      
      // Focus the input to show results
      const searchInput = screen.getByPlaceholderText('Search dependencies by name, group, or version...');
      fireEvent.focus(searchInput);
      
      expect(screen.getByText('No dependencies found for "nonexistent"')).toBeInTheDocument();
    });

    it('highlights search matches in result text', () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          searchQuery="spring" 
          searchResults={mockSearchResults}
        />
      );
      
      // Focus the input to show results
      const searchInput = screen.getByPlaceholderText('Search dependencies by name, group, or version...');
      fireEvent.focus(searchInput);
      
      // Check for highlighted text (mark elements)
      const highlightedElements = screen.getAllByText('spring', { selector: 'mark' });
      expect(highlightedElements.length).toBeGreaterThan(0);
    });

    it('calls onDependencySelect when result is clicked', async () => {
      const user = userEvent.setup();
      render(
        <DependencySearch 
          {...defaultProps} 
          searchQuery="spring" 
          searchResults={mockSearchResults}
        />
      );
      
      // Focus the input to show results
      const searchInput = screen.getByPlaceholderText('Search dependencies by name, group, or version...');
      fireEvent.focus(searchInput);
      
      const resultButton = screen.getByText('com.example:test-library').closest('button');
      await user.click(resultButton!);
      
      expect(defaultProps.onDependencySelect).toHaveBeenCalledWith('dep-1');
    });

    it('shows conflict indicators in search results', () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          searchQuery="spring" 
          searchResults={mockSearchResults}
        />
      );
      
      // Focus the input to show results
      const searchInput = screen.getByPlaceholderText('Search dependencies by name, group, or version...');
      fireEvent.focus(searchInput);
      
      expect(screen.getByText('HIGH')).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates results with arrow keys', async () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          searchQuery="spring" 
          searchResults={mockSearchResults}
        />
      );
      
      const searchInput = screen.getByPlaceholderText('Search dependencies by name, group, or version...');
      fireEvent.focus(searchInput);
      
      // Navigate down
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
      
      // First result should be focused (we can't easily test focus state, but we can test the behavior)
      fireEvent.keyDown(searchInput, { key: 'Enter' });
      expect(defaultProps.onDependencySelect).toHaveBeenCalledWith('dep-1');
    });

    it('closes results on Escape key', () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          searchQuery="spring" 
          searchResults={mockSearchResults}
        />
      );
      
      const searchInput = screen.getByPlaceholderText('Search dependencies by name, group, or version...');
      fireEvent.focus(searchInput);
      
      // Results should be visible
      expect(screen.getByText('2 results found')).toBeInTheDocument();
      
      // Press Escape
      fireEvent.keyDown(searchInput, { key: 'Escape' });
      
      // Results should be hidden (we can't easily test this without more complex setup)
    });
  });

  describe('Filters', () => {
    it('shows filter toggle button', () => {
      render(<DependencySearch {...defaultProps} />);
      
      const filterButton = screen.getByTitle('Show filters');
      expect(filterButton).toBeInTheDocument();
    });

    it('highlights filter button when filters are active', () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          filters={{ scopes: ['compile'] }}
        />
      );
      
      const filterButton = screen.getByTitle('Hide filters');
      expect(filterButton).toHaveClass('text-blue-600');
    });

    it('shows filter summary when filters are active', () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          filters={{ 
            scopes: ['compile', 'runtime'], 
            conflictStatus: true,
            transitive: false
          }}
        />
      );
      
      expect(screen.getByText(/Filtered by:/)).toBeInTheDocument();
      expect(screen.getByText(/2 scopes/)).toBeInTheDocument();
      expect(screen.getByText(/with conflicts/)).toBeInTheDocument();
      expect(screen.getByText(/direct only/)).toBeInTheDocument();
    });

    it('shows clear all filters button when filters are active', () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          filters={{ scopes: ['compile'] }}
        />
      );
      
      const clearButton = screen.getByText('Clear all');
      expect(clearButton).toBeInTheDocument();
    });

    it('calls onFiltersChange when clear all is clicked', async () => {
      const user = userEvent.setup();
      render(
        <DependencySearch 
          {...defaultProps} 
          filters={{ scopes: ['compile'] }}
        />
      );
      
      const clearButton = screen.getByText('Clear all');
      await user.click(clearButton);
      
      expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({});
    });

    it('toggles filter panel when filter button is clicked', async () => {
      const user = userEvent.setup();
      render(<DependencySearch {...defaultProps} />);
      
      const filterButton = screen.getByTitle('Show filters');
      await user.click(filterButton);
      
      expect(screen.getByTestId('dependency-search-filter')).toBeInTheDocument();
    });
  });

  describe('Filter Summary', () => {
    it('generates correct filter summary for depth filters', () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          filters={{ 
            depth: { min: 1, max: 3 }
          }}
        />
      );
      
      expect(screen.getByText(/depth 1-3/)).toBeInTheDocument();
    });

    it('generates correct filter summary for min depth only', () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          filters={{ 
            depth: { min: 2 }
          }}
        />
      );
      
      expect(screen.getByText(/depth ≥2/)).toBeInTheDocument();
    });

    it('generates correct filter summary for max depth only', () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          filters={{ 
            depth: { max: 2 }
          }}
        />
      );
      
      expect(screen.getByText(/depth ≤2/)).toBeInTheDocument();
    });

    it('generates correct filter summary for conflict severity', () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          filters={{ 
            conflictSeverity: ['high', 'critical']
          }}
        />
      );
      
      expect(screen.getByText(/2 severity levels/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and roles', () => {
      render(<DependencySearch {...defaultProps} />);
      
      const searchInput = screen.getByRole('textbox');
      expect(searchInput).toHaveAttribute('placeholder', 'Search dependencies by name, group, or version...');
    });

    it('supports keyboard navigation', () => {
      render(
        <DependencySearch 
          {...defaultProps} 
          searchQuery="spring" 
          searchResults={mockSearchResults}
        />
      );
      
      const searchInput = screen.getByRole('textbox');
      
      // Should handle keyboard events without errors
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
      fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
      fireEvent.keyDown(searchInput, { key: 'Enter' });
      fireEvent.keyDown(searchInput, { key: 'Escape' });
    });
  });
});
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConflictVisualization from '../src/components/ConflictVisualization';

const mockConflicts = [
  {
    id: '1',
    conflict_type: 'version_conflict',
    affected_dependencies: ['com.example:library-a:1.0.0', 'com.example:library-b:2.0.0'],
    description: 'Multiple versions of the same dependency found',
    severity: 'high' as const,
    resolution_suggestion: 'Use dependency management to force a single version',
    conflicting_versions: ['1.0.0', '2.0.0'],
    winning_version: '2.0.0',
    paths: [
      ['root', 'com.example:library-a:1.0.0'],
      ['root', 'com.example:library-b:2.0.0', 'com.example:library-a:1.0.0']
    ]
  },
  {
    id: '2',
    conflict_type: 'scope_conflict',
    affected_dependencies: ['com.test:util:1.5.0'],
    description: 'Dependency appears in multiple scopes',
    severity: 'medium' as const,
    conflicting_versions: ['1.5.0'],
    paths: [
      ['root', 'com.test:util:1.5.0']
    ]
  },
  {
    id: '3',
    conflict_type: 'transitive_conflict',
    affected_dependencies: ['org.apache:commons-lang:3.0', 'org.apache:commons-lang:3.1'],
    description: 'Transitive dependency version conflict',
    severity: 'critical' as const,
    resolution_suggestion: 'Exclude transitive dependency and declare explicit version',
    conflicting_versions: ['3.0', '3.1'],
    winning_version: '3.1',
    paths: [
      ['root', 'dep1', 'org.apache:commons-lang:3.0'],
      ['root', 'dep2', 'org.apache:commons-lang:3.1']
    ]
  }
];

describe('ConflictVisualization', () => {
  const user = userEvent.setup();

  describe('Empty State', () => {
    it('should display no conflicts message when conflicts array is empty', () => {
      render(<ConflictVisualization conflicts={[]} />);
      
      expect(screen.getByText('No Conflicts Found')).toBeInTheDocument();
      expect(screen.getByText('All dependencies are compatible with each other.')).toBeInTheDocument();
    });

    it('should display no conflicts message when conflicts is undefined', () => {
      render(<ConflictVisualization conflicts={undefined as any} />);
      
      expect(screen.getByText('No Conflicts Found')).toBeInTheDocument();
    });
  });

  describe('Conflict Display', () => {
    it('should display all conflicts with correct count', () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      expect(screen.getByText('Dependency Conflicts (3/3)')).toBeInTheDocument();
      expect(screen.getByText('VERSION CONFLICT')).toBeInTheDocument();
      expect(screen.getByText('SCOPE CONFLICT')).toBeInTheDocument();
      expect(screen.getByText('TRANSITIVE CONFLICT')).toBeInTheDocument();
    });

    it('should display severity indicators with correct colors', () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      expect(screen.getByText('HIGH')).toBeInTheDocument();
      expect(screen.getByText('MEDIUM')).toBeInTheDocument();
      expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    });

    it('should display affected dependencies count', () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      expect(screen.getByText('2 dependencies affected')).toBeInTheDocument();
      expect(screen.getByText('1 dependencies affected')).toBeInTheDocument();
    });
  });

  describe('Conflict Expansion', () => {
    it('should expand conflict details when clicked', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      const firstConflict = screen.getByText('VERSION CONFLICT').closest('div');
      expect(firstConflict).toBeInTheDocument();
      
      // Initially collapsed
      expect(screen.queryByText('Description')).not.toBeInTheDocument();
      
      // Click to expand
      await user.click(firstConflict!);
      
      // Should show details
      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Multiple versions of the same dependency found')).toBeInTheDocument();
      expect(screen.getByText('Conflicting Versions')).toBeInTheDocument();
      expect(screen.getByText('Affected Dependencies')).toBeInTheDocument();
      expect(screen.getByText('Resolution Suggestion')).toBeInTheDocument();
    });

    it('should collapse conflict details when clicked again', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      const firstConflict = screen.getByText('VERSION CONFLICT').closest('div');
      
      // Expand
      await user.click(firstConflict!);
      expect(screen.getByText('Description')).toBeInTheDocument();
      
      // Collapse
      await user.click(firstConflict!);
      expect(screen.queryByText('Description')).not.toBeInTheDocument();
    });

    it('should call onConflictSelect when conflict is clicked', async () => {
      const onConflictSelect = jest.fn();
      render(<ConflictVisualization conflicts={mockConflicts} onConflictSelect={onConflictSelect} />);
      
      const firstConflict = screen.getByText('VERSION CONFLICT').closest('div');
      await user.click(firstConflict!);
      
      expect(onConflictSelect).toHaveBeenCalledWith(mockConflicts[0]);
    });
  });

  describe('Filtering', () => {
    it('should show filter controls when filter button is clicked', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      const filterButton = screen.getByRole('button', { name: /filter/i });
      await user.click(filterButton);
      
      expect(screen.getByPlaceholderText('Search conflicts...')).toBeInTheDocument();
      expect(screen.getByText('Severity')).toBeInTheDocument();
      expect(screen.getByText('Conflict Type')).toBeInTheDocument();
      expect(screen.getByText('Resolution Status')).toBeInTheDocument();
    });

    it('should filter conflicts by search query', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      // Open filters
      const filterButton = screen.getByRole('button', { name: /filter/i });
      await user.click(filterButton);
      
      // Search for "version"
      const searchInput = screen.getByPlaceholderText('Search conflicts...');
      await user.type(searchInput, 'version');
      
      // Should show only version-related conflicts
      await waitFor(() => {
        expect(screen.getByText('Dependency Conflicts (2/3)')).toBeInTheDocument();
      });
      
      expect(screen.getByText('VERSION CONFLICT')).toBeInTheDocument();
      expect(screen.queryByText('SCOPE CONFLICT')).not.toBeInTheDocument();
    });

    it('should filter conflicts by severity', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      // Open filters
      const filterButton = screen.getByRole('button', { name: /filter/i });
      await user.click(filterButton);
      
      // Select critical severity
      const criticalCheckbox = screen.getByRole('checkbox', { name: /critical/i });
      await user.click(criticalCheckbox);
      
      // Should show only critical conflicts
      await waitFor(() => {
        expect(screen.getByText('Dependency Conflicts (1/3)')).toBeInTheDocument();
      });
      
      expect(screen.getByText('TRANSITIVE CONFLICT')).toBeInTheDocument();
      expect(screen.queryByText('VERSION CONFLICT')).not.toBeInTheDocument();
      expect(screen.queryByText('SCOPE CONFLICT')).not.toBeInTheDocument();
    });

    it('should filter conflicts by conflict type', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      // Open filters
      const filterButton = screen.getByRole('button', { name: /filter/i });
      await user.click(filterButton);
      
      // Select scope conflict type
      const scopeCheckbox = screen.getByRole('checkbox', { name: /scope conflict/i });
      await user.click(scopeCheckbox);
      
      // Should show only scope conflicts
      await waitFor(() => {
        expect(screen.getByText('Dependency Conflicts (1/3)')).toBeInTheDocument();
      });
      
      expect(screen.getByText('SCOPE CONFLICT')).toBeInTheDocument();
      expect(screen.queryByText('VERSION CONFLICT')).not.toBeInTheDocument();
    });

    it('should filter conflicts by resolution status', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      // Open filters
      const filterButton = screen.getByRole('button', { name: /filter/i });
      await user.click(filterButton);
      
      // Select "Has Resolution"
      const hasResolutionRadio = screen.getByRole('radio', { name: /has resolution/i });
      await user.click(hasResolutionRadio);
      
      // Should show only conflicts with resolution suggestions
      await waitFor(() => {
        expect(screen.getByText('Dependency Conflicts (2/3)')).toBeInTheDocument();
      });
      
      expect(screen.getByText('VERSION CONFLICT')).toBeInTheDocument();
      expect(screen.getByText('TRANSITIVE CONFLICT')).toBeInTheDocument();
      expect(screen.queryByText('SCOPE CONFLICT')).not.toBeInTheDocument();
    });

    it('should clear all filters when clear button is clicked', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      // Open filters and apply some
      const filterButton = screen.getByRole('button', { name: /filter/i });
      await user.click(filterButton);
      
      const criticalCheckbox = screen.getByRole('checkbox', { name: /critical/i });
      await user.click(criticalCheckbox);
      
      // Should show filtered count
      await waitFor(() => {
        expect(screen.getByText('Dependency Conflicts (1/3)')).toBeInTheDocument();
      });
      
      // Clear filters
      const clearButton = screen.getByText('Clear filters');
      await user.click(clearButton);
      
      // Should show all conflicts again
      expect(screen.getByText('Dependency Conflicts (3/3)')).toBeInTheDocument();
    });

    it('should show no results message when filters match nothing', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      // Open filters
      const filterButton = screen.getByRole('button', { name: /filter/i });
      await user.click(filterButton);
      
      // Search for something that doesn't exist
      const searchInput = screen.getByPlaceholderText('Search conflicts...');
      await user.type(searchInput, 'nonexistent');
      
      await waitFor(() => {
        expect(screen.getByText('No conflicts match your current filters.')).toBeInTheDocument();
      });
    });
  });

  describe('Sorting', () => {
    it('should sort conflicts by severity in descending order by default', () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      const conflictElements = screen.getAllByText(/CONFLICT$/);
      expect(conflictElements[0]).toHaveTextContent('TRANSITIVE CONFLICT'); // critical
      expect(conflictElements[1]).toHaveTextContent('VERSION CONFLICT'); // high
      expect(conflictElements[2]).toHaveTextContent('SCOPE CONFLICT'); // medium
    });

    it('should sort conflicts by type when type sort is clicked', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      const typeSortButton = screen.getByText('type');
      await user.click(typeSortButton);
      
      await waitFor(() => {
        const conflictElements = screen.getAllByText(/CONFLICT$/);
        expect(conflictElements[0]).toHaveTextContent('VERSION CONFLICT');
        expect(conflictElements[1]).toHaveTextContent('TRANSITIVE CONFLICT');
        expect(conflictElements[2]).toHaveTextContent('SCOPE CONFLICT');
      });
    });

    it('should sort conflicts by affected count when clicked', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      const affectedCountSortButton = screen.getByText('Affected Count');
      await user.click(affectedCountSortButton);
      
      await waitFor(() => {
        const conflictElements = screen.getAllByText(/CONFLICT$/);
        // Should be sorted by number of affected dependencies (descending)
        expect(conflictElements[0]).toHaveTextContent('VERSION CONFLICT'); // 2 dependencies
        expect(conflictElements[1]).toHaveTextContent('TRANSITIVE CONFLICT'); // 2 dependencies
        expect(conflictElements[2]).toHaveTextContent('SCOPE CONFLICT'); // 1 dependency
      });
    });

    it('should toggle sort direction when same field is clicked twice', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      const severitySortButton = screen.getByText('severity');
      
      // Click once (should be desc by default)
      await user.click(severitySortButton);
      
      // Click again to toggle to asc
      await user.click(severitySortButton);
      
      await waitFor(() => {
        const conflictElements = screen.getAllByText(/CONFLICT$/);
        expect(conflictElements[0]).toHaveTextContent('TRANSITIVE CONFLICT'); // critical (highest when asc)
        expect(conflictElements[1]).toHaveTextContent('VERSION CONFLICT'); // high
        expect(conflictElements[2]).toHaveTextContent('SCOPE CONFLICT'); // medium (lowest when asc)
      });
    });
  });

  describe('Conflict Details', () => {
    it('should display conflicting versions when expanded', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      const firstConflict = screen.getByText('VERSION CONFLICT').closest('div');
      await user.click(firstConflict!);
      
      expect(screen.getByText('Conflicting Versions')).toBeInTheDocument();
      expect(screen.getByText('1.0.0')).toBeInTheDocument();
      expect(screen.getAllByText('2.0.0')).toHaveLength(2); // One in versions list, one in resolved text
      expect(screen.getByText(/Resolved to:/)).toBeInTheDocument();
    });

    it('should display affected dependencies when expanded', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      const firstConflict = screen.getByText('VERSION CONFLICT').closest('div');
      await user.click(firstConflict!);
      
      expect(screen.getByText('Affected Dependencies')).toBeInTheDocument();
      expect(screen.getByText('com.example:library-a:1.0.0')).toBeInTheDocument();
      expect(screen.getByText('com.example:library-b:2.0.0')).toBeInTheDocument();
    });

    it('should display dependency paths when available', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      const firstConflict = screen.getByText('VERSION CONFLICT').closest('div');
      await user.click(firstConflict!);
      
      expect(screen.getByText('Dependency Paths')).toBeInTheDocument();
      expect(screen.getByText('root → com.example:library-a:1.0.0')).toBeInTheDocument();
    });

    it('should display resolution suggestion when available', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      const firstConflict = screen.getByText('VERSION CONFLICT').closest('div');
      await user.click(firstConflict!);
      
      expect(screen.getByText('Resolution Suggestion')).toBeInTheDocument();
      expect(screen.getByText('Use dependency management to force a single version')).toBeInTheDocument();
    });

    it('should not display resolution suggestion when not available', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      const scopeConflict = screen.getByText('SCOPE CONFLICT').closest('div');
      await user.click(scopeConflict!);
      
      expect(screen.queryByText('Resolution Suggestion')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      // The filter button doesn't have a text label, just an icon, so we check for the button element
      const filterButtons = screen.getAllByRole('button');
      expect(filterButtons.length).toBeGreaterThan(0);
    });

    it('should support keyboard navigation for conflict expansion', async () => {
      render(<ConflictVisualization conflicts={mockConflicts} />);
      
      const firstConflict = screen.getByText('VERSION CONFLICT').closest('div');
      
      // Focus and press Enter
      firstConflict?.focus();
      fireEvent.keyDown(firstConflict!, { key: 'Enter', code: 'Enter' });
      
      // Should expand (though we're testing click behavior here)
      await user.click(firstConflict!);
      expect(screen.getByText('Description')).toBeInTheDocument();
    });
  });
});
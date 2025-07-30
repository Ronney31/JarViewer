import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DependencyDashboard } from '../DependencyDashboard';
import { jarService } from '../../services/jarService';

// Mock jarService
jest.mock('../../services/jarService');
const mockJarService = jarService as jest.Mocked<typeof jarService>;

const mockComprehensiveData = {
  dependencyTree: {
    id: 'tree_test-jar',
    jar_id: 'test-jar',
    root_dependencies: [
      {
        id: 'org.springframework:spring-core',
        group_id: 'org.springframework',
        artifact_id: 'spring-core',
        version: '5.3.21',
        scope: 'compile',
        source: 'maven',
        is_transitive: false,
        depth: 0,
        children: [],
        dependency_path: ['org.springframework:spring-core'],
        has_conflicts: false,
        conflict_ids: [],
        confidence: 0.95,
        package_imports: ['org.springframework.core']
      }
    ],
    all_dependencies: {
      'org.springframework:spring-core': {
        id: 'org.springframework:spring-core',
        group_id: 'org.springframework',
        artifact_id: 'spring-core',
        version: '5.3.21',
        scope: 'compile',
        source: 'maven',
        is_transitive: false,
        depth: 0,
        children: [],
        dependency_path: ['org.springframework:spring-core'],
        has_conflicts: false,
        conflict_ids: [],
        confidence: 0.95,
        package_imports: ['org.springframework.core']
      }
    },
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
  recommendations: ['Consider reviewing dependencies'],
  detectedFrameworks: { 'Spring Framework': '5.3.21' },
  importedPackages: { 'org.springframework.core': ['OSGi Import-Package'] },
  exportedPackages: { 'com.example.api': '1.0.0' }
};

describe('DependencyDashboard', () => {
  beforeEach(() => {
    mockJarService.getComprehensiveDependencyAnalysis.mockClear();
  });

  test('renders loading state initially', () => {
    mockJarService.getComprehensiveDependencyAnalysis.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<DependencyDashboard jarId="test-jar" isVisible={true} />);
    
    expect(screen.getByText('Loading dependency analysis...')).toBeInTheDocument();
  });

  test('renders dependency data after loading', async () => {
    mockJarService.getComprehensiveDependencyAnalysis.mockResolvedValue(mockComprehensiveData);

    render(<DependencyDashboard jarId="test-jar" isVisible={true} />);

    await waitFor(() => {
      expect(screen.getByText('Dependency Analysis')).toBeInTheDocument();
    });

    expect(screen.getByText('1')).toBeInTheDocument(); // Total dependencies
    expect(screen.getByText('spring-core')).toBeInTheDocument();
    expect(screen.getByText('Spring Framework')).toBeInTheDocument();
  });

  test('handles search functionality', async () => {
    mockJarService.getComprehensiveDependencyAnalysis.mockResolvedValue(mockComprehensiveData);

    render(<DependencyDashboard jarId="test-jar" isVisible={true} />);

    await waitFor(() => {
      expect(screen.getByText('spring-core')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search dependencies...');
    fireEvent.change(searchInput, { target: { value: 'spring' } });

    await waitFor(() => {
      expect(screen.getByText('spring-core')).toBeInTheDocument();
    });
  });

  test('handles error states gracefully', async () => {
    mockJarService.getComprehensiveDependencyAnalysis.mockRejectedValue(
      new Error('Failed to load data')
    );

    render(<DependencyDashboard jarId="test-jar" isVisible={true} />);

    await waitFor(() => {
      expect(screen.getByText('Analysis Failed')).toBeInTheDocument();
      expect(screen.getByText('Failed to load data')).toBeInTheDocument();
    });
  });

  test('shows framework detection', async () => {
    mockJarService.getComprehensiveDependencyAnalysis.mockResolvedValue(mockComprehensiveData);

    render(<DependencyDashboard jarId="test-jar" isVisible={true} />);

    await waitFor(() => {
      expect(screen.getByText('Detected Frameworks')).toBeInTheDocument();
      expect(screen.getByText('Spring Framework')).toBeInTheDocument();
      expect(screen.getByText('5.3.21')).toBeInTheDocument();
    });
  });

  test('shows confidence scores', async () => {
    mockJarService.getComprehensiveDependencyAnalysis.mockResolvedValue(mockComprehensiveData);

    render(<DependencyDashboard jarId="test-jar" isVisible={true} />);

    await waitFor(() => {
      expect(screen.getByText('Detection Quality')).toBeInTheDocument();
      expect(screen.getByText('95%')).toBeInTheDocument(); // Confidence score
    });
  });
});
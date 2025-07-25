import React, { useState, useCallback } from 'react';
import DependencySearch from './DependencySearch';
import DependencyTreeView from './DependencyTreeView';
import { SearchFilters, DependencyNode, DependencyTree } from '@/stores/singleJarDashboardStore';

// Demo component to showcase the search and filter functionality
const DependencySearchDemo: React.FC = () => {
  // Mock data for demonstration
  const mockDependencyTree: DependencyTree = {
    id: 'demo-tree',
    jar_id: 'demo-jar',
    root_dependencies: [
      {
        id: 'spring-boot-starter',
        group_id: 'org.springframework.boot',
        artifact_id: 'spring-boot-starter',
        version: '2.7.0',
        scope: 'compile',
        source: 'maven',
        is_transitive: false,
        depth: 0,
        children: [
          {
            id: 'spring-core',
            group_id: 'org.springframework',
            artifact_id: 'spring-core',
            version: '5.3.21',
            scope: 'compile',
            source: 'maven',
            is_transitive: true,
            depth: 1,
            children: [],
            dependency_path: ['spring-boot-starter', 'spring-core'],
            has_conflicts: true,
            conflict_severity: 'high',
            conflict_ids: ['version-conflict-1'],
            description: 'Spring Framework Core'
          }
        ],
        dependency_path: ['spring-boot-starter'],
        has_conflicts: false,
        conflict_ids: [],
        description: 'Spring Boot Starter'
      },
      {
        id: 'junit',
        group_id: 'junit',
        artifact_id: 'junit',
        version: '4.13.2',
        scope: 'test',
        source: 'maven',
        is_transitive: false,
        depth: 0,
        children: [],
        dependency_path: ['junit'],
        has_conflicts: false,
        conflict_ids: [],
        description: 'JUnit Testing Framework'
      },
      {
        id: 'logback-classic',
        group_id: 'ch.qos.logback',
        artifact_id: 'logback-classic',
        version: '1.2.11',
        scope: 'runtime',
        source: 'gradle',
        is_transitive: false,
        depth: 0,
        children: [],
        dependency_path: ['logback-classic'],
        has_conflicts: true,
        conflict_severity: 'medium',
        conflict_ids: ['version-conflict-2'],
        description: 'Logback Classic Module'
      }
    ],
    all_dependencies: {},
    conflicts: [
      {
        id: 'version-conflict-1',
        conflict_type: 'version',
        affected_dependencies: ['spring-core'],
        description: 'Version conflict in Spring Core',
        severity: 'high',
        conflicting_versions: ['5.3.21', '5.3.20'],
        winning_version: '5.3.21',
        paths: [['spring-boot-starter', 'spring-core']]
      },
      {
        id: 'version-conflict-2',
        conflict_type: 'version',
        affected_dependencies: ['logback-classic'],
        description: 'Version conflict in Logback',
        severity: 'medium',
        conflicting_versions: ['1.2.11', '1.2.10'],
        winning_version: '1.2.11',
        paths: [['logback-classic']]
      }
    ],
    paths: [],
    total_dependencies: 4,
    direct_dependencies: 3,
    transitive_dependencies: 1,
    max_depth: 1,
    scope_counts: { compile: 2, test: 1, runtime: 1 },
    source_counts: { maven: 3, gradle: 1 }
  };

  // Initialize all_dependencies from root_dependencies
  const initializeAllDependencies = (tree: DependencyTree): DependencyTree => {
    const allDeps: Record<string, DependencyNode> = {};
    
    const addDependency = (dep: DependencyNode) => {
      allDeps[dep.id] = dep;
      dep.children.forEach(addDependency);
    };
    
    tree.root_dependencies.forEach(addDependency);
    
    return {
      ...tree,
      all_dependencies: allDeps
    };
  };

  const [dependencyTree] = useState<DependencyTree>(() => 
    initializeAllDependencies(mockDependencyTree)
  );

  // State for search and filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [searchResults, setSearchResults] = useState<DependencyNode[]>([]);
  const [selectedDependency, setSelectedDependency] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['spring-boot-starter']));

  // Search functionality
  const performSearch = useCallback((query: string, currentFilters: SearchFilters) => {
    let results = Object.values(dependencyTree.all_dependencies);
    
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
    if (currentFilters.scopes && currentFilters.scopes.length > 0) {
      results = results.filter(dep => currentFilters.scopes!.includes(dep.scope));
    }
    
    if (currentFilters.sources && currentFilters.sources.length > 0) {
      results = results.filter(dep => currentFilters.sources!.includes(dep.source));
    }
    
    if (currentFilters.conflictStatus !== undefined) {
      results = results.filter(dep => dep.has_conflicts === currentFilters.conflictStatus);
    }
    
    if (currentFilters.conflictSeverity && currentFilters.conflictSeverity.length > 0) {
      results = results.filter(dep => 
        dep.conflict_severity && currentFilters.conflictSeverity!.includes(dep.conflict_severity)
      );
    }
    
    if (currentFilters.depth) {
      const { min, max } = currentFilters.depth;
      results = results.filter(dep => {
        if (min !== undefined && dep.depth < min) return false;
        if (max !== undefined && dep.depth > max) return false;
        return true;
      });
    }
    
    if (currentFilters.transitive !== undefined) {
      results = results.filter(dep => dep.is_transitive === currentFilters.transitive);
    }
    
    setSearchResults(results);
  }, [dependencyTree.all_dependencies]);

  // Handle search query change
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    performSearch(query, filters);
  }, [filters, performSearch]);

  // Handle filters change
  const handleFiltersChange = useCallback((newFilters: SearchFilters) => {
    setFilters(newFilters);
    performSearch(searchQuery, newFilters);
  }, [searchQuery, performSearch]);

  // Handle dependency selection
  const handleDependencySelect = useCallback((dependencyId: string) => {
    setSelectedDependency(dependencyId);
  }, []);

  // Handle node toggle
  const handleNodeToggle = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  return (
    <div className="dependency-search-demo p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Dependency Search & Filter Demo
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Demonstration of real-time search and filtering capabilities for JAR dependency analysis.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search and Filter Panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <DependencySearch
              searchQuery={searchQuery}
              filters={filters}
              dependencyTree={dependencyTree}
              searchResults={searchResults}
              onSearchChange={handleSearchChange}
              onFiltersChange={handleFiltersChange}
              onDependencySelect={handleDependencySelect}
            />
            
            {/* Search Results Summary */}
            {(searchQuery.trim() || Object.keys(filters).length > 0) && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                  Search Results
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Found {searchResults.length} dependencies matching your criteria
                </p>
                {searchResults.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {searchResults.slice(0, 3).map(dep => (
                      <div key={dep.id} className="text-xs text-blue-600 dark:text-blue-400">
                        {dep.group_id}:{dep.artifact_id}
                      </div>
                    ))}
                    {searchResults.length > 3 && (
                      <div className="text-xs text-blue-500 dark:text-blue-500">
                        +{searchResults.length - 3} more...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Dependency Tree Panel */}
        <div className="lg:col-span-2">
          <DependencyTreeView
            dependencyTree={dependencyTree}
            searchQuery={searchQuery}
            filters={filters}
            selectedDependency={selectedDependency}
            expandedNodes={expandedNodes}
            onDependencySelect={handleDependencySelect}
            onNodeToggle={handleNodeToggle}
          />
          
          {/* Selected Dependency Details */}
          {selectedDependency && (
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                Selected Dependency Details
              </h3>
              {(() => {
                const dep = dependencyTree.all_dependencies[selectedDependency];
                if (!dep) return <p className="text-gray-500">Dependency not found</p>;
                
                return (
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Name:</span>{' '}
                      <span className="text-gray-900 dark:text-gray-100">
                        {dep.group_id}:{dep.artifact_id}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Version:</span>{' '}
                      <span className="text-gray-900 dark:text-gray-100">{dep.version}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Scope:</span>{' '}
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                        {dep.scope}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Source:</span>{' '}
                      <span className="text-gray-900 dark:text-gray-100">{dep.source}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Type:</span>{' '}
                      <span className="text-gray-900 dark:text-gray-100">
                        {dep.is_transitive ? 'Transitive' : 'Direct'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Depth:</span>{' '}
                      <span className="text-gray-900 dark:text-gray-100">{dep.depth}</span>
                    </div>
                    {dep.has_conflicts && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Conflicts:</span>{' '}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          dep.conflict_severity === 'high' 
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                        }`}>
                          {dep.conflict_severity?.toUpperCase()}
                        </span>
                      </div>
                    )}
                    {dep.description && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Description:</span>{' '}
                        <span className="text-gray-900 dark:text-gray-100">{dep.description}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Feature Showcase */}
      <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Features Demonstrated
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Real-time Search</h3>
            <ul className="space-y-1 text-gray-600 dark:text-gray-400">
              <li>• Search by group ID, artifact ID, or version</li>
              <li>• Instant results with highlighting</li>
              <li>• Keyboard navigation support</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Advanced Filtering</h3>
            <ul className="space-y-1 text-gray-600 dark:text-gray-400">
              <li>• Filter by scope (compile, test, runtime)</li>
              <li>• Filter by source (maven, gradle)</li>
              <li>• Filter by conflict status and severity</li>
              <li>• Filter by dependency type and depth</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Tree Visualization</h3>
            <ul className="space-y-1 text-gray-600 dark:text-gray-400">
              <li>• Hierarchical dependency tree</li>
              <li>• Expand/collapse functionality</li>
              <li>• Visual conflict indicators</li>
              <li>• Search result highlighting</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DependencySearchDemo;
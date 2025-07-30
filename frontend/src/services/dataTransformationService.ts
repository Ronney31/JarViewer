/**
 * Data Transformation Service
 * Converts backend API responses to frontend-expected data structures
 */

// Backend response interfaces
interface BackendDependency {
  name: string;
  version?: string;
  group_id?: string;
  artifact_id?: string;
  scope: string;
  source: string;
  optional: boolean;
  description?: string;
  license?: string;
  bundle_symbolic_name?: string;
  bundle_version?: string;
  resolution: string;
  package_imports: string[];
  package_exports: string[];
  confidence: number;
}

interface BackendJarInfo {
  name?: string;
  version?: string;
  group_id?: string;
  artifact_id?: string;
  bundle_name?: string;
  bundle_symbolic_name?: string;
  bundle_version?: string;
  bundle_vendor?: string;
  bundle_description?: string;
  built_by?: string;
  build_jdk?: string;
  build_time?: string;
  created_by?: string;
  specification_title?: string;
  specification_version?: string;
  specification_vendor?: string;
  implementation_title?: string;
  implementation_version?: string;
  implementation_vendor?: string;
  main_class?: string;
  class_path: string[];
}

interface BackendStatistics {
  total_dependencies: number;
  maven_dependencies: number;
  osgi_dependencies: number;
  gradle_dependencies: number;
  direct_dependencies: number;
  transitive_dependencies: number;
  optional_dependencies: number;
  security_risks: number;
  license_conflicts: number;
  version_conflicts: number;
  detected_frameworks: number;
}

interface BackendAnalysisResponse {
  jar_info: BackendJarInfo;
  dependencies: BackendDependency[];
  direct_dependencies: BackendDependency[];
  transitive_dependencies: BackendDependency[];
  optional_dependencies: BackendDependency[];
  imported_packages: Record<string, string[]>;
  exported_packages: Record<string, string>;
  detected_frameworks: Record<string, string>;
  security_risks: any[];
  license_conflicts: any[];
  version_conflicts: any[];
  statistics: BackendStatistics;
}

// Frontend interfaces (matching existing store expectations)
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
  confidence?: number;
  package_imports?: string[];
  package_exports?: string[];
  optional?: boolean;
}

interface DependencyTree {
  id: string;
  jar_id: string;
  root_dependencies: DependencyNode[];
  all_dependencies: Record<string, DependencyNode>;
  conflicts: any[];
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
  conflicts: any[];
  recommendations: string[];
  detectedFrameworks: Record<string, string>;
  importedPackages: Record<string, string[]>;
  exportedPackages: Record<string, string>;
}

class DataTransformationService {
  /**
   * Transform backend comprehensive analysis response to frontend format
   */
  transformComprehensiveAnalysis(
    backendResponse: BackendAnalysisResponse,
    jarId: string
  ): AnalysisData {
    console.log('🔄 DataTransformationService: Transforming backend response:', backendResponse);

    // Transform dependencies to nodes
    const allDependencies: Record<string, DependencyNode> = {};
    const rootDependencies: DependencyNode[] = [];

    // Process direct dependencies first
    backendResponse.direct_dependencies.forEach((dep, index) => {
      const node = this.transformDependencyToNode(dep, false, 0, jarId);
      allDependencies[node.id] = node;
      rootDependencies.push(node);
    });

    // Process transitive dependencies
    backendResponse.transitive_dependencies.forEach((dep, index) => {
      const node = this.transformDependencyToNode(dep, true, 1, jarId);
      allDependencies[node.id] = node;
      
      // Try to find parent in direct dependencies
      const parentNode = rootDependencies.find(parent => 
        this.couldBeParent(parent, node)
      );
      
      if (parentNode) {
        node.parent_id = parentNode.id;
        node.dependency_path = [...parentNode.dependency_path, node.id];
        parentNode.children.push(node);
      } else {
        // If no clear parent, add as root with depth 1
        // For now, let's add all transitive as children of the first direct dependency
        // This is a simplified approach - in a real scenario we'd need more sophisticated logic
        if (rootDependencies.length > 0) {
          const firstParent = rootDependencies[0];
          node.parent_id = firstParent.id;
          node.dependency_path = [...firstParent.dependency_path, node.id];
          firstParent.children.push(node);
        } else {
          rootDependencies.push(node);
        }
      }
    });

    // Calculate scope and source breakdowns
    const scopeBreakdown: Record<string, number> = {};
    const sourceBreakdown: Record<string, number> = {};
    
    Object.values(allDependencies).forEach(dep => {
      scopeBreakdown[dep.scope] = (scopeBreakdown[dep.scope] || 0) + 1;
      sourceBreakdown[dep.source] = (sourceBreakdown[dep.source] || 0) + 1;
    });

    // Calculate max depth
    const maxDepth = Math.max(
      ...Object.values(allDependencies).map(dep => dep.depth),
      0
    );

    // Determine risk level based on conflicts and dependency count
    const totalDeps = backendResponse.statistics.total_dependencies;
    const hasConflicts = backendResponse.version_conflicts.length > 0 || 
                        backendResponse.license_conflicts.length > 0;
    
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (hasConflicts) {
      riskLevel = 'high';
    } else if (totalDeps > 20) {
      riskLevel = 'medium';
    }

    // Create dependency tree
    const dependencyTree: DependencyTree = {
      id: `tree_${jarId}`,
      jar_id: jarId,
      root_dependencies: rootDependencies,
      all_dependencies: allDependencies,
      conflicts: backendResponse.version_conflicts || [],
      paths: [],
      total_dependencies: backendResponse.statistics.total_dependencies,
      direct_dependencies: backendResponse.statistics.direct_dependencies,
      transitive_dependencies: backendResponse.statistics.transitive_dependencies,
      max_depth: maxDepth,
      scope_counts: scopeBreakdown,
      source_counts: sourceBreakdown
    };

    // Create analysis summary
    const summary = {
      total_dependencies: backendResponse.statistics.total_dependencies,
      direct_dependencies: backendResponse.statistics.direct_dependencies,
      transitive_dependencies: backendResponse.statistics.transitive_dependencies,
      max_depth: maxDepth,
      conflicts_count: backendResponse.version_conflicts.length + backendResponse.license_conflicts.length,
      scope_breakdown: scopeBreakdown,
      source_breakdown: sourceBreakdown,
      has_conflicts: hasConflicts,
      risk_level: riskLevel
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations(backendResponse);

    const result: AnalysisData = {
      dependencyTree,
      summary,
      conflicts: [...backendResponse.version_conflicts, ...backendResponse.license_conflicts],
      recommendations,
      detectedFrameworks: backendResponse.detected_frameworks || {},
      importedPackages: backendResponse.imported_packages || {},
      exportedPackages: backendResponse.exported_packages || {}
    };

    console.log('✅ DataTransformationService: Transformation complete:', {
      totalDependencies: result.summary.total_dependencies,
      directDependencies: result.summary.direct_dependencies,
      transitiveDependencies: result.summary.transitive_dependencies,
      rootNodes: result.dependencyTree.root_dependencies.length,
      allNodes: Object.keys(result.dependencyTree.all_dependencies).length
    });

    return result;
  }

  /**
   * Transform a backend dependency to a frontend dependency node
   */
  private transformDependencyToNode(
    backendDep: BackendDependency,
    isTransitive: boolean,
    depth: number,
    jarId: string
  ): DependencyNode {
    // Create unique ID from group_id and artifact_id
    const groupId = backendDep.group_id || this.extractGroupFromName(backendDep.name);
    const artifactId = backendDep.artifact_id || this.extractArtifactFromName(backendDep.name);
    const id = `${groupId}:${artifactId}`;

    return {
      id,
      group_id: groupId,
      artifact_id: artifactId,
      version: backendDep.version,
      scope: backendDep.scope,
      source: backendDep.source,
      is_transitive: isTransitive,
      depth,
      children: [],
      dependency_path: [id],
      has_conflicts: false, // Will be updated if conflicts are detected
      conflict_ids: [],
      description: backendDep.description,
      license: backendDep.license,
      confidence: backendDep.confidence,
      package_imports: backendDep.package_imports,
      package_exports: backendDep.package_exports,
      optional: backendDep.optional
    };
  }

  /**
   * Extract group ID from dependency name
   */
  private extractGroupFromName(name: string): string {
    if (name.includes(':')) {
      return name.split(':')[0];
    }
    
    // For names like "Unknown Library (com.thoughtworks.qdox)"
    const match = name.match(/\(([^)]+)\)/);
    if (match) {
      const packageName = match[1];
      const parts = packageName.split('.');
      if (parts.length >= 2) {
        return parts.slice(0, -1).join('.');
      }
    }
    
    return name;
  }

  /**
   * Extract artifact ID from dependency name
   */
  private extractArtifactFromName(name: string): string {
    if (name.includes(':')) {
      const parts = name.split(':');
      return parts[parts.length - 1];
    }
    
    // For names like "Unknown Library (com.thoughtworks.qdox)"
    const match = name.match(/\(([^)]+)\)/);
    if (match) {
      const packageName = match[1];
      const parts = packageName.split('.');
      return parts[parts.length - 1];
    }
    
    return name;
  }

  /**
   * Check if a dependency could be a parent of another
   */
  private couldBeParent(parent: DependencyNode, child: DependencyNode): boolean {
    // Simple heuristic: if parent and child share similar package structure
    if (parent.package_imports && child.package_imports) {
      const parentPackages = new Set(parent.package_imports);
      const childPackages = new Set(child.package_imports);
      
      // Check for package overlap
      for (const pkg of childPackages) {
        if (parentPackages.has(pkg)) {
          return true;
        }
      }
    }
    
    // Check if group IDs are related
    if (parent.group_id && child.group_id) {
      return parent.group_id === child.group_id || 
             child.group_id.startsWith(parent.group_id) ||
             parent.group_id.startsWith(child.group_id);
    }
    
    return false;
  }

  /**
   * Generate recommendations based on analysis results
   */
  private generateRecommendations(backendResponse: BackendAnalysisResponse): string[] {
    const recommendations: string[] = [];
    
    const stats = backendResponse.statistics;
    
    if (stats.total_dependencies === 0) {
      recommendations.push("This JAR appears to be self-contained with no external dependencies.");
    } else if (stats.total_dependencies > 50) {
      recommendations.push("Consider reviewing the large number of dependencies for potential optimization.");
    }
    
    if (stats.security_risks > 0) {
      recommendations.push(`Found ${stats.security_risks} potential security risks. Review dependencies for known vulnerabilities.`);
    }
    
    if (stats.version_conflicts > 0) {
      recommendations.push(`Detected ${stats.version_conflicts} version conflicts. Consider dependency resolution.`);
    }
    
    if (stats.license_conflicts > 0) {
      recommendations.push(`Found ${stats.license_conflicts} license conflicts. Review license compatibility.`);
    }
    
    const frameworkCount = Object.keys(backendResponse.detected_frameworks).length;
    if (frameworkCount > 0) {
      recommendations.push(`Detected ${frameworkCount} frameworks. Ensure version compatibility.`);
    }
    
    if (stats.optional_dependencies > 0) {
      recommendations.push(`${stats.optional_dependencies} optional dependencies found. Consider if all are needed.`);
    }
    
    return recommendations;
  }
}

// Export singleton instance
export const dataTransformationService = new DataTransformationService();
export type { BackendAnalysisResponse, AnalysisData, DependencyNode, DependencyTree };
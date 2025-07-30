import { dataTransformationService } from '../dataTransformationService';

describe('DataTransformationService', () => {
  const mockBackendResponse = {
    jar_info: {
      name: 'test.jar',
      version: '1.0.0'
    },
    dependencies: [],
    direct_dependencies: [
      {
        name: 'org.springframework:spring-core',
        version: '5.3.21',
        group_id: 'org.springframework',
        artifact_id: 'spring-core',
        scope: 'compile',
        source: 'maven',
        optional: false,
        confidence: 0.95,
        package_imports: ['org.springframework.core'],
        package_exports: []
      }
    ],
    transitive_dependencies: [
      {
        name: 'org.springframework:spring-jcl',
        version: '5.3.21',
        group_id: 'org.springframework',
        artifact_id: 'spring-jcl',
        scope: 'compile',
        source: 'maven',
        optional: false,
        confidence: 0.90,
        package_imports: ['org.apache.commons.logging'],
        package_exports: []
      }
    ],
    optional_dependencies: [],
    imported_packages: {
      'org.springframework.core': ['OSGi Import-Package'],
      'org.apache.commons.logging': ['OSGi Import-Package']
    },
    exported_packages: {
      'com.example.api': '1.0.0'
    },
    detected_frameworks: {
      'Spring Framework': '5.3.21'
    },
    security_risks: [],
    license_conflicts: [],
    version_conflicts: [],
    statistics: {
      total_dependencies: 2,
      maven_dependencies: 2,
      osgi_dependencies: 0,
      gradle_dependencies: 0,
      direct_dependencies: 1,
      transitive_dependencies: 1,
      optional_dependencies: 0,
      security_risks: 0,
      license_conflicts: 0,
      version_conflicts: 0,
      detected_frameworks: 1
    }
  };

  test('transforms comprehensive analysis correctly', () => {
    const result = dataTransformationService.transformComprehensiveAnalysis(
      mockBackendResponse,
      'test-jar-123'
    );

    expect(result.dependencyTree.jar_id).toBe('test-jar-123');
    expect(result.dependencyTree.total_dependencies).toBe(2);
    expect(result.dependencyTree.direct_dependencies).toBe(1);
    expect(result.dependencyTree.transitive_dependencies).toBe(1);
    expect(result.dependencyTree.root_dependencies).toHaveLength(1);
    expect(Object.keys(result.dependencyTree.all_dependencies)).toHaveLength(2);
  });

  test('includes framework detection data', () => {
    const result = dataTransformationService.transformComprehensiveAnalysis(
      mockBackendResponse,
      'test-jar-123'
    );

    expect(result.detectedFrameworks).toEqual({
      'Spring Framework': '5.3.21'
    });
  });

  test('includes package import/export data', () => {
    const result = dataTransformationService.transformComprehensiveAnalysis(
      mockBackendResponse,
      'test-jar-123'
    );

    expect(result.importedPackages).toEqual({
      'org.springframework.core': ['OSGi Import-Package'],
      'org.apache.commons.logging': ['OSGi Import-Package']
    });
    expect(result.exportedPackages).toEqual({
      'com.example.api': '1.0.0'
    });
  });

  test('calculates risk level correctly', () => {
    const result = dataTransformationService.transformComprehensiveAnalysis(
      mockBackendResponse,
      'test-jar-123'
    );

    expect(result.summary.risk_level).toBe('low');
  });

  test('handles empty dependencies gracefully', () => {
    const emptyResponse = {
      ...mockBackendResponse,
      direct_dependencies: [],
      transitive_dependencies: [],
      statistics: {
        ...mockBackendResponse.statistics,
        total_dependencies: 0,
        direct_dependencies: 0,
        transitive_dependencies: 0
      }
    };

    const result = dataTransformationService.transformComprehensiveAnalysis(
      emptyResponse,
      'test-jar-123'
    );

    expect(result.dependencyTree.total_dependencies).toBe(0);
    expect(result.dependencyTree.root_dependencies).toHaveLength(0);
    expect(Object.keys(result.dependencyTree.all_dependencies)).toHaveLength(0);
  });
});
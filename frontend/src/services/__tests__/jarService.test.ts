import { jarService } from '../jarService';
import { apiService } from '../apiService';
import { dataTransformationService } from '../dataTransformationService';

// Mock dependencies
jest.mock('../apiService');
jest.mock('../dataTransformationService');

const mockApiService = apiService as jest.Mocked<typeof apiService>;
const mockDataTransformationService = dataTransformationService as jest.Mocked<typeof dataTransformationService>;

describe('JarService', () => {
  beforeEach(() => {
    mockApiService.get.mockClear();
    mockDataTransformationService.transformComprehensiveAnalysis.mockClear();
  });

  test('getComprehensiveDependencyAnalysis calls correct endpoint', async () => {
    const mockBackendResponse = {
      success: true,
      data: {
        jar_info: {},
        dependencies: [],
        direct_dependencies: [],
        transitive_dependencies: [],
        statistics: { total_dependencies: 0 }
      }
    };

    const mockTransformedData = {
      dependencyTree: { jar_id: 'test-jar' },
      summary: { total_dependencies: 0 }
    };

    mockApiService.get.mockResolvedValue(mockBackendResponse);
    mockDataTransformationService.transformComprehensiveAnalysis.mockReturnValue(mockTransformedData as any);

    const result = await jarService.getComprehensiveDependencyAnalysis('test-jar');

    expect(mockApiService.get).toHaveBeenCalledWith('/jars/test-jar/analysis/comprehensive');
    expect(mockDataTransformationService.transformComprehensiveAnalysis).toHaveBeenCalledWith(
      mockBackendResponse.data,
      'test-jar'
    );
    expect(result).toEqual(mockTransformedData);
  });

  test('handles API errors gracefully', async () => {
    mockApiService.get.mockRejectedValue(new Error('API Error'));

    await expect(jarService.getComprehensiveDependencyAnalysis('test-jar'))
      .rejects.toThrow('API Error');
  });

  test('handles invalid API response', async () => {
    const invalidResponse = {
      success: false,
      error: 'Invalid JAR file'
    };

    mockApiService.get.mockResolvedValue(invalidResponse);

    await expect(jarService.getComprehensiveDependencyAnalysis('test-jar'))
      .rejects.toThrow('Failed to load comprehensive dependency analysis');
  });
});
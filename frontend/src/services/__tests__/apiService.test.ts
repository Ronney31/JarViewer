import { apiService } from '../apiService';

// Mock fetch
global.fetch = jest.fn();

describe('ApiService', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  test('makes GET request to correct endpoint', async () => {
    const mockResponse = {
      success: true,
      data: { test: 'data' }
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const result = await apiService.get('/test-endpoint');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9000/api/v1/test-endpoint',
      expect.objectContaining({
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );
    expect(result).toEqual(mockResponse);
  });

  test('handles network errors gracefully', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    await expect(apiService.get('/test-endpoint')).rejects.toThrow('Network error');
  });

  test('handles HTTP errors gracefully', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    await expect(apiService.get('/test-endpoint')).rejects.toThrow('HTTP error! status: 404');
  });

  test('makes POST request with data', async () => {
    const mockResponse = { success: true };
    const testData = { key: 'value' };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const result = await apiService.post('/test-endpoint', testData);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9000/api/v1/test-endpoint',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testData)
      })
    );
    expect(result).toEqual(mockResponse);
  });
});
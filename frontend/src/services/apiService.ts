// API Service for making HTTP requests
class ApiService {
  private baseUrl: string;

  constructor() {
    // Use environment variable for API URL, fallback to localhost:9000 (correct backend port for Docker)
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:9000';
    this.baseUrl = `${apiUrl}/api/v1`;
  }

  /**
   * Generic GET request
   */
  async get(endpoint: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Request failed: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Request failed',
      };
    }
  }

  /**
   * Generic POST request
   */
  async post(endpoint: string, body?: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Request failed: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Request failed',
      };
    }
  }

  /**
   * Get comprehensive dependency analysis for a JAR
   */
  async getComprehensiveDependencyAnalysis(jarId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    return this.get(`/jars/${jarId}/analysis/comprehensive`);
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<{ success: boolean; data?: any; error?: string }> {
    return this.get('/health');
  }
}

export const apiService = new ApiService();
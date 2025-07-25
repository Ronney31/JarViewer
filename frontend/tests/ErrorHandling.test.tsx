/**
 * Comprehensive tests for frontend error handling implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import {
  ErrorType,
  ErrorSeverity,
  LoadingStage,
  AnalysisErrorBuilder,
  createErrorFromApiResponse,
  getLoadingMessage,
  estimateTimeRemaining,
  shouldRetry,
  calculateRetryDelay,
  DEFAULT_RETRY_CONFIG
} from '../src/types/errors';

import { errorHandlingService } from '../src/services/errorHandlingService';
import LoadingIndicator from '../src/components/LoadingIndicator';
import ErrorBoundary from '../src/components/ErrorBoundary';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('Error Types and Builders', () => {
  describe('AnalysisErrorBuilder', () => {
    it('should create error with all properties', () => {
      const error = AnalysisErrorBuilder.create()
        .type(ErrorType.JAR_NOT_FOUND)
        .severity(ErrorSeverity.HIGH)
        .message('Test error message')
        .suggested_action('Test suggested action')
        .retryable(false)
        .context({ test: 'context' })
        .build();

      expect(error.type).toBe(ErrorType.JAR_NOT_FOUND);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.message).toBe('Test error message');
      expect(error.suggestedAction).toBe('Test suggested action');
      expect(error.retryable).toBe(false);
      expect(error.context).toEqual({ test: 'context' });
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should throw error when required fields are missing', () => {
      expect(() => {
        AnalysisErrorBuilder.create().build();
      }).toThrow('AnalysisError requires type, message, and suggestedAction');
    });

    it('should use default severity when not specified', () => {
      const error = AnalysisErrorBuilder.create()
        .type(ErrorType.NETWORK_ERROR)
        .message('Test message')
        .suggestedAction('Test action')
        .build();

      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
    });
  });

  describe('createErrorFromApiResponse', () => {
    it('should create JAR_NOT_FOUND error for 404 status', () => {
      const response = { status: 404 };
      const error = createErrorFromApiResponse(response, { jarId: 'test' });

      expect(error.type).toBe(ErrorType.JAR_NOT_FOUND);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.retryable).toBe(false);
      expect(error.context?.jarId).toBe('test');
    });

    it('should create TIMEOUT_ERROR for timeout status codes', () => {
      const response = { status: 408 };
      const error = createErrorFromApiResponse(response);

      expect(error.type).toBe(ErrorType.TIMEOUT_ERROR);
      expect(error.retryable).toBe(true);
    });

    it('should create API_ERROR for server errors', () => {
      const response = { status: 500, statusText: 'Internal Server Error' };
      const error = createErrorFromApiResponse(response);

      expect(error.type).toBe(ErrorType.API_ERROR);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.retryable).toBe(true);
    });

    it('should create NETWORK_ERROR for no status', () => {
      const response = {};
      const error = createErrorFromApiResponse(response);

      expect(error.type).toBe(ErrorType.NETWORK_ERROR);
      expect(error.retryable).toBe(true);
    });
  });
});

describe('Loading State Utilities', () => {
  describe('getLoadingMessage', () => {
    it('should return appropriate messages for each stage', () => {
      expect(getLoadingMessage(LoadingStage.INITIALIZING, 0))
        .toBe('Initializing dependency analysis...');
      
      expect(getLoadingMessage(LoadingStage.EXTRACTING_DEPENDENCIES, 25))
        .toBe('Extracting dependencies from JAR file... (25%)');
      
      expect(getLoadingMessage(LoadingStage.COMPLETE, 100))
        .toBe('Analysis complete!');
    });
  });

  describe('estimateTimeRemaining', () => {
    it('should calculate time remaining correctly', () => {
      const startTime = new Date(Date.now() - 10000); // 10 seconds ago
      const remaining = estimateTimeRemaining(LoadingStage.BUILDING_TREE, 50, startTime);
      
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThan(20); // Should be around 10 seconds
    });

    it('should return 0 for zero progress', () => {
      const startTime = new Date();
      const remaining = estimateTimeRemaining(LoadingStage.INITIALIZING, 0, startTime);
      
      expect(remaining).toBe(0);
    });
  });
});

describe('Retry Logic', () => {
  describe('shouldRetry', () => {
    it('should return true for retryable errors within attempt limit', () => {
      const error = AnalysisErrorBuilder.create()
        .type(ErrorType.NETWORK_ERROR)
        .message('Network error')
        .suggestedAction('Retry')
        .retryable(true)
        .build();

      expect(shouldRetry(error, 1, DEFAULT_RETRY_CONFIG)).toBe(true);
      expect(shouldRetry(error, 3, DEFAULT_RETRY_CONFIG)).toBe(false);
    });

    it('should return false for non-retryable errors', () => {
      const error = AnalysisErrorBuilder.create()
        .type(ErrorType.JAR_NOT_FOUND)
        .message('JAR not found')
        .suggestedAction('Upload again')
        .retryable(false)
        .build();

      expect(shouldRetry(error, 1, DEFAULT_RETRY_CONFIG)).toBe(false);
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      expect(calculateRetryDelay(1, DEFAULT_RETRY_CONFIG)).toBe(1000);
      expect(calculateRetryDelay(2, DEFAULT_RETRY_CONFIG)).toBe(2000);
      expect(calculateRetryDelay(3, DEFAULT_RETRY_CONFIG)).toBe(4000);
    });

    it('should cap at maximum delay', () => {
      const delay = calculateRetryDelay(10, DEFAULT_RETRY_CONFIG);
      expect(delay).toBe(DEFAULT_RETRY_CONFIG.maxDelay);
    });
  });
});

describe('ErrorHandlingService', () => {
  beforeEach(() => {
    errorHandlingService.cleanup();
  });

  afterEach(() => {
    errorHandlingService.cleanup();
  });

  describe('Error Listeners', () => {
    it('should register and notify error listeners', () => {
      const mockListener = vi.fn();
      const unsubscribe = errorHandlingService.onError(mockListener);

      const error = AnalysisErrorBuilder.create()
        .type(ErrorType.NETWORK_ERROR)
        .message('Test error')
        .suggestedAction('Test action')
        .build();

      // Simulate error handling
      errorHandlingService.handleApiError(
        { status: 500 },
        { jarId: 'test', operation: 'test' }
      );

      expect(mockListener).toHaveBeenCalled();
      
      unsubscribe();
    });
  });

  describe('Loading State Management', () => {
    it('should update and retrieve loading states', () => {
      const jarId = 'test-jar';
      
      errorHandlingService.updateLoadingState(
        jarId,
        LoadingStage.EXTRACTING_DEPENDENCIES,
        50
      );

      const loadingState = errorHandlingService.getLoadingState(jarId);
      
      expect(loadingState).toBeTruthy();
      expect(loadingState?.stage).toBe(LoadingStage.EXTRACTING_DEPENDENCIES);
      expect(loadingState?.progress).toBe(50);
      expect(loadingState?.isLoading).toBe(true);
    });

    it('should clear loading states', () => {
      const jarId = 'test-jar';
      
      errorHandlingService.updateLoadingState(jarId, LoadingStage.BUILDING_TREE, 25);
      expect(errorHandlingService.getLoadingState(jarId)).toBeTruthy();
      
      errorHandlingService.clearLoadingState(jarId);
      expect(errorHandlingService.getLoadingState(jarId)).toBeNull();
    });
  });

  describe('Partial Analysis Handling', () => {
    it('should handle partial analysis failures correctly', () => {
      const errors = [
        AnalysisErrorBuilder.create()
          .type(ErrorType.CONFLICT_DETECTION_FAILED)
          .message('Conflict detection failed')
          .suggestedAction('Retry analysis')
          .build()
      ];

      const availableData = {
        dependencyTree: true,
        conflicts: false,
        summary: true
      };

      const result = errorHandlingService.handlePartialFailure('test-jar', errors, availableData);

      expect(result.hasErrors).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.availableData.dependencyTree).toBe(true);
      expect(result.availableData.conflicts).toBe(false);
      expect(result.degradedFeatures).toContain('Conflict detection');
    });
  });

  describe('Recovery Strategies', () => {
    it('should provide appropriate recovery strategies', () => {
      const networkError = AnalysisErrorBuilder.create()
        .type(ErrorType.NETWORK_ERROR)
        .message('Network error')
        .suggestedAction('Check connection')
        .retryable(true)
        .build();

      const strategy = errorHandlingService.getRecoveryStrategy(networkError);
      
      expect(strategy.canRecover).toBe(true);
      expect(strategy.recoveryMessage).toContain('network');
    });

    it('should indicate non-recoverable errors', () => {
      const jarNotFoundError = AnalysisErrorBuilder.create()
        .type(ErrorType.JAR_NOT_FOUND)
        .message('JAR not found')
        .suggestedAction('Upload again')
        .retryable(false)
        .build();

      const strategy = errorHandlingService.getRecoveryStrategy(jarNotFoundError);
      
      expect(strategy.canRecover).toBe(false);
    });
  });
});

describe('LoadingIndicator Component', () => {
  const mockLoadingState = {
    isLoading: true,
    stage: LoadingStage.EXTRACTING_DEPENDENCIES,
    progress: 50,
    message: 'Extracting dependencies...',
    canCancel: true
  };

  it('should render loading state correctly', () => {
    render(<LoadingIndicator loadingState={mockLoadingState} />);
    
    expect(screen.getByText('Analyzing Dependencies')).toBeInTheDocument();
    expect(screen.getByText('Extracting dependencies...')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('should show cancel button when cancellable', () => {
    const mockCancel = vi.fn();
    
    render(
      <LoadingIndicator 
        loadingState={mockLoadingState} 
        onCancel={mockCancel}
      />
    );
    
    const cancelButton = screen.getByTitle('Cancel analysis');
    expect(cancelButton).toBeInTheDocument();
    
    fireEvent.click(cancelButton);
    expect(mockCancel).toHaveBeenCalled();
  });

  it('should render error state with retry button', () => {
    const error = AnalysisErrorBuilder.create()
      .type(ErrorType.NETWORK_ERROR)
      .message('Network connection failed')
      .suggestedAction('Check your connection')
      .retryable(true)
      .build();

    const mockRetry = vi.fn();
    const loadingState = { ...mockLoadingState, isLoading: false };

    render(
      <LoadingIndicator 
        loadingState={loadingState}
        error={error}
        onRetry={mockRetry}
      />
    );
    
    expect(screen.getByText('Analysis Failed')).toBeInTheDocument();
    expect(screen.getByText('Network connection failed')).toBeInTheDocument();
    
    const retryButton = screen.getByText('Retry Analysis');
    fireEvent.click(retryButton);
    expect(mockRetry).toHaveBeenCalled();
  });

  it('should show completion state', () => {
    const completedState = {
      isLoading: false,
      stage: LoadingStage.COMPLETE,
      progress: 100,
      message: 'Analysis complete!',
      canCancel: false
    };

    render(<LoadingIndicator loadingState={completedState} />);
    
    expect(screen.getByText('Analysis Complete!')).toBeInTheDocument();
  });

  it('should display sub-tasks when provided', () => {
    const stateWithSubTasks = {
      ...mockLoadingState,
      subTasks: {
        current: 'Processing dependencies',
        completed: ['Extracted JAR', 'Parsed manifest'],
        remaining: ['Build tree', 'Detect conflicts']
      }
    };

    render(<LoadingIndicator loadingState={stateWithSubTasks} />);
    
    expect(screen.getByText('Current Task: Processing dependencies')).toBeInTheDocument();
    expect(screen.getByText('Extracted JAR')).toBeInTheDocument();
    expect(screen.getByText('Build tree')).toBeInTheDocument();
  });
});

describe('ErrorBoundary Component', () => {
  // Mock console.error to avoid noise in tests
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) {
      throw new Error('Test error');
    }
    return <div>No error</div>;
  };

  it('should render children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('should render error UI when error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('An unexpected error occurred in the application')).toBeInTheDocument();
  });

  it('should show retry button and handle retry', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    const retryButton = screen.getByText('Try Again');
    fireEvent.click(retryButton);
    
    // After retry, component should reset
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('should call onError callback when provided', () => {
    const mockOnError = vi.fn();
    
    render(
      <ErrorBoundary onError={mockOnError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    expect(mockOnError).toHaveBeenCalled();
    const calledError = mockOnError.mock.calls[0][0];
    expect(calledError.type).toBe(ErrorType.UNKNOWN_ERROR);
  });

  it('should render custom fallback when provided', () => {
    const customFallback = <div>Custom error UI</div>;
    
    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
  });

  it('should show technical details when showDetails is true', () => {
    render(
      <ErrorBoundary showDetails={true}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Technical Details')).toBeInTheDocument();
  });
});

describe('Integration Tests', () => {
  it('should handle complete error flow from API to UI', async () => {
    const mockApiResponse = { status: 500, statusText: 'Internal Server Error' };
    const error = createErrorFromApiResponse(mockApiResponse, { 
      jarId: 'test-jar', 
      operation: 'analysis' 
    });

    expect(error.type).toBe(ErrorType.API_ERROR);
    expect(error.retryable).toBe(true);

    // Test that error can be used in loading indicator
    const loadingState = {
      isLoading: false,
      stage: LoadingStage.COMPLETE,
      progress: 0,
      message: 'Failed',
      canCancel: false
    };

    const mockRetry = vi.fn();
    
    render(
      <LoadingIndicator 
        loadingState={loadingState}
        error={error}
        onRetry={mockRetry}
      />
    );

    expect(screen.getByText('Analysis Failed')).toBeInTheDocument();
    expect(screen.getByText('Server error occurred during analysis')).toBeInTheDocument();
    
    const retryButton = screen.getByText('Retry Analysis');
    expect(retryButton).toBeInTheDocument();
  });

  it('should handle partial analysis results correctly', () => {
    const errors = [
      AnalysisErrorBuilder.create()
        .type(ErrorType.CONFLICT_DETECTION_FAILED)
        .message('Could not detect conflicts')
        .suggestedAction('Continue with available data')
        .build()
    ];

    const availableData = {
      dependencyTree: true,
      conflicts: false,
      summary: true,
      search: true,
      export: true
    };

    const partialResult = errorHandlingService.handlePartialFailure(
      'test-jar', 
      errors, 
      availableData
    );

    expect(partialResult.hasErrors).toBe(true);
    expect(partialResult.availableData.dependencyTree).toBe(true);
    expect(partialResult.availableData.conflicts).toBe(false);
    expect(partialResult.degradedFeatures).toContain('Conflict detection');
  });
});
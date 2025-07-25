/**
 * Comprehensive error handling service for single JAR dependency analysis
 */

import { 
  AnalysisError, 
  ErrorType, 
  ErrorSeverity, 
  PartialAnalysisResult,
  LoadingState,
  LoadingStage,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  AnalysisErrorBuilder,
  createErrorFromApiResponse,
  shouldRetry,
  calculateRetryDelay,
  getLoadingMessage,
  estimateTimeRemaining
} from '@/types/errors';

export interface ErrorRecoveryStrategy {
  canRecover: boolean;
  recoveryAction: () => Promise<void>;
  recoveryMessage: string;
}

export interface RetryState {
  attemptCount: number;
  lastError: AnalysisError | null;
  isRetrying: boolean;
  nextRetryAt: Date | null;
}

export class ErrorHandlingService {
  private retryStates = new Map<string, RetryState>();
  private loadingStates = new Map<string, LoadingState>();
  private errorListeners = new Set<(error: AnalysisError) => void>();
  private loadingListeners = new Set<(loading: LoadingState) => void>();

  /**
   * Register error listener
   */
  onError(listener: (error: AnalysisError) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /**
   * Register loading state listener
   */
  onLoadingChange(listener: (loading: LoadingState) => void): () => void {
    this.loadingListeners.add(listener);
    return () => this.loadingListeners.delete(listener);
  }

  /**
   * Handle API errors with automatic retry logic
   */
  async handleApiError(
    error: any,
    context: { jarId: string; operation: string },
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ): Promise<AnalysisError> {
    const analysisError = createErrorFromApiResponse(error, context);
    const retryKey = `${context.jarId}-${context.operation}`;
    
    // Get or create retry state
    let retryState = this.retryStates.get(retryKey) || {
      attemptCount: 0,
      lastError: null,
      isRetrying: false,
      nextRetryAt: null
    };

    retryState.attemptCount++;
    retryState.lastError = analysisError;

    // Check if we should retry
    if (shouldRetry(analysisError, retryState.attemptCount, retryConfig)) {
      const delay = calculateRetryDelay(retryState.attemptCount, retryConfig);
      retryState.isRetrying = true;
      retryState.nextRetryAt = new Date(Date.now() + delay);
      
      this.retryStates.set(retryKey, retryState);
      
      // Enhanced error with retry information
      const retryError = AnalysisErrorBuilder.create()
        .type(analysisError.type)
        .severity(analysisError.severity)
        .message(`${analysisError.message} (Attempt ${retryState.attemptCount}/${retryConfig.maxAttempts})`)
        .details({
          ...analysisError.details,
          retryAttempt: retryState.attemptCount,
          maxAttempts: retryConfig.maxAttempts,
          nextRetryIn: delay
        })
        .retryable(true)
        .suggestedAction(`Retrying automatically in ${Math.round(delay / 1000)} seconds...`)
        .context(analysisError.context)
        .build();

      this.notifyErrorListeners(retryError);
      return retryError;
    } else {
      // Max retries reached or not retryable
      retryState.isRetrying = false;
      retryState.nextRetryAt = null;
      this.retryStates.set(retryKey, retryState);
      
      const finalError = AnalysisErrorBuilder.create()
        .type(analysisError.type)
        .severity(ErrorSeverity.HIGH)
        .message(retryState.attemptCount > 1 
          ? `${analysisError.message} (Failed after ${retryState.attemptCount} attempts)`
          : analysisError.message)
        .details(analysisError.details)
        .retryable(false)
        .suggestedAction(this.getSuggestedAction(analysisError))
        .context(analysisError.context)
        .build();

      this.notifyErrorListeners(finalError);
      return finalError;
    }
  }

  /**
   * Handle partial analysis failures with graceful degradation
   */
  handlePartialFailure(
    jarId: string,
    errors: AnalysisError[],
    availableData: any
  ): PartialAnalysisResult {
    const result: PartialAnalysisResult = {
      hasErrors: true,
      errors,
      availableData: {
        dependencyTree: !!availableData.dependencyTree,
        conflicts: !!availableData.conflicts,
        summary: !!availableData.summary,
        search: !!availableData.searchIndex,
        export: !!availableData.dependencyTree // Export depends on tree
      },
      degradedFeatures: []
    };

    // Determine degraded features
    if (!result.availableData.dependencyTree) {
      result.degradedFeatures.push('Dependency tree visualization');
    }
    if (!result.availableData.conflicts) {
      result.degradedFeatures.push('Conflict detection');
    }
    if (!result.availableData.summary) {
      result.degradedFeatures.push('Analysis summary');
    }
    if (!result.availableData.search) {
      result.degradedFeatures.push('Dependency search');
    }
    if (!result.availableData.export) {
      result.degradedFeatures.push('Data export');
    }

    // Create partial failure error
    const partialError = AnalysisErrorBuilder.create()
      .type(ErrorType.PARTIAL_ANALYSIS_FAILURE)
      .severity(ErrorSeverity.MEDIUM)
      .message(`Analysis completed with ${errors.length} error(s). Some features may be limited.`)
      .details({ 
        errorCount: errors.length,
        availableFeatures: Object.keys(result.availableData).filter(key => result.availableData[key as keyof typeof result.availableData]),
        degradedFeatures: result.degradedFeatures
      })
      .retryable(true)
      .suggestedAction('Some data is available. You can retry the analysis or continue with limited functionality.')
      .context({ jarId, operation: 'comprehensive_analysis' })
      .build();

    this.notifyErrorListeners(partialError);
    return result;
  }

  /**
   * Update loading state with progress tracking
   */
  updateLoadingState(
    jarId: string,
    stage: LoadingStage,
    progress: number,
    startTime?: Date,
    subTasks?: LoadingState['subTasks']
  ): void {
    const loadingState: LoadingState = {
      isLoading: stage !== LoadingStage.COMPLETE,
      stage,
      progress: Math.max(0, Math.min(100, progress)),
      message: getLoadingMessage(stage, progress),
      canCancel: stage !== LoadingStage.FINALIZING && stage !== LoadingStage.COMPLETE,
      subTasks
    };

    // Calculate estimated time remaining
    if (startTime && progress > 0 && stage !== LoadingStage.COMPLETE) {
      loadingState.estimatedTimeRemaining = estimateTimeRemaining(stage, progress, startTime);
    }

    this.loadingStates.set(jarId, loadingState);
    this.notifyLoadingListeners(loadingState);
  }

  /**
   * Get current loading state
   */
  getLoadingState(jarId: string): LoadingState | null {
    return this.loadingStates.get(jarId) || null;
  }

  /**
   * Get retry state for operation
   */
  getRetryState(jarId: string, operation: string): RetryState | null {
    return this.retryStates.get(`${jarId}-${operation}`) || null;
  }

  /**
   * Clear retry state
   */
  clearRetryState(jarId: string, operation?: string): void {
    if (operation) {
      this.retryStates.delete(`${jarId}-${operation}`);
    } else {
      // Clear all retry states for this jar
      const keysToDelete = Array.from(this.retryStates.keys())
        .filter(key => key.startsWith(`${jarId}-`));
      keysToDelete.forEach(key => this.retryStates.delete(key));
    }
  }

  /**
   * Clear loading state
   */
  clearLoadingState(jarId: string): void {
    this.loadingStates.delete(jarId);
  }

  /**
   * Get error recovery strategy
   */
  getRecoveryStrategy(error: AnalysisError): ErrorRecoveryStrategy {
    switch (error.type) {
      case ErrorType.NETWORK_ERROR:
        return {
          canRecover: true,
          recoveryAction: async () => {
            // Wait a moment and retry
            await new Promise(resolve => setTimeout(resolve, 2000));
          },
          recoveryMessage: 'Checking network connection and retrying...'
        };

      case ErrorType.TIMEOUT_ERROR:
        return {
          canRecover: true,
          recoveryAction: async () => {
            // Longer wait for timeout recovery
            await new Promise(resolve => setTimeout(resolve, 5000));
          },
          recoveryMessage: 'Waiting for server response and retrying...'
        };

      case ErrorType.PARTIAL_ANALYSIS_FAILURE:
        return {
          canRecover: true,
          recoveryAction: async () => {
            // Retry with different parameters or approach
            await new Promise(resolve => setTimeout(resolve, 1000));
          },
          recoveryMessage: 'Attempting to complete missing analysis components...'
        };

      case ErrorType.JAR_NOT_FOUND:
        return {
          canRecover: false,
          recoveryAction: async () => {},
          recoveryMessage: 'JAR file needs to be re-uploaded'
        };

      default:
        return {
          canRecover: error.retryable,
          recoveryAction: async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
          },
          recoveryMessage: 'Attempting to recover from error...'
        };
    }
  }

  /**
   * Create user-friendly error message
   */
  getUserFriendlyMessage(error: AnalysisError): string {
    const baseMessages: Record<ErrorType, string> = {
      [ErrorType.NETWORK_ERROR]: 'Connection problem - please check your internet connection',
      [ErrorType.API_ERROR]: 'Server temporarily unavailable - please try again',
      [ErrorType.TIMEOUT_ERROR]: 'Analysis is taking longer than expected',
      [ErrorType.JAR_NOT_FOUND]: 'JAR file not found - please upload it again',
      [ErrorType.JAR_PROCESSING_ERROR]: 'Problem processing the JAR file',
      [ErrorType.ANALYSIS_IN_PROGRESS]: 'Analysis is already running for this JAR',
      [ErrorType.DEPENDENCY_EXTRACTION_FAILED]: 'Could not extract dependency information',
      [ErrorType.CONFLICT_DETECTION_FAILED]: 'Could not detect dependency conflicts',
      [ErrorType.SEARCH_INDEX_FAILED]: 'Search functionality may be limited',
      [ErrorType.EXPORT_FAILED]: 'Could not export analysis data',
      [ErrorType.PARTIAL_ANALYSIS_FAILURE]: 'Analysis completed with some limitations',
      [ErrorType.UNKNOWN_ERROR]: 'An unexpected problem occurred'
    };

    return baseMessages[error.type] || error.message;
  }

  /**
   * Get suggested action for error
   */
  private getSuggestedAction(error: AnalysisError): string {
    switch (error.type) {
      case ErrorType.NETWORK_ERROR:
        return 'Check your internet connection and try again';
      
      case ErrorType.TIMEOUT_ERROR:
        return 'The analysis may take longer for large JARs. Please try again or contact support if this persists';
      
      case ErrorType.JAR_NOT_FOUND:
        return 'Please upload the JAR file again';
      
      case ErrorType.JAR_PROCESSING_ERROR:
        return 'Ensure the JAR file is valid and not corrupted. Try uploading a different JAR file';
      
      case ErrorType.PARTIAL_ANALYSIS_FAILURE:
        return 'You can continue with available data or retry the analysis for complete results';
      
      default:
        return error.suggestedAction || 'Please try again or contact support if the problem persists';
    }
  }

  /**
   * Notify error listeners
   */
  private notifyErrorListeners(error: AnalysisError): void {
    this.errorListeners.forEach(listener => {
      try {
        listener(error);
      } catch (e) {
        console.error('Error in error listener:', e);
      }
    });
  }

  /**
   * Notify loading listeners
   */
  private notifyLoadingListeners(loading: LoadingState): void {
    this.loadingListeners.forEach(listener => {
      try {
        listener(loading);
      } catch (e) {
        console.error('Error in loading listener:', e);
      }
    });
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.retryStates.clear();
    this.loadingStates.clear();
    this.errorListeners.clear();
    this.loadingListeners.clear();
  }
}

// Global service instance
export const errorHandlingService = new ErrorHandlingService();
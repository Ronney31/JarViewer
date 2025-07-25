/**
 * Comprehensive error handling types and utilities for single JAR dependency analysis
 */

export enum ErrorType {
  // Network/API errors
  NETWORK_ERROR = 'network_error',
  API_ERROR = 'api_error',
  TIMEOUT_ERROR = 'timeout_error',
  
  // JAR processing errors
  JAR_NOT_FOUND = 'jar_not_found',
  JAR_PROCESSING_ERROR = 'jar_processing_error',
  ANALYSIS_IN_PROGRESS = 'analysis_in_progress',
  
  // Analysis-specific errors
  DEPENDENCY_EXTRACTION_FAILED = 'dependency_extraction_failed',
  CONFLICT_DETECTION_FAILED = 'conflict_detection_failed',
  SEARCH_INDEX_FAILED = 'search_index_failed',
  EXPORT_FAILED = 'export_failed',
  
  // Partial failures
  PARTIAL_ANALYSIS_FAILURE = 'partial_analysis_failure',
  
  // Unknown/unexpected errors
  UNKNOWN_ERROR = 'unknown_error'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface AnalysisError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  details?: any;
  retryable: boolean;
  suggestedAction: string;
  timestamp: Date;
  context?: {
    jarId?: string;
    operation?: string;
    stage?: string;
  };
}

export interface PartialAnalysisResult {
  hasErrors: boolean;
  errors: AnalysisError[];
  availableData: {
    dependencyTree: boolean;
    conflicts: boolean;
    summary: boolean;
    search: boolean;
    export: boolean;
  };
  degradedFeatures: string[];
}

export enum LoadingStage {
  INITIALIZING = 'initializing',
  EXTRACTING_DEPENDENCIES = 'extracting_dependencies',
  BUILDING_TREE = 'building_tree',
  DETECTING_CONFLICTS = 'detecting_conflicts',
  BUILDING_SEARCH_INDEX = 'building_search_index',
  FINALIZING = 'finalizing',
  COMPLETE = 'complete'
}

export interface LoadingState {
  isLoading: boolean;
  stage: LoadingStage;
  progress: number; // 0-100
  message: string;
  estimatedTimeRemaining?: number; // seconds
  canCancel: boolean;
  subTasks?: {
    current: string;
    completed: string[];
    remaining: string[];
  };
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  retryableErrors: ErrorType[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    ErrorType.NETWORK_ERROR,
    ErrorType.TIMEOUT_ERROR,
    ErrorType.API_ERROR,
    ErrorType.PARTIAL_ANALYSIS_FAILURE
  ]
};

export class AnalysisErrorBuilder {
  private error: Partial<AnalysisError> = {
    timestamp: new Date()
  };

  static create(): AnalysisErrorBuilder {
    return new AnalysisErrorBuilder();
  }

  type(type: ErrorType): AnalysisErrorBuilder {
    this.error.type = type;
    return this;
  }

  severity(severity: ErrorSeverity): AnalysisErrorBuilder {
    this.error.severity = severity;
    return this;
  }

  message(message: string): AnalysisErrorBuilder {
    this.error.message = message;
    return this;
  }

  details(details: any): AnalysisErrorBuilder {
    this.error.details = details;
    return this;
  }

  retryable(retryable: boolean): AnalysisErrorBuilder {
    this.error.retryable = retryable;
    return this;
  }

  suggestedAction(action: string): AnalysisErrorBuilder {
    this.error.suggestedAction = action;
    return this;
  }

  context(context: AnalysisError['context']): AnalysisErrorBuilder {
    this.error.context = context;
    return this;
  }

  build(): AnalysisError {
    if (!this.error.type || !this.error.message || !this.error.suggestedAction) {
      throw new Error('AnalysisError requires type, message, and suggestedAction');
    }

    return {
      type: this.error.type,
      severity: this.error.severity || ErrorSeverity.MEDIUM,
      message: this.error.message,
      details: this.error.details,
      retryable: this.error.retryable ?? false,
      suggestedAction: this.error.suggestedAction,
      timestamp: this.error.timestamp!,
      context: this.error.context
    };
  }
}

export function createErrorFromApiResponse(response: any, context?: AnalysisError['context']): AnalysisError {
  const builder = AnalysisErrorBuilder.create().context(context);

  // Map API error codes to our error types
  if (response.status === 404) {
    return builder
      .type(ErrorType.JAR_NOT_FOUND)
      .severity(ErrorSeverity.HIGH)
      .message('JAR file not found or has been removed')
      .suggestedAction('Please upload the JAR file again or select a different file')
      .retryable(false)
      .build();
  }

  if (response.status === 408 || response.status === 504) {
    return builder
      .type(ErrorType.TIMEOUT_ERROR)
      .severity(ErrorSeverity.MEDIUM)
      .message('Analysis request timed out')
      .suggestedAction('The analysis is taking longer than expected. Please try again.')
      .retryable(true)
      .build();
  }

  if (response.status >= 500) {
    return builder
      .type(ErrorType.API_ERROR)
      .severity(ErrorSeverity.HIGH)
      .message('Server error occurred during analysis')
      .suggestedAction('Please try again. If the problem persists, contact support.')
      .retryable(true)
      .details({ status: response.status, statusText: response.statusText })
      .build();
  }

  if (response.status >= 400) {
    return builder
      .type(ErrorType.JAR_PROCESSING_ERROR)
      .severity(ErrorSeverity.MEDIUM)
      .message(response.data?.error || 'Invalid request or JAR file')
      .suggestedAction('Please check the JAR file and try again')
      .retryable(false)
      .details({ status: response.status, error: response.data?.error })
      .build();
  }

  // Network/connection errors
  if (!response.status) {
    return builder
      .type(ErrorType.NETWORK_ERROR)
      .severity(ErrorSeverity.HIGH)
      .message('Network connection failed')
      .suggestedAction('Please check your internet connection and try again')
      .retryable(true)
      .build();
  }

  return builder
    .type(ErrorType.UNKNOWN_ERROR)
    .severity(ErrorSeverity.MEDIUM)
    .message('An unexpected error occurred')
    .suggestedAction('Please try again or contact support if the problem persists')
    .retryable(true)
    .details(response)
    .build();
}

export function getLoadingMessage(stage: LoadingStage, progress: number): string {
  const messages: Record<LoadingStage, string> = {
    [LoadingStage.INITIALIZING]: 'Initializing dependency analysis...',
    [LoadingStage.EXTRACTING_DEPENDENCIES]: 'Extracting dependencies from JAR file...',
    [LoadingStage.BUILDING_TREE]: 'Building dependency tree structure...',
    [LoadingStage.DETECTING_CONFLICTS]: 'Detecting version conflicts...',
    [LoadingStage.BUILDING_SEARCH_INDEX]: 'Building search index...',
    [LoadingStage.FINALIZING]: 'Finalizing analysis results...',
    [LoadingStage.COMPLETE]: 'Analysis complete!'
  };

  const baseMessage = messages[stage];
  if (progress > 0 && stage !== LoadingStage.COMPLETE) {
    return `${baseMessage} (${progress}%)`;
  }
  return baseMessage;
}

export function estimateTimeRemaining(stage: LoadingStage, progress: number, startTime: Date): number {
  const now = new Date();
  const elapsed = (now.getTime() - startTime.getTime()) / 1000; // seconds
  
  if (progress <= 0) return 0;
  
  const totalEstimated = (elapsed / progress) * 100;
  const remaining = Math.max(0, totalEstimated - elapsed);
  
  return Math.round(remaining);
}

export function shouldRetry(error: AnalysisError, attemptCount: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  return (
    error.retryable &&
    attemptCount < config.maxAttempts &&
    config.retryableErrors.includes(error.type)
  );
}

export function calculateRetryDelay(attemptCount: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attemptCount - 1);
  return Math.min(delay, config.maxDelay);
}
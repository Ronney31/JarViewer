/**
 * Error boundary component for graceful error handling in React components
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { AnalysisError, ErrorType, ErrorSeverity, AnalysisErrorBuilder } from '@/types/errors';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: AnalysisError) => void;
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  analysisError: AnalysisError | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      analysisError: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Convert React error to AnalysisError
    const analysisError = AnalysisErrorBuilder.create()
      .type(ErrorType.UNKNOWN_ERROR)
      .severity(ErrorSeverity.HIGH)
      .message('An unexpected error occurred in the application')
      .details({ 
        originalError: error.message,
        stack: error.stack 
      })
      .retryable(true)
      .suggestedAction('Please refresh the page or try again')
      .build();

    return {
      hasError: true,
      error,
      analysisError
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      errorInfo
    });

    // Log error for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Notify parent component
    if (this.props.onError && this.state.analysisError) {
      this.props.onError(this.state.analysisError);
    }

    // Report to error tracking service (if available)
    this.reportError(error, errorInfo);
  }

  private reportError(error: Error, errorInfo: ErrorInfo) {
    // This would integrate with error tracking services like Sentry
    try {
      const errorReport = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };

      // Send to error tracking service
      console.error('Error Report:', errorReport);
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      analysisError: null
    });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, analysisError } = this.state;

      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-8">
              {/* Error Icon and Title */}
              <div className="flex items-center space-x-3 mb-6">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-12 w-12 text-red-500" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    Something went wrong
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400">
                    {analysisError?.message || 'An unexpected error occurred'}
                  </p>
                </div>
              </div>

              {/* Error Details */}
              {analysisError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                  <div className="flex items-start space-x-3">
                    <Bug className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                        Error Details
                      </h3>
                      <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                        {analysisError.suggestedAction}
                      </p>
                      {analysisError.details && (
                        <div className="mt-2">
                          <p className="text-xs text-red-600 dark:text-red-400">
                            Error Type: {analysisError.type}
                          </p>
                          <p className="text-xs text-red-600 dark:text-red-400">
                            Severity: {analysisError.severity}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Technical Details (collapsible) */}
              {this.props.showDetails && error && (
                <details className="mb-6">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
                    Technical Details
                  </summary>
                  <div className="mt-3 bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                    <div className="text-sm text-gray-800 dark:text-gray-200 font-mono">
                      <div className="mb-3">
                        <strong>Error:</strong>
                        <pre className="mt-1 whitespace-pre-wrap break-words">
                          {error.message}
                        </pre>
                      </div>
                      
                      {error.stack && (
                        <div className="mb-3">
                          <strong>Stack Trace:</strong>
                          <pre className="mt-1 whitespace-pre-wrap break-words text-xs">
                            {error.stack}
                          </pre>
                        </div>
                      )}
                      
                      {errorInfo?.componentStack && (
                        <div>
                          <strong>Component Stack:</strong>
                          <pre className="mt-1 whitespace-pre-wrap break-words text-xs">
                            {errorInfo.componentStack}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={this.handleRetry}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </button>
                
                <button
                  onClick={this.handleReload}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reload Page
                </button>
                
                <button
                  onClick={this.handleGoHome}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </button>
              </div>

              {/* Help Text */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  If this problem persists, please contact support with the error details above.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
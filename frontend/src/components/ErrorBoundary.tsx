/**
 * Error boundary component for graceful error handling in React components
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AnalysisError, ErrorType, ErrorSeverity, AnalysisErrorBuilder } from '../types/errors';
import ErrorDisplay from './ErrorDisplay';

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

      // Prepare technical details for ErrorDisplay
      let technicalDetails = '';
      if (this.props.showDetails && error) {
        technicalDetails = `Error: ${error.message}\n\n`;
        if (error.stack) {
          technicalDetails += `Stack Trace:\n${error.stack}\n\n`;
        }
        if (errorInfo?.componentStack) {
          technicalDetails += `Component Stack:\n${errorInfo.componentStack}`;
        }
      }

      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full">
            <ErrorDisplay
              error={{
                type: 'error',
                title: 'Application Error',
                message: analysisError?.message || 'An unexpected error occurred in the application',
                details: technicalDetails || undefined,
                actions: [
                  {
                    label: 'Try Again',
                    action: this.handleRetry,
                    variant: 'primary'
                  },
                  {
                    label: 'Reload Page',
                    action: this.handleReload,
                    variant: 'secondary'
                  },
                  {
                    label: 'Go Home',
                    action: this.handleGoHome,
                    variant: 'secondary'
                  }
                ]
              }}
              className="shadow-lg"
            />
            
            {/* Help Text */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                If this problem persists, please contact support with the error details above.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

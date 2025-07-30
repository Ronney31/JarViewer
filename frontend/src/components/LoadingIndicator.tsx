/**
 * Progressive loading indicator with stage tracking and error recovery
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  X,
  RefreshCw
} from 'lucide-react';
import { LoadingState, LoadingStage, AnalysisError } from '../types/errors';
import ErrorDisplay from './ErrorDisplay';

interface LoadingIndicatorProps {
  loadingState: LoadingState;
  error?: AnalysisError | null;
  onCancel?: () => void;
  onRetry?: () => void;
  className?: string;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  loadingState,
  error,
  onCancel,
  onRetry,
  className = ''
}) => {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStageIcon = (stage: LoadingStage, isComplete: boolean) => {
    if (isComplete) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    
    if (stage === loadingState.stage) {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    }
    
    return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
  };

  const getStageLabel = (stage: LoadingStage): string => {
    switch (stage) {
      case LoadingStage.INITIALIZING:
        return 'Initializing analysis...';
      case LoadingStage.UPLOADING:
        return 'Uploading JAR file...';
      case LoadingStage.EXTRACTING:
        return 'Extracting contents...';
      case LoadingStage.ANALYZING:
        return 'Analyzing dependencies...';
      case LoadingStage.PROCESSING:
        return 'Processing results...';
      case LoadingStage.COMPLETE:
        return 'Analysis complete';
      default:
        return 'Processing...';
    }
  };

  // Show error using standardized ErrorDisplay
  if (error && !loadingState.isLoading) {
    const retryInfo = error.details?.retryAttempt 
      ? `Attempt ${error.details.retryAttempt} of ${error.details.maxAttempts}${
          error.details.nextRetryIn 
            ? ` • Retrying in ${Math.round(error.details.nextRetryIn / 1000)}s`
            : ''
        }`
      : undefined;

    return (
      <ErrorDisplay
        error={{
          type: 'error',
          title: 'Analysis Failed',
          message: error.message,
          details: retryInfo,
          actions: onRetry && error.retryable ? [
            {
              label: 'Retry Analysis',
              action: onRetry,
              variant: 'primary'
            }
          ] : undefined
        }}
        className={className}
      />
    );
  }

  if (!loadingState.isLoading && loadingState.stage === LoadingStage.COMPLETE) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 ${className}`}
      >
        <div className="flex items-center space-x-3">
          <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
          <div>
            <h3 className="text-lg font-medium text-green-800 dark:text-green-200">
              Analysis Complete
            </h3>
            <p className="text-green-700 dark:text-green-300">
              JAR file has been successfully analyzed
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  if (!loadingState.isLoading) {
    return null;
  }

  const stages = [
    LoadingStage.INITIALIZING,
    LoadingStage.UPLOADING,
    LoadingStage.EXTRACTING,
    LoadingStage.ANALYZING,
    LoadingStage.PROCESSING
  ];

  const currentStageIndex = stages.indexOf(loadingState.stage);
  const progress = currentStageIndex >= 0 ? ((currentStageIndex + 1) / stages.length) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Analyzing JAR File
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {getStageLabel(loadingState.stage)}
            </p>
          </div>
        </div>
        
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Cancel analysis"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
          <span>Progress</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <motion.div
            className="bg-blue-500 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Stage List */}
      <div className="space-y-3">
        {stages.map((stage, index) => {
          const isComplete = index < currentStageIndex;
          const isCurrent = stage === loadingState.stage;
          
          return (
            <div
              key={stage}
              className={`flex items-center space-x-3 ${
                isCurrent ? 'text-blue-600 dark:text-blue-400' : 
                isComplete ? 'text-green-600 dark:text-green-400' : 
                'text-gray-400 dark:text-gray-500'
              }`}
            >
              {getStageIcon(stage, isComplete)}
              <span className="text-sm font-medium">
                {getStageLabel(stage)}
              </span>
              {isCurrent && loadingState.estimatedTimeRemaining && (
                <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                  <Clock className="h-3 w-3" />
                  <span>~{formatTime(loadingState.estimatedTimeRemaining)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Additional Info */}
      {loadingState.currentFile && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Processing: <span className="font-mono">{loadingState.currentFile}</span>
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default LoadingIndicator;

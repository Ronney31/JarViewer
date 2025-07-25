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
import { LoadingState, LoadingStage, AnalysisError } from '@/types/errors';

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

  const stages = [
    { key: LoadingStage.INITIALIZING, label: 'Initializing' },
    { key: LoadingStage.EXTRACTING_DEPENDENCIES, label: 'Extracting Dependencies' },
    { key: LoadingStage.BUILDING_TREE, label: 'Building Tree' },
    { key: LoadingStage.DETECTING_CONFLICTS, label: 'Detecting Conflicts' },
    { key: LoadingStage.BUILDING_SEARCH_INDEX, label: 'Building Search Index' },
    { key: LoadingStage.FINALIZING, label: 'Finalizing' }
  ];

  const getCurrentStageIndex = () => {
    return stages.findIndex(stage => stage.key === loadingState.stage);
  };

  const isStageComplete = (stageIndex: number) => {
    return stageIndex < getCurrentStageIndex() || loadingState.stage === LoadingStage.COMPLETE;
  };

  if (error && !loadingState.isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 ${className}`}
      >
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-lg font-medium text-red-800 dark:text-red-200">
              Analysis Failed
            </h3>
            <p className="mt-2 text-red-700 dark:text-red-300">
              {error.message}
            </p>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {error.suggestedAction}
            </p>
            
            {error.details?.retryAttempt && (
              <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                Attempt {error.details.retryAttempt} of {error.details.maxAttempts}
                {error.details.nextRetryIn && (
                  <span> • Retrying in {Math.round(error.details.nextRetryIn / 1000)}s</span>
                )}
              </div>
            )}
            
            {onRetry && error.retryable && (
              <button
                onClick={onRetry}
                className="mt-4 inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Analysis
              </button>
            )}
          </div>
        </div>
      </motion.div>
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
              Analysis Complete!
            </h3>
            <p className="text-green-700 dark:text-green-300">
              Dependency analysis has been completed successfully.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Analyzing Dependencies
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {loadingState.message}
          </p>
        </div>
        
        {loadingState.canCancel && onCancel && (
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Cancel analysis"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Progress
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {loadingState.progress}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <motion.div
            className="bg-blue-600 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${loadingState.progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Stage Progress */}
      <div className="space-y-3 mb-6">
        {stages.map((stage, index) => {
          const isComplete = isStageComplete(index);
          const isCurrent = stage.key === loadingState.stage;
          
          return (
            <motion.div
              key={stage.key}
              className={`flex items-center space-x-3 ${
                isCurrent ? 'text-blue-600 dark:text-blue-400' : 
                isComplete ? 'text-green-600 dark:text-green-400' : 
                'text-gray-400 dark:text-gray-500'
              }`}
              initial={{ opacity: 0.5 }}
              animate={{ 
                opacity: isCurrent || isComplete ? 1 : 0.5,
                scale: isCurrent ? 1.02 : 1
              }}
              transition={{ duration: 0.3 }}
            >
              {getStageIcon(stage.key, isComplete)}
              <span className={`text-sm ${isCurrent ? 'font-medium' : ''}`}>
                {stage.label}
              </span>
              {isCurrent && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex justify-end"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Sub-tasks */}
      <AnimatePresence>
        {loadingState.subTasks && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6"
          >
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Current Task: {loadingState.subTasks.current}
            </h4>
            
            {loadingState.subTasks.completed.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Completed ({loadingState.subTasks.completed.length}):
                </p>
                <div className="flex flex-wrap gap-1">
                  {loadingState.subTasks.completed.map((task, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded text-xs bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {task}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {loadingState.subTasks.remaining.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Remaining ({loadingState.subTasks.remaining.length}):
                </p>
                <div className="flex flex-wrap gap-1">
                  {loadingState.subTasks.remaining.map((task, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
                    >
                      {task}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Time Estimation */}
      {loadingState.estimatedTimeRemaining && loadingState.estimatedTimeRemaining > 0 && (
        <div className="flex items-center justify-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
          <Clock className="h-4 w-4" />
          <span>
            Estimated time remaining: {formatTime(loadingState.estimatedTimeRemaining)}
          </span>
        </div>
      )}
    </motion.div>
  );
};

export default LoadingIndicator;
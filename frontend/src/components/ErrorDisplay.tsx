import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, 
  XCircle, 
  AlertCircle, 
  Info, 
  X, 
  RefreshCw,
  ExternalLink,
  Copy
} from 'lucide-react';

interface ErrorDisplayProps {
  error: {
    type: 'error' | 'warning' | 'info';
    title: string;
    message: string;
    details?: string;
    actions?: Array<{
      label: string;
      action: () => void;
      variant?: 'primary' | 'secondary';
    }>;
  };
  onDismiss?: () => void;
  className?: string;
  overlay?: boolean; // New prop to control overlay behavior
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onDismiss,
  className = '',
  overlay = false
}) => {
  const getErrorConfig = () => {
    switch (error.type) {
      case 'error':
        return {
          icon: XCircle,
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          borderColor: 'border-red-200 dark:border-red-800',
          iconColor: 'text-red-600 dark:text-red-400',
          titleColor: 'text-red-800 dark:text-red-200',
          messageColor: 'text-red-700 dark:text-red-300'
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
          borderColor: 'border-yellow-200 dark:border-yellow-800',
          iconColor: 'text-yellow-600 dark:text-yellow-400',
          titleColor: 'text-yellow-800 dark:text-yellow-200',
          messageColor: 'text-yellow-700 dark:text-yellow-300'
        };
      case 'info':
        return {
          icon: Info,
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          borderColor: 'border-blue-200 dark:border-blue-800',
          iconColor: 'text-blue-600 dark:text-blue-400',
          titleColor: 'text-blue-800 dark:text-blue-200',
          messageColor: 'text-blue-700 dark:text-blue-300'
        };
      default:
        return {
          icon: AlertCircle,
          bgColor: 'bg-gray-50 dark:bg-gray-900/20',
          borderColor: 'border-gray-200 dark:border-gray-800',
          iconColor: 'text-gray-600 dark:text-gray-400',
          titleColor: 'text-gray-800 dark:text-gray-200',
          messageColor: 'text-gray-700 dark:text-gray-300'
        };
    }
  };

  const config = getErrorConfig();
  const Icon = config.icon;

  const copyErrorDetails = () => {
    const errorText = `${error.title}\n${error.message}${error.details ? `\n\nDetails:\n${error.details}` : ''}`;
    navigator.clipboard.writeText(errorText);
  };

  const errorContent = (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`${config.bgColor} ${config.borderColor} border rounded-xl p-6 shadow-lg backdrop-blur-sm ${className}`}
    >
      <div className="flex items-start space-x-4">
        {/* Icon */}
        <div className={`flex-shrink-0 p-2 rounded-full bg-white dark:bg-gray-800 shadow-sm`}>
          <Icon className={`h-6 w-6 ${config.iconColor}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className={`text-lg font-semibold ${config.titleColor} mb-2`}>
                {error.title}
              </h3>
              <p className={`text-sm ${config.messageColor} leading-relaxed`}>
                {error.message}
              </p>
              
              {error.details && (
                <details className="mt-3">
                  <summary className={`text-sm font-medium ${config.titleColor} cursor-pointer hover:underline`}>
                    View Details
                  </summary>
                  <div className={`mt-2 p-3 bg-white dark:bg-gray-800 rounded-lg border ${config.borderColor}`}>
                    <pre className={`text-xs ${config.messageColor} whitespace-pre-wrap font-mono`}>
                      {error.details}
                    </pre>
                  </div>
                </details>
              )}
            </div>

            {/* Dismiss Button */}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className={`flex-shrink-0 p-1 rounded-full ${config.iconColor} hover:bg-white dark:hover:bg-gray-800 transition-colors`}
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Actions */}
          {(error.actions || error.details) && (
            <div className="flex items-center space-x-3 mt-4">
              {error.actions?.map((action, index) => (
                <button
                  key={index}
                  onClick={action.action}
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                    action.variant === 'primary'
                      ? `${config.iconColor.replace('text-', 'bg-').replace('dark:text-', 'dark:bg-')} text-white hover:opacity-90 shadow-sm`
                      : `border ${config.borderColor} ${config.titleColor} hover:bg-white dark:hover:bg-gray-800`
                  }`}
                >
                  {action.label === 'Retry' && <RefreshCw className="h-4 w-4 mr-2" />}
                  {action.label === 'Report Issue' && <ExternalLink className="h-4 w-4 mr-2" />}
                  {action.label}
                </button>
              ))}
              
              {error.details && (
                <button
                  onClick={copyErrorDetails}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium ${config.titleColor} hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors`}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Details
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  // If overlay is true, render with backdrop and fixed positioning
  if (overlay) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
          onClick={onDismiss}
        />
        
        {/* Error content */}
        <div className="relative z-10 max-w-2xl w-full max-h-[90vh] overflow-auto">
          {errorContent}
        </div>
      </div>
    );
  }

  // Default inline rendering
  return errorContent;
};

export default ErrorDisplay;

"""
Comprehensive error handling utilities for JAR dependency analysis
"""

import asyncio
import functools
import logging
import traceback
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, TypeVar, Union
from dataclasses import dataclass, asdict
import structlog

logger = structlog.get_logger()

class ErrorType(str, Enum):
    """Error types for analysis operations"""
    NETWORK_ERROR = "network_error"
    API_ERROR = "api_error"
    TIMEOUT_ERROR = "timeout_error"
    JAR_NOT_FOUND = "jar_not_found"
    JAR_PROCESSING_ERROR = "jar_processing_error"
    ANALYSIS_IN_PROGRESS = "analysis_in_progress"
    DEPENDENCY_EXTRACTION_FAILED = "dependency_extraction_failed"
    CONFLICT_DETECTION_FAILED = "conflict_detection_failed"
    SEARCH_INDEX_FAILED = "search_index_failed"
    EXPORT_FAILED = "export_failed"
    PARTIAL_ANALYSIS_FAILURE = "partial_analysis_failure"
    UNKNOWN_ERROR = "unknown_error"

class ErrorSeverity(str, Enum):
    """Error severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class AnalysisError:
    """Structured error information for analysis operations"""
    type: ErrorType
    severity: ErrorSeverity
    message: str
    details: Optional[Dict[str, Any]] = None
    retryable: bool = False
    suggested_action: str = ""
    timestamp: datetime = None
    context: Optional[Dict[str, Any]] = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        result = asdict(self)
        result['timestamp'] = self.timestamp.isoformat()
        return result

@dataclass
class PartialAnalysisResult:
    """Result of partial analysis with error information"""
    has_errors: bool
    errors: List[AnalysisError]
    available_data: Dict[str, bool]
    degraded_features: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'has_errors': self.has_errors,
            'errors': [error.to_dict() for error in self.errors],
            'available_data': self.available_data,
            'degraded_features': self.degraded_features
        }

class AnalysisErrorBuilder:
    """Builder pattern for creating AnalysisError instances"""
    
    def __init__(self):
        self._error = AnalysisError(
            type=ErrorType.UNKNOWN_ERROR,
            severity=ErrorSeverity.MEDIUM,
            message="",
            suggested_action=""
        )
    
    @classmethod
    def create(cls) -> 'AnalysisErrorBuilder':
        return cls()
    
    def type(self, error_type: ErrorType) -> 'AnalysisErrorBuilder':
        self._error.type = error_type
        return self
    
    def severity(self, severity: ErrorSeverity) -> 'AnalysisErrorBuilder':
        self._error.severity = severity
        return self
    
    def message(self, message: str) -> 'AnalysisErrorBuilder':
        self._error.message = message
        return self
    
    def details(self, details: Dict[str, Any]) -> 'AnalysisErrorBuilder':
        self._error.details = details
        return self
    
    def retryable(self, retryable: bool) -> 'AnalysisErrorBuilder':
        self._error.retryable = retryable
        return self
    
    def suggested_action(self, action: str) -> 'AnalysisErrorBuilder':
        self._error.suggested_action = action
        return self
    
    def context(self, context: Dict[str, Any]) -> 'AnalysisErrorBuilder':
        self._error.context = context
        return self
    
    def build(self) -> AnalysisError:
        if not self._error.message or not self._error.suggested_action:
            raise ValueError("AnalysisError requires message and suggested_action")
        return self._error

class RetryConfig:
    """Configuration for retry logic"""
    
    def __init__(
        self,
        max_attempts: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 10.0,
        backoff_multiplier: float = 2.0,
        retryable_errors: Optional[List[ErrorType]] = None
    ):
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.backoff_multiplier = backoff_multiplier
        self.retryable_errors = retryable_errors or [
            ErrorType.NETWORK_ERROR,
            ErrorType.TIMEOUT_ERROR,
            ErrorType.API_ERROR,
            ErrorType.PARTIAL_ANALYSIS_FAILURE
        ]

def should_retry(error: AnalysisError, attempt_count: int, config: RetryConfig) -> bool:
    """Determine if an operation should be retried"""
    return (
        error.retryable and
        attempt_count < config.max_attempts and
        error.type in config.retryable_errors
    )

def calculate_retry_delay(attempt_count: int, config: RetryConfig) -> float:
    """Calculate delay before retry attempt"""
    delay = config.base_delay * (config.backoff_multiplier ** (attempt_count - 1))
    return min(delay, config.max_delay)

def create_error_from_exception(
    exception: Exception,
    context: Optional[Dict[str, Any]] = None
) -> AnalysisError:
    """Create AnalysisError from Python exception"""
    
    builder = AnalysisErrorBuilder.create().context(context or {})
    
    if isinstance(exception, asyncio.TimeoutError):
        return builder.type(ErrorType.TIMEOUT_ERROR)\
                     .severity(ErrorSeverity.MEDIUM)\
                     .message("Operation timed out")\
                     .suggested_action("The operation is taking longer than expected. Please try again.")\
                     .retryable(True)\
                     .details({"exception_type": type(exception).__name__})\
                     .build()
    
    if isinstance(exception, FileNotFoundError):
        return builder.type(ErrorType.JAR_NOT_FOUND)\
                     .severity(ErrorSeverity.HIGH)\
                     .message("JAR file not found")\
                     .suggested_action("Please ensure the JAR file exists and try again")\
                     .retryable(False)\
                     .details({"exception_type": type(exception).__name__, "path": str(exception)})\
                     .build()
    
    if isinstance(exception, PermissionError):
        return builder.type(ErrorType.JAR_PROCESSING_ERROR)\
                     .severity(ErrorSeverity.HIGH)\
                     .message("Permission denied accessing JAR file")\
                     .suggested_action("Check file permissions and try again")\
                     .retryable(False)\
                     .details({"exception_type": type(exception).__name__})\
                     .build()
    
    # Generic exception handling
    return builder.type(ErrorType.UNKNOWN_ERROR)\
                 .severity(ErrorSeverity.MEDIUM)\
                 .message(f"Unexpected error: {str(exception)}")\
                 .suggested_action("Please try again or contact support if the problem persists")\
                 .retryable(True)\
                 .details({
                     "exception_type": type(exception).__name__,
                     "exception_message": str(exception),
                     "traceback": traceback.format_exc()
                 })\
                 .build()

F = TypeVar('F', bound=Callable[..., Any])

def with_error_handling(
    operation_name: str,
    retry_config: Optional[RetryConfig] = None
) -> Callable[[F], F]:
    """Decorator for adding comprehensive error handling to functions"""
    
    def decorator(func: F) -> F:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            config = retry_config or RetryConfig()
            attempt_count = 0
            last_error = None
            
            while attempt_count < config.max_attempts:
                attempt_count += 1
                
                try:
                    logger.info(
                        "Starting operation",
                        operation=operation_name,
                        attempt=attempt_count,
                        max_attempts=config.max_attempts
                    )
                    
                    result = await func(*args, **kwargs)
                    
                    logger.info(
                        "Operation completed successfully",
                        operation=operation_name,
                        attempt=attempt_count
                    )
                    
                    return result
                    
                except Exception as e:
                    error = create_error_from_exception(
                        e, 
                        context={
                            "operation": operation_name,
                            "attempt": attempt_count,
                            "max_attempts": config.max_attempts
                        }
                    )
                    
                    last_error = error
                    
                    logger.error(
                        "Operation failed",
                        operation=operation_name,
                        attempt=attempt_count,
                        error_type=error.type,
                        error_message=error.message,
                        retryable=error.retryable
                    )
                    
                    if not should_retry(error, attempt_count, config):
                        break
                    
                    # Wait before retry
                    delay = calculate_retry_delay(attempt_count, config)
                    logger.info(
                        "Retrying operation",
                        operation=operation_name,
                        attempt=attempt_count + 1,
                        delay=delay
                    )
                    await asyncio.sleep(delay)
            
            # All retries exhausted
            if last_error:
                logger.error(
                    "Operation failed after all retries",
                    operation=operation_name,
                    total_attempts=attempt_count,
                    final_error=last_error.message
                )
                raise AnalysisException(last_error)
            
            # This shouldn't happen, but just in case
            raise AnalysisException(
                AnalysisErrorBuilder.create()
                .type(ErrorType.UNKNOWN_ERROR)
                .message(f"Operation {operation_name} failed unexpectedly")
                .suggested_action("Please try again")
                .build()
            )
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            config = retry_config or RetryConfig()
            attempt_count = 0
            last_error = None
            
            while attempt_count < config.max_attempts:
                attempt_count += 1
                
                try:
                    logger.info(
                        "Starting operation",
                        operation=operation_name,
                        attempt=attempt_count,
                        max_attempts=config.max_attempts
                    )
                    
                    result = func(*args, **kwargs)
                    
                    logger.info(
                        "Operation completed successfully",
                        operation=operation_name,
                        attempt=attempt_count
                    )
                    
                    return result
                    
                except Exception as e:
                    error = create_error_from_exception(
                        e, 
                        context={
                            "operation": operation_name,
                            "attempt": attempt_count,
                            "max_attempts": config.max_attempts
                        }
                    )
                    
                    last_error = error
                    
                    logger.error(
                        "Operation failed",
                        operation=operation_name,
                        attempt=attempt_count,
                        error_type=error.type,
                        error_message=error.message,
                        retryable=error.retryable
                    )
                    
                    if not should_retry(error, attempt_count, config):
                        break
                    
                    # Wait before retry
                    import time
                    delay = calculate_retry_delay(attempt_count, config)
                    logger.info(
                        "Retrying operation",
                        operation=operation_name,
                        attempt=attempt_count + 1,
                        delay=delay
                    )
                    time.sleep(delay)
            
            # All retries exhausted
            if last_error:
                logger.error(
                    "Operation failed after all retries",
                    operation=operation_name,
                    total_attempts=attempt_count,
                    final_error=last_error.message
                )
                raise AnalysisException(last_error)
            
            # This shouldn't happen, but just in case
            raise AnalysisException(
                AnalysisErrorBuilder.create()
                .type(ErrorType.UNKNOWN_ERROR)
                .message(f"Operation {operation_name} failed unexpectedly")
                .suggested_action("Please try again")
                .build()
            )
        
        # Return appropriate wrapper based on function type
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator

class AnalysisException(Exception):
    """Exception that wraps AnalysisError for proper error propagation"""
    
    def __init__(self, analysis_error: AnalysisError):
        self.analysis_error = analysis_error
        super().__init__(analysis_error.message)

def handle_partial_analysis_failure(
    errors: List[AnalysisError],
    available_data: Dict[str, Any]
) -> PartialAnalysisResult:
    """Handle partial analysis failures with graceful degradation"""
    
    # Determine what data is available
    data_availability = {
        'dependency_tree': bool(available_data.get('dependency_tree')),
        'conflicts': bool(available_data.get('conflicts')),
        'summary': bool(available_data.get('summary')),
        'search_index': bool(available_data.get('search_index', True)),  # Default to True
        'export': bool(available_data.get('dependency_tree'))  # Export depends on tree
    }
    
    # Determine degraded features
    degraded_features = []
    if not data_availability['dependency_tree']:
        degraded_features.append('Dependency tree visualization')
    if not data_availability['conflicts']:
        degraded_features.append('Conflict detection')
    if not data_availability['summary']:
        degraded_features.append('Analysis summary')
    if not data_availability['search_index']:
        degraded_features.append('Dependency search')
    if not data_availability['export']:
        degraded_features.append('Data export')
    
    return PartialAnalysisResult(
        has_errors=True,
        errors=errors,
        available_data=data_availability,
        degraded_features=degraded_features
    )

def get_user_friendly_message(error: AnalysisError) -> str:
    """Get user-friendly error message"""
    
    messages = {
        ErrorType.NETWORK_ERROR: "Connection problem - please check your internet connection",
        ErrorType.API_ERROR: "Server temporarily unavailable - please try again",
        ErrorType.TIMEOUT_ERROR: "Analysis is taking longer than expected",
        ErrorType.JAR_NOT_FOUND: "JAR file not found - please upload it again",
        ErrorType.JAR_PROCESSING_ERROR: "Problem processing the JAR file",
        ErrorType.ANALYSIS_IN_PROGRESS: "Analysis is already running for this JAR",
        ErrorType.DEPENDENCY_EXTRACTION_FAILED: "Could not extract dependency information",
        ErrorType.CONFLICT_DETECTION_FAILED: "Could not detect dependency conflicts",
        ErrorType.SEARCH_INDEX_FAILED: "Search functionality may be limited",
        ErrorType.EXPORT_FAILED: "Could not export analysis data",
        ErrorType.PARTIAL_ANALYSIS_FAILURE: "Analysis completed with some limitations",
        ErrorType.UNKNOWN_ERROR: "An unexpected problem occurred"
    }
    
    return messages.get(error.type, error.message)
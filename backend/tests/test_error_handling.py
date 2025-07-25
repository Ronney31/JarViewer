#!/usr/bin/env python3
"""
Comprehensive tests for error handling implementation
"""

import pytest
import asyncio
from datetime import datetime
from unittest.mock import Mock, patch

from src.utils.error_handling import (
    AnalysisError, ErrorType, ErrorSeverity, AnalysisErrorBuilder,
    PartialAnalysisResult, handle_partial_analysis_failure,
    create_error_from_exception, with_error_handling, RetryConfig,
    AnalysisException, should_retry, calculate_retry_delay,
    get_user_friendly_message
)


class TestAnalysisErrorBuilder:
    """Test AnalysisErrorBuilder functionality"""
    
    def test_basic_error_creation(self):
        """Test basic error creation with builder pattern"""
        error = AnalysisErrorBuilder.create()\
            .type(ErrorType.JAR_NOT_FOUND)\
            .severity(ErrorSeverity.HIGH)\
            .message("Test error message")\
            .suggested_action("Test suggested action")\
            .retryable(False)\
            .context({"test": "context"})\
            .build()
        
        assert error.type == ErrorType.JAR_NOT_FOUND
        assert error.severity == ErrorSeverity.HIGH
        assert error.message == "Test error message"
        assert error.suggested_action == "Test suggested action"
        assert error.retryable == False
        assert error.context == {"test": "context"}
        assert isinstance(error.timestamp, datetime)
    
    def test_error_builder_validation(self):
        """Test that builder validates required fields"""
        with pytest.raises(ValueError):
            AnalysisErrorBuilder.create().build()  # Missing required fields
    
    def test_error_serialization(self):
        """Test error serialization to dictionary"""
        error = AnalysisErrorBuilder.create()\
            .type(ErrorType.NETWORK_ERROR)\
            .severity(ErrorSeverity.MEDIUM)\
            .message("Network error")\
            .suggested_action("Check connection")\
            .retryable(True)\
            .details({"status_code": 500})\
            .build()
        
        error_dict = error.to_dict()
        
        assert error_dict['type'] == 'network_error'
        assert error_dict['severity'] == 'medium'
        assert error_dict['message'] == 'Network error'
        assert error_dict['retryable'] == True
        assert error_dict['details']['status_code'] == 500
        assert 'timestamp' in error_dict


class TestErrorFromException:
    """Test creating errors from Python exceptions"""
    
    def test_file_not_found_error(self):
        """Test FileNotFoundError conversion"""
        try:
            raise FileNotFoundError("test.jar not found")
        except Exception as e:
            error = create_error_from_exception(e, {"jar_id": "test"})
            assert error.type == ErrorType.JAR_NOT_FOUND
            assert "not found" in error.message.lower()
            assert error.retryable == False
            assert error.context["jar_id"] == "test"
    
    def test_timeout_error(self):
        """Test TimeoutError conversion"""
        try:
            raise asyncio.TimeoutError()
        except Exception as e:
            error = create_error_from_exception(e)
            assert error.type == ErrorType.TIMEOUT_ERROR
            assert error.retryable == True
            assert error.severity == ErrorSeverity.MEDIUM
    
    def test_permission_error(self):
        """Test PermissionError conversion"""
        try:
            raise PermissionError("Access denied")
        except Exception as e:
            error = create_error_from_exception(e)
            assert error.type == ErrorType.JAR_PROCESSING_ERROR
            assert error.retryable == False
            assert "permission" in error.message.lower()
    
    def test_generic_exception(self):
        """Test generic exception conversion"""
        try:
            raise ValueError("Test error")
        except Exception as e:
            error = create_error_from_exception(e, {"operation": "test"})
            assert error.type == ErrorType.UNKNOWN_ERROR
            assert error.retryable == True
            assert "Test error" in error.message
            assert error.context["operation"] == "test"


class TestPartialAnalysisResult:
    """Test partial analysis result handling"""
    
    def test_partial_analysis_creation(self):
        """Test creating partial analysis result"""
        errors = [
            AnalysisErrorBuilder.create()
            .type(ErrorType.DEPENDENCY_EXTRACTION_FAILED)
            .message("Test error")
            .suggested_action("Test action")
            .build()
        ]
        
        available_data = {
            'dependency_tree': True,
            'conflicts': False,
            'summary': True
        }
        
        result = handle_partial_analysis_failure(errors, available_data)
        
        assert result.has_errors == True
        assert len(result.errors) == 1
        assert result.available_data['dependency_tree'] == True
        assert result.available_data['conflicts'] == False
        assert 'Conflict detection' in result.degraded_features
        # Export should be available since dependency_tree is True
    
    def test_partial_analysis_serialization(self):
        """Test partial analysis result serialization"""
        errors = [
            AnalysisErrorBuilder.create()
            .type(ErrorType.SEARCH_INDEX_FAILED)
            .message("Search failed")
            .suggested_action("Retry")
            .build()
        ]
        
        available_data = {'dependency_tree': True, 'search_index': False}
        result = handle_partial_analysis_failure(errors, available_data)
        
        result_dict = result.to_dict()
        
        assert result_dict['has_errors'] == True
        assert len(result_dict['errors']) == 1
        assert result_dict['available_data']['dependency_tree'] == True
        assert 'Dependency search' in result_dict['degraded_features']


class TestRetryLogic:
    """Test retry logic and configuration"""
    
    def test_should_retry_logic(self):
        """Test retry decision logic"""
        config = RetryConfig(max_attempts=3)
        
        # Retryable error, within attempts
        error = AnalysisErrorBuilder.create()\
            .type(ErrorType.NETWORK_ERROR)\
            .message("Network error")\
            .suggested_action("Retry")\
            .retryable(True)\
            .build()
        
        assert should_retry(error, 1, config) == True
        assert should_retry(error, 3, config) == False  # Max attempts reached
        
        # Non-retryable error
        error.retryable = False
        assert should_retry(error, 1, config) == False
    
    def test_retry_delay_calculation(self):
        """Test retry delay calculation with backoff"""
        config = RetryConfig(base_delay=1.0, backoff_multiplier=2.0, max_delay=10.0)
        
        assert calculate_retry_delay(1, config) == 1.0
        assert calculate_retry_delay(2, config) == 2.0
        assert calculate_retry_delay(3, config) == 4.0
        assert calculate_retry_delay(10, config) == 10.0  # Should cap at max_delay


class TestRetryDecorator:
    """Test retry decorator functionality"""
    
    @pytest.mark.asyncio
    async def test_successful_async_operation(self):
        """Test successful async operation with retry decorator"""
        
        @with_error_handling("test_operation", RetryConfig(max_attempts=2))
        async def test_function():
            return "success"
        
        result = await test_function()
        assert result == "success"
    
    @pytest.mark.asyncio
    async def test_failing_async_operation(self):
        """Test failing async operation with retry decorator"""
        
        call_count = 0
        
        @with_error_handling("test_failing_operation", RetryConfig(max_attempts=2, base_delay=0.1))
        async def test_function():
            nonlocal call_count
            call_count += 1
            raise ValueError("Test failure")
        
        with pytest.raises(AnalysisException) as exc_info:
            await test_function()
        
        assert call_count >= 1  # Should be called at least once
        assert exc_info.value.analysis_error.type == ErrorType.UNKNOWN_ERROR
    
    def test_successful_sync_operation(self):
        """Test successful sync operation with retry decorator"""
        
        @with_error_handling("test_sync_operation", RetryConfig(max_attempts=2))
        def test_function():
            return "sync_success"
        
        result = test_function()
        assert result == "sync_success"
    
    def test_failing_sync_operation(self):
        """Test failing sync operation with retry decorator"""
        
        call_count = 0
        
        @with_error_handling("test_failing_sync", RetryConfig(max_attempts=2, base_delay=0.1))
        def test_function():
            nonlocal call_count
            call_count += 1
            raise ValueError("Sync test failure")
        
        with pytest.raises(AnalysisException) as exc_info:
            test_function()
        
        assert call_count >= 1  # Should be called at least once
        assert exc_info.value.analysis_error.type == ErrorType.UNKNOWN_ERROR


class TestUserFriendlyMessages:
    """Test user-friendly error messages"""
    
    def test_user_friendly_messages(self):
        """Test getting user-friendly messages for different error types"""
        
        test_cases = [
            (ErrorType.NETWORK_ERROR, "connection problem"),
            (ErrorType.JAR_NOT_FOUND, "not found"),
            (ErrorType.TIMEOUT_ERROR, "longer than expected"),
            (ErrorType.PARTIAL_ANALYSIS_FAILURE, "limitations"),
        ]
        
        for error_type, expected_phrase in test_cases:
            error = AnalysisErrorBuilder.create()\
                .type(error_type)\
                .message("Test message")\
                .suggested_action("Test action")\
                .build()
            
            friendly_message = get_user_friendly_message(error)
            assert expected_phrase.lower() in friendly_message.lower()


class TestAnalysisException:
    """Test AnalysisException wrapper"""
    
    def test_analysis_exception_creation(self):
        """Test creating AnalysisException from AnalysisError"""
        error = AnalysisErrorBuilder.create()\
            .type(ErrorType.JAR_PROCESSING_ERROR)\
            .message("Processing failed")\
            .suggested_action("Try again")\
            .build()
        
        exception = AnalysisException(error)
        
        assert exception.analysis_error == error
        assert str(exception) == "Processing failed"


class TestRetryConfig:
    """Test RetryConfig functionality"""
    
    def test_default_retry_config(self):
        """Test default retry configuration"""
        config = RetryConfig()
        
        assert config.max_attempts == 3
        assert config.base_delay == 1.0
        assert config.max_delay == 10.0
        assert config.backoff_multiplier == 2.0
        assert ErrorType.NETWORK_ERROR in config.retryable_errors
        assert ErrorType.JAR_NOT_FOUND not in config.retryable_errors
    
    def test_custom_retry_config(self):
        """Test custom retry configuration"""
        config = RetryConfig(
            max_attempts=5,
            base_delay=0.5,
            retryable_errors=[ErrorType.TIMEOUT_ERROR]
        )
        
        assert config.max_attempts == 5
        assert config.base_delay == 0.5
        assert config.retryable_errors == [ErrorType.TIMEOUT_ERROR]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
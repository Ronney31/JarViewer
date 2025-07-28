"""
Complete workflow integration tests for single JAR dependency analysis.
Tests the end-to-end workflow from JAR upload to dependency analysis, search, and export.
"""

import pytest
import tempfile
import zipfile
import os
import json
import csv
import io
import asyncio
import concurrent.futures
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from src.main import app
from src.services.jar_service import jar_service
from src.services.dependency_tree_service import dependency_tree_service
from src.services.dependency_export_service import dependency_export_service, ExportFormat


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app, base_url="http://localhost:8000")


@pytest.fixture
def complex_jar_file():
    """Create a complex JAR file with multiple dependencies for testing."""
    with tempfile.NamedTemporaryFile(suffix='.jar', delete=False) as temp_file:
        with zipfile.ZipFile(temp_file.name, 'w') as jar:
            # Add comprehensive manifest
            jar.writestr('META-INF/MANIFEST.MF', '''Manifest-Version: 1.0
Main-Class: com.example.ComplexApp
Implementation-Title: Complex Test Application
Implementation-Version: 2.1.0
Implementation-Vendor: Test Corp
Built-By: integration-test
Build-Jdk: 11.0.2
Created-By: Maven 3.8.1
''')
            
            # Add multiple Java classes
            for i in range(20):
                jar.writestr(f'com/example/service/Service{i}.class', b'fake class content' * 100)
                jar.writestr(f'com/example/model/Model{i}.class', b'fake class content' * 50)
                jar.writestr(f'com/example/util/Util{i}.class', b'fake class content' * 25)
            
            # Add Maven POM with complex dependencies
            jar.writestr('META-INF/maven/com.example/complex-app/pom.xml', '''<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>complex-app</artifactId>
    <version>2.1.0</version>
    <packaging>jar</packaging>
    
    <dependencies>
        <!-- Spring Framework -->
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-core</artifactId>
            <version>5.3.21</version>
        </dependency>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-context</artifactId>
            <version>5.3.21</version>
        </dependency>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-web</artifactId>
            <version>5.3.20</version>
        </dependency>
        
        <!-- Jackson -->
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-core</artifactId>
            <version>2.13.3</version>
        </dependency>
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-databind</artifactId>
            <version>2.13.3</version>
        </dependency>
        
        <!-- Logging -->
        <dependency>
            <groupId>org.slf4j</groupId>
            <artifactId>slf4j-api</artifactId>
            <version>1.7.36</version>
        </dependency>
        <dependency>
            <groupId>ch.qos.logback</groupId>
            <artifactId>logback-classic</artifactId>
            <version>1.2.11</version>
        </dependency>
        
        <!-- Testing -->
        <dependency>
            <groupId>junit</groupId>
            <artifactId>junit</artifactId>
            <version>4.13.2</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.mockito</groupId>
            <artifactId>mockito-core</artifactId>
            <version>4.6.1</version>
            <scope>test</scope>
        </dependency>
        
        <!-- Conflicting versions -->
        <dependency>
            <groupId>commons-lang</groupId>
            <artifactId>commons-lang</artifactId>
            <version>2.6</version>
        </dependency>
        <dependency>
            <groupId>org.apache.commons</groupId>
            <artifactId>commons-lang3</artifactId>
            <version>3.12.0</version>
        </dependency>
    </dependencies>
</project>''')
            
            # Add properties files
            jar.writestr('application.properties', '''
server.port=8080
spring.datasource.url=jdbc:h2:mem:testdb
spring.jpa.hibernate.ddl-auto=create-drop
logging.level.com.example=DEBUG
''')
            
            # Add some library JARs in WEB-INF/lib
            for lib in ['spring-core-5.3.21', 'jackson-core-2.13.3', 'slf4j-api-1.7.36']:
                jar.writestr(f'WEB-INF/lib/{lib}.jar', b'fake jar content' * 200)
            
            # Add some conflicting versions
            jar.writestr('WEB-INF/lib/spring-web-5.3.20.jar', b'fake jar content' * 150)
            jar.writestr('WEB-INF/lib/commons-lang-2.6.jar', b'fake jar content' * 100)
            jar.writestr('WEB-INF/lib/commons-lang3-3.12.0.jar', b'fake jar content' * 120)
        
        yield temp_file.name
        
        # Cleanup
        try:
            os.unlink(temp_file.name)
        except OSError:
            pass


@pytest.fixture
def large_dependency_jar():
    """Create a JAR with many dependencies for search testing."""
    with tempfile.NamedTemporaryFile(suffix='.jar', delete=False) as temp_file:
        with zipfile.ZipFile(temp_file.name, 'w') as jar:
            # Add manifest
            jar.writestr('META-INF/MANIFEST.MF', '''Manifest-Version: 1.0
Main-Class: com.example.LargeApp
Implementation-Title: Large Dependency Test
Implementation-Version: 1.0.0
''')
            
            # Create a POM with many dependencies
            dependencies = []
            for i in range(50):
                group_id = f"com.test.group{i % 10}"
                artifact_id = f"artifact-{i}"
                version = f"{i % 5 + 1}.{i % 3}.{i % 2}"
                scope = ['compile', 'test', 'runtime', 'provided'][i % 4]
                
                dependencies.append(f'''        <dependency>
            <groupId>{group_id}</groupId>
            <artifactId>{artifact_id}</artifactId>
            <version>{version}</version>
            <scope>{scope}</scope>
        </dependency>''')
            
            pom_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>large-app</artifactId>
    <version>1.0.0</version>
    
    <dependencies>
{chr(10).join(dependencies)}
    </dependencies>
</project>'''
            
            jar.writestr('META-INF/maven/com.example/large-app/pom.xml', pom_content)
            
            # Add corresponding JAR files
            for i in range(50):
                jar_name = f"artifact-{i}-{i % 5 + 1}.{i % 3}.{i % 2}.jar"
                jar.writestr(f'WEB-INF/lib/{jar_name}', b'fake jar content' * (i % 10 + 1))
        
        yield temp_file.name
        
        try:
            os.unlink(temp_file.name)
        except OSError:
            pass


class TestCompleteWorkflowIntegration:
    """Test complete workflow from JAR upload to dependency analysis."""
    
    def test_end_to_end_jar_upload_to_analysis_workflow(self, client, complex_jar_file):
        """Test the complete workflow from JAR upload to comprehensive analysis."""
        # Step 1: Upload JAR
        with open(complex_jar_file, 'rb') as f:
            response = client.post(
                "/api/v1/jars/upload",
                files={"file": ("complex-app.jar", f, "application/java-archive")}
            )
        
        assert response.status_code == 200
        upload_data = response.json()
        assert upload_data["success"] is True
        
        jar_id = upload_data["data"]["jarFile"]["id"]
        assert jar_id is not None
        
        # Step 2: Verify JAR metadata extraction
        response = client.get(f"/api/v1/jars/{jar_id}/metadata")
        assert response.status_code == 200
        
        metadata = response.json()
        assert metadata["success"] is True
        assert metadata["data"]["manifest"]["mainClass"] == "com.example.ComplexApp"
        assert metadata["data"]["manifest"]["implementationTitle"] == "Complex Test Application"
        
        # Step 3: Perform comprehensive dependency analysis
        response = client.get(f"/api/v1/jars/{jar_id}/analysis/comprehensive")
        assert response.status_code == 200
        
        analysis = response.json()
        assert analysis["success"] is True
        
        # Verify analysis structure
        analysis_data = analysis["data"]
        assert "dependencyTree" in analysis_data
        assert "summary" in analysis_data
        assert "conflicts" in analysis_data
        
        # Verify dependency tree structure
        dep_tree = analysis_data["dependencyTree"]
        assert dep_tree["total_dependencies"] > 0
        assert dep_tree["direct_dependencies"] > 0
        assert "root_dependencies" in dep_tree
        assert "all_dependencies" in dep_tree
        
        # Verify summary information
        summary = analysis_data["summary"]
        assert summary["total_dependencies"] > 0
        assert "scope_breakdown" in summary
        assert "source_breakdown" in summary
        assert "risk_level" in summary
        
        # Step 4: Test dependency tree endpoint
        response = client.get(f"/api/v1/jars/{jar_id}/dependencies/tree")
        assert response.status_code == 200
        
        tree_data = response.json()
        assert tree_data["success"] is True
        assert "dependencies" in tree_data["data"]
        
        # Step 5: Test conflict analysis
        response = client.get(f"/api/v1/jars/{jar_id}/analysis/conflicts")
        assert response.status_code == 200
        
        conflicts = response.json()
        assert conflicts["success"] is True
        assert "conflicts" in conflicts["data"]
        
        # Step 6: Test version extraction
        response = client.get(f"/api/v1/jars/{jar_id}/analysis/versions")
        assert response.status_code == 200
        
        versions = response.json()
        assert versions["success"] is True
        assert "versions" in versions["data"]
        assert versions["data"]["total_versions"] > 0
        
        # Step 7: Test SBOM generation
        response = client.post(f"/api/v1/jars/{jar_id}/sbom/generate?format=cyclonedx")
        assert response.status_code == 200
        
        sbom = response.json()
        assert sbom["success"] is True
        assert "sbom" in sbom["data"]
        assert sbom["data"]["components_count"] > 0
        
        # Step 8: Test file structure access
        response = client.get(f"/api/v1/jars/{jar_id}/files")
        assert response.status_code == 200
        
        files = response.json()
        assert files["success"] is True
        assert len(files["data"]["files"]) > 0
        
        return jar_id, analysis_data
    
    def test_search_functionality_across_large_dependency_trees(self, client, large_dependency_jar):
        """Test search functionality with large dependency trees."""
        # Upload large dependency JAR
        with open(large_dependency_jar, 'rb') as f:
            response = client.post(
                "/api/v1/jars/upload",
                files={"file": ("large-app.jar", f, "application/java-archive")}
            )
        
        assert response.status_code == 200
        jar_id = response.json()["data"]["jarFile"]["id"]
        
        # Get comprehensive analysis
        response = client.get(f"/api/v1/jars/{jar_id}/analysis/comprehensive")
        assert response.status_code == 200
        
        analysis_data = response.json()["data"]
        dep_tree = analysis_data["dependencyTree"]
        
        # Test 1: Search by artifact name
        search_tests = [
            ("artifact-1", "exact artifact match"),
            ("group5", "group ID search"),
            ("test", "partial name search"),
            ("1.2.0", "version search"),
            ("compile", "scope search")
        ]
        
        for query, description in search_tests:
            # Test file search endpoint
            response = client.get(f"/api/v1/jars/{jar_id}/search?q={query}")
            assert response.status_code == 200
            
            search_results = response.json()
            assert search_results["success"] is True
            
            # Verify search results structure
            assert "results" in search_results["data"]
            assert "total" in search_results["data"]
            assert "query" in search_results["data"]
            assert search_results["data"]["query"] == query
            
            print(f"Search test '{description}' with query '{query}': {search_results['data']['total']} results")
        
        # Test 2: Advanced search with filters
        response = client.get(f"/api/v1/jars/{jar_id}/search/advanced?q=artifact&search_type=filename&max_results=10")
        assert response.status_code == 200
        
        advanced_results = response.json()
        assert advanced_results["success"] is True
        assert len(advanced_results["data"]["results"]) <= 10
        
        # Test 3: Search performance with large result sets
        import time
        start_time = time.time()
        
        response = client.get(f"/api/v1/jars/{jar_id}/search?q=com")
        search_time = time.time() - start_time
        
        assert response.status_code == 200
        assert search_time < 2.0  # Should complete within 2 seconds
        
        # Test 4: Empty search results
        response = client.get(f"/api/v1/jars/{jar_id}/search?q=nonexistent-dependency")
        assert response.status_code == 200
        
        empty_results = response.json()
        assert empty_results["success"] is True
        assert empty_results["data"]["total"] == 0
        
        return jar_id, dep_tree
    
    def test_export_functionality_with_real_jar_data(self, client, complex_jar_file):
        """Test export functionality with real JAR dependency data."""
        # Upload and analyze JAR
        with open(complex_jar_file, 'rb') as f:
            response = client.post(
                "/api/v1/jars/upload",
                files={"file": ("complex-app.jar", f, "application/java-archive")}
            )
        
        jar_id = response.json()["data"]["jarFile"]["id"]
        
        # Get comprehensive analysis
        response = client.get(f"/api/v1/jars/{jar_id}/analysis/comprehensive")
        assert response.status_code == 200
        
        # Test 1: Export formats preview
        response = client.get(f"/api/v1/jars/{jar_id}/exports/formats")
        assert response.status_code == 200
        
        formats = response.json()
        assert "formats" in formats
        assert len(formats["formats"]) >= 3  # JSON, CSV, TEXT_TREE
        
        format_ids = [f["id"] for f in formats["formats"]]
        assert "json" in format_ids
        assert "csv" in format_ids
        assert "text_tree" in format_ids
        
        # Test 2: Export preview for each format
        for format_id in ["json", "csv", "text_tree"]:
            response = client.get(f"/api/v1/jars/{jar_id}/exports/preview?format={format_id}")
            assert response.status_code == 200
            
            preview = response.json()
            assert preview["format"] == format_id
            assert "filename" in preview
            assert "estimated_size" in preview
            assert "total_dependencies" in preview
            assert "preview" in preview
            
            print(f"Export preview for {format_id}: {preview['total_dependencies']} dependencies, ~{preview['estimated_size']} bytes")
        
        # Test 3: Full export for each format
        export_results = {}
        
        for format_id in ["json", "csv", "text_tree"]:
            response = client.get(f"/api/v1/jars/{jar_id}/exports?format={format_id}")
            assert response.status_code == 200
            
            # Verify response headers
            content_type = response.headers.get("content-type")
            if format_id == "json":
                assert "application/json" in content_type
            elif format_id == "csv":
                assert "text/csv" in content_type
            elif format_id == "text_tree":
                assert "text/plain" in content_type
            
            export_results[format_id] = response.content
            
            # Verify content is not empty
            assert len(response.content) > 0
            
            print(f"Export {format_id}: {len(response.content)} bytes")
        
        # Test 4: Validate JSON export structure
        json_data = json.loads(export_results["json"])
        assert "jar_id" in json_data
        assert "statistics" in json_data
        assert "dependencies" in json_data
        assert json_data["statistics"]["total_dependencies"] > 0
        
        # Test 5: Validate CSV export structure
        csv_content = export_results["csv"].decode('utf-8')
        csv_reader = csv.reader(io.StringIO(csv_content))
        headers = next(csv_reader)
        
        expected_headers = ["Group ID", "Artifact ID", "Version", "Scope", "Source"]
        for header in expected_headers:
            assert header in headers
        
        # Count CSV rows
        csv_rows = list(csv_reader)
        assert len(csv_rows) > 0
        
        # Test 6: Validate text tree export
        text_content = export_results["text_tree"].decode('utf-8')
        assert "Dependency Tree for complex-app.jar" in text_content
        assert "Total Dependencies:" in text_content
        assert "├─" in text_content or "└─" in text_content  # Tree structure indicators
        
        # Test 7: Export with filters
        response = client.get(f"/api/v1/jars/{jar_id}/exports?format=json&include_transitive=false&include_conflicts=true")
        assert response.status_code == 200
        
        filtered_json = json.loads(response.content)
        # Should have fewer dependencies when transitive are excluded
        assert filtered_json["statistics"]["total_dependencies"] <= json_data["statistics"]["total_dependencies"]
        
        # Test 8: Export with scope filtering
        response = client.get(f"/api/v1/jars/{jar_id}/exports?format=csv&scope=compile&scope=runtime")
        assert response.status_code == 200
        
        # Test 9: Export with maximum depth
        response = client.get(f"/api/v1/jars/{jar_id}/exports?format=text_tree&max_depth=2")
        assert response.status_code == 200
        
        return jar_id, export_results
    
    def test_error_handling_and_recovery_scenarios(self, client, complex_jar_file):
        """Test error handling and recovery scenarios throughout the workflow."""
        # Test 1: Invalid JAR file handling
        with tempfile.NamedTemporaryFile(suffix='.jar', delete=False) as temp_file:
            temp_file.write(b'This is not a valid JAR file')
            temp_file.flush()
            
            try:
                with open(temp_file.name, 'rb') as f:
                    response = client.post(
                        "/api/v1/jars/upload",
                        files={"file": ("invalid.jar", f, "application/java-archive")}
                    )
                
                # Should handle gracefully
                assert response.status_code in [400, 422]
                error_data = response.json()
                assert error_data["success"] is False
                assert "error" in error_data
                
            finally:
                os.unlink(temp_file.name)
        
        # Test 2: Non-existent JAR ID handling
        non_existent_id = "non-existent-jar-id"
        
        endpoints_to_test = [
            f"/api/v1/jars/{non_existent_id}/metadata",
            f"/api/v1/jars/{non_existent_id}/analysis/comprehensive",
            f"/api/v1/jars/{non_existent_id}/dependencies/tree",
            f"/api/v1/jars/{non_existent_id}/analysis/conflicts",
            f"/api/v1/jars/{non_existent_id}/analysis/versions",
            f"/api/v1/jars/{non_existent_id}/exports/preview",
            f"/api/v1/jars/{non_existent_id}/exports"
        ]
        
        for endpoint in endpoints_to_test:
            response = client.get(endpoint)
            assert response.status_code == 404
            
            error_data = response.json()
            assert error_data["success"] is False
            assert "error" in error_data
            
            print(f"Error handling test for {endpoint}: {error_data['error']}")
        
        # Test 3: Upload valid JAR and test partial failure scenarios
        with open(complex_jar_file, 'rb') as f:
            response = client.post(
                "/api/v1/jars/upload",
                files={"file": ("complex-app.jar", f, "application/java-archive")}
            )
        
        jar_id = response.json()["data"]["jarFile"]["id"]
        
        # Test 4: Comprehensive analysis with potential partial failures
        response = client.get(f"/api/v1/jars/{jar_id}/analysis/comprehensive")
        assert response.status_code == 200
        
        analysis = response.json()
        assert analysis["success"] is True
        
        # Check if partial results are handled
        if "partial_result" in analysis and analysis["partial_result"]:
            partial_result = analysis["partial_result"]
            assert "hasErrors" in partial_result
            assert "errors" in partial_result
            assert "degradedFeatures" in partial_result
            
            print(f"Partial analysis detected: {len(partial_result['errors'])} errors")
            for error in partial_result["errors"]:
                print(f"  - {error['type']}: {error['message']}")
        
        # Test 5: Invalid export parameters
        invalid_export_tests = [
            ("invalid_format", 400),
            ("json&scope=invalid_scope", 400),
            ("csv&max_depth=-1", 400)
        ]
        
        for params, expected_status in invalid_export_tests:
            response = client.get(f"/api/v1/jars/{jar_id}/exports?format={params}")
            assert response.status_code == expected_status
        
        # Test 6: File content access errors
        response = client.get(f"/api/v1/jars/{jar_id}/files/content?path=non/existent/file.class")
        assert response.status_code == 404
        
        # Test 7: Search with invalid parameters
        response = client.get(f"/api/v1/jars/{jar_id}/search/advanced?search_type=invalid_type")
        assert response.status_code in [400, 422]
        
        # Test 8: Concurrent request handling
        def make_concurrent_request(endpoint):
            return client.get(f"/api/v1/jars/{jar_id}/{endpoint}")
        
        endpoints = [
            "analysis/comprehensive",
            "analysis/versions",
            "analysis/conflicts",
            "dependencies/tree"
        ]
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(make_concurrent_request, endpoint) for endpoint in endpoints]
            results = [future.result() for future in concurrent.futures.as_completed(futures)]
        
        # All concurrent requests should succeed
        for response in results:
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
        
        # Test 9: Large file handling
        response = client.get(f"/api/v1/jars/{jar_id}/exports?format=json&include_metadata=true")
        assert response.status_code == 200
        
        # Should handle large exports gracefully
        content_length = len(response.content)
        assert content_length > 0
        print(f"Large export test: {content_length} bytes")
        
        # Test 10: Cleanup and resource management
        response = client.delete(f"/api/v1/jars/{jar_id}")
        assert response.status_code == 200
        
        cleanup_data = response.json()
        assert cleanup_data["success"] is True
        
        # Verify JAR is actually deleted
        response = client.get(f"/api/v1/jars/{jar_id}/metadata")
        assert response.status_code == 404
        
        return jar_id
    
    def test_performance_and_scalability(self, client, large_dependency_jar):
        """Test performance and scalability aspects of the workflow."""
        import time
        
        # Upload large JAR
        start_time = time.time()
        with open(large_dependency_jar, 'rb') as f:
            response = client.post(
                "/api/v1/jars/upload",
                files={"file": ("large-app.jar", f, "application/java-archive")}
            )
        upload_time = time.time() - start_time
        
        assert response.status_code == 200
        jar_id = response.json()["data"]["jarFile"]["id"]
        
        print(f"Upload time: {upload_time:.2f} seconds")
        assert upload_time < 30.0  # Should complete within 30 seconds
        
        # Test comprehensive analysis performance
        start_time = time.time()
        response = client.get(f"/api/v1/jars/{jar_id}/analysis/comprehensive")
        analysis_time = time.time() - start_time
        
        assert response.status_code == 200
        print(f"Comprehensive analysis time: {analysis_time:.2f} seconds")
        assert analysis_time < 60.0  # Should complete within 60 seconds
        
        analysis_data = response.json()["data"]
        total_deps = analysis_data["summary"]["total_dependencies"]
        print(f"Analyzed {total_deps} dependencies in {analysis_time:.2f} seconds")
        
        # Test search performance
        search_queries = ["artifact", "group", "test", "1.0", "compile"]
        
        for query in search_queries:
            start_time = time.time()
            response = client.get(f"/api/v1/jars/{jar_id}/search?q={query}")
            search_time = time.time() - start_time
            
            assert response.status_code == 200
            results_count = response.json()["data"]["total"]
            
            print(f"Search '{query}': {results_count} results in {search_time:.3f} seconds")
            assert search_time < 2.0  # Should complete within 2 seconds
        
        # Test export performance
        for format_id in ["json", "csv", "text_tree"]:
            start_time = time.time()
            response = client.get(f"/api/v1/jars/{jar_id}/exports?format={format_id}")
            export_time = time.time() - start_time
            
            assert response.status_code == 200
            export_size = len(response.content)
            
            print(f"Export {format_id}: {export_size} bytes in {export_time:.2f} seconds")
            assert export_time < 30.0  # Should complete within 30 seconds
        
        # Test memory usage (basic check)
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        memory_info = process.memory_info()
        memory_mb = memory_info.rss / 1024 / 1024
        
        print(f"Memory usage: {memory_mb:.1f} MB")
        # Basic memory check - should not exceed 1GB for test
        assert memory_mb < 1024
        
        return jar_id
    
    def test_workflow_state_consistency(self, client, complex_jar_file):
        """Test that workflow maintains consistent state across operations."""
        # Upload JAR
        with open(complex_jar_file, 'rb') as f:
            response = client.post(
                "/api/v1/jars/upload",
                files={"file": ("complex-app.jar", f, "application/java-archive")}
            )
        
        jar_id = response.json()["data"]["jarFile"]["id"]
        
        # Get initial analysis
        response1 = client.get(f"/api/v1/jars/{jar_id}/analysis/comprehensive")
        assert response1.status_code == 200
        analysis1 = response1.json()["data"]
        
        # Get analysis again - should be consistent
        response2 = client.get(f"/api/v1/jars/{jar_id}/analysis/comprehensive")
        assert response2.status_code == 200
        analysis2 = response2.json()["data"]
        
        # Compare key metrics
        assert analysis1["summary"]["total_dependencies"] == analysis2["summary"]["total_dependencies"]
        assert analysis1["summary"]["direct_dependencies"] == analysis2["summary"]["direct_dependencies"]
        assert len(analysis1["conflicts"]) == len(analysis2["conflicts"])
        
        # Test dependency tree consistency
        tree1_response = client.get(f"/api/v1/jars/{jar_id}/dependencies/tree")
        tree2_response = client.get(f"/api/v1/jars/{jar_id}/dependencies/tree")
        
        assert tree1_response.status_code == 200
        assert tree2_response.status_code == 200
        
        tree1 = tree1_response.json()["data"]
        tree2 = tree2_response.json()["data"]
        
        assert tree1["summary"]["total_dependencies"] == tree2["summary"]["total_dependencies"]
        
        # Test export consistency
        export1_response = client.get(f"/api/v1/jars/{jar_id}/exports?format=json")
        export2_response = client.get(f"/api/v1/jars/{jar_id}/exports?format=json")
        
        assert export1_response.status_code == 200
        assert export2_response.status_code == 200
        
        export1_data = json.loads(export1_response.content)
        export2_data = json.loads(export2_response.content)
        
        assert export1_data["statistics"]["total_dependencies"] == export2_data["statistics"]["total_dependencies"]
        assert len(export1_data["dependencies"]) == len(export2_data["dependencies"])
        
        return jar_id


class TestWorkflowEdgeCases:
    """Test edge cases and boundary conditions in the workflow."""
    
    def test_empty_jar_handling(self, client):
        """Test handling of JAR files with minimal content."""
        with tempfile.NamedTemporaryFile(suffix='.jar', delete=False) as temp_file:
            with zipfile.ZipFile(temp_file.name, 'w') as jar:
                # Add only manifest
                jar.writestr('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\n')
            
            try:
                with open(temp_file.name, 'rb') as f:
                    response = client.post(
                        "/api/v1/jars/upload",
                        files={"file": ("empty.jar", f, "application/java-archive")}
                    )
                
                assert response.status_code == 200
                jar_id = response.json()["data"]["jarFile"]["id"]
                
                # Analysis should handle empty JAR gracefully
                response = client.get(f"/api/v1/jars/{jar_id}/analysis/comprehensive")
                assert response.status_code == 200
                
                analysis = response.json()
                assert analysis["success"] is True
                
                # Should have zero or minimal dependencies
                summary = analysis["data"]["summary"]
                assert summary["total_dependencies"] >= 0
                
            finally:
                os.unlink(temp_file.name)
    
    def test_malformed_pom_handling(self, client):
        """Test handling of JARs with malformed POM files."""
        with tempfile.NamedTemporaryFile(suffix='.jar', delete=False) as temp_file:
            with zipfile.ZipFile(temp_file.name, 'w') as jar:
                jar.writestr('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\n')
                
                # Add malformed POM
                jar.writestr('META-INF/maven/com.example/test/pom.xml', '''
                <invalid-xml>
                    <this-is-not-valid>
                        <dependency>
                            <groupId>test</groupId>
                ''')
            
            try:
                with open(temp_file.name, 'rb') as f:
                    response = client.post(
                        "/api/v1/jars/upload",
                        files={"file": ("malformed.jar", f, "application/java-archive")}
                    )
                
                assert response.status_code == 200
                jar_id = response.json()["data"]["jarFile"]["id"]
                
                # Analysis should handle malformed POM gracefully
                response = client.get(f"/api/v1/jars/{jar_id}/analysis/comprehensive")
                
                # Should either succeed with partial results or fail gracefully
                if response.status_code == 200:
                    analysis = response.json()
                    # If successful, might have partial results
                    if "partial_result" in analysis:
                        assert analysis["partial_result"]["hasErrors"] is True
                else:
                    # If failed, should be a structured error
                    assert response.status_code in [400, 422, 500]
                    error_data = response.json()
                    assert error_data["success"] is False
                
            finally:
                os.unlink(temp_file.name)
    
    def test_very_large_jar_handling(self, client):
        """Test handling of very large JAR files (within limits)."""
        with tempfile.NamedTemporaryFile(suffix='.jar', delete=False) as temp_file:
            with zipfile.ZipFile(temp_file.name, 'w') as jar:
                jar.writestr('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\n')
                
                # Add many files to make it larger (but within reasonable limits)
                for i in range(1000):
                    jar.writestr(f'com/example/Class{i}.class', b'fake class content' * 1000)
                
                # Add large POM with many dependencies
                dependencies = []
                for i in range(200):
                    dependencies.append(f'''        <dependency>
            <groupId>com.test.group{i % 20}</groupId>
            <artifactId>artifact-{i}</artifactId>
            <version>1.{i % 10}.0</version>
        </dependency>''')
                
                pom_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>large-jar</artifactId>
    <version>1.0.0</version>
    <dependencies>
{chr(10).join(dependencies)}
    </dependencies>
</project>'''
                
                jar.writestr('META-INF/maven/com.example/large-jar/pom.xml', pom_content)
            
            try:
                # Check file size
                file_size = os.path.getsize(temp_file.name)
                print(f"Large JAR file size: {file_size / 1024 / 1024:.1f} MB")
                
                with open(temp_file.name, 'rb') as f:
                    response = client.post(
                        "/api/v1/jars/upload",
                        files={"file": ("large.jar", f, "application/java-archive")}
                    )
                
                if response.status_code == 200:
                    jar_id = response.json()["data"]["jarFile"]["id"]
                    
                    # Analysis should handle large JAR
                    response = client.get(f"/api/v1/jars/{jar_id}/analysis/comprehensive")
                    
                    # Should complete within reasonable time
                    assert response.status_code == 200
                    
                    analysis = response.json()
                    assert analysis["success"] is True
                    
                    summary = analysis["data"]["summary"]
                    print(f"Large JAR analysis: {summary['total_dependencies']} dependencies")
                    
                elif response.status_code == 413:
                    # File too large - acceptable
                    print("Large JAR rejected due to size limits - this is expected behavior")
                else:
                    # Other error
                    assert False, f"Unexpected response: {response.status_code}"
                
            finally:
                os.unlink(temp_file.name)


if __name__ == "__main__":
    # Run specific test for debugging
    import sys
    if len(sys.argv) > 1:
        test_name = sys.argv[1]
        pytest.main([f"-v", f"-k", test_name, __file__])
    else:
        pytest.main(["-v", __file__])
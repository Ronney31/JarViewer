"""
Integration tests for JAR viewer and dependency analysis integration.
"""

import pytest
import tempfile
import zipfile
import os
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from src.main import app
from src.models.jar import JarFile
from src.services.jar_service import JarService
from src.services.dependency_tree_service import DependencyTreeService


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app, base_url="http://localhost:9000")


@pytest.fixture
def sample_jar_file():
    """Create a sample JAR file for testing."""
    with tempfile.NamedTemporaryFile(suffix='.jar', delete=False) as temp_file:
        with zipfile.ZipFile(temp_file.name, 'w') as jar:
            # Add a simple manifest
            jar.writestr('META-INF/MANIFEST.MF', '''Manifest-Version: 1.0
Main-Class: com.example.Main
Implementation-Title: Test Application
Implementation-Version: 1.0.0
''')
            
            # Add some Java classes
            jar.writestr('com/example/Main.class', b'fake class content')
            jar.writestr('com/example/util/Helper.class', b'fake class content')
            
            # Add Maven POM
            jar.writestr('META-INF/maven/com.example/test-app/pom.xml', '''<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>test-app</artifactId>
    <version>1.0.0</version>
    <dependencies>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-core</artifactId>
            <version>5.3.0</version>
        </dependency>
        <dependency>
            <groupId>junit</groupId>
            <artifactId>junit</artifactId>
            <version>4.13.2</version>
            <scope>test</scope>
        </dependency>
    </dependencies>
</project>''')
            
            # Add some library JARs in WEB-INF/lib
            jar.writestr('WEB-INF/lib/spring-core-5.3.0.jar', b'fake jar content')
            jar.writestr('WEB-INF/lib/junit-4.13.2.jar', b'fake jar content')
        
        yield temp_file.name
        
        # Cleanup
        try:
            os.unlink(temp_file.name)
        except OSError:
            pass


class TestJarViewerIntegration:
    """Test integration between JAR viewer and dependency analysis."""
    
    def test_jar_upload_and_basic_info(self, client, sample_jar_file):
        """Test JAR upload and basic information retrieval."""
        with open(sample_jar_file, 'rb') as f:
            response = client.post(
                "/api/v1/jars/upload",
                files={"file": ("test-app.jar", f, "application/java-archive")}
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        
        jar_data = data["data"]
        jar_id = jar_data["id"]
        
        # Verify basic JAR information
        assert jar_data["name"] == "test-app.jar"
        assert jar_data["size"] > 0
        assert "stats" in jar_data
        
        return jar_id
    
    def test_jar_metadata_extraction(self, client, sample_jar_file):
        """Test metadata extraction from uploaded JAR."""
        jar_id = self.test_jar_upload_and_basic_info(client, sample_jar_file)
        
        # Get JAR metadata
        response = client.get(f"/api/v1/jars/{jar_id}/metadata")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        
        metadata = data["data"]
        assert "manifest" in metadata
        assert metadata["manifest"]["mainClass"] == "com.example.Main"
        assert metadata["manifest"]["implementationTitle"] == "Test Application"
    
    def test_dependency_analysis_integration(self, client, sample_jar_file):
        """Test dependency analysis integration with JAR viewer."""
        jar_id = self.test_jar_upload_and_basic_info(client, sample_jar_file)
        
        # Test comprehensive analysis endpoint
        response = client.get(f"/api/v1/jars/{jar_id}/analysis/comprehensive")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        
        analysis = data["data"]
        assert "summary" in analysis
        assert "maven_dependencies" in analysis
        assert "detected_libraries" in analysis
        assert "frameworks" in analysis
        assert "statistics" in analysis
    
    def test_dependency_tree_generation(self, client, sample_jar_file):
        """Test dependency tree generation for JAR."""
        jar_id = self.test_jar_upload_and_basic_info(client, sample_jar_file)
        
        # Test dependency tree endpoint
        response = client.get(f"/api/v1/jars/{jar_id}/dependencies/tree")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        
        tree = data["data"]
        assert "root" in tree
        assert "dependencies" in tree
        assert "summary" in tree
    
    def test_conflict_analysis_integration(self, client, sample_jar_file):
        """Test conflict analysis integration."""
        jar_id = self.test_jar_upload_and_basic_info(client, sample_jar_file)
        
        # Test conflicts endpoint
        response = client.get(f"/api/v1/jars/{jar_id}/analysis/conflicts")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        
        conflicts = data["data"]
        assert "conflicts" in conflicts
        assert "total_dependencies" in conflicts
        assert "severity_breakdown" in conflicts
    
    def test_export_functionality_integration(self, client, sample_jar_file):
        """Test export functionality integration."""
        jar_id = self.test_jar_upload_and_basic_info(client, sample_jar_file)
        
        # Test SBOM generation
        response = client.post(f"/api/v1/jars/{jar_id}/sbom/generate?format=cyclonedx")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        
        sbom = data["data"]
        assert "format" in sbom
        assert "sbom" in sbom
        assert "components_count" in sbom
    
    def test_version_extraction_integration(self, client, sample_jar_file):
        """Test version extraction integration."""
        jar_id = self.test_jar_upload_and_basic_info(client, sample_jar_file)
        
        # Test versions endpoint
        response = client.get(f"/api/v1/jars/{jar_id}/analysis/versions")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        
        versions = data["data"]
        assert "versions" in versions
        assert "total_versions" in versions
        assert "manifest_info" in versions
        assert "framework_versions" in versions
    
    def test_file_structure_integration(self, client, sample_jar_file):
        """Test file structure integration with dependency analysis."""
        jar_id = self.test_jar_upload_and_basic_info(client, sample_jar_file)
        
        # Get file structure
        response = client.get(f"/api/v1/jars/{jar_id}/files")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        
        files = data["data"]
        assert "files" in files
        assert len(files["files"]) > 0
        
        # Verify that dependency-related files are included
        file_paths = [f["path"] for f in files["files"]]
        assert any("META-INF/maven" in path for path in file_paths)
        assert any("WEB-INF/lib" in path for path in file_paths)
    
    def test_error_handling_integration(self, client):
        """Test error handling in integration scenarios."""
        # Test with non-existent JAR ID
        response = client.get("/api/v1/jars/non-existent-id/analysis/comprehensive")
        assert response.status_code == 404
        
        data = response.json()
        assert data["success"] is False
        assert "error" in data
    
    def test_concurrent_analysis_requests(self, client, sample_jar_file):
        """Test handling of concurrent analysis requests."""
        jar_id = self.test_jar_upload_and_basic_info(client, sample_jar_file)
        
        # Make multiple concurrent requests
        import concurrent.futures
        
        def make_request(endpoint):
            return client.get(f"/api/v1/jars/{jar_id}/{endpoint}")
        
        endpoints = [
            "analysis/comprehensive",
            "analysis/versions",
            "analysis/conflicts",
            "dependencies/tree"
        ]
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(make_request, endpoint) for endpoint in endpoints]
            results = [future.result() for future in concurrent.futures.as_completed(futures)]
        
        # All requests should succeed
        for response in results:
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
    
    @patch('src.services.dependency_tree_service.DependencyTreeService.build_tree')
    def test_dependency_service_integration(self, mock_build_tree, client, sample_jar_file):
        """Test integration with dependency service."""
        # Mock the dependency tree service
        mock_build_tree.return_value = {
            "root": {
                "name": "test-app",
                "version": "1.0.0",
                "type": "jar"
            },
            "dependencies": [
                {
                    "name": "spring-core",
                    "version": "5.3.0",
                    "scope": "compile",
                    "children": []
                }
            ],
            "summary": {
                "total_dependencies": 1,
                "direct_dependencies": 1,
                "transitive_dependencies": 0
            }
        }
        
        jar_id = self.test_jar_upload_and_basic_info(client, sample_jar_file)
        
        # Test dependency tree endpoint
        response = client.get(f"/api/v1/jars/{jar_id}/dependencies/tree")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        
        # Verify the service was called
        mock_build_tree.assert_called_once()
    
    def test_health_check_integration(self, client):
        """Test health check endpoint integration."""
        response = client.get("/health")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert "version" in data
        assert "uptime" in data
    
    def test_cors_integration(self, client):
        """Test CORS integration for frontend."""
        # Test preflight request
        response = client.options(
            "/api/v1/jars/upload",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type"
            }
        )
        
        # Should allow the request
        assert response.status_code in [200, 204]
    
    def test_large_jar_handling(self, client):
        """Test handling of large JAR files."""
        # Create a larger JAR file
        with tempfile.NamedTemporaryFile(suffix='.jar', delete=False) as temp_file:
            with zipfile.ZipFile(temp_file.name, 'w') as jar:
                # Add manifest
                jar.writestr('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\n')
                
                # Add many files to make it larger
                for i in range(100):
                    jar.writestr(f'com/example/Class{i}.class', b'fake class content' * 100)
            
            try:
                with open(temp_file.name, 'rb') as f:
                    response = client.post(
                        "/api/v1/jars/upload",
                        files={"file": ("large-app.jar", f, "application/java-archive")}
                    )
                
                assert response.status_code == 200
                data = response.json()
                assert data["success"] is True
                
            finally:
                os.unlink(temp_file.name)
    
    def test_malformed_jar_handling(self, client):
        """Test handling of malformed JAR files."""
        # Create a malformed JAR file
        with tempfile.NamedTemporaryFile(suffix='.jar', delete=False) as temp_file:
            temp_file.write(b'This is not a valid JAR file')
            temp_file.flush()
            
            try:
                with open(temp_file.name, 'rb') as f:
                    response = client.post(
                        "/api/v1/jars/upload",
                        files={"file": ("malformed.jar", f, "application/java-archive")}
                    )
                
                # Should handle the error gracefully
                assert response.status_code in [400, 422]
                data = response.json()
                assert data["success"] is False
                
            finally:
                os.unlink(temp_file.name)


class TestDependencyAnalysisWorkflow:
    """Test the complete dependency analysis workflow."""
    
    def test_complete_workflow(self, client, sample_jar_file):
        """Test the complete workflow from upload to analysis."""
        # Step 1: Upload JAR
        with open(sample_jar_file, 'rb') as f:
            response = client.post(
                "/api/v1/jars/upload",
                files={"file": ("workflow-test.jar", f, "application/java-archive")}
            )
        
        assert response.status_code == 200
        jar_id = response.json()["data"]["id"]
        
        # Step 2: Get basic metadata
        response = client.get(f"/api/v1/jars/{jar_id}/metadata")
        assert response.status_code == 200
        
        # Step 3: Perform comprehensive analysis
        response = client.get(f"/api/v1/jars/{jar_id}/analysis/comprehensive")
        assert response.status_code == 200
        
        # Step 4: Get dependency tree
        response = client.get(f"/api/v1/jars/{jar_id}/dependencies/tree")
        assert response.status_code == 200
        
        # Step 5: Check for conflicts
        response = client.get(f"/api/v1/jars/{jar_id}/analysis/conflicts")
        assert response.status_code == 200
        
        # Step 6: Generate SBOM
        response = client.post(f"/api/v1/jars/{jar_id}/sbom/generate")
        assert response.status_code == 200
        
        # Step 7: Export analysis
        response = client.get(f"/api/v1/jars/{jar_id}/export/json")
        assert response.status_code == 200
        
        # All steps should complete successfully
        data = response.json()
        assert data["success"] is True
    
    def test_workflow_with_errors(self, client, sample_jar_file):
        """Test workflow behavior when errors occur."""
        jar_id = "non-existent-jar"
        
        # All endpoints should handle missing JAR gracefully
        endpoints = [
            f"/api/v1/jars/{jar_id}/metadata",
            f"/api/v1/jars/{jar_id}/analysis/comprehensive",
            f"/api/v1/jars/{jar_id}/dependencies/tree",
            f"/api/v1/jars/{jar_id}/analysis/conflicts"
        ]
        
        for endpoint in endpoints:
            response = client.get(endpoint)
            assert response.status_code == 404
            data = response.json()
            assert data["success"] is False
            assert "error" in data
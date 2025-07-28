#!/usr/bin/env python3
"""
Complete workflow integration test for single JAR dependency analysis.
Tests the entire workflow from JAR upload through analysis, search, and export.
"""

import requests
import time
import tempfile
import zipfile
import os
import json
import csv
import io
import concurrent.futures
import threading
from pathlib import Path
from typing import Dict, List, Any, Optional
import argparse
import sys


class WorkflowTester:
    """Complete workflow integration tester."""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.timeout = 30
        
        # Test results tracking
        self.results = {
            'total_tests': 0,
            'passed_tests': 0,
            'failed_tests': 0,
            'test_details': []
        }
    
    def log_test(self, test_name: str, success: bool, message: str = "", details: Any = None):
        """Log test result."""
        self.results['total_tests'] += 1
        if success:
            self.results['passed_tests'] += 1
            status = "✅ PASS"
        else:
            self.results['failed_tests'] += 1
            status = "❌ FAIL"
        
        print(f"{status} {test_name}: {message}")
        
        self.results['test_details'].append({
            'name': test_name,
            'success': success,
            'message': message,
            'details': details
        })
    
    def create_complex_jar(self) -> str:
        """Create a complex JAR file for testing."""
        temp_file = tempfile.NamedTemporaryFile(suffix='.jar', delete=False)
        
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
            for i in range(50):
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
        
        return temp_file.name
    
    def create_large_dependency_jar(self) -> str:
        """Create a JAR with many dependencies for search testing."""
        temp_file = tempfile.NamedTemporaryFile(suffix='.jar', delete=False)
        
        with zipfile.ZipFile(temp_file.name, 'w') as jar:
            # Add manifest
            jar.writestr('META-INF/MANIFEST.MF', '''Manifest-Version: 1.0
Main-Class: com.example.LargeApp
Implementation-Title: Large Dependency Test
Implementation-Version: 1.0.0
''')
            
            # Create a POM with many dependencies
            dependencies = []
            for i in range(100):
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
            for i in range(100):
                jar_name = f"artifact-{i}-{i % 5 + 1}.{i % 3}.{i % 2}.jar"
                jar.writestr(f'WEB-INF/lib/{jar_name}', b'fake jar content' * (i % 10 + 1))
        
        return temp_file.name
    
    def test_backend_health(self) -> bool:
        """Test backend health and availability."""
        try:
            response = self.session.get(f"{self.base_url}/health")
            if response.status_code == 200:
                health_data = response.json()
                self.log_test("Backend Health Check", True, 
                             f"Backend is healthy - {health_data.get('status', 'unknown')}")
                return True
            else:
                self.log_test("Backend Health Check", False, 
                             f"Health check failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Backend Health Check", False, f"Backend not accessible: {str(e)}")
            return False
    
    def test_end_to_end_workflow(self) -> Optional[str]:
        """Test complete end-to-end workflow from upload to analysis."""
        jar_path = self.create_complex_jar()
        
        try:
            # Step 1: Upload JAR
            start_time = time.time()
            with open(jar_path, 'rb') as f:
                files = {'file': ('complex-app.jar', f, 'application/java-archive')}
                response = self.session.post(f"{self.base_url}/api/v1/jars/upload", files=files)
            
            upload_time = time.time() - start_time
            
            if response.status_code != 200:
                self.log_test("JAR Upload", False, 
                             f"Upload failed with status {response.status_code}: {response.text}")
                return None
            
            upload_data = response.json()
            if not upload_data.get('success'):
                self.log_test("JAR Upload", False, f"Upload failed: {upload_data}")
                return None
            
            jar_id = upload_data['data']['jarFile']['id']
            self.log_test("JAR Upload", True, 
                         f"Uploaded successfully in {upload_time:.2f}s, JAR ID: {jar_id}")
            
            # Step 2: Test metadata extraction
            response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/metadata")
            if response.status_code == 200:
                metadata = response.json()
                if metadata.get('success'):
                    manifest = metadata['data'].get('manifest', {})
                    self.log_test("Metadata Extraction", True, 
                                 f"Main class: {manifest.get('mainClass', 'N/A')}")
                else:
                    self.log_test("Metadata Extraction", False, f"Metadata failed: {metadata}")
            else:
                self.log_test("Metadata Extraction", False, 
                             f"Metadata request failed: {response.status_code}")
            
            # Step 3: Test comprehensive dependency analysis
            start_time = time.time()
            response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/analysis/comprehensive")
            analysis_time = time.time() - start_time
            
            if response.status_code != 200:
                self.log_test("Comprehensive Analysis", False, 
                             f"Analysis failed with status {response.status_code}")
                return jar_id
            
            analysis = response.json()
            if not analysis.get('success'):
                self.log_test("Comprehensive Analysis", False, f"Analysis failed: {analysis}")
                return jar_id
            
            analysis_data = analysis['data']
            summary = analysis_data.get('summary', {})
            
            self.log_test("Comprehensive Analysis", True, 
                         f"Completed in {analysis_time:.2f}s - {summary.get('total_dependencies', 0)} dependencies")
            
            # Check for partial results
            if analysis.get('partial_result') and analysis['partial_result'].get('hasErrors'):
                partial_result = analysis['partial_result']
                self.log_test("Partial Analysis Handling", True, 
                             f"Handled {len(partial_result['errors'])} partial failures gracefully")
            
            # Step 4: Test dependency tree generation
            response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/dependencies/tree")
            if response.status_code == 200:
                tree_data = response.json()
                if tree_data.get('success'):
                    tree_summary = tree_data['data'].get('summary', {})
                    self.log_test("Dependency Tree", True, 
                                 f"Generated tree with {tree_summary.get('total_dependencies', 0)} dependencies")
                else:
                    self.log_test("Dependency Tree", False, f"Tree generation failed: {tree_data}")
            else:
                self.log_test("Dependency Tree", False, 
                             f"Tree request failed: {response.status_code}")
            
            # Step 5: Test conflict analysis
            response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/analysis/conflicts")
            if response.status_code == 200:
                conflicts = response.json()
                if conflicts.get('success'):
                    conflict_count = len(conflicts['data'].get('conflicts', []))
                    self.log_test("Conflict Analysis", True, f"Found {conflict_count} conflicts")
                else:
                    self.log_test("Conflict Analysis", False, f"Conflict analysis failed: {conflicts}")
            else:
                self.log_test("Conflict Analysis", False, 
                             f"Conflict request failed: {response.status_code}")
            
            # Step 6: Test version extraction
            response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/analysis/versions")
            if response.status_code == 200:
                versions = response.json()
                if versions.get('success'):
                    version_count = versions['data'].get('total_versions', 0)
                    self.log_test("Version Extraction", True, f"Extracted {version_count} versions")
                else:
                    self.log_test("Version Extraction", False, f"Version extraction failed: {versions}")
            else:
                self.log_test("Version Extraction", False, 
                             f"Version request failed: {response.status_code}")
            
            # Step 7: Test SBOM generation
            response = self.session.post(f"{self.base_url}/api/v1/jars/{jar_id}/sbom/generate?format=cyclonedx")
            if response.status_code == 200:
                sbom = response.json()
                if sbom.get('success'):
                    component_count = sbom['data'].get('components_count', 0)
                    self.log_test("SBOM Generation", True, f"Generated SBOM with {component_count} components")
                else:
                    self.log_test("SBOM Generation", False, f"SBOM generation failed: {sbom}")
            else:
                self.log_test("SBOM Generation", False, 
                             f"SBOM request failed: {response.status_code}")
            
            return jar_id
            
        except Exception as e:
            self.log_test("End-to-End Workflow", False, f"Workflow failed: {str(e)}")
            return None
        finally:
            # Cleanup
            try:
                os.unlink(jar_path)
            except OSError:
                pass
    
    def test_search_functionality(self) -> Optional[str]:
        """Test search functionality with large dependency trees."""
        jar_path = self.create_large_dependency_jar()
        
        try:
            # Upload large dependency JAR
            with open(jar_path, 'rb') as f:
                files = {'file': ('large-app.jar', f, 'application/java-archive')}
                response = self.session.post(f"{self.base_url}/api/v1/jars/upload", files=files)
            
            if response.status_code != 200:
                self.log_test("Large JAR Upload", False, f"Upload failed: {response.status_code}")
                return None
            
            jar_id = response.json()['data']['jarFile']['id']
            self.log_test("Large JAR Upload", True, f"Uploaded large JAR: {jar_id}")
            
            # Get comprehensive analysis first
            response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/analysis/comprehensive")
            if response.status_code != 200:
                self.log_test("Large JAR Analysis", False, f"Analysis failed: {response.status_code}")
                return jar_id
            
            analysis_data = response.json()['data']
            total_deps = analysis_data['summary']['total_dependencies']
            self.log_test("Large JAR Analysis", True, f"Analyzed {total_deps} dependencies")
            
            # Test various search queries
            search_tests = [
                ("artifact-1", "exact artifact match"),
                ("group5", "group ID search"),
                ("test", "partial name search"),
                ("1.2.0", "version search"),
                ("compile", "scope search"),
                ("nonexistent", "empty results test")
            ]
            
            for query, description in search_tests:
                start_time = time.time()
                response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/search?q={query}")
                search_time = time.time() - start_time
                
                if response.status_code == 200:
                    search_results = response.json()
                    if search_results.get('success'):
                        result_count = search_results['data']['total']
                        self.log_test(f"Search: {description}", True, 
                                     f"Query '{query}' returned {result_count} results in {search_time:.3f}s")
                        
                        # Performance check
                        if search_time > 2.0:
                            self.log_test(f"Search Performance: {description}", False, 
                                         f"Search took {search_time:.3f}s (>2s limit)")
                        else:
                            self.log_test(f"Search Performance: {description}", True, 
                                         f"Search completed in {search_time:.3f}s")
                    else:
                        self.log_test(f"Search: {description}", False, 
                                     f"Search failed: {search_results}")
                else:
                    self.log_test(f"Search: {description}", False, 
                                 f"Search request failed: {response.status_code}")
            
            # Test advanced search
            response = self.session.get(
                f"{self.base_url}/api/v1/jars/{jar_id}/search/advanced?q=artifact&search_type=filename&max_results=10"
            )
            if response.status_code == 200:
                advanced_results = response.json()
                if advanced_results.get('success'):
                    result_count = len(advanced_results['data']['results'])
                    self.log_test("Advanced Search", True, 
                                 f"Advanced search returned {result_count} results (max 10)")
                else:
                    self.log_test("Advanced Search", False, f"Advanced search failed: {advanced_results}")
            else:
                self.log_test("Advanced Search", False, 
                             f"Advanced search request failed: {response.status_code}")
            
            return jar_id
            
        except Exception as e:
            self.log_test("Search Functionality", False, f"Search test failed: {str(e)}")
            return None
        finally:
            try:
                os.unlink(jar_path)
            except OSError:
                pass
    
    def test_export_functionality(self, jar_id: str):
        """Test export functionality with real JAR data."""
        try:
            # Test 1: Get available export formats
            response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/exports/formats")
            if response.status_code == 200:
                formats = response.json()
                format_count = len(formats.get('formats', []))
                self.log_test("Export Formats", True, f"Found {format_count} export formats")
                
                format_ids = [f['id'] for f in formats.get('formats', [])]
                expected_formats = ['json', 'csv', 'text_tree']
                for fmt in expected_formats:
                    if fmt in format_ids:
                        self.log_test(f"Export Format: {fmt}", True, f"Format {fmt} available")
                    else:
                        self.log_test(f"Export Format: {fmt}", False, f"Format {fmt} missing")
            else:
                self.log_test("Export Formats", False, f"Format request failed: {response.status_code}")
                return
            
            # Test 2: Export preview for each format
            for format_id in ["json", "csv", "text_tree"]:
                response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/exports/preview?format={format_id}")
                if response.status_code == 200:
                    preview = response.json()
                    if 'format' in preview and 'total_dependencies' in preview:
                        deps_count = preview['total_dependencies']
                        estimated_size = preview.get('estimated_size', 0)
                        self.log_test(f"Export Preview: {format_id}", True, 
                                     f"{deps_count} deps, ~{estimated_size} bytes")
                    else:
                        self.log_test(f"Export Preview: {format_id}", False, 
                                     f"Invalid preview response: {preview}")
                else:
                    self.log_test(f"Export Preview: {format_id}", False, 
                                 f"Preview failed: {response.status_code}")
            
            # Test 3: Full export for each format
            export_results = {}
            for format_id in ["json", "csv", "text_tree"]:
                start_time = time.time()
                response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/exports?format={format_id}")
                export_time = time.time() - start_time
                
                if response.status_code == 200:
                    content_length = len(response.content)
                    export_results[format_id] = response.content
                    
                    # Verify content type
                    content_type = response.headers.get("content-type", "")
                    expected_types = {
                        "json": "application/json",
                        "csv": "text/csv",
                        "text_tree": "text/plain"
                    }
                    
                    if expected_types[format_id] in content_type:
                        self.log_test(f"Export: {format_id}", True, 
                                     f"{content_length} bytes in {export_time:.2f}s")
                    else:
                        self.log_test(f"Export Content Type: {format_id}", False, 
                                     f"Expected {expected_types[format_id]}, got {content_type}")
                    
                    # Performance check
                    if export_time > 30.0:
                        self.log_test(f"Export Performance: {format_id}", False, 
                                     f"Export took {export_time:.2f}s (>30s limit)")
                    else:
                        self.log_test(f"Export Performance: {format_id}", True, 
                                     f"Export completed in {export_time:.2f}s")
                else:
                    self.log_test(f"Export: {format_id}", False, 
                                 f"Export failed: {response.status_code}")
            
            # Test 4: Validate export content
            if 'json' in export_results:
                try:
                    json_data = json.loads(export_results['json'])
                    if 'jar_id' in json_data and 'dependencies' in json_data:
                        dep_count = len(json_data['dependencies'])
                        self.log_test("JSON Export Validation", True, 
                                     f"Valid JSON with {dep_count} dependencies")
                    else:
                        self.log_test("JSON Export Validation", False, 
                                     "JSON missing required fields")
                except json.JSONDecodeError as e:
                    self.log_test("JSON Export Validation", False, f"Invalid JSON: {str(e)}")
            
            if 'csv' in export_results:
                try:
                    csv_content = export_results['csv'].decode('utf-8')
                    csv_reader = csv.reader(io.StringIO(csv_content))
                    headers = next(csv_reader)
                    rows = list(csv_reader)
                    
                    expected_headers = ["Group ID", "Artifact ID", "Version"]
                    if all(h in headers for h in expected_headers):
                        self.log_test("CSV Export Validation", True, 
                                     f"Valid CSV with {len(rows)} rows")
                    else:
                        self.log_test("CSV Export Validation", False, 
                                     f"CSV missing expected headers: {expected_headers}")
                except Exception as e:
                    self.log_test("CSV Export Validation", False, f"CSV validation failed: {str(e)}")
            
            if 'text_tree' in export_results:
                text_content = export_results['text_tree'].decode('utf-8')
                if "Dependency Tree" in text_content and "Total Dependencies:" in text_content:
                    self.log_test("Text Tree Export Validation", True, 
                                 f"Valid text tree ({len(text_content)} chars)")
                else:
                    self.log_test("Text Tree Export Validation", False, 
                                 "Text tree missing expected content")
            
            # Test 5: Export with filters
            response = self.session.get(
                f"{self.base_url}/api/v1/jars/{jar_id}/exports?format=json&include_transitive=false"
            )
            if response.status_code == 200:
                filtered_data = json.loads(response.content)
                original_count = json_data.get('statistics', {}).get('total_dependencies', 0)
                filtered_count = filtered_data.get('statistics', {}).get('total_dependencies', 0)
                
                if filtered_count <= original_count:
                    self.log_test("Filtered Export", True, 
                                 f"Filtered export: {filtered_count} <= {original_count} dependencies")
                else:
                    self.log_test("Filtered Export", False, 
                                 f"Filtered export has more deps: {filtered_count} > {original_count}")
            else:
                self.log_test("Filtered Export", False, f"Filtered export failed: {response.status_code}")
                
        except Exception as e:
            self.log_test("Export Functionality", False, f"Export test failed: {str(e)}")
    
    def test_error_handling_scenarios(self):
        """Test error handling and recovery scenarios."""
        try:
            # Test 1: Invalid JAR file
            with tempfile.NamedTemporaryFile(suffix='.jar', delete=False) as temp_file:
                temp_file.write(b'This is not a valid JAR file')
                temp_file.flush()
                
                try:
                    with open(temp_file.name, 'rb') as f:
                        files = {'file': ('invalid.jar', f, 'application/java-archive')}
                        response = self.session.post(f"{self.base_url}/api/v1/jars/upload", files=files)
                    
                    if response.status_code in [400, 422]:
                        error_data = response.json()
                        if not error_data.get('success') and 'error' in error_data:
                            self.log_test("Invalid JAR Handling", True, 
                                         f"Invalid JAR rejected properly: {error_data['error']}")
                        else:
                            self.log_test("Invalid JAR Handling", False, 
                                         f"Invalid response format: {error_data}")
                    else:
                        self.log_test("Invalid JAR Handling", False, 
                                     f"Invalid JAR not rejected: {response.status_code}")
                finally:
                    os.unlink(temp_file.name)
            
            # Test 2: Non-existent JAR ID
            non_existent_id = "non-existent-jar-id-12345"
            endpoints_to_test = [
                f"/api/v1/jars/{non_existent_id}/metadata",
                f"/api/v1/jars/{non_existent_id}/analysis/comprehensive",
                f"/api/v1/jars/{non_existent_id}/dependencies/tree",
                f"/api/v1/jars/{non_existent_id}/analysis/conflicts",
                f"/api/v1/jars/{non_existent_id}/exports/preview"
            ]
            
            for endpoint in endpoints_to_test:
                response = self.session.get(f"{self.base_url}{endpoint}")
                if response.status_code == 404:
                    error_data = response.json()
                    if not error_data.get('success') and 'error' in error_data:
                        self.log_test(f"404 Handling: {endpoint.split('/')[-1]}", True, 
                                     "Non-existent JAR handled properly")
                    else:
                        self.log_test(f"404 Handling: {endpoint.split('/')[-1]}", False, 
                                     f"Invalid error response: {error_data}")
                else:
                    self.log_test(f"404 Handling: {endpoint.split('/')[-1]}", False, 
                                 f"Expected 404, got {response.status_code}")
            
            # Test 3: Invalid export parameters
            # First create a valid JAR for testing
            jar_path = self.create_complex_jar()
            try:
                with open(jar_path, 'rb') as f:
                    files = {'file': ('test.jar', f, 'application/java-archive')}
                    response = self.session.post(f"{self.base_url}/api/v1/jars/upload", files=files)
                
                if response.status_code == 200:
                    jar_id = response.json()['data']['jarFile']['id']
                    
                    # Test invalid export format
                    response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/exports?format=invalid_format")
                    if response.status_code == 400:
                        self.log_test("Invalid Export Format", True, "Invalid format rejected")
                    else:
                        self.log_test("Invalid Export Format", False, 
                                     f"Invalid format not rejected: {response.status_code}")
                    
                    # Test invalid scope
                    response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/exports?format=json&scope=invalid_scope")
                    if response.status_code == 400:
                        self.log_test("Invalid Export Scope", True, "Invalid scope rejected")
                    else:
                        self.log_test("Invalid Export Scope", False, 
                                     f"Invalid scope not rejected: {response.status_code}")
            finally:
                os.unlink(jar_path)
                
        except Exception as e:
            self.log_test("Error Handling Tests", False, f"Error handling test failed: {str(e)}")
    
    def test_concurrent_requests(self, jar_id: str):
        """Test concurrent request handling."""
        try:
            def make_request(endpoint):
                response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/{endpoint}")
                return endpoint, response.status_code, response.json() if response.status_code == 200 else None
            
            endpoints = [
                "analysis/comprehensive",
                "analysis/versions",
                "analysis/conflicts",
                "dependencies/tree"
            ]
            
            start_time = time.time()
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
                futures = [executor.submit(make_request, endpoint) for endpoint in endpoints]
                results = [future.result() for future in concurrent.futures.as_completed(futures)]
            
            concurrent_time = time.time() - start_time
            
            # Check all requests succeeded
            success_count = sum(1 for _, status, _ in results if status == 200)
            
            if success_count == len(endpoints):
                self.log_test("Concurrent Requests", True, 
                             f"All {len(endpoints)} concurrent requests succeeded in {concurrent_time:.2f}s")
            else:
                self.log_test("Concurrent Requests", False, 
                             f"Only {success_count}/{len(endpoints)} concurrent requests succeeded")
            
            # Performance check
            if concurrent_time < 10.0:
                self.log_test("Concurrent Performance", True, 
                             f"Concurrent requests completed in {concurrent_time:.2f}s")
            else:
                self.log_test("Concurrent Performance", False, 
                             f"Concurrent requests took {concurrent_time:.2f}s (>10s limit)")
                
        except Exception as e:
            self.log_test("Concurrent Requests", False, f"Concurrent test failed: {str(e)}")
    
    def test_performance_benchmarks(self, jar_id: str):
        """Test performance benchmarks."""
        try:
            # Test comprehensive analysis performance
            start_time = time.time()
            response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/analysis/comprehensive")
            analysis_time = time.time() - start_time
            
            if response.status_code == 200:
                analysis_data = response.json()['data']
                total_deps = analysis_data['summary']['total_dependencies']
                
                # Performance targets
                if analysis_time < 60.0:
                    self.log_test("Analysis Performance", True, 
                                 f"Analysis of {total_deps} deps in {analysis_time:.2f}s")
                else:
                    self.log_test("Analysis Performance", False, 
                                 f"Analysis took {analysis_time:.2f}s (>60s limit)")
                
                # Throughput calculation
                if total_deps > 0:
                    throughput = total_deps / analysis_time
                    self.log_test("Analysis Throughput", True, 
                                 f"{throughput:.1f} dependencies/second")
            
            # Test search performance
            search_queries = ["spring", "test", "com", "1.0"]
            total_search_time = 0
            
            for query in search_queries:
                start_time = time.time()
                response = self.session.get(f"{self.base_url}/api/v1/jars/{jar_id}/search?q={query}")
                search_time = time.time() - start_time
                total_search_time += search_time
                
                if response.status_code == 200 and search_time < 2.0:
                    result_count = response.json()['data']['total']
                    self.log_test(f"Search Performance: {query}", True, 
                                 f"{result_count} results in {search_time:.3f}s")
                elif search_time >= 2.0:
                    self.log_test(f"Search Performance: {query}", False, 
                                 f"Search took {search_time:.3f}s (>2s limit)")
            
            avg_search_time = total_search_time / len(search_queries)
            self.log_test("Average Search Performance", True, 
                         f"Average search time: {avg_search_time:.3f}s")
                         
        except Exception as e:
            self.log_test("Performance Benchmarks", False, f"Performance test failed: {str(e)}")
    
    def run_all_tests(self):
        """Run all integration tests."""
        print("🚀 Starting Complete Workflow Integration Tests")
        print("=" * 60)
        
        # Test 1: Backend health
        if not self.test_backend_health():
            print("❌ Backend not available, stopping tests")
            return False
        
        # Test 2: End-to-end workflow
        jar_id = self.test_end_to_end_workflow()
        if not jar_id:
            print("❌ End-to-end workflow failed, stopping tests")
            return False
        
        # Test 3: Search functionality
        search_jar_id = self.test_search_functionality()
        
        # Test 4: Export functionality (use the first JAR)
        self.test_export_functionality(jar_id)
        
        # Test 5: Error handling
        self.test_error_handling_scenarios()
        
        # Test 6: Concurrent requests
        self.test_concurrent_requests(jar_id)
        
        # Test 7: Performance benchmarks
        self.test_performance_benchmarks(jar_id)
        
        # Cleanup
        try:
            self.session.delete(f"{self.base_url}/api/v1/jars/{jar_id}")
            if search_jar_id and search_jar_id != jar_id:
                self.session.delete(f"{self.base_url}/api/v1/jars/{search_jar_id}")
        except:
            pass
        
        return True
    
    def print_summary(self):
        """Print test summary."""
        print("\n" + "=" * 60)
        print("📊 Test Summary")
        print("=" * 60)
        
        total = self.results['total_tests']
        passed = self.results['passed_tests']
        failed = self.results['failed_tests']
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed} ✅")
        print(f"Failed: {failed} ❌")
        print(f"Success Rate: {(passed/total*100):.1f}%" if total > 0 else "No tests run")
        
        if failed > 0:
            print("\n❌ Failed Tests:")
            for test in self.results['test_details']:
                if not test['success']:
                    print(f"  - {test['name']}: {test['message']}")
        
        print("\n" + "=" * 60)
        
        return failed == 0


def main():
    """Main function."""
    parser = argparse.ArgumentParser(description='Complete workflow integration tests')
    parser.add_argument('--base-url', default='http://localhost:8000', 
                       help='Base URL for the backend API')
    parser.add_argument('--verbose', action='store_true', 
                       help='Enable verbose output')
    
    args = parser.parse_args()
    
    tester = WorkflowTester(args.base_url)
    
    try:
        success = tester.run_all_tests()
        all_passed = tester.print_summary()
        
        if all_passed:
            print("🎉 All integration tests passed!")
            sys.exit(0)
        else:
            print("💥 Some integration tests failed!")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n⚠️ Tests interrupted by user")
        tester.print_summary()
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Test runner failed: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
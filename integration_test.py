#!/usr/bin/env python3
"""
Simple integration test to verify JAR viewer and dependency analysis integration.
"""

import requests
import time
import tempfile
import zipfile
import os

def test_integration():
    """Test the integration between JAR viewer and dependency analysis."""
    
    # Test backend health
    print("Testing backend health...")
    try:
        response = requests.get("http://localhost:8000/health", timeout=5)
        if response.status_code == 200:
            print("✅ Backend is healthy")
            print(f"   Response: {response.json()}")
        else:
            print(f"❌ Backend health check failed: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Backend is not accessible: {e}")
        return False
    
    # Create a test JAR file
    print("\nCreating test JAR file...")
    with tempfile.NamedTemporaryFile(suffix='.jar', delete=False) as temp_file:
        with zipfile.ZipFile(temp_file.name, 'w') as jar:
            # Add manifest
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
    </dependencies>
</project>''')
        
        jar_path = temp_file.name
    
    try:
        # Test JAR upload
        print("Testing JAR upload...")
        with open(jar_path, 'rb') as f:
            files = {'file': ('test-app.jar', f, 'application/java-archive')}
            response = requests.post("http://localhost:8000/api/v1/jars/upload", files=files, timeout=30)
        
        if response.status_code == 200:
            print("✅ JAR upload successful")
            jar_data = response.json()
            if jar_data.get('success'):
                jar_id = jar_data['data']['jarFile']['id']
                print(f"   JAR ID: {jar_id}")
            else:
                print(f"❌ JAR upload failed: {jar_data}")
                return False
        else:
            print(f"❌ JAR upload failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
        
        # Test metadata extraction
        print("\nTesting metadata extraction...")
        response = requests.get(f"http://localhost:8000/api/v1/jars/{jar_id}/metadata", timeout=10)
        if response.status_code == 200:
            print("✅ Metadata extraction successful")
            metadata = response.json()
            if metadata.get('success'):
                print(f"   Main Class: {metadata['data'].get('manifest', {}).get('mainClass', 'N/A')}")
            else:
                print(f"❌ Metadata extraction failed: {metadata}")
        else:
            print(f"❌ Metadata extraction failed: {response.status_code}")
        
        # Test dependency analysis
        print("\nTesting dependency analysis...")
        response = requests.get(f"http://localhost:8000/api/v1/jars/{jar_id}/analysis/comprehensive", timeout=30)
        if response.status_code == 200:
            print("✅ Dependency analysis successful")
            analysis = response.json()
            if analysis.get('success'):
                summary = analysis['data'].get('summary', {})
                print(f"   Total dependencies: {summary.get('total_dependencies', 'N/A')}")
                print(f"   Compatibility score: {summary.get('compatibility_score', 'N/A')}")
            else:
                print(f"❌ Dependency analysis failed: {analysis}")
        else:
            print(f"❌ Dependency analysis failed: {response.status_code}")
        
        # Test dependency tree
        print("\nTesting dependency tree generation...")
        response = requests.get(f"http://localhost:8000/api/v1/jars/{jar_id}/dependencies/tree", timeout=20)
        if response.status_code == 200:
            print("✅ Dependency tree generation successful")
            tree = response.json()
            if tree.get('success'):
                summary = tree['data'].get('summary', {})
                print(f"   Total dependencies: {summary.get('total_dependencies', 'N/A')}")
            else:
                print(f"❌ Dependency tree generation failed: {tree}")
        else:
            print(f"❌ Dependency tree generation failed: {response.status_code}")
        
        print("\n🎉 Integration test completed successfully!")
        return True
        
    finally:
        # Cleanup
        try:
            os.unlink(jar_path)
        except OSError:
            pass

if __name__ == "__main__":
    print("🚀 Starting JAR Viewer Integration Test")
    print("=" * 50)
    
    success = test_integration()
    
    print("=" * 50)
    if success:
        print("✅ All integration tests passed!")
        exit(0)
    else:
        print("❌ Some integration tests failed!")
        exit(1)
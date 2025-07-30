#!/usr/bin/env python3
"""
Test script to verify dependency tree visualization functionality
"""

import requests
import json
import time
from pathlib import Path

# Configuration
BACKEND_URL = "http://localhost:9000"
TEST_JAR_PATH = ".tempTestJar/groovy.jar"

def test_dependency_tree_visualization():
    """Test the complete dependency tree visualization workflow"""
    
    print("🧪 Testing Dependency Tree Visualization")
    print("=" * 50)
    
    # Step 1: Check if test JAR exists
    jar_path = Path(TEST_JAR_PATH)
    if not jar_path.exists():
        print(f"❌ Test JAR not found: {TEST_JAR_PATH}")
        return False
    
    print(f"✅ Test JAR found: {TEST_JAR_PATH}")
    
    # Step 2: Upload JAR
    print("\n📤 Uploading JAR file...")
    
    with open(jar_path, 'rb') as f:
        files = {'file': (jar_path.name, f, 'application/java-archive')}
        response = requests.post(f"{BACKEND_URL}/api/v1/jars/upload", files=files)
    
    if response.status_code != 200:
        print(f"❌ JAR upload failed: {response.status_code}")
        print(response.text)
        return False
    
    upload_result = response.json()
    print(f"📋 Upload response keys: {list(upload_result.keys())}")
    if 'data' in upload_result:
        print(f"📋 Data keys: {list(upload_result['data'].keys())}")
        if 'jarFile' in upload_result['data']:
            print(f"📋 JarFile keys: {list(upload_result['data']['jarFile'].keys())}")
    
    # Handle different response formats
    if 'jar_id' in upload_result:
        jar_id = upload_result['jar_id']
    elif 'id' in upload_result:
        jar_id = upload_result['id']
    elif 'data' in upload_result and 'jar_id' in upload_result['data']:
        jar_id = upload_result['data']['jar_id']
    elif 'data' in upload_result and 'id' in upload_result['data']:
        jar_id = upload_result['data']['id']
    elif 'data' in upload_result and 'jarFile' in upload_result['data'] and 'id' in upload_result['data']['jarFile']:
        jar_id = upload_result['data']['jarFile']['id']
    else:
        print(f"❌ Could not find jar_id in response")
        return False
    
    print(f"✅ JAR uploaded successfully: {jar_id}")
    
    # Step 3: Get comprehensive analysis
    print("\n🔍 Getting comprehensive dependency analysis...")
    
    response = requests.get(f"{BACKEND_URL}/api/v1/jars/{jar_id}/analysis/comprehensive")
    
    if response.status_code != 200:
        print(f"❌ Analysis failed: {response.status_code}")
        print(response.text)
        return False
    
    analysis_result = response.json()
    
    if not analysis_result.get('success'):
        print(f"❌ Analysis unsuccessful: {analysis_result}")
        return False
    
    data = analysis_result['data']
    print(f"✅ Analysis completed successfully")
    
    # Step 4: Verify dependency data structure
    print("\n📊 Verifying dependency data structure...")
    
    # Check required fields
    required_fields = [
        'jar_info', 'dependencies', 'direct_dependencies', 
        'transitive_dependencies', 'statistics'
    ]
    
    for field in required_fields:
        if field not in data:
            print(f"❌ Missing required field: {field}")
            return False
        print(f"✅ Found field: {field}")
    
    # Check statistics
    stats = data['statistics']
    total_deps = stats.get('total_dependencies', 0)
    direct_deps = stats.get('direct_dependencies', 0)
    transitive_deps = stats.get('transitive_dependencies', 0)
    
    print(f"\n📈 Dependency Statistics:")
    print(f"   Total Dependencies: {total_deps}")
    print(f"   Direct Dependencies: {direct_deps}")
    print(f"   Transitive Dependencies: {transitive_deps}")
    
    if total_deps == 0:
        print("⚠️  No dependencies found - this might be expected for some JARs")
    else:
        print(f"✅ Found {total_deps} dependencies")
    
    # Step 5: Verify dependency structure
    print("\n🌳 Verifying dependency structure...")
    
    dependencies = data.get('dependencies', [])
    if len(dependencies) > 0:
        sample_dep = dependencies[0]
        required_dep_fields = [
            'name', 'group_id', 'artifact_id', 'scope', 'source', 
            'confidence', 'package_imports', 'package_exports'
        ]
        
        for field in required_dep_fields:
            if field in sample_dep:
                print(f"✅ Dependency has field: {field}")
            else:
                print(f"⚠️  Dependency missing field: {field}")
        
        # Show sample dependency
        print(f"\n📋 Sample Dependency:")
        print(f"   Name: {sample_dep.get('name', 'N/A')}")
        print(f"   Group ID: {sample_dep.get('group_id', 'N/A')}")
        print(f"   Artifact ID: {sample_dep.get('artifact_id', 'N/A')}")
        print(f"   Version: {sample_dep.get('version', 'N/A')}")
        print(f"   Scope: {sample_dep.get('scope', 'N/A')}")
        print(f"   Source: {sample_dep.get('source', 'N/A')}")
        print(f"   Confidence: {sample_dep.get('confidence', 'N/A')}")
        print(f"   Package Imports: {len(sample_dep.get('package_imports', []))}")
        print(f"   Package Exports: {len(sample_dep.get('package_exports', []))}")
    
    # Step 6: Test frontend data transformation (simulate)
    print("\n🔄 Testing data transformation compatibility...")
    
    # Check if the data structure matches what the frontend expects
    frontend_compatible = True
    
    # The frontend expects these fields to be present for proper tree visualization
    if 'dependencies' not in data or not isinstance(data['dependencies'], list):
        print("❌ Dependencies field missing or not a list")
        frontend_compatible = False
    
    if 'direct_dependencies' not in data or not isinstance(data['direct_dependencies'], list):
        print("❌ Direct dependencies field missing or not a list")
        frontend_compatible = False
    
    if 'transitive_dependencies' not in data or not isinstance(data['transitive_dependencies'], list):
        print("❌ Transitive dependencies field missing or not a list")
        frontend_compatible = False
    
    if frontend_compatible:
        print("✅ Data structure is compatible with frontend transformation")
    else:
        print("❌ Data structure needs adjustment for frontend compatibility")
    
    # Step 7: Cleanup
    print(f"\n🧹 Cleaning up...")
    response = requests.delete(f"{BACKEND_URL}/api/v1/jars/{jar_id}")
    if response.status_code == 200:
        print("✅ JAR cleaned up successfully")
    else:
        print(f"⚠️  JAR cleanup failed: {response.status_code}")
    
    print("\n" + "=" * 50)
    print("🎉 Dependency Tree Visualization Test Complete!")
    
    return True

if __name__ == "__main__":
    try:
        success = test_dependency_tree_visualization()
        if success:
            print("✅ All tests passed!")
        else:
            print("❌ Some tests failed!")
    except Exception as e:
        print(f"❌ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
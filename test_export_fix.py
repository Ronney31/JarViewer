#!/usr/bin/env python3
"""
Test script to verify export functionality fix
"""

import requests
import json
from pathlib import Path

# Configuration
BACKEND_URL = "http://localhost:9000"
TEST_JAR_PATH = ".tempTestJar/groovy.jar"

def test_export_functionality():
    """Test the export functionality after the fix"""
    
    print("🧪 Testing Export Functionality Fix")
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
    jar_id = upload_result['data']['jarFile']['id']
    print(f"✅ JAR uploaded successfully: {jar_id}")
    
    # Step 3: Test export formats endpoint
    print("\n📋 Testing export formats endpoint...")
    
    response = requests.get(f"{BACKEND_URL}/api/v1/jars/{jar_id}/exports/formats")
    
    if response.status_code != 200:
        print(f"❌ Export formats failed: {response.status_code}")
        print(response.text)
        return False
    
    formats_result = response.json()
    print(f"✅ Export formats retrieved: {len(formats_result.get('formats', []))} formats available")
    
    # Step 4: Test export preview endpoint
    print("\n🔍 Testing export preview endpoint...")
    
    response = requests.get(
        f"{BACKEND_URL}/api/v1/jars/{jar_id}/exports/preview",
        params={
            'format': 'json',
            'include_transitive': 'true',
            'include_conflicts': 'true',
            'include_metadata': 'true'
        }
    )
    
    if response.status_code != 200:
        print(f"❌ Export preview failed: {response.status_code}")
        print(response.text)
        return False
    
    preview_result = response.json()
    print(f"✅ Export preview successful")
    print(f"   Format: {preview_result.get('format')}")
    print(f"   Filename: {preview_result.get('filename')}")
    print(f"   Total Dependencies: {preview_result.get('total_dependencies')}")
    print(f"   Preview Length: {len(preview_result.get('preview', ''))}")
    
    # Step 5: Test actual export endpoint
    print("\n📦 Testing actual export endpoint...")
    
    response = requests.get(
        f"{BACKEND_URL}/api/v1/jars/{jar_id}/exports",
        params={
            'format': 'json',
            'include_transitive': 'true',
            'include_conflicts': 'true',
            'include_metadata': 'true'
        }
    )
    
    if response.status_code != 200:
        print(f"❌ Export failed: {response.status_code}")
        print(response.text)
        return False
    
    export_result = response.json()
    print(f"✅ Export successful")
    print(f"   Format: {export_result.get('format')}")
    print(f"   Filename: {export_result.get('filename')}")
    print(f"   Size: {export_result.get('size')} bytes")
    print(f"   Total Dependencies: {export_result.get('total_dependencies')}")
    print(f"   Download URL: {export_result.get('download_url')}")
    
    # Step 6: Cleanup
    print(f"\n🧹 Cleaning up...")
    response = requests.delete(f"{BACKEND_URL}/api/v1/jars/{jar_id}")
    if response.status_code == 200:
        print("✅ JAR cleaned up successfully")
    else:
        print(f"⚠️  JAR cleanup failed: {response.status_code}")
    
    print("\n" + "=" * 50)
    print("🎉 Export Functionality Test Complete!")
    
    return True

if __name__ == "__main__":
    try:
        success = test_export_functionality()
        if success:
            print("✅ All export tests passed!")
        else:
            print("❌ Some export tests failed!")
    except Exception as e:
        print(f"❌ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
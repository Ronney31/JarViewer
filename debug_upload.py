#!/usr/bin/env python3
import requests
import json

# Upload a test JAR file
jar_file_path = ".tempTestJar/groovy.jar"

print("🔄 Testing JAR upload...")

try:
    with open(jar_file_path, 'rb') as f:
        files = {'file': f}
        upload_response = requests.post(
            'http://localhost:9000/api/v1/jars/upload',
            files=files,
            timeout=30
        )
    
    print(f"Status Code: {upload_response.status_code}")
    print(f"Response: {upload_response.text}")
    
    if upload_response.status_code == 200:
        data = upload_response.json()
        print(f"JSON Response: {json.dumps(data, indent=2)}")
        
except Exception as e:
    print(f"Error: {str(e)}")
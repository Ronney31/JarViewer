#!/usr/bin/env python3
"""
Integration test runner for single JAR dependency analysis workflow.
Runs both backend and frontend integration tests.
"""

import subprocess
import sys
import os
import time
import signal
import argparse
from pathlib import Path
from typing import Optional, List


class TestRunner:
    """Integration test runner."""
    
    def __init__(self, backend_url: str = "http://localhost:9000", frontend_url: str = "http://localhost:3000"):
        self.backend_url = backend_url
        self.frontend_url = frontend_url
        self.backend_process: Optional[subprocess.Popen] = None
        self.frontend_process: Optional[subprocess.Popen] = None
        
    def check_service_health(self, url: str, service_name: str, timeout: int = 30) -> bool:
        """Check if a service is healthy."""
        import requests
        
        print(f"🔍 Checking {service_name} health at {url}")
        
        for attempt in range(timeout):
            try:
                if service_name == "backend":
                    response = requests.get(f"{url}/health", timeout=5)
                else:
                    response = requests.get(url, timeout=5)
                
                if response.status_code == 200:
                    print(f"✅ {service_name} is healthy")
                    return True
                    
            except requests.exceptions.RequestException:
                pass
            
            if attempt < timeout - 1:
                print(f"⏳ Waiting for {service_name}... ({attempt + 1}/{timeout})")
                time.sleep(1)
        
        print(f"❌ {service_name} is not responding after {timeout} seconds")
        return False
    
    def start_backend(self) -> bool:
        """Start the backend service."""
        backend_dir = Path("backend")
        if not backend_dir.exists():
            print("❌ Backend directory not found")
            return False
        
        print("🚀 Starting backend service...")
        
        try:
            # Check if we're in a virtual environment or need to activate one
            venv_python = backend_dir / ".venv" / "bin" / "python"
            if venv_python.exists():
                python_cmd = str(venv_python)
            else:
                python_cmd = "python"
            
            # Start the backend
            self.backend_process = subprocess.Popen(
                [python_cmd, "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "9000"],
                cwd=backend_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid if os.name != 'nt' else None
            )
            
            # Wait for backend to start
            if self.check_service_health(self.backend_url, "backend"):
                return True
            else:
                self.stop_backend()
                return False
                
        except Exception as e:
            print(f"❌ Failed to start backend: {str(e)}")
            return False
    
    def stop_backend(self):
        """Stop the backend service."""
        if self.backend_process:
            print("🛑 Stopping backend service...")
            try:
                if os.name != 'nt':
                    os.killpg(os.getpgid(self.backend_process.pid), signal.SIGTERM)
                else:
                    self.backend_process.terminate()
                
                self.backend_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                if os.name != 'nt':
                    os.killpg(os.getpgid(self.backend_process.pid), signal.SIGKILL)
                else:
                    self.backend_process.kill()
            except Exception as e:
                print(f"⚠️ Error stopping backend: {str(e)}")
            
            self.backend_process = None
    
    def start_frontend(self) -> bool:
        """Start the frontend service."""
        frontend_dir = Path("frontend")
        if not frontend_dir.exists():
            print("❌ Frontend directory not found")
            return False
        
        print("🚀 Starting frontend service...")
        
        try:
            # Check if node_modules exists
            if not (frontend_dir / "node_modules").exists():
                print("📦 Installing frontend dependencies...")
                install_result = subprocess.run(
                    ["npm", "install"],
                    cwd=frontend_dir,
                    capture_output=True,
                    text=True
                )
                
                if install_result.returncode != 0:
                    print(f"❌ Failed to install frontend dependencies: {install_result.stderr}")
                    return False
            
            # Start the frontend
            self.frontend_process = subprocess.Popen(
                ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"],
                cwd=frontend_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid if os.name != 'nt' else None
            )
            
            # Wait for frontend to start
            if self.check_service_health(self.frontend_url, "frontend"):
                return True
            else:
                self.stop_frontend()
                return False
                
        except Exception as e:
            print(f"❌ Failed to start frontend: {str(e)}")
            return False
    
    def stop_frontend(self):
        """Stop the frontend service."""
        if self.frontend_process:
            print("🛑 Stopping frontend service...")
            try:
                if os.name != 'nt':
                    os.killpg(os.getpgid(self.frontend_process.pid), signal.SIGTERM)
                else:
                    self.frontend_process.terminate()
                
                self.frontend_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                if os.name != 'nt':
                    os.killpg(os.getpgid(self.frontend_process.pid), signal.SIGKILL)
                else:
                    self.frontend_process.kill()
            except Exception as e:
                print(f"⚠️ Error stopping frontend: {str(e)}")
            
            self.frontend_process = None
    
    def run_backend_tests(self) -> bool:
        """Run backend integration tests."""
        print("\n" + "=" * 60)
        print("🧪 Running Backend Integration Tests")
        print("=" * 60)
        
        # Run pytest tests
        backend_dir = Path("backend")
        test_files = [
            "tests/test_integration_complete_workflow.py",
            "tests/test_integration.py"
        ]
        
        all_passed = True
        
        for test_file in test_files:
            test_path = backend_dir / test_file
            if test_path.exists():
                print(f"\n🔬 Running {test_file}...")
                
                try:
                    result = subprocess.run(
                        ["python", "-m", "pytest", str(test_path), "-v", "--tb=short"],
                        cwd=backend_dir,
                        capture_output=True,
                        text=True
                    )
                    
                    if result.returncode == 0:
                        print(f"✅ {test_file} passed")
                        print(result.stdout)
                    else:
                        print(f"❌ {test_file} failed")
                        print(result.stdout)
                        print(result.stderr)
                        all_passed = False
                        
                except Exception as e:
                    print(f"❌ Error running {test_file}: {str(e)}")
                    all_passed = False
            else:
                print(f"⚠️ Test file not found: {test_file}")
        
        # Run standalone integration test
        print(f"\n🔬 Running standalone integration test...")
        try:
            result = subprocess.run(
                ["python", "integration_test_complete_workflow.py", "--base-url", self.backend_url],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                print("✅ Standalone integration test passed")
                print(result.stdout)
            else:
                print("❌ Standalone integration test failed")
                print(result.stdout)
                print(result.stderr)
                all_passed = False
                
        except Exception as e:
            print(f"❌ Error running standalone integration test: {str(e)}")
            all_passed = False
        
        return all_passed
    
    def run_frontend_tests(self) -> bool:
        """Run frontend integration tests."""
        print("\n" + "=" * 60)
        print("🧪 Running Frontend Integration Tests")
        print("=" * 60)
        
        frontend_dir = Path("frontend")
        test_files = [
            "tests/IntegrationCompleteWorkflow.test.tsx",
            "tests/Integration.test.tsx"
        ]
        
        all_passed = True
        
        for test_file in test_files:
            test_path = frontend_dir / test_file
            if test_path.exists():
                print(f"\n🔬 Running {test_file}...")
                
                try:
                    result = subprocess.run(
                        ["npm", "run", "test", "--", "--run", test_file],
                        cwd=frontend_dir,
                        capture_output=True,
                        text=True
                    )
                    
                    if result.returncode == 0:
                        print(f"✅ {test_file} passed")
                        print(result.stdout)
                    else:
                        print(f"❌ {test_file} failed")
                        print(result.stdout)
                        print(result.stderr)
                        all_passed = False
                        
                except Exception as e:
                    print(f"❌ Error running {test_file}: {str(e)}")
                    all_passed = False
            else:
                print(f"⚠️ Test file not found: {test_file}")
        
        return all_passed
    
    def run_all_tests(self, start_services: bool = True, run_backend: bool = True, run_frontend: bool = True) -> bool:
        """Run all integration tests."""
        print("🚀 Starting Complete Workflow Integration Test Suite")
        print("=" * 60)
        
        services_started = False
        
        try:
            # Start services if requested
            if start_services:
                print("🔧 Starting services...")
                
                if run_backend:
                    if not self.start_backend():
                        print("❌ Failed to start backend service")
                        return False
                
                if run_frontend:
                    if not self.start_frontend():
                        print("❌ Failed to start frontend service")
                        if run_backend:
                            self.stop_backend()
                        return False
                
                services_started = True
                print("✅ All services started successfully")
            else:
                # Check if services are already running
                if run_backend and not self.check_service_health(self.backend_url, "backend", timeout=5):
                    print("❌ Backend service is not running")
                    return False
                
                if run_frontend and not self.check_service_health(self.frontend_url, "frontend", timeout=5):
                    print("❌ Frontend service is not running")
                    return False
            
            # Run tests
            all_passed = True
            
            if run_backend:
                backend_passed = self.run_backend_tests()
                all_passed = all_passed and backend_passed
            
            if run_frontend:
                frontend_passed = self.run_frontend_tests()
                all_passed = all_passed and frontend_passed
            
            # Print summary
            print("\n" + "=" * 60)
            print("📊 Integration Test Summary")
            print("=" * 60)
            
            if all_passed:
                print("🎉 All integration tests passed!")
            else:
                print("💥 Some integration tests failed!")
            
            return all_passed
            
        except KeyboardInterrupt:
            print("\n⚠️ Tests interrupted by user")
            return False
            
        finally:
            # Stop services if we started them
            if services_started:
                print("\n🛑 Stopping services...")
                self.stop_frontend()
                self.stop_backend()
                print("✅ Services stopped")
    
    def cleanup(self):
        """Cleanup any running processes."""
        self.stop_frontend()
        self.stop_backend()


def main():
    """Main function."""
    parser = argparse.ArgumentParser(description='Run complete workflow integration tests')
    parser.add_argument('--backend-url', default='http://localhost:9000', 
                       help='Backend service URL')
    parser.add_argument('--frontend-url', default='http://localhost:3000', 
                       help='Frontend service URL')
    parser.add_argument('--no-start-services', action='store_true', 
                       help='Do not start services (assume they are already running)')
    parser.add_argument('--backend-only', action='store_true', 
                       help='Run only backend tests')
    parser.add_argument('--frontend-only', action='store_true', 
                       help='Run only frontend tests')
    parser.add_argument('--list-tests', action='store_true', 
                       help='List available test files')
    
    args = parser.parse_args()
    
    if args.list_tests:
        print("Available test files:")
        print("\nBackend tests:")
        print("  - backend/tests/test_integration_complete_workflow.py")
        print("  - backend/tests/test_integration.py")
        print("  - integration_test_complete_workflow.py")
        print("\nFrontend tests:")
        print("  - frontend/tests/IntegrationCompleteWorkflow.test.tsx")
        print("  - frontend/tests/Integration.test.tsx")
        return
    
    runner = TestRunner(args.backend_url, args.frontend_url)
    
    # Determine what to run
    run_backend = not args.frontend_only
    run_frontend = not args.backend_only
    start_services = not args.no_start_services
    
    try:
        success = runner.run_all_tests(
            start_services=start_services,
            run_backend=run_backend,
            run_frontend=run_frontend
        )
        
        sys.exit(0 if success else 1)
        
    except KeyboardInterrupt:
        print("\n⚠️ Test runner interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Test runner failed: {str(e)}")
        sys.exit(1)
    finally:
        runner.cleanup()


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""
Startup script for the Driver Bookkeeping System
Runs both the Streamlit web app and the mobile API server
"""

import subprocess
import sys
import os
import time
import signal
import threading
from pathlib import Path

def run_streamlit():
    """Run the Streamlit web application"""
    try:
        print("🚀 Starting Streamlit web application...")
        subprocess.run([
            sys.executable, "-m", "streamlit", "run", "1_home.py",
            "--server.port", "8501",
            "--server.address", "0.0.0.0"
        ], check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Streamlit failed to start: {e}")
    except KeyboardInterrupt:
        print("⏹️  Streamlit stopped by user")

def run_mobile_api():
    """Run the mobile API server"""
    try:
        print("📱 Starting mobile API server...")
        subprocess.run([
            sys.executable, "mobile_api.py"
        ], check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Mobile API failed to start: {e}")
    except KeyboardInterrupt:
        print("⏹️  Mobile API stopped by user")

def setup_environment():
    """Set up required environment variables and directories"""
    # Create necessary directories
    directories = [
        "Temp/Mileage",
        "Temp/Record",
        "Temp/Excel",
        "data"
    ]
    
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)
        print(f"📁 Created directory: {directory}")
    
    # Set default environment variables if not already set
    env_vars = {
        "MOBILE_API_KEY": "demo-api-key-change-in-production",
        "PORT": "5000",
        "DEBUG": "true"
    }
    
    for key, value in env_vars.items():
        if not os.getenv(key):
            os.environ[key] = value
            print(f"🔧 Set environment variable: {key}={value}")

def check_dependencies():
    """Check if required dependencies are installed"""
    try:
        import streamlit
        import pandas
        import flask
        import plotly
        print("✅ All dependencies are installed")
        return True
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("📦 Please install dependencies: pip install -r requirements.txt")
        return False

def main():
    """Main function to start both services"""
    print("🏁 Starting Driver Bookkeeping System...")
    
    # Check dependencies
    if not check_dependencies():
        return 1
    
    # Setup environment
    setup_environment()
    
    # Create and start threads for both services
    streamlit_thread = threading.Thread(target=run_streamlit, daemon=True)
    api_thread = threading.Thread(target=run_mobile_api, daemon=True)
    
    try:
        # Start both services
        streamlit_thread.start()
        time.sleep(2)  # Give Streamlit a moment to start
        
        api_thread.start()
        
        print("\n" + "="*60)
        print("🎉 Driver Bookkeeping System is running!")
        print("="*60)
        print("🌐 Web Interface: http://localhost:8501")
        print("📱 Mobile API: http://localhost:5000")
        print("📚 API Documentation: See mobile_app_guide.md")
        print("="*60)
        print("Press Ctrl+C to stop both services")
        print("="*60 + "\n")
        
        # Keep the main thread alive
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n⏹️  Shutting down services...")
        return 0
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
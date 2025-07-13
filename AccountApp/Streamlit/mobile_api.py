from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import uuid
from datetime import datetime
from utils.mileage_tracker import MileageTracker
import os
from typing import Dict, Any

app = Flask(__name__)
CORS(app)  # Enable CORS for mobile app access

# Initialize mileage tracker
tracker = MileageTracker()

# API Key for basic authentication (in production, use proper authentication)
API_KEY = os.getenv('MOBILE_API_KEY', 'your-secret-api-key')

def authenticate_request():
    """Simple API key authentication"""
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return False
    
    token = auth_header.split(' ')[1]
    return token == API_KEY

def create_response(data: Any = None, success: bool = True, message: str = "", status: int = 200):
    """Create standardized API response"""
    response = {
        "success": success,
        "message": message,
        "data": data,
        "timestamp": datetime.now().isoformat()
    }
    return jsonify(response), status

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return create_response({"status": "healthy", "version": "1.0.0"})

@app.route('/api/sessions/start', methods=['POST'])
def start_session():
    """Start a new mileage tracking session"""
    if not authenticate_request():
        return create_response(success=False, message="Unauthorized", status=401)
    
    try:
        data = request.get_json()
        
        if not data:
            return create_response(success=False, message="No data provided", status=400)
        
        # Validate required fields
        required_fields = ['device_id', 'start_location']
        for field in required_fields:
            if field not in data:
                return create_response(success=False, message=f"Missing required field: {field}", status=400)
        
        # Prepare session data
        session_data = {
            'start_time': data.get('start_time', datetime.now().isoformat()),
            'start_location': data['start_location'],
            'start_coordinates': data.get('start_coordinates'),
            'purpose': data.get('purpose', 'Business')
        }
        
        # Start session
        session_id = tracker.start_session(session_data)
        
        if session_id:
            # Record device sync
            tracker.sync_mobile_data(data['device_id'], {
                'action': 'start_session',
                'session_id': session_id,
                'timestamp': datetime.now().isoformat()
            })
            
            return create_response({
                'session_id': session_id,
                'start_time': session_data['start_time']
            }, message="Session started successfully")
        else:
            return create_response(success=False, message="Failed to start session", status=500)
            
    except Exception as e:
        return create_response(success=False, message=f"Error: {str(e)}", status=500)

@app.route('/api/sessions/<session_id>/stop', methods=['POST'])
def stop_session(session_id: str):
    """Stop an active mileage tracking session"""
    if not authenticate_request():
        return create_response(success=False, message="Unauthorized", status=401)
    
    try:
        data = request.get_json() or {}
        
        # Prepare end data
        end_data = {
            'end_time': data.get('end_time', datetime.now().isoformat()),
            'end_location': data.get('end_location'),
            'end_coordinates': data.get('end_coordinates'),
            'miles': data.get('miles', 0)
        }
        
        # Stop session
        if tracker.stop_session(session_id, end_data):
            # Record device sync
            if 'device_id' in data:
                tracker.sync_mobile_data(data['device_id'], {
                    'action': 'stop_session',
                    'session_id': session_id,
                    'timestamp': datetime.now().isoformat()
                })
            
            return create_response({
                'session_id': session_id,
                'end_time': end_data['end_time'],
                'miles': end_data['miles']
            }, message="Session stopped successfully")
        else:
            return create_response(success=False, message="Failed to stop session", status=500)
            
    except Exception as e:
        return create_response(success=False, message=f"Error: {str(e)}", status=500)

@app.route('/api/sessions/active', methods=['GET'])
def get_active_sessions():
    """Get all active tracking sessions"""
    if not authenticate_request():
        return create_response(success=False, message="Unauthorized", status=401)
    
    try:
        sessions = tracker.get_active_sessions()
        return create_response(sessions)
        
    except Exception as e:
        return create_response(success=False, message=f"Error: {str(e)}", status=500)

@app.route('/api/trips', methods=['POST'])
def add_trip():
    """Add a new trip manually"""
    if not authenticate_request():
        return create_response(success=False, message="Unauthorized", status=401)
    
    try:
        data = request.get_json()
        
        if not data:
            return create_response(success=False, message="No data provided", status=400)
        
        # Validate required fields
        required_fields = ['date', 'start_location', 'end_location', 'purpose', 'miles']
        for field in required_fields:
            if field not in data:
                return create_response(success=False, message=f"Missing required field: {field}", status=400)
        
        # Add trip
        if tracker.add_trip(data):
            # Record device sync
            if 'device_id' in data:
                tracker.sync_mobile_data(data['device_id'], {
                    'action': 'add_trip',
                    'trip_data': data,
                    'timestamp': datetime.now().isoformat()
                })
            
            return create_response(data, message="Trip added successfully")
        else:
            return create_response(success=False, message="Failed to add trip", status=500)
            
    except Exception as e:
        return create_response(success=False, message=f"Error: {str(e)}", status=500)

@app.route('/api/trips', methods=['GET'])
def get_trips():
    """Get all trips with optional filtering"""
    if not authenticate_request():
        return create_response(success=False, message="Unauthorized", status=401)
    
    try:
        # Get query parameters
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        purpose = request.args.get('purpose')
        limit = request.args.get('limit', type=int)
        
        # Get all trips
        trips_df = tracker.get_mileage_records()
        
        # Apply filters
        if start_date:
            trips_df = trips_df[trips_df['date'] >= start_date]
        
        if end_date:
            trips_df = trips_df[trips_df['date'] <= end_date]
            
        if purpose:
            trips_df = trips_df[trips_df['purpose'] == purpose]
            
        if limit:
            trips_df = trips_df.head(limit)
        
        # Convert to dict
        trips = trips_df.to_dict('records')
        
        return create_response(trips)
        
    except Exception as e:
        return create_response(success=False, message=f"Error: {str(e)}", status=500)

@app.route('/api/sync', methods=['POST'])
def sync_data():
    """Sync data from mobile device"""
    if not authenticate_request():
        return create_response(success=False, message="Unauthorized", status=401)
    
    try:
        data = request.get_json()
        
        if not data or 'device_id' not in data:
            return create_response(success=False, message="Device ID required", status=400)
        
        device_id = data['device_id']
        sync_data = data.get('sync_data', {})
        
        # Sync data
        if tracker.sync_mobile_data(device_id, sync_data):
            return create_response({
                'device_id': device_id,
                'sync_time': datetime.now().isoformat()
            }, message="Data synced successfully")
        else:
            return create_response(success=False, message="Failed to sync data", status=500)
            
    except Exception as e:
        return create_response(success=False, message=f"Error: {str(e)}", status=500)

@app.route('/api/reports/summary', methods=['GET'])
def get_summary():
    """Get mileage summary for a period"""
    if not authenticate_request():
        return create_response(success=False, message="Unauthorized", status=401)
    
    try:
        # Get query parameters
        year = request.args.get('year', default=datetime.now().year, type=int)
        month = request.args.get('month', default=datetime.now().month, type=int)
        
        # Get summary
        summary = tracker.get_monthly_summary(year, month)
        
        return create_response(summary)
        
    except Exception as e:
        return create_response(success=False, message=f"Error: {str(e)}", status=500)

@app.route('/api/reports/deduction', methods=['GET'])
def get_tax_deduction():
    """Calculate tax deduction for a period"""
    if not authenticate_request():
        return create_response(success=False, message="Unauthorized", status=401)
    
    try:
        # Get query parameters
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if not start_date or not end_date:
            return create_response(success=False, message="Start date and end date are required", status=400)
        
        # Calculate deduction
        deduction = tracker.calculate_tax_deduction(start_date, end_date)
        
        return create_response(deduction)
        
    except Exception as e:
        return create_response(success=False, message=f"Error: {str(e)}", status=500)

@app.errorhandler(404)
def not_found(error):
    return create_response(success=False, message="Endpoint not found", status=404)

@app.errorhandler(500)
def internal_error(error):
    return create_response(success=False, message="Internal server error", status=500)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    print(f"Starting Mobile API server on port {port}")
    print(f"Debug mode: {debug}")
    print(f"API Key: {API_KEY}")
    
    app.run(host='0.0.0.0', port=port, debug=debug)
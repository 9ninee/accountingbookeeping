# Mobile App Integration Guide

This guide explains how to integrate a mobile app with the mileage tracking system.

## API Overview

The mileage tracking system provides a REST API for mobile app integration. The API allows mobile apps to:

- Start and stop mileage tracking sessions
- Add trips manually
- Sync data with the server
- Get trip summaries and reports

## Base URL

When running locally:
```
http://localhost:5000/api
```

For production deployment, replace with your actual server URL.

## Authentication

All API endpoints require authentication using a Bearer token in the Authorization header:

```
Authorization: Bearer your-secret-api-key
```

Set the `MOBILE_API_KEY` environment variable or update the default in `mobile_api.py`.

## Core Endpoints

### 1. Health Check
```
GET /api/health
```
Returns server status and version information.

### 2. Start Tracking Session
```
POST /api/sessions/start
```

**Request Body:**
```json
{
  "device_id": "unique-device-identifier",
  "start_location": "123 Main St, City, State",
  "start_coordinates": "40.7128,-74.0060",
  "purpose": "Business"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Session started successfully",
  "data": {
    "session_id": "uuid-session-id",
    "start_time": "2024-01-01T10:00:00"
  }
}
```

### 3. Stop Tracking Session
```
POST /api/sessions/{session_id}/stop
```

**Request Body:**
```json
{
  "device_id": "unique-device-identifier",
  "end_location": "456 Oak Ave, City, State",
  "end_coordinates": "40.7580,-73.9855",
  "miles": 5.2
}
```

### 4. Add Trip Manually
```
POST /api/trips
```

**Request Body:**
```json
{
  "device_id": "unique-device-identifier",
  "date": "2024-01-01",
  "start_time": "10:00:00",
  "end_time": "10:30:00",
  "start_location": "123 Main St, City, State",
  "end_location": "456 Oak Ave, City, State",
  "purpose": "Business",
  "miles": 5.2,
  "notes": "Client meeting"
}
```

### 5. Get Trips
```
GET /api/trips?start_date=2024-01-01&end_date=2024-01-31&purpose=Business&limit=50
```

### 6. Sync Data
```
POST /api/sync
```

**Request Body:**
```json
{
  "device_id": "unique-device-identifier",
  "sync_data": {
    "trips": [
      {
        "date": "2024-01-01",
        "start_location": "Location A",
        "end_location": "Location B",
        "purpose": "Business",
        "miles": 10.5
      }
    ]
  }
}
```

## Mobile App Implementation Guidelines

### 1. Location Tracking
- Use GPS to track location when session is active
- Calculate distance using coordinate differences
- Store location data locally and sync periodically

### 2. Session Management
- Allow users to start/stop tracking manually
- Implement auto-start based on movement detection
- Handle network interruptions gracefully

### 3. Data Storage
- Store trips locally using SQLite or similar
- Implement offline functionality
- Sync with server when connection is available

### 4. User Interface
- Simple start/stop button
- Trip history view
- Settings for default trip purpose
- Sync status indicator

### 5. Battery Optimization
- Use geofencing to detect significant location changes
- Implement smart tracking intervals
- Allow users to disable background tracking

## Example Mobile App Flow

1. **App Launch**: Check for active sessions and connection status
2. **Start Trip**: User taps "Start Tracking" → Call `/api/sessions/start`
3. **Background Tracking**: Monitor location changes, calculate distance
4. **Stop Trip**: User taps "Stop Tracking" → Call `/api/sessions/{id}/stop`
5. **Manual Entry**: User adds trip manually → Call `/api/trips`
6. **Sync**: Periodically sync data → Call `/api/sync`

## Error Handling

The API returns standardized error responses:

```json
{
  "success": false,
  "message": "Error description",
  "data": null,
  "timestamp": "2024-01-01T10:00:00"
}
```

Common HTTP status codes:
- 200: Success
- 400: Bad Request (validation errors)
- 401: Unauthorized (invalid API key)
- 500: Internal Server Error

## Running the API Server

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set environment variables:
```bash
export MOBILE_API_KEY=your-secret-api-key
export PORT=5000
export DEBUG=true
```

3. Run the server:
```bash
python mobile_api.py
```

## Security Considerations

- Use HTTPS in production
- Implement proper authentication (OAuth, JWT)
- Validate all input data
- Rate limiting for API endpoints
- Encrypt sensitive data in transit and at rest

## Testing

Use tools like Postman or curl to test the API:

```bash
# Health check
curl -X GET http://localhost:5000/api/health

# Start session
curl -X POST http://localhost:5000/api/sessions/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-api-key" \
  -d '{"device_id": "test-device", "start_location": "Test Location"}'
```

## Mobile App Technologies

Recommended technologies for mobile app development:

### React Native
- Cross-platform development
- Good location tracking libraries
- Easy API integration

### Flutter
- Cross-platform with excellent performance
- Good geolocation plugins
- Native UI components

### Native Development
- iOS: Swift with Core Location
- Android: Kotlin with Location Services

## Sample Code Snippets

### React Native Location Tracking
```javascript
import Geolocation from '@react-native-community/geolocation';

const startTracking = async () => {
  const position = await getCurrentPosition();
  
  const response = await fetch('http://localhost:5000/api/sessions/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-api-key'
    },
    body: JSON.stringify({
      device_id: 'unique-device-id',
      start_location: `${position.coords.latitude},${position.coords.longitude}`,
      start_coordinates: `${position.coords.latitude},${position.coords.longitude}`,
      purpose: 'Business'
    })
  });
  
  const data = await response.json();
  return data.data.session_id;
};
```

### Flutter Location Service
```dart
import 'package:location/location.dart';
import 'package:http/http.dart' as http;

class MileageTracker {
  static Future<String> startSession() async {
    Location location = Location();
    LocationData locationData = await location.getLocation();
    
    final response = await http.post(
      Uri.parse('http://localhost:5000/api/sessions/start'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer your-api-key',
      },
      body: json.encode({
        'device_id': 'unique-device-id',
        'start_location': '${locationData.latitude},${locationData.longitude}',
        'start_coordinates': '${locationData.latitude},${locationData.longitude}',
        'purpose': 'Business',
      }),
    );
    
    final data = json.decode(response.body);
    return data['data']['session_id'];
  }
}
```

This guide provides everything needed to create a mobile app that integrates with your mileage tracking system.
# Driver Bookkeeping System - Mileage Tracking

A comprehensive automated bookkeeping system for self-employed drivers with advanced mileage tracking capabilities.

## 🚀 New Features Added

### Mileage Tracking System
- **Automated mileage tracking** with start/stop functionality
- **Mobile app integration** via REST API
- **Real-time session management**
- **Comprehensive reporting** with tax deduction calculations
- **Data backup and restore** capabilities
- **Multi-purpose trip categorization** (Business, Personal, Commute, etc.)

### Enhanced Expense Management
- **Bank statement upload** with automatic categorization
- **AI-powered transaction categorization** using OpenAI API
- **Fuzzy matching** for similar transactions
- **Business type recognition** based on keywords
- **Historical learning** from previous categorizations

## 📋 System Requirements

- Python 3.8 or higher
- 2GB RAM minimum
- 500MB free disk space
- Internet connection for AI categorization (optional)

## 🛠️ Installation

1. **Clone the repository** (if not already done):
```bash
git clone <repository-url>
cd AccountApp/Streamlit
```

2. **Install dependencies**:
```bash
pip install -r requirements.txt
```

3. **Set up environment variables** (optional):
```bash
export MOBILE_API_KEY=your-secret-api-key
export OPENAI_API_KEY=your-openai-api-key  # For AI categorization
export PORT=5000
export DEBUG=true
```

4. **Run the system**:
```bash
python run_app.py
```

## 🌐 Access Points

After starting the system, you can access:

- **Web Interface**: http://localhost:8501
- **Mobile API**: http://localhost:5000
- **API Health Check**: http://localhost:5000/api/health

## 📱 Features Overview

### 1. Expense Tracking
- Upload bank statements (CSV format)
- Automatic transaction categorization
- Manual category assignment
- Fuzzy matching for similar transactions
- Business type recognition

### 2. Mileage Tracking
- Manual trip entry
- Start/stop tracking sessions
- Mobile app integration
- GPS coordinate support
- Multiple trip purposes

### 3. Reporting
- Monthly/quarterly/yearly reports
- Tax deduction calculations
- Export to CSV
- Visual charts and graphs
- Summary statistics

### 4. Mobile Integration
- REST API for mobile apps
- Real-time session sync
- Offline data storage
- Background tracking support

## 🎯 How to Use

### Web Interface Usage

1. **Dashboard**: View all transactions and mileage records
2. **File Uploader**: Upload bank statements for expense tracking
3. **Categories**: Manage and assign transaction categories
4. **Mileage Tracker**: Record and manage driving records
5. **Reports**: Generate comprehensive reports

### Mobile App Integration

1. **Start Tracking**: Begin a new mileage session
2. **Background Monitoring**: App tracks location and distance
3. **Stop Tracking**: End session and record trip
4. **Sync Data**: Upload to central server
5. **Offline Mode**: Continue tracking without internet

## 🔧 Configuration

### Mileage Rates
- **Business Rate**: $0.67/mile (2024 IRS standard)
- **Personal Rate**: $0.22/mile
- Configurable in Settings tab

### API Authentication
- Set `MOBILE_API_KEY` environment variable
- Use Bearer token authentication
- Default key: `demo-api-key-change-in-production`

### Data Storage
- **SQLite database** for mileage records
- **CSV files** for expense data
- **JSON files** for settings and configuration
- **Automatic backups** available

## 📊 Database Schema

### Trips Table
```sql
CREATE TABLE trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    start_location TEXT,
    end_location TEXT,
    purpose TEXT NOT NULL,
    miles REAL NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Active Sessions Table
```sql
CREATE TABLE active_sessions (
    id TEXT PRIMARY KEY,
    start_time TEXT NOT NULL,
    start_location TEXT,
    start_coordinates TEXT,
    purpose TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## 🔌 API Endpoints

### Core Endpoints
- `GET /api/health` - Health check
- `POST /api/sessions/start` - Start tracking
- `POST /api/sessions/{id}/stop` - Stop tracking
- `GET /api/sessions/active` - Get active sessions
- `POST /api/trips` - Add trip manually
- `GET /api/trips` - Get all trips
- `POST /api/sync` - Sync mobile data

### Reporting Endpoints
- `GET /api/reports/summary` - Monthly summary
- `GET /api/reports/deduction` - Tax deduction calculation

## 🔒 Security Features

- **API Key authentication**
- **Input validation** for all endpoints
- **SQL injection protection**
- **Data encryption** recommendations
- **Rate limiting** guidelines

## 📱 Mobile App Development

### Recommended Technologies
- **React Native** - Cross-platform development
- **Flutter** - High-performance cross-platform
- **Native iOS/Android** - Platform-specific optimization

### Key Features to Implement
- GPS location tracking
- Background processing
- Offline data storage
- Push notifications
- Battery optimization
- Geofencing

## 🚨 Troubleshooting

### Common Issues

1. **Dependencies not installed**:
```bash
pip install -r requirements.txt
```

2. **Port already in use**:
```bash
export PORT=5001  # Use different port
```

3. **Database permissions**:
```bash
chmod 755 Temp/Mileage/  # Fix directory permissions
```

4. **API authentication failed**:
```bash
export MOBILE_API_KEY=your-new-api-key
```

### Log Files
- Check console output for errors
- API server logs to stdout
- Streamlit logs to browser console

## 🔧 Development

### Project Structure
```
AccountApp/Streamlit/
├── 1_home.py                 # Main dashboard
├── pages/
│   ├── 2_File_uploader.py    # Bank statement upload
│   ├── 3_Categories_uploader.py  # Transaction categorization
│   └── 5_Mileage_Tracker.py  # Mileage tracking interface
├── utils/
│   ├── auto_categorizer.py   # AI categorization
│   └── mileage_tracker.py    # Mileage tracking logic
├── mobile_api.py             # Mobile API server
├── run_app.py               # Startup script
└── requirements.txt         # Dependencies
```

### Testing
- Unit tests for core functions
- API endpoint testing with Postman
- Mobile app integration testing
- Database integrity checks

## 📈 Performance Optimization

### Database Optimization
- Index frequently queried columns
- Regular database cleanup
- Batch operations for large datasets
- Connection pooling

### API Performance
- Implement caching for frequent requests
- Use pagination for large result sets
- Async processing for heavy operations
- Rate limiting to prevent abuse

## 🔄 Data Migration

### Backup Creation
```bash
python -c "from utils.mileage_tracker import MileageTracker; t = MileageTracker(); print(t.backup_data())" > backup.json
```

### Data Restore
- Use the backup/restore functionality in Settings
- Import CSV files for bulk data
- API endpoints for programmatic data entry

## 🚀 Deployment

### Local Development
```bash
python run_app.py
```

### Production Deployment
- Use HTTPS for all connections
- Set strong API keys
- Configure proper database
- Enable logging
- Set up monitoring

### Docker Deployment
```dockerfile
FROM python:3.9-slim
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8501 5000
CMD ["python", "run_app.py"]
```

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Review the API documentation
3. Check console logs for errors
4. Create detailed issue reports

## 🎯 Future Enhancements

- **Real-time GPS tracking**
- **Automatic trip detection**
- **Integration with accounting software**
- **Advanced reporting dashboards**
- **Machine learning for route optimization**
- **Multi-user support**
- **Cloud synchronization**

## 📄 License

This project is for educational and business use. Please ensure compliance with local tax regulations when using for business purposes.

---

**Happy Tracking! 🚗💨**
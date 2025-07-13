# 🚀 Quick Start Guide

## ⚡ Get Running in 2 Minutes

### 1. Setup Environment
```bash
cd AccountApp/Streamlit
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Start the System
```bash
python run_app.py
```

### 3. Access Your App
- **Web Dashboard**: http://localhost:8501
- **Mobile API**: http://localhost:5000

## 🎯 What You'll See

### Dashboard (http://localhost:8501)
- **Home**: Transaction overview with filtering
- **File Uploader**: Bank statement upload
- **Categories**: AI-powered transaction categorization
- **Mileage Tracker**: Complete mileage management
- **Reports**: Tax-ready summaries

### Mobile API (http://localhost:5000/api/health)
- **Health Check**: `GET /api/health`
- **Start Trip**: `POST /api/sessions/start`
- **Stop Trip**: `POST /api/sessions/{id}/stop`
- **Add Trip**: `POST /api/trips`
- **Get Trips**: `GET /api/trips`

## 📊 Test with Sample Data

The system includes sample data to test immediately:
- **3 sample transactions** (Fuel, Maintenance, Parking)
- **Sample mileage trips** for testing
- **Working charts and reports**

## 🔧 Quick Commands

```bash
# Test components individually
python -c "from utils.mileage_tracker import MileageTracker; print('✓ Working')"

# Run just the web app
streamlit run 1_home.py --server.port=8501

# Run just the API
python mobile_api.py
```

## 🎉 You're Ready!

Your automated bookkeeping system is now running and ready for self-employed drivers to:
- Upload bank statements
- Track mileage automatically
- Generate tax reports
- Use mobile app integration

**Need help?** Check `TESTING_RESULTS.md` for detailed testing info or `FINAL_SUMMARY.md` for complete system overview.
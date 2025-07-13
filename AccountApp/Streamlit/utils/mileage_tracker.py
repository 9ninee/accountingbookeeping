import pandas as pd
import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union
import uuid
from pathlib import Path
import sqlite3
import hashlib

class MileageTracker:
    def __init__(self, data_dir: str = "Temp/Mileage"):
        """
        Initialize the MileageTracker with data directory and database setup
        
        Args:
            data_dir: Directory to store mileage data
        """
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        # File paths
        self.trips_file = self.data_dir / "trips.csv"
        self.sessions_file = self.data_dir / "active_sessions.json"
        self.settings_file = self.data_dir / "settings.json"
        self.db_file = self.data_dir / "mileage.db"
        
        # Initialize database
        self._init_database()
        
        # Load settings
        self.settings = self._load_settings()
        
        # Initialize active sessions
        self.active_sessions = self._load_active_sessions()
    
    def _init_database(self):
        """Initialize SQLite database for mileage tracking"""
        conn = sqlite3.connect(str(self.db_file))
        cursor = conn.cursor()
        
        # Create trips table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS trips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                start_time TEXT,
                end_time TEXT,
                start_location TEXT,
                end_location TEXT,
                purpose TEXT NOT NULL,
                miles REAL NOT NULL,
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create sessions table for active tracking
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS active_sessions (
                id TEXT PRIMARY KEY,
                start_time TEXT NOT NULL,
                start_location TEXT,
                start_coordinates TEXT,
                purpose TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create sync table for mobile app integration
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS mobile_sync (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                last_sync TEXT NOT NULL,
                sync_data TEXT
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def _load_settings(self) -> Dict:
        """Load settings from file or create default settings"""
        default_settings = {
            "business_rate": 0.67,  # IRS 2024 standard mileage rate
            "personal_rate": 0.22,
            "auto_start": False,
            "min_trip_distance": 1.0,
            "currency": "USD",
            "distance_unit": "miles"
        }
        
        if self.settings_file.exists():
            try:
                with open(self.settings_file, 'r') as f:
                    settings = json.load(f)
                    # Merge with defaults for any missing keys
                    return {**default_settings, **settings}
            except (json.JSONDecodeError, Exception):
                pass
        
        return default_settings
    
    def _load_active_sessions(self) -> List[Dict]:
        """Load active tracking sessions"""
        if self.sessions_file.exists():
            try:
                with open(self.sessions_file, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, Exception):
                pass
        return []
    
    def save_settings(self, settings: Dict) -> bool:
        """Save settings to file"""
        try:
            self.settings.update(settings)
            with open(self.settings_file, 'w') as f:
                json.dump(self.settings, f, indent=2)
            return True
        except Exception as e:
            print(f"Error saving settings: {e}")
            return False
    
    def add_trip(self, trip_data: Dict) -> bool:
        """
        Add a new trip to the database
        
        Args:
            trip_data: Dictionary containing trip information
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            conn = sqlite3.connect(str(self.db_file))
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO trips (date, start_time, end_time, start_location, end_location, 
                                 purpose, miles, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                trip_data.get('date'),
                trip_data.get('start_time'),
                trip_data.get('end_time'),
                trip_data.get('start_location'),
                trip_data.get('end_location'),
                trip_data.get('purpose'),
                trip_data.get('miles'),
                trip_data.get('notes', '')
            ))
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            print(f"Error adding trip: {e}")
            return False
    
    def get_mileage_records(self) -> pd.DataFrame:
        """Get all mileage records as pandas DataFrame"""
        try:
            conn = sqlite3.connect(str(self.db_file))
            df = pd.read_sql_query('''
                SELECT date, start_time, end_time, start_location, end_location, 
                       purpose, miles, notes, created_at
                FROM trips
                ORDER BY date DESC, start_time DESC
            ''', conn)
            conn.close()
            return df
        except Exception as e:
            print(f"Error loading mileage records: {e}")
            return pd.DataFrame()
    
    def delete_trips(self, trip_ids: List[int]) -> bool:
        """Delete selected trips by their indices"""
        try:
            # Get the actual trip IDs from the database
            conn = sqlite3.connect(str(self.db_file))
            cursor = conn.cursor()
            
            # Get all trip IDs ordered by date DESC
            cursor.execute('''
                SELECT id FROM trips 
                ORDER BY date DESC, start_time DESC
            ''')
            
            all_ids = [row[0] for row in cursor.fetchall()]
            
            # Convert indices to actual IDs
            ids_to_delete = [all_ids[i] for i in trip_ids if i < len(all_ids)]
            
            if ids_to_delete:
                placeholders = ','.join(['?' for _ in ids_to_delete])
                cursor.execute(f'DELETE FROM trips WHERE id IN ({placeholders})', ids_to_delete)
                conn.commit()
            
            conn.close()
            return True
            
        except Exception as e:
            print(f"Error deleting trips: {e}")
            return False
    
    def start_session(self, session_data: Dict) -> Optional[str]:
        """
        Start a new tracking session
        
        Args:
            session_data: Dictionary containing session start information
            
        Returns:
            Optional[str]: Session ID if successful, None otherwise
        """
        try:
            session_id = str(uuid.uuid4())
            
            conn = sqlite3.connect(str(self.db_file))
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO active_sessions (id, start_time, start_location, start_coordinates, purpose)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                session_id,
                session_data.get('start_time', datetime.now().isoformat()),
                session_data.get('start_location'),
                session_data.get('start_coordinates'),
                session_data.get('purpose', 'Business')
            ))
            
            conn.commit()
            conn.close()
            return session_id
            
        except Exception as e:
            print(f"Error starting session: {e}")
            return None
    
    def stop_session(self, session_id: str, end_data: Optional[Dict] = None) -> bool:
        """
        Stop an active tracking session and convert to trip
        
        Args:
            session_id: ID of the session to stop
            end_data: Optional end location and time data
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            conn = sqlite3.connect(str(self.db_file))
            cursor = conn.cursor()
            
            # Get session data
            cursor.execute('SELECT * FROM active_sessions WHERE id = ?', (session_id,))
            session = cursor.fetchone()
            
            if not session:
                return False
            
            # Convert to trip (you might want to calculate actual miles here)
            trip_data = {
                'date': session[1][:10],  # Extract date from start_time
                'start_time': session[1],
                'end_time': end_data.get('end_time', datetime.now().isoformat()) if end_data else datetime.now().isoformat(),
                'start_location': session[2],
                'end_location': end_data.get('end_location', 'Unknown') if end_data else 'Unknown',
                'purpose': session[4] or 'Business',
                'miles': end_data.get('miles', 0) if end_data else 0,
                'notes': f"Automatically tracked session {session_id}"
            }
            
            # Add as trip
            self.add_trip(trip_data)
            
            # Remove from active sessions
            cursor.execute('DELETE FROM active_sessions WHERE id = ?', (session_id,))
            conn.commit()
            conn.close()
            
            return True
            
        except Exception as e:
            print(f"Error stopping session: {e}")
            return False
    
    def get_active_sessions(self) -> List[Dict]:
        """Get all active tracking sessions"""
        try:
            conn = sqlite3.connect(str(self.db_file))
            cursor = conn.cursor()
            
            cursor.execute('SELECT * FROM active_sessions ORDER BY created_at DESC')
            sessions = cursor.fetchall()
            
            conn.close()
            
            return [
                {
                    'id': session[0],
                    'start_time': session[1],
                    'start_location': session[2],
                    'start_coordinates': session[3],
                    'purpose': session[4]
                }
                for session in sessions
            ]
            
        except Exception as e:
            print(f"Error getting active sessions: {e}")
            return []
    
    def check_mobile_connection(self) -> Optional[Dict]:
        """Check mobile app connection status"""
        try:
            conn = sqlite3.connect(str(self.db_file))
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT device_id, last_sync, sync_data 
                FROM mobile_sync 
                ORDER BY last_sync DESC 
                LIMIT 1
            ''')
            
            result = cursor.fetchone()
            conn.close()
            
            if result:
                return {
                    'device_id': result[0],
                    'last_sync': result[1],
                    'sync_data': json.loads(result[2]) if result[2] else {}
                }
            
            return None
            
        except Exception as e:
            print(f"Error checking mobile connection: {e}")
            return None
    
    def sync_mobile_data(self, device_id: str, sync_data: Dict) -> bool:
        """Sync data from mobile app"""
        try:
            conn = sqlite3.connect(str(self.db_file))
            cursor = conn.cursor()
            
            # Update or insert sync record
            cursor.execute('''
                INSERT OR REPLACE INTO mobile_sync (device_id, last_sync, sync_data)
                VALUES (?, ?, ?)
            ''', (
                device_id,
                datetime.now().isoformat(),
                json.dumps(sync_data)
            ))
            
            # Process any trips in sync data
            if 'trips' in sync_data:
                for trip in sync_data['trips']:
                    self.add_trip(trip)
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            print(f"Error syncing mobile data: {e}")
            return False
    
    def backup_data(self) -> Optional[str]:
        """Create a backup of all mileage data"""
        try:
            backup_data = {
                'trips': self.get_mileage_records().to_dict('records'),
                'active_sessions': self.get_active_sessions(),
                'settings': self.settings,
                'backup_timestamp': datetime.now().isoformat()
            }
            
            return json.dumps(backup_data, indent=2)
            
        except Exception as e:
            print(f"Error creating backup: {e}")
            return None
    
    def restore_data(self, backup_file) -> bool:
        """Restore data from backup file"""
        try:
            backup_data = json.loads(backup_file.read())
            
            # Restore trips
            if 'trips' in backup_data:
                for trip in backup_data['trips']:
                    self.add_trip(trip)
            
            # Restore settings
            if 'settings' in backup_data:
                self.save_settings(backup_data['settings'])
            
            return True
            
        except Exception as e:
            print(f"Error restoring data: {e}")
            return False
    
    def calculate_tax_deduction(self, start_date: str, end_date: str) -> Dict:
        """Calculate tax deduction for a given period"""
        try:
            conn = sqlite3.connect(str(self.db_file))
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT purpose, SUM(miles) as total_miles
                FROM trips
                WHERE date >= ? AND date <= ?
                GROUP BY purpose
            ''', (start_date, end_date))
            
            results = cursor.fetchall()
            conn.close()
            
            deductions = {}
            total_deduction = 0
            
            for purpose, miles in results:
                if purpose == 'Business':
                    deduction = miles * self.settings['business_rate']
                else:
                    deduction = miles * self.settings['personal_rate']
                
                deductions[purpose] = {
                    'miles': miles,
                    'rate': self.settings['business_rate'] if purpose == 'Business' else self.settings['personal_rate'],
                    'deduction': deduction
                }
                
                total_deduction += deduction
            
            return {
                'period': f"{start_date} to {end_date}",
                'deductions': deductions,
                'total_deduction': total_deduction
            }
            
        except Exception as e:
            print(f"Error calculating tax deduction: {e}")
            return {}
    
    def get_monthly_summary(self, year: int, month: int) -> Dict:
        """Get monthly summary of mileage"""
        try:
            start_date = f"{year}-{month:02d}-01"
            
            # Calculate end date
            if month == 12:
                end_date = f"{year + 1}-01-01"
            else:
                end_date = f"{year}-{month + 1:02d}-01"
            
            conn = sqlite3.connect(str(self.db_file))
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT 
                    COUNT(*) as total_trips,
                    SUM(miles) as total_miles,
                    AVG(miles) as avg_trip_miles,
                    purpose,
                    COUNT(*) as purpose_count
                FROM trips
                WHERE date >= ? AND date < ?
                GROUP BY purpose
            ''', (start_date, end_date))
            
            results = cursor.fetchall()
            conn.close()
            
            summary = {
                'year': year,
                'month': month,
                'total_trips': sum(row[0] for row in results),
                'total_miles': sum(row[1] for row in results),
                'by_purpose': {}
            }
            
            for row in results:
                purpose = row[3]
                summary['by_purpose'][purpose] = {
                    'trips': row[4],
                    'miles': row[1],
                    'avg_miles': row[2]
                }
            
            return summary
            
        except Exception as e:
            print(f"Error getting monthly summary: {e}")
            return {}
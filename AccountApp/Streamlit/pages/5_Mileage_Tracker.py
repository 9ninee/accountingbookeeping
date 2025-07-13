import streamlit as st
import pandas as pd
from st_aggrid import AgGrid
from st_aggrid.grid_options_builder import GridOptionsBuilder
from datetime import datetime, date
import json
import os
from utils.mileage_tracker import MileageTracker
import folium
from streamlit_folium import folium_static

st.set_page_config(page_title="Mileage Tracker", layout="wide")

st.title("🚗 Mileage Tracker")

# Initialize mileage tracker
@st.cache_resource
def get_mileage_tracker():
    return MileageTracker()

tracker = get_mileage_tracker()

# Create tabs for different functionalities
tab1, tab2, tab3, tab4 = st.tabs(["📱 Mobile Sync", "📊 Mileage Records", "📈 Reports", "⚙️ Settings"])

with tab1:
    st.header("Mobile App Integration")
    
    # Display QR code for mobile app connection
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("Quick Start Session")
        
        # Manual trip entry
        with st.form("manual_trip"):
            st.write("**Start a New Trip Manually**")
            
            trip_date = st.date_input("Date", value=date.today())
            start_time = st.time_input("Start Time", value=datetime.now().time())
            
            start_location = st.text_input("Starting Location", placeholder="123 Main St, City, State")
            end_location = st.text_input("Ending Location", placeholder="456 Oak Ave, City, State")
            
            trip_purpose = st.selectbox(
                "Trip Purpose",
                ["Business", "Personal", "Commute", "Client Visit", "Delivery", "Other"]
            )
            
            odometer_start = st.number_input("Starting Odometer", min_value=0, value=0)
            odometer_end = st.number_input("Ending Odometer", min_value=0, value=0)
            
            notes = st.text_area("Notes (Optional)", placeholder="Additional details about the trip")
            
            if st.form_submit_button("Add Trip"):
                if start_location and end_location and odometer_end > odometer_start:
                    miles = odometer_end - odometer_start
                    trip_data = {
                        "date": trip_date.isoformat(),
                        "start_time": start_time.isoformat(),
                        "start_location": start_location,
                        "end_location": end_location,
                        "purpose": trip_purpose,
                        "miles": miles,
                        "notes": notes
                    }
                    
                    if tracker.add_trip(trip_data):
                        st.success(f"Trip added successfully! {miles} miles recorded.")
                        st.rerun()
                    else:
                        st.error("Failed to add trip. Please try again.")
                else:
                    st.error("Please fill in all required fields and ensure ending odometer is greater than starting odometer.")
    
    with col2:
        st.subheader("Active Tracking Sessions")
        
        # Display active sessions
        active_sessions = tracker.get_active_sessions()
        
        if active_sessions:
            for session in active_sessions:
                with st.container():
                    st.write(f"**Session ID:** {session['id']}")
                    st.write(f"**Started:** {session['start_time']}")
                    st.write(f"**Location:** {session['start_location']}")
                    
                    if st.button(f"Stop Session {session['id']}", key=f"stop_{session['id']}"):
                        if tracker.stop_session(session['id']):
                            st.success("Session stopped successfully!")
                            st.rerun()
        else:
            st.info("No active tracking sessions")
        
        # Mobile app connection status
        st.subheader("Mobile App Status")
        connection_status = tracker.check_mobile_connection()
        
        if connection_status:
            st.success("📱 Mobile app connected")
            st.write(f"Last sync: {connection_status.get('last_sync', 'Never')}")
        else:
            st.warning("📱 Mobile app not connected")
            st.write("Download the companion mobile app to enable automatic mileage tracking.")

with tab2:
    st.header("Mileage Records")
    
    # Load mileage data
    mileage_df = tracker.get_mileage_records()
    
    if not mileage_df.empty:
        # Filter options
        col1, col2, col3 = st.columns(3)
        
        with col1:
            date_filter = st.date_input("Filter by Date Range", value=[])
        
        with col2:
            purpose_filter = st.multiselect(
                "Filter by Purpose",
                options=mileage_df['purpose'].unique(),
                default=mileage_df['purpose'].unique()
            )
        
        with col3:
            min_miles = st.number_input("Minimum Miles", min_value=0, value=0)
        
        # Apply filters
        filtered_df = mileage_df[
            (mileage_df['purpose'].isin(purpose_filter)) &
            (mileage_df['miles'] >= min_miles)
        ]
        
        if date_filter:
            if len(date_filter) == 2:
                filtered_df = filtered_df[
                    (pd.to_datetime(filtered_df['date']) >= pd.to_datetime(date_filter[0])) &
                    (pd.to_datetime(filtered_df['date']) <= pd.to_datetime(date_filter[1]))
                ]
        
        # Display records in editable grid
        st.subheader(f"Records ({len(filtered_df)} trips)")
        
        # Configure grid options
        gb = GridOptionsBuilder.from_dataframe(filtered_df)
        gb.configure_pagination(paginationAutoPageSize=True)
        gb.configure_default_column(editable=True, groupable=True)
        gb.configure_selection(selection_mode='multiple', use_checkbox=True)
        
        grid_response = AgGrid(
            filtered_df,
            gridOptions=gb.build(),
            update_mode='MODEL_CHANGED',
            fit_columns_on_grid_load=True,
            theme='alpine'
        )
        
        # Actions for selected rows
        if grid_response['selected_rows']:
            st.subheader("Actions")
            col1, col2 = st.columns(2)
            
            with col1:
                if st.button("Delete Selected"):
                    selected_indices = [row['_selectedRowNodeInfo']['nodeRowIndex'] for row in grid_response['selected_rows']]
                    if tracker.delete_trips(selected_indices):
                        st.success("Selected trips deleted successfully!")
                        st.rerun()
            
            with col2:
                if st.button("Export Selected"):
                    selected_data = pd.DataFrame(grid_response['selected_rows'])
                    csv = selected_data.to_csv(index=False)
                    st.download_button(
                        label="Download CSV",
                        data=csv,
                        file_name=f"mileage_records_{datetime.now().strftime('%Y%m%d')}.csv",
                        mime="text/csv"
                    )
        
        # Summary statistics
        st.subheader("Summary")
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            total_miles = filtered_df['miles'].sum()
            st.metric("Total Miles", f"{total_miles:,.1f}")
        
        with col2:
            business_miles = filtered_df[filtered_df['purpose'] == 'Business']['miles'].sum()
            st.metric("Business Miles", f"{business_miles:,.1f}")
        
        with col3:
            avg_trip = filtered_df['miles'].mean()
            st.metric("Average Trip", f"{avg_trip:,.1f}" if not pd.isna(avg_trip) else "0")
        
        with col4:
            total_trips = len(filtered_df)
            st.metric("Total Trips", total_trips)
    
    else:
        st.info("No mileage records found. Start tracking your trips to see them here!")

with tab3:
    st.header("Mileage Reports")
    
    # Load data for reports
    mileage_df = tracker.get_mileage_records()
    
    if not mileage_df.empty:
        # Convert date column to datetime
        mileage_df['date'] = pd.to_datetime(mileage_df['date'])
        
        # Report period selection
        report_period = st.selectbox(
            "Select Report Period",
            ["Monthly", "Quarterly", "Yearly", "Custom Range"]
        )
        
        if report_period == "Custom Range":
            col1, col2 = st.columns(2)
            with col1:
                start_date = st.date_input("Start Date")
            with col2:
                end_date = st.date_input("End Date")
        else:
            # Auto-generate date range based on period
            end_date = datetime.now().date()
            if report_period == "Monthly":
                start_date = end_date.replace(day=1)
            elif report_period == "Quarterly":
                quarter_start = ((end_date.month - 1) // 3) * 3 + 1
                start_date = end_date.replace(month=quarter_start, day=1)
            else:  # Yearly
                start_date = end_date.replace(month=1, day=1)
        
        # Filter data by date range
        report_df = mileage_df[
            (mileage_df['date'] >= pd.to_datetime(start_date)) &
            (mileage_df['date'] <= pd.to_datetime(end_date))
        ]
        
        if not report_df.empty:
            # Generate report
            st.subheader(f"Report for {start_date} to {end_date}")
            
            # Key metrics
            col1, col2, col3 = st.columns(3)
            
            with col1:
                total_miles = report_df['miles'].sum()
                st.metric("Total Miles", f"{total_miles:,.1f}")
            
            with col2:
                business_miles = report_df[report_df['purpose'] == 'Business']['miles'].sum()
                business_rate = 0.67  # 2024 IRS mileage rate
                deduction = business_miles * business_rate
                st.metric("Business Deduction", f"${deduction:,.2f}")
            
            with col3:
                avg_daily = total_miles / ((pd.to_datetime(end_date) - pd.to_datetime(start_date)).days + 1)
                st.metric("Avg Daily Miles", f"{avg_daily:.1f}")
            
            # Charts
            import plotly.express as px
            
            # Miles by purpose
            purpose_summary = report_df.groupby('purpose')['miles'].sum().reset_index()
            fig1 = px.pie(purpose_summary, values='miles', names='purpose', title='Miles by Purpose')
            st.plotly_chart(fig1, use_container_width=True)
            
            # Daily miles trend
            daily_summary = report_df.groupby('date')['miles'].sum().reset_index()
            fig2 = px.line(daily_summary, x='date', y='miles', title='Daily Miles Trend')
            st.plotly_chart(fig2, use_container_width=True)
            
            # Export report
            if st.button("Export Report"):
                report_csv = report_df.to_csv(index=False)
                st.download_button(
                    label="Download Report CSV",
                    data=report_csv,
                    file_name=f"mileage_report_{start_date}_{end_date}.csv",
                    mime="text/csv"
                )
        else:
            st.info("No data available for the selected period.")
    
    else:
        st.info("No mileage data available for reporting.")

with tab4:
    st.header("Settings")
    
    # Mileage rate settings
    st.subheader("Mileage Rates")
    
    col1, col2 = st.columns(2)
    
    with col1:
        business_rate = st.number_input("Business Mileage Rate ($/mile)", value=0.67, step=0.01)
        
    with col2:
        personal_rate = st.number_input("Personal Mileage Rate ($/mile)", value=0.22, step=0.01)
    
    # Auto-tracking settings
    st.subheader("Auto-Tracking Settings")
    
    auto_start = st.checkbox("Auto-start tracking when driving detected")
    min_trip_distance = st.number_input("Minimum trip distance (miles)", value=1.0, step=0.1)
    
    # Data management
    st.subheader("Data Management")
    
    col1, col2 = st.columns(2)
    
    with col1:
        if st.button("Backup Data"):
            backup_data = tracker.backup_data()
            if backup_data:
                st.download_button(
                    label="Download Backup",
                    data=backup_data,
                    file_name=f"mileage_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
                    mime="application/json"
                )
    
    with col2:
        uploaded_backup = st.file_uploader("Restore from Backup", type=['json'])
        if uploaded_backup:
            if st.button("Restore Data"):
                if tracker.restore_data(uploaded_backup):
                    st.success("Data restored successfully!")
                    st.rerun()
                else:
                    st.error("Failed to restore data.")
    
    # Save settings
    if st.button("Save Settings"):
        settings = {
            "business_rate": business_rate,
            "personal_rate": personal_rate,
            "auto_start": auto_start,
            "min_trip_distance": min_trip_distance
        }
        
        if tracker.save_settings(settings):
            st.success("Settings saved successfully!")
        else:
            st.error("Failed to save settings.")

# Add some styling
st.markdown("""
<style>
    .metric-container {
        background-color: #f0f2f6;
        padding: 1rem;
        border-radius: 0.5rem;
        margin: 0.5rem 0;
    }
</style>
""", unsafe_allow_html=True)
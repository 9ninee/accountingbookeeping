"""
Supabase client for the Streamlit dashboard.
Reads from the same cloud database as the mobile app.

Setup:
  1. Create a .env file in the Streamlit directory with:
     SUPABASE_URL=https://your-project.supabase.co
     SUPABASE_ANON_KEY=your-anon-key
  2. pip install supabase python-dotenv
"""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")


def is_configured() -> bool:
    return bool(SUPABASE_URL) and bool(SUPABASE_ANON_KEY)


def get_client():
    if not is_configured():
        return None
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def fetch_transactions(user_id: str = None, limit: int = 1000):
    """Fetch transactions from Supabase cloud."""
    import pandas as pd
    client = get_client()
    if not client:
        return pd.DataFrame()

    query = client.table("transactions").select("*").order("date", desc=True).limit(limit)
    if user_id:
        query = query.eq("user_id", user_id)

    result = query.execute()
    if not result.data:
        return pd.DataFrame()

    df = pd.DataFrame(result.data)
    # Map cloud column names to dashboard column names
    column_map = {
        "date": "Transaction Date",
        "description": "Transaction Description",
        "amount": "Amount",
        "currency": "Currency",
        "type": "Type",
        "category": "Categories",
        "merchant_name": "Merchant",
        "import_source": "Source",
        "validation_status": "Status",
    }
    df = df.rename(columns={k: v for k, v in column_map.items() if k in df.columns})

    if "Amount" in df.columns:
        df["Debit Amount"] = df["Amount"].apply(lambda x: abs(x) if x < 0 else 0)
        df["Credit Amount"] = df["Amount"].apply(lambda x: x if x > 0 else 0)

    if "Transaction Date" in df.columns:
        df["Transaction Date"] = pd.to_datetime(df["Transaction Date"], errors="coerce")

    return df


def fetch_mileage_trips(user_id: str = None, limit: int = 500):
    """Fetch mileage trips from Supabase cloud."""
    import pandas as pd
    client = get_client()
    if not client:
        return pd.DataFrame()

    query = client.table("mileage_trips").select("*").order("start_time", desc=True).limit(limit)
    if user_id:
        query = query.eq("user_id", user_id)

    result = query.execute()
    if not result.data:
        return pd.DataFrame()

    return pd.DataFrame(result.data)


def fetch_linked_banks(user_id: str = None):
    """Fetch linked bank accounts from Supabase cloud."""
    import pandas as pd
    client = get_client()
    if not client:
        return pd.DataFrame()

    query = client.table("linked_banks").select("*")
    if user_id:
        query = query.eq("user_id", user_id)

    result = query.execute()
    if not result.data:
        return pd.DataFrame()

    return pd.DataFrame(result.data)

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from pathlib import Path

# ── Design System Colors (matching mobile app) ──
COLORS = {
    "background": "#111125",
    "surface": "#1a1a2e",
    "surfaceContainer": "#1e1e32",
    "surfaceHigh": "#28283d",
    "surfaceHighest": "#333348",
    "primary": "#78dc77",
    "secondary": "#9ecaff",
    "tertiary": "#ffb870",
    "error": "#ffb4ab",
    "onSurface": "#e2e0fc",
    "onSurfaceVariant": "#becab9",
    "outline": "#3f4a3c",
    "income": "#78dc77",
    "expense": "#ffb4ab",
    "personal": "#ffb870",
}

st.set_page_config(
    page_title="Financial Cockpit",
    page_icon="",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Global CSS: Dark theme, Inter + JetBrains Mono fonts ──
st.markdown(f"""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

    /* Root dark theme */
    .stApp {{
        background-color: {COLORS['background']};
        color: {COLORS['onSurface']};
        font-family: 'Inter', sans-serif;
    }}

    /* Sidebar */
    section[data-testid="stSidebar"] {{
        background-color: {COLORS['surface']};
        border-right: 1px solid {COLORS['outline']};
    }}
    section[data-testid="stSidebar"] .stMarkdown p,
    section[data-testid="stSidebar"] label {{
        color: {COLORS['onSurfaceVariant']};
        font-family: 'Inter', sans-serif;
    }}

    /* Headers */
    h1, h2, h3, h4, h5, h6 {{
        font-family: 'Inter', sans-serif !important;
        color: {COLORS['onSurface']} !important;
    }}
    h1 {{ font-weight: 800 !important; letter-spacing: -0.5px; }}
    h2 {{ font-weight: 700 !important; }}
    h3 {{ font-weight: 600 !important; }}

    /* Body text */
    p, span, li, td, th, label, .stMarkdown {{
        font-family: 'Inter', sans-serif;
        color: {COLORS['onSurface']};
    }}

    /* Metric cards */
    [data-testid="stMetric"] {{
        background-color: {COLORS['surfaceContainer']};
        border: 1px solid {COLORS['outline']};
        border-radius: 16px;
        padding: 20px 24px;
    }}
    [data-testid="stMetricLabel"] p {{
        font-family: 'Inter', sans-serif !important;
        font-weight: 600;
        font-size: 12px;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: {COLORS['onSurfaceVariant']} !important;
    }}
    [data-testid="stMetricValue"] {{
        font-family: 'JetBrains Mono', monospace !important;
        font-weight: 700;
        color: {COLORS['onSurface']} !important;
    }}
    [data-testid="stMetricDelta"] {{
        font-family: 'JetBrains Mono', monospace !important;
    }}

    /* Dataframe / table */
    .stDataFrame {{
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid {COLORS['outline']};
    }}
    .stDataFrame [data-testid="stDataFrameResizable"] {{
        background-color: {COLORS['surfaceContainer']};
    }}

    /* Multiselect */
    .stMultiSelect > div > div {{
        background-color: {COLORS['surfaceContainer']};
        border-color: {COLORS['outline']};
        border-radius: 10px;
        color: {COLORS['onSurface']};
    }}

    /* Selectbox */
    .stSelectbox > div > div {{
        background-color: {COLORS['surfaceContainer']};
        border-color: {COLORS['outline']};
        border-radius: 10px;
    }}

    /* Tabs */
    .stTabs [data-baseweb="tab-list"] {{
        gap: 8px;
        background-color: transparent;
    }}
    .stTabs [data-baseweb="tab"] {{
        background-color: {COLORS['surfaceContainer']};
        border-radius: 12px;
        border: 1px solid {COLORS['outline']};
        color: {COLORS['onSurfaceVariant']};
        font-family: 'Inter', sans-serif;
        font-weight: 600;
        padding: 8px 20px;
    }}
    .stTabs [aria-selected="true"] {{
        background-color: {COLORS['primary']}22;
        border-color: {COLORS['primary']}66;
        color: {COLORS['primary']} !important;
    }}

    /* Cards helper */
    .card {{
        background-color: {COLORS['surfaceContainer']};
        border: 1px solid {COLORS['outline']};
        border-radius: 16px;
        padding: 24px;
        margin-bottom: 16px;
    }}
    .card-title {{
        font-family: 'Inter', sans-serif;
        font-weight: 700;
        font-size: 14px;
        color: {COLORS['onSurfaceVariant']};
        text-transform: uppercase;
        letter-spacing: 1.5px;
        margin-bottom: 12px;
    }}
    .card-value {{
        font-family: 'JetBrains Mono', monospace;
        font-weight: 700;
        font-size: 28px;
        line-height: 1.2;
    }}
    .card-value.income {{ color: {COLORS['income']}; }}
    .card-value.expense {{ color: {COLORS['expense']}; }}
    .card-value.personal {{ color: {COLORS['personal']}; }}
    .card-value.secondary {{ color: {COLORS['secondary']}; }}
    .card-subtitle {{
        font-family: 'Inter', sans-serif;
        font-size: 12px;
        color: {COLORS['onSurfaceVariant']};
        margin-top: 8px;
    }}

    /* Section header */
    .section-header {{
        font-family: 'Inter', sans-serif;
        font-weight: 700;
        font-size: 20px;
        color: {COLORS['onSurface']};
        margin: 32px 0 16px 0;
        padding-bottom: 8px;
        border-bottom: 1px solid {COLORS['outline']};
    }}

    /* Remove default streamlit padding */
    .block-container {{
        padding-top: 2rem;
        padding-bottom: 2rem;
    }}

    /* Plotly chart containers */
    .js-plotly-plot .plotly {{
        border-radius: 16px;
    }}
</style>
""", unsafe_allow_html=True)


# ── Data Loading ──
DATA_PATH = Path(__file__).parent / "Temp" / "Record" / "Data.csv"
CAT_PATH = Path(__file__).parent / "Temp" / "Excel" / "Indcat.csv"

# Try importing Supabase client
try:
    from utils.supabase_client import is_configured as supabase_configured, fetch_transactions
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False


@st.cache_data(ttl=300)
def load_data():
    # Try cloud data first
    if HAS_SUPABASE and supabase_configured():
        try:
            cloud_df = fetch_transactions()
            if not cloud_df.empty:
                # Merge with local CSV if it exists
                try:
                    local_df = _load_local_csv()
                    if not local_df.empty:
                        df = pd.concat([cloud_df, local_df], ignore_index=True)
                        df = df.drop_duplicates(
                            subset=["Transaction Date", "Transaction Description", "Debit Amount"],
                            keep="first",
                        )
                        return df
                except Exception:
                    pass
                return cloud_df
        except Exception:
            pass

    # Fallback: local CSV only
    return _load_local_csv()


def _load_local_csv():
    if not DATA_PATH.exists():
        return pd.DataFrame(columns=["Transaction Date", "Transaction Description", "Debit Amount", "Credit Amount", "Categories"])
    df = pd.read_csv(DATA_PATH, encoding="latin1")
    df = df.dropna(axis=1, how="all")
    df = df.loc[:, ~df.columns.str.contains("^Unnamed")]

    if "Transaction Date" in df.columns:
        df["Transaction Date"] = pd.to_datetime(
            df["Transaction Date"], dayfirst=True, errors="coerce"
        )
    if "Debit Amount" in df.columns:
        df["Debit Amount"] = pd.to_numeric(df["Debit Amount"], errors="coerce").fillna(0)
    if "Credit Amount" in df.columns:
        df["Credit Amount"] = pd.to_numeric(df["Credit Amount"], errors="coerce").fillna(0)

    return df


@st.cache_data
def load_categories():
    try:
        cats = pd.read_csv(CAT_PATH)
        return cats["cat_name"].dropna().tolist()
    except Exception:
        return []


df = load_data()
categories_list = load_categories()

# ── Sidebar Filters ──
with st.sidebar:
    st.markdown(f"""
    <div style="text-align:center; margin-bottom:24px;">
        <span style="font-family:'Inter',sans-serif; font-weight:800; font-size:20px; color:{COLORS['primary']};">
            Financial Cockpit
        </span>
        <br/>
        <span style="font-family:'Inter',sans-serif; font-size:12px; color:{COLORS['onSurfaceVariant']};">
            Bookkeeping Dashboard
        </span>
    </div>
    """, unsafe_allow_html=True)

    # Data source indicator
    if HAS_SUPABASE and supabase_configured():
        st.markdown(f'<div style="text-align:center;margin-bottom:16px;padding:6px 12px;border-radius:8px;background:{COLORS["primary"]}1A;"><span style="font-family:Inter;font-size:11px;font-weight:600;color:{COLORS["primary"]};">CLOUD + LOCAL DATA</span></div>', unsafe_allow_html=True)
    else:
        st.markdown(f'<div style="text-align:center;margin-bottom:16px;padding:6px 12px;border-radius:8px;background:{COLORS["surfaceContainer"]};"><span style="font-family:Inter;font-size:11px;font-weight:600;color:{COLORS["onSurfaceVariant"]};">LOCAL CSV DATA</span></div>', unsafe_allow_html=True)

    st.markdown(f'<p style="font-family:Inter,sans-serif;font-weight:600;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:{COLORS["onSurfaceVariant"]};">FILTERS</p>', unsafe_allow_html=True)

    # Date range filter
    if "Transaction Date" in df.columns and df["Transaction Date"].notna().any():
        min_date = df["Transaction Date"].min()
        max_date = df["Transaction Date"].max()
        date_range = st.date_input(
            "Date Range",
            value=(min_date, max_date),
            min_value=min_date,
            max_value=max_date,
        )
    else:
        date_range = None

    # Category filter
    available_cats = df["Categories"].dropna().unique().tolist() if "Categories" in df.columns else []
    selected_cats = st.multiselect(
        "Categories",
        available_cats,
        default=available_cats,
    )

    # Transaction type filter
    txn_type = st.radio(
        "Show",
        ["All", "Debits Only", "Credits Only"],
        horizontal=True,
    )

# ── Apply Filters ──
filtered = df.copy()

if date_range and len(date_range) == 2 and "Transaction Date" in filtered.columns:
    start, end = pd.Timestamp(date_range[0]), pd.Timestamp(date_range[1])
    filtered = filtered[
        (filtered["Transaction Date"] >= start) & (filtered["Transaction Date"] <= end)
    ]

if selected_cats and "Categories" in filtered.columns:
    filtered = filtered[
        filtered["Categories"].isin(selected_cats) | filtered["Categories"].isna()
    ]

if txn_type == "Debits Only":
    filtered = filtered[filtered["Debit Amount"] > 0]
elif txn_type == "Credits Only":
    filtered = filtered[filtered["Credit Amount"] > 0]


# ── Summary Cards ──
total_debit = filtered["Debit Amount"].sum() if "Debit Amount" in filtered.columns else 0
total_credit = filtered["Credit Amount"].sum() if "Credit Amount" in filtered.columns else 0
net = total_credit - total_debit
txn_count = len(filtered)
categorized = filtered["Categories"].notna().sum() if "Categories" in filtered.columns else 0
uncategorized = txn_count - categorized

st.markdown(f"""
<div style="margin-bottom:8px;">
    <span style="font-family:'Inter',sans-serif; font-weight:800; font-size:32px; color:{COLORS['onSurface']}; letter-spacing:-0.5px;">
        Financial Cockpit
    </span>
</div>
""", unsafe_allow_html=True)

# Top summary cards row
c1, c2, c3, c4 = st.columns(4)

with c1:
    st.markdown(f"""
    <div class="card">
        <div class="card-title">Total Income</div>
        <div class="card-value income">£{total_credit:,.2f}</div>
        <div class="card-subtitle">Credits this period</div>
    </div>
    """, unsafe_allow_html=True)

with c2:
    st.markdown(f"""
    <div class="card">
        <div class="card-title">Total Expenses</div>
        <div class="card-value expense">£{total_debit:,.2f}</div>
        <div class="card-subtitle">Debits this period</div>
    </div>
    """, unsafe_allow_html=True)

with c3:
    net_class = "income" if net >= 0 else "expense"
    net_sign = "+" if net >= 0 else ""
    st.markdown(f"""
    <div class="card" style="border-left:4px solid {COLORS['income'] if net >= 0 else COLORS['expense']};">
        <div class="card-title">Net Balance</div>
        <div class="card-value {net_class}">{net_sign}£{abs(net):,.2f}</div>
        <div class="card-subtitle">{'Surplus' if net >= 0 else 'Deficit'}</div>
    </div>
    """, unsafe_allow_html=True)

with c4:
    cat_pct = (categorized / txn_count * 100) if txn_count > 0 else 0
    st.markdown(f"""
    <div class="card">
        <div class="card-title">Transactions</div>
        <div class="card-value secondary">{txn_count:,}</div>
        <div class="card-subtitle">{categorized} categorized ({cat_pct:.0f}%) · {uncategorized} pending</div>
    </div>
    """, unsafe_allow_html=True)


# ── Charts Row ──
st.markdown('<div class="section-header">Analytics</div>', unsafe_allow_html=True)

chart_col1, chart_col2 = st.columns(2)

# Category breakdown pie chart
with chart_col1:
    if "Categories" in filtered.columns:
        cat_data = filtered[filtered["Categories"].notna()].copy()
        if not cat_data.empty and "Debit Amount" in cat_data.columns:
            cat_summary = (
                cat_data.groupby("Categories")["Debit Amount"]
                .sum()
                .sort_values(ascending=False)
                .head(10)
                .reset_index()
            )
            fig_pie = px.pie(
                cat_summary,
                values="Debit Amount",
                names="Categories",
                hole=0.55,
                color_discrete_sequence=[
                    COLORS["primary"], COLORS["secondary"], COLORS["tertiary"],
                    COLORS["error"], "#a78bfa", "#67e8f9", "#fca5a5",
                    "#86efac", "#fde68a", "#c4b5fd",
                ],
            )
            fig_pie.update_layout(
                paper_bgcolor="rgba(0,0,0,0)",
                plot_bgcolor="rgba(0,0,0,0)",
                font=dict(family="Inter, sans-serif", color=COLORS["onSurface"]),
                legend=dict(
                    font=dict(size=11, color=COLORS["onSurfaceVariant"]),
                    bgcolor="rgba(0,0,0,0)",
                ),
                margin=dict(t=40, b=20, l=20, r=20),
                title=dict(
                    text="Expense by Category",
                    font=dict(size=16, family="Inter, sans-serif", color=COLORS["onSurface"]),
                ),
            )
            fig_pie.update_traces(
                textfont=dict(family="JetBrains Mono, monospace", size=11),
                textinfo="percent+label",
            )
            st.plotly_chart(fig_pie, use_container_width=True)

# Monthly trend line chart
with chart_col2:
    if "Transaction Date" in filtered.columns and filtered["Transaction Date"].notna().any():
        monthly = filtered.copy()
        monthly["Month"] = monthly["Transaction Date"].dt.to_period("M").astype(str)
        monthly_agg = monthly.groupby("Month").agg(
            Debits=("Debit Amount", "sum"),
            Credits=("Credit Amount", "sum"),
        ).reset_index()

        fig_trend = go.Figure()
        fig_trend.add_trace(go.Scatter(
            x=monthly_agg["Month"], y=monthly_agg["Credits"],
            mode="lines+markers", name="Income",
            line=dict(color=COLORS["income"], width=3),
            marker=dict(size=8),
        ))
        fig_trend.add_trace(go.Scatter(
            x=monthly_agg["Month"], y=monthly_agg["Debits"],
            mode="lines+markers", name="Expenses",
            line=dict(color=COLORS["expense"], width=3),
            marker=dict(size=8),
        ))
        fig_trend.update_layout(
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            font=dict(family="Inter, sans-serif", color=COLORS["onSurface"]),
            legend=dict(
                font=dict(size=12, color=COLORS["onSurfaceVariant"]),
                bgcolor="rgba(0,0,0,0)",
                orientation="h", yanchor="bottom", y=1.02,
            ),
            margin=dict(t=40, b=20, l=20, r=20),
            title=dict(
                text="Monthly Trend",
                font=dict(size=16, family="Inter, sans-serif", color=COLORS["onSurface"]),
            ),
            xaxis=dict(
                gridcolor=COLORS["outline"],
                tickfont=dict(family="JetBrains Mono, monospace", size=10),
            ),
            yaxis=dict(
                gridcolor=COLORS["outline"],
                tickfont=dict(family="JetBrains Mono, monospace", size=10),
                tickprefix="£",
            ),
        )
        st.plotly_chart(fig_trend, use_container_width=True)


# ── Top Categories Bar ──
if "Categories" in filtered.columns:
    cat_expenses = (
        filtered[filtered["Categories"].notna()]
        .groupby("Categories")["Debit Amount"]
        .sum()
        .sort_values(ascending=True)
        .tail(8)
        .reset_index()
    )
    if not cat_expenses.empty:
        fig_bar = px.bar(
            cat_expenses,
            x="Debit Amount",
            y="Categories",
            orientation="h",
            color_discrete_sequence=[COLORS["primary"]],
        )
        fig_bar.update_layout(
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            font=dict(family="Inter, sans-serif", color=COLORS["onSurface"]),
            margin=dict(t=40, b=20, l=20, r=20),
            title=dict(
                text="Top Expense Categories",
                font=dict(size=16, family="Inter, sans-serif", color=COLORS["onSurface"]),
            ),
            xaxis=dict(
                gridcolor=COLORS["outline"],
                tickfont=dict(family="JetBrains Mono, monospace", size=10),
                tickprefix="£",
            ),
            yaxis=dict(
                tickfont=dict(family="Inter, sans-serif", size=11),
            ),
            showlegend=False,
        )
        fig_bar.update_traces(
            marker_line_width=0,
            marker_cornerradius=6,
        )
        st.plotly_chart(fig_bar, use_container_width=True)


# ── Interactive Transactions Table ──
st.markdown('<div class="section-header">Transactions</div>', unsafe_allow_html=True)

# Table toolbar
tb1, tb2, tb3 = st.columns([2, 2, 1])
with tb1:
    search = st.text_input(
        "Search transactions",
        placeholder="Type to search descriptions...",
        label_visibility="collapsed",
    )
with tb2:
    sort_by = st.selectbox(
        "Sort by",
        ["Transaction Date", "Debit Amount", "Credit Amount", "Categories"],
        label_visibility="collapsed",
    )
with tb3:
    sort_order = st.selectbox("Order", ["Newest First", "Oldest First", "Highest First", "Lowest First"], label_visibility="collapsed")

# Apply search
table_df = filtered.copy()
if search:
    table_df = table_df[
        table_df["Transaction Description"].str.contains(search, case=False, na=False)
    ]

# Apply sort
ascending = sort_order in ["Oldest First", "Lowest First"]
if sort_by in table_df.columns:
    table_df = table_df.sort_values(sort_by, ascending=ascending, na_position="last")

# Format for display
display_df = table_df.copy()
if "Transaction Date" in display_df.columns:
    display_df["Transaction Date"] = display_df["Transaction Date"].dt.strftime("%d %b %Y")
if "Debit Amount" in display_df.columns:
    display_df["Debit Amount"] = display_df["Debit Amount"].apply(
        lambda x: f"£{x:,.2f}" if x > 0 else ""
    )
if "Credit Amount" in display_df.columns:
    display_df["Credit Amount"] = display_df["Credit Amount"].apply(
        lambda x: f"£{x:,.2f}" if x > 0 else ""
    )

# Show interactive dataframe
st.dataframe(
    display_df,
    use_container_width=True,
    height=500,
    column_config={
        "Transaction Date": st.column_config.TextColumn("Date", width="small"),
        "Transaction Description": st.column_config.TextColumn("Description", width="large"),
        "Debit Amount": st.column_config.TextColumn("Debit", width="small"),
        "Credit Amount": st.column_config.TextColumn("Credit", width="small"),
        "Categories": st.column_config.TextColumn("Category", width="medium"),
    },
    hide_index=True,
)

st.markdown(f"""
<div style="text-align:right; margin-top:4px;">
    <span style="font-family:'JetBrains Mono',monospace; font-size:12px; color:{COLORS['onSurfaceVariant']};">
        Showing {len(table_df):,} of {len(df):,} transactions
    </span>
</div>
""", unsafe_allow_html=True)


# ── Uncategorized Transactions ──
if "Categories" in filtered.columns:
    uncat = filtered[filtered["Categories"].isna()]
    if not uncat.empty:
        st.markdown('<div class="section-header">Uncategorized Transactions</div>', unsafe_allow_html=True)
        st.markdown(f"""
        <div class="card" style="border-left:4px solid {COLORS['tertiary']};">
            <div class="card-title">Action Required</div>
            <div class="card-value personal">{len(uncat)}</div>
            <div class="card-subtitle">transactions need categories — go to Categories Uploader page</div>
        </div>
        """, unsafe_allow_html=True)

        uncat_display = uncat[["Transaction Description", "Debit Amount", "Credit Amount"]].copy()
        if "Transaction Date" in uncat.columns:
            uncat_display.insert(0, "Transaction Date", uncat["Transaction Date"].dt.strftime("%d %b %Y"))
        st.dataframe(uncat_display.head(20), use_container_width=True, hide_index=True)

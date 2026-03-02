# 🧾 Automatic Bookkeeping Platform

> A Python + Streamlit web app that ingests UK bank statement exports, automatically maps transactions to categories, and gives you a live filterable dashboard — built for anyone who needs to track personal or business expenses without paying for accounting software.

---

## 📖 Overview

Managing bank statements manually is tedious. This tool automates the process: drop in your exported bank CSV, and it merges it against a growing category lookup table to classify each transaction. Any unrecognised transactions are flagged for you to label — and once labelled, they're remembered for next time.

The whole thing runs as a local **Streamlit** web app with an interactive data grid, so you can filter and explore your spending by category in real time.

---

## ✨ Features

- 📂 **Bank statement ingestion** — reads CSV exports from UK banks (currently supports Lloyds; HSBC and Chase adapters are scaffolded)
- 🤖 **Automatic transaction categorisation** — merges transactions against a saved description→category lookup table
- 🆕 **Unknown transaction flagging** — unrecognised transactions are exported to a separate Excel file for you to categorise manually, then fed back into the lookup for future runs
- 💾 **Persistent category memory** — your categorisation decisions accumulate over time; re-running the script won't lose previous labels
- 🗂️ **Automatic daily backups** — the previous data file is backed up with a date-stamped filename before each update
- 📊 **Interactive Streamlit dashboard** — filter your full transaction history by category using a multiselect widget, powered by `AgGrid`
- 🔢 **Multi-file batch processing** — processes all CSV files in the input folder in one run

---

## 🏗️ Project Structure

```
AccountApp/Streamlit/
│
├── 1_home.py              # Streamlit dashboard — category filter + AgGrid table
├── Acc_Function.py        # Core logic: bank parsers, merge, dedup, backup
├── Test.ipynb             # Development notebook — batch processing workflow
│
└── pages/Temp/
    ├── Excel/             # Drop new bank statement CSVs here
    │   └── DiscriptionCategories.xlsx   # Uncategorised transactions (for manual labelling)
    └── Record/
        ├── Data.csv                     # Master transaction record
        ├── DiscriptionCategories.xlsx   # Saved category lookup table
        └── Backup/                      # Auto date-stamped backups
```

---

## 🚀 Getting Started

### Prerequisites

```bash
pip install streamlit pandas numpy openpyxl streamlit-aggrid
```

### Workflow

**Step 1 — Export your bank statement**
Download a CSV export from your bank (Lloyds format supported out of the box).

**Step 2 — Drop it in the input folder**
Place the CSV in `pages/Temp/Excel/`.

**Step 3 — Run the processing script**
Execute the notebook or script to merge new transactions into your master record. Unrecognised transactions will be saved to `DiscriptionCategories.xlsx`.

**Step 4 — Label new categories**
Open `DiscriptionCategories.xlsx`, fill in the `Categories` column for any new transactions, and save.

**Step 5 — Re-run to apply labels**
Run the merge again — your new labels are now saved into the lookup table and applied automatically in future.

**Step 6 — View the dashboard**
```bash
streamlit run 1_home.py
```
Open your browser and filter transactions by category interactively.

---

## 🏦 Supported Banks

| Bank | Status |
|---|---|
| Lloyds | ✅ Supported |
| HSBC | 🔧 Scaffolded (in progress) |
| Chase | 🔧 Scaffolded (in progress) |

The `bank` class in `Acc_Function.py` is designed to be extended — add a new method for any bank whose CSV format you want to support.

---

## 🗺️ Scalability & Future Directions

- **🏦 More bank adapters** — complete HSBC and Chase parsers; add Monzo, Starling, Barclays, NatWest
- **📊 Spending analytics** — pie/bar charts breaking down expenses by category and month (chart code is partially scaffolded in `1_home.py`)
- **🤖 ML-assisted categorisation** — train a text classifier on your labelled descriptions to auto-suggest categories for new transactions
- **☁️ Open Banking API** — replace manual CSV exports with automatic transaction fetching via [TrueLayer](https://truelayer.com) or [Plaid](https://plaid.com)
- **📤 Tax-ready export** — generate HMRC self-assessment compatible expense summaries
- **🌐 Multi-user support** — extend to support multiple accounts or users with separate data stores
- **📱 Mobile UI** — wrap the Streamlit app for mobile-friendly use

---

## 🏷️ Related

[#Python](https://github.com) · [#Streamlit](https://streamlit.io) · [#Pandas](https://pandas.pydata.org) · [#OpenBanking](https://www.openbanking.org.uk) · [#PersonalFinance](https://github.com) · [#Automation](https://github.com) · [#FinTech](https://github.com)

**Companies & platforms in this space:** [TrueLayer](https://truelayer.com) · [Plaid](https://plaid.com) · [Monzo](https://monzo.com) · [Starling Bank](https://www.starlingbank.com) · [Xero](https://www.xero.com/uk/) · [FreeAgent](https://www.freeagent.com) · [HMRC](https://www.gov.uk/self-assessment-tax-returns)

---

## 📄 Licence

MIT — free to use, modify, and share.

---

*Built to automate the boring part of personal finance — so you can focus on the decisions, not the data entry.*

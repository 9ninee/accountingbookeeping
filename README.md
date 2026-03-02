# 🧾 Automatic Bookkeeping Platform for Self-Employed Drivers

> A Python-based bookkeeping automation tool that reads bank statements, automatically categorises transactions, and generates tax-ready expense summaries — built specifically for self-employed drivers (Uber, Bolt, delivery platforms, and more).

---

## 📖 Overview

Self-employed drivers face a recurring problem: manually sorting through hundreds of monthly bank transactions to separate business expenses from personal spending — fuel, insurance, platform fees, vehicle maintenance — before filing taxes or reviewing profitability.

This tool automates that entire process. Upload your bank statement, and it handles the categorisation, summarisation, and reporting — saving hours of manual bookkeeping every month.

No accounting software subscription required. No data sent to third-party servers. Runs entirely on your local machine.

---

## ✨ Features

- 📂 **Bank statement ingestion** — reads exported CSV/Excel statements from major UK banks
- 🤖 **Automatic transaction categorisation** — classifies transactions into relevant business expense categories:
  - ⛽ Fuel
  - 🚗 Vehicle maintenance & repairs
  - 🛡️ Insurance
  - 📱 Platform fees (Uber, Bolt, Amazon Flex, etc.)
  - 🅿️ Parking & tolls
  - 📦 Other business expenses
- 📊 **Summary reports** — generates monthly and annual expense breakdowns ready for self-assessment tax returns
- 🧮 **Income vs. expense tracking** — calculates net earnings per period
- 🔧 **Customisable rules** — add your own categorisation keywords to match your spending patterns

---

## 🚀 Getting Started

### Prerequisites

```bash
pip install pandas openpyxl
```

### Usage

1. Export your bank statement as a **CSV or Excel file**
2. Place it in the project folder
3. Run the script:

```bash
python main.py --input your_statement.csv
```

4. Find your categorised summary report in the `/output` folder

---

## 🗂️ Expense Categories

The tool maps transaction descriptions to HMRC-aligned expense categories out of the box:

| Category | Example Keywords |
|---|---|
| Fuel | Shell, BP, Esso, Tesco Fuel |
| Platform fees | Uber, Bolt, Amazon Flex, Stuart |
| Insurance | Admiral, Direct Line, Aviva |
| Vehicle maintenance | Halfords, Kwik Fit, Motorpoint |
| Parking & tolls | NCP, RingGo, DART Charge |
| Phone & data | Vodafone, EE, O2, Three |

> Custom keywords can be added in `categories.py`.

---

## 📄 Output Example

```
=== Monthly Summary: January 2025 ===
Income:              £2,840.00
Fuel:               -£320.50
Platform fees:       -£284.00
Insurance:           -£112.00
Vehicle maintenance: -£85.00
Parking & tolls:     -£42.00
───────────────────────────────
Net Earnings:        £1,996.50
```

---

## 🗺️ Scalability & Future Directions

- **🏦 Open Banking API integration** — connect directly to bank accounts via [Plaid](https://plaid.com) or [TrueLayer](https://truelayer.com) to fetch transactions automatically (no manual exports)
- **🤖 ML-powered categorisation** — train a classifier on labelled transaction data for higher accuracy across edge cases
- **📱 Mobile-friendly web UI** — wrap in a lightweight Flask/FastAPI app so drivers can use it on their phone
- **📤 HMRC-ready export** — generate pre-filled SA103 (Self Employment) supplementary pages for self-assessment
- **📊 Profitability dashboard** — visualise earnings trends, busiest periods, and expense ratios over time
- **👥 Multi-driver support** — extend for fleet operators or agencies managing multiple self-employed drivers
- **🔗 Accounting software sync** — export directly to [QuickBooks](https://quickbooks.intuit.com/uk/), [Xero](https://www.xero.com/uk/), or [FreeAgent](https://www.freeagent.com)

---

## 🏷️ Related

[#HMRC](https://www.gov.uk/self-assessment-tax-returns) · [#SelfEmployed](https://www.linkedin.com) · [#GigEconomy](https://www.linkedin.com) · [#Python](https://www.linkedin.com) · [#Automation](https://www.linkedin.com) · [#OpenBanking](https://www.openbanking.org.uk) · [#FinTech](https://www.linkedin.com) · [#Bookkeeping](https://www.linkedin.com)

**Companies & platforms in this space:** [Uber](https://www.uber.com/gb/en/drive/) · [Bolt](https://driver.bolt.eu/en-gb/) · [Amazon Flex](https://flex.amazon.co.uk) · [TrueLayer](https://truelayer.com) · [Xero](https://www.xero.com/uk/) · [FreeAgent](https://www.freeagent.com) · [QuickBooks](https://quickbooks.intuit.com/uk/)

---

## 📄 Licence

MIT — free to use, modify, and share.

---

*Built to solve a real problem: making tax season less painful for self-employed drivers in the UK. 🚗💨*

# WattWise — Energy Intelligence & Electricity Bill Analyzer

An intelligent household power intelligence and forecasting platform with an AI-powered Electricity Bill Analyzer.

## New Feature: AI Electricity Bill Auditor

Users can upload their electricity bill (PDF or photo/image) to receive a detailed breakdown and energy efficiency audit powered by OpenRouter:
- **Tariff & Slab Breakdown**: Audits consumption across progressive billing tiers (e.g. Tier 1 vs Tier 2 excess).
- **Cost Component Analysis**: Interactive visual breakdown of Energy Charges, Fixed Service Fees, Fuel Surcharges, and Taxes.
- **Efficiency Scoring**: Computes a 0–100 efficiency score, average daily usage benchmark, and estimated carbon footprint.
- **Actionable Savings Recommendations**: High, medium, and low-impact actions tailored to the bill with estimated monthly savings.
- **Rooftop Solar & Clean Energy Potential**: Recommended PV capacity and annual savings projection.
- **Interactive Bill Assistant**: Ask follow-up questions directly about the uploaded bill.

---

## Getting Started

### 1. Backend Setup (Flask API)

```bash
cd backend
# Activate virtual environment
venv\Scripts\activate

# Install requirements (if not already installed)
pip install -r requirements.txt

# (Optional) Set your OpenRouter API Key in backend/.env:
# OPENROUTER_API_KEY=sk-or-v1-...

# Run the Flask API on port 5000:
python app.py
```

### 2. Frontend Setup (React + Vite)

```bash
# In the energy-frontend directory:
npm install
npm run dev
```

Visit `http://localhost:5173` to explore the dashboard and navigate to **Bill Analysis**.

### 3. OpenRouter API Key Configuration

You can configure your OpenRouter API key in two convenient ways:
1. **Via UI**: Click **"Configure OpenRouter Key"** in the app header and paste your key. You can choose to save it to your browser or write it to `backend/.env`.
2. **Via `.env` file**: Create a `.env` file inside `backend/` with:
   ```env
   OPENROUTER_API_KEY=your_key_here
   ```
*(You can get a free/prepaid key at [https://openrouter.ai/keys](https://openrouter.ai/keys).)*

"""Electricity Bill Analyzer module using OpenRouter AI API.

Extracts text from PDF bills or encodes image bills to multimodal base64,
then sends them to OpenRouter for deep energy tariff and consumption analysis.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import httpx
from dotenv import find_dotenv, load_dotenv
from pypdf import PdfReader

# Load .env if present
load_dotenv(find_dotenv(usecwd=True))

logger = logging.getLogger(__name__)

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "google/gemini-2.5-flash"
FALLBACK_MODELS = ["openai/gpt-4o-mini", "google/gemini-2.5-flash"]


def call_openrouter_api(headers: dict, body: dict, requested_model: str, max_tokens: int = 2500) -> str:
    """Execute OpenRouter API call with automatic fallback across candidate models."""
    models_to_try = [requested_model]
    for fb in FALLBACK_MODELS:
        if fb not in models_to_try:
            models_to_try.append(fb)

    last_err = None
    for model_name in models_to_try:
        try:
            payload = dict(body)
            payload["model"] = model_name
            payload["max_tokens"] = max_tokens
            with httpx.Client(timeout=55.0) as client:
                resp = client.post(OPENROUTER_API_URL, headers=headers, json=payload)
                if resp.status_code == 200:
                    result_json = resp.json()
                    return result_json["choices"][0]["message"]["content"]

                err_text = resp.text
                logger.warning("OpenRouter model %s returned status %s: %s", model_name, resp.status_code, err_text)
                last_err = RuntimeError(f"OpenRouter error ({resp.status_code}): {err_text}")
                if resp.status_code in (404, 402, 429, 500, 502, 503):
                    continue
                else:
                    raise last_err
        except (httpx.TimeoutException, httpx.RequestError) as net_err:
            logger.warning("Network issue calling OpenRouter model %s: %s", model_name, net_err)
            last_err = net_err
            continue

    if last_err:
        raise last_err
    raise RuntimeError("Failed to call OpenRouter API with available models.")

BILL_SYSTEM_PROMPT = """You are an expert energy auditor and electricity tariff analyst for WattWise, an intelligent energy management platform.
Your task is to analyze electricity utility bills (uploaded as documents or images) with extreme precision and provide deep, actionable insights.

You must extract and compute:
1. Core metadata: Utility Provider, Consumer Name, Account/Consumer ID, Billing Period, Bill Date, Due Date, Currency symbol/code.
2. Consumption figures: Total Units Consumed (kWh), Previous & Present Meter Readings, Meter Number, Connected/Sanctioned Load (kW or kVA).
3. Financial details: Total Amount Due, Net Current Charges, Energy Charges, Fixed/Demand Charges, Fuel Adjustment/Surcharges, Taxes/Duties, Rebates or Late Fees.
4. Tariff & Rate analysis: Tariff Category (Domestic/Residential/Commercial), Slab-wise consumption breakdown (e.g., 0-100 kWh, 101-200 kWh, etc.) with rate per unit, Effective Cost per kWh (Total Amount / Total Units).
5. Energy Efficiency & Environmental Impact:
   - Estimated daily average consumption (kWh/day).
   - Efficiency Score out of 100 (based on typical household consumption efficiency, power factor, and load factor).
   - Efficiency Rating ("Exceptional", "Efficient", "Moderate Consumption", "High Consumption", or "Critically Inefficient").
   - Estimated Carbon Footprint (kg CO2) using standard grid factor (approx 0.82 kg CO2 per kWh if not specified).
6. Anomalies & Red Flags: Any abnormal spikes compared to past averages, power factor penalties, excessive fixed demand charges, or billing discrepancies.
7. Actionable Savings Recommendations: 4-6 specific, high-impact tips tailored to this bill (e.g. AC temperature optimization, shifting flexible loads away from peak hours, replacing resistance heating, vampire power reduction, rooftop solar viability estimate) with realistic estimated monthly savings.

You must respond ONLY with a valid, clean JSON object with the following schema:
{
  "utility_provider": "string",
  "consumer_name": "string",
  "account_number": "string",
  "meter_number": "string",
  "billing_period": "string",
  "bill_date": "string",
  "due_date": "string",
  "sanctioned_load": "string",
  "tariff_category": "string",
  "currency": "string",
  "total_amount": 0.0,
  "total_units_kwh": 0.0,
  "billing_days": 30,
  "average_daily_units": 0.0,
  "effective_cost_per_kwh": 0.0,
  "efficiency_score": 78,
  "efficiency_rating": "Efficient",
  "estimated_carbon_kg": 0.0,
  "cost_breakdown": {
    "energy_charges": 0.0,
    "fixed_charges": 0.0,
    "fuel_surcharges": 0.0,
    "taxes_and_duties": 0.0,
    "other_charges": 0.0
  },
  "slab_breakdown": [
    {
      "slab": "0 - 100 kWh",
      "units": 100.0,
      "rate": 3.5,
      "amount": 350.0
    }
  ],
  "key_observations": [
    "string"
  ],
  "anomalies_or_alerts": [
    "string"
  ],
  "savings_recommendations": [
    {
      "title": "string",
      "impact": "High" | "Medium" | "Low",
      "estimated_monthly_savings": "string",
      "description": "string"
    }
  ],
  "potential_total_savings_pct": 18,
  "solar_potential": {
    "recommended_capacity_kw": "string",
    "estimated_annual_generation_kwh": "string",
    "estimated_annual_savings": "string"
  },
  "summary_notes": "A concise executive summary paragraph of the bill analysis and key takeaway for the household."
}

Do not wrap in markdown quotes if possible, or output strictly valid JSON. If any field is not visible in the bill, provide the most reasonable estimate or indicate 'Not Specified'."""


def get_api_key(override_key: Optional[str] = None) -> Optional[str]:
    """Retrieve the OpenRouter API key from parameters, env, or .env file."""
    if override_key and override_key.strip():
        return override_key.strip()
    return os.environ.get("OPENROUTER_API_KEY", "").strip() or None


def save_api_key_to_env(api_key: str, env_dir: Path) -> bool:
    """Save the OpenRouter API key to backend .env file."""
    try:
        env_path = env_dir / ".env"
        lines = []
        key_found = False
        if env_path.exists():
            with env_path.open("r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("OPENROUTER_API_KEY="):
                        lines.append(f"OPENROUTER_API_KEY={api_key}\n")
                        key_found = True
                    else:
                        lines.append(line)
        if not key_found:
            lines.append(f"OPENROUTER_API_KEY={api_key}\n")

        with env_path.open("w", encoding="utf-8") as f:
            f.writelines(lines)

        os.environ["OPENROUTER_API_KEY"] = api_key
        return True
    except Exception as exc:
        logger.exception("Failed to save API key to .env: %s", exc)
        return False


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF pages using pypdf."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    extracted = []
    for idx, page in enumerate(reader.pages):
        page_text = page.extract_text() or ""
        if page_text.strip():
            extracted.append(f"--- Page {idx + 1} ---\n{page_text}")
    return "\n\n".join(extracted).strip()


def extract_json_from_response(raw_text: str) -> Dict[str, Any]:
    """Parse JSON from model response, handling markdown fences or leading prose."""
    text = raw_text.strip()
    # Try direct parse
    try:
        return json.loads(text)
    except Exception:
        pass

    # Try extracting inside ```json ... ```
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            pass

    # Try finding outer braces { ... }
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        snippet = text[first_brace : last_brace + 1]
        try:
            return json.loads(snippet)
        except Exception:
            pass

    raise ValueError(f"Could not parse valid JSON from AI response: {text[:200]}...")


def build_sample_analysis() -> Dict[str, Any]:
    """Provide a comprehensive sample analysis for demonstration and testing."""
    return {
        "utility_provider": "Pacific Energy & Electric Co. (PG&E)",
        "consumer_name": "Eleanor Vance",
        "account_number": "9421-8830-410",
        "meter_number": "E-883019",
        "billing_period": "Oct 01, 2026 – Oct 31, 2026",
        "bill_date": "Nov 02, 2026",
        "due_date": "Nov 22, 2026",
        "sanctioned_load": "5.0 kW",
        "tariff_category": "Domestic Time-Of-Use (TOU-D)",
        "currency": "$",
        "total_amount": 142.85,
        "total_units_kwh": 412.0,
        "billing_days": 31,
        "average_daily_units": 13.29,
        "effective_cost_per_kwh": 0.347,
        "efficiency_score": 72,
        "efficiency_rating": "Moderate Consumption",
        "estimated_carbon_kg": 337.8,
        "cost_breakdown": {
            "energy_charges": 108.40,
            "fixed_charges": 14.50,
            "fuel_surcharges": 8.75,
            "taxes_and_duties": 11.20,
            "other_charges": 0.0,
        },
        "slab_breakdown": [
            {"slab": "Tier 1 (Baseline: 0 - 250 kWh)", "units": 250.0, "rate": 0.28, "amount": 70.00},
            {"slab": "Tier 2 (Excess: 251 - 412 kWh)", "units": 162.0, "rate": 0.38, "amount": 61.56},
        ],
        "key_observations": [
            "Your average daily consumption was 13.29 kWh/day, which is ~14% higher than the regional suburban benchmark (11.6 kWh/day).",
            "162 kWh (39% of your total usage) spilled into the higher Tier 2 rate (+35% tariff surcharge).",
            "Fixed demand charges accounted for 10.1% of the bill, which aligns with standard single-phase residential meters.",
            "Peak evening hours (5 PM – 9 PM) showed a sharp cluster of active load.",
        ],
        "anomalies_or_alerts": [
            "Tier 2 Creep Alert: 39% of consumption was billed at the higher $0.38/kWh rate. Shaving 40 kWh per month would prevent Tier 2 penalties.",
            "Seasonal heating/cooling uptick detected compared to baseline shoulder-season consumption.",
        ],
        "savings_recommendations": [
            {
                "title": "Thermostat Optimization (Cooling/Heating)",
                "impact": "High",
                "estimated_monthly_savings": "$22 - $30 / mo",
                "description": "Adjusting daytime thermostat by 2°F (or using a smart programmable schedule) can trim up to 12% of total HVAC load.",
            },
            {
                "title": "Pre-Cooling & Evening Peak Load Shifting",
                "impact": "High",
                "estimated_monthly_savings": "$15 - $20 / mo",
                "description": "Run high-wattage appliances (dishwasher, washing machine, dryer, EV charging) before 4 PM or after 9 PM to avoid peak-tier pricing.",
            },
            {
                "title": "Vampire / Standby Load Mitigation",
                "impact": "Medium",
                "estimated_monthly_savings": "$8 - $12 / mo",
                "description": "Plug entertainment units, home office equipment, and gaming rigs into smart surge protectors to cut 40-50W continuous idle drain.",
            },
            {
                "title": "Water Heater Tank Insulation & Schedule",
                "impact": "Medium",
                "estimated_monthly_savings": "$10 - $14 / mo",
                "description": "Lower hot water temperature set-point to 120°F (49°C) and install a thermal jacket to reduce standby heat dissipation.",
            },
        ],
        "potential_total_savings_pct": 24,
        "solar_potential": {
            "recommended_capacity_kw": "3.5 kW Rooftop PV System",
            "estimated_annual_generation_kwh": "4,900 kWh/year",
            "estimated_annual_savings": "$1,250 – $1,450 / year",
        },
        "summary_notes": "Your bill of $142.85 for 412 kWh reflects moderate household usage with significant savings potential by preventing Tier-2 spillover and shifting heavy appliance cycles outside peak hours.",
    }


def analyze_bill_with_openrouter(
    file_bytes: Optional[bytes] = None,
    filename: Optional[str] = None,
    mime_type: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    use_sample: bool = False,
) -> Dict[str, Any]:
    """Analyze an uploaded bill file using OpenRouter's vision/LLM API."""
    if use_sample or not file_bytes:
        return build_sample_analysis()

    key = get_api_key(api_key)
    if not key:
        raise ValueError(
            "OpenRouter API key is required. Please set OPENROUTER_API_KEY or provide it in the request."
        )

    selected_model = model or DEFAULT_MODEL
    filename_lower = (filename or "").lower()
    is_pdf = filename_lower.endswith(".pdf") or (mime_type == "application/pdf")

    # Construct the message content
    messages_payload = []

    if is_pdf:
        # Extract text from PDF
        pdf_text = extract_text_from_pdf(file_bytes)
        if not pdf_text or len(pdf_text.strip()) < 20:
            raise ValueError(
                "Could not extract sufficient text from this PDF. If this is a scanned document, please convert it to an image (JPG/PNG) or upload a photo of the bill."
            )

        user_content = [
            {
                "type": "text",
                "text": f"Here is the text extracted from the user's electricity utility bill:\n\n{pdf_text}\n\nPlease perform a comprehensive tariff audit, consumption breakdown, and energy savings analysis.",
            }
        ]
    else:
        # Multimodal image upload
        actual_mime = mime_type or "image/jpeg"
        if filename_lower.endswith(".png"):
            actual_mime = "image/png"
        elif filename_lower.endswith(".webp"):
            actual_mime = "image/webp"

        b64_img = base64.b64encode(file_bytes).decode("utf-8")
        data_url = f"data:{actual_mime};base64,{b64_img}"

        user_content = [
            {
                "type": "text",
                "text": "Please analyze this electricity bill image in detail. Extract all consumption figures, meter readings, slab rates, fixed charges, taxes, and calculate energy efficiency metrics and actionable savings recommendations.",
            },
            {
                "type": "image_url",
                "image_url": {"url": data_url},
            },
        ]

    messages_payload = [
        {"role": "system", "content": BILL_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "WattWise Electricity Bill Analyzer",
    }

    body = {
        "messages": messages_payload,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    try:
        raw_content = call_openrouter_api(
            headers=headers,
            body=body,
            requested_model=selected_model,
            max_tokens=2500,
        )
        analysis = extract_json_from_response(raw_content)
        return analysis
    except httpx.TimeoutException:
        raise RuntimeError("Request to OpenRouter timed out. Please try again.")
    except Exception as exc:
        logger.exception("Bill analysis failed: %s", exc)
        raise


def ask_bill_question(
    bill_context: Dict[str, Any],
    question: str,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> str:
    """Answer a user follow-up question in the context of an analyzed bill."""
    key = get_api_key(api_key)
    if not key:
        raise ValueError("OpenRouter API key is required to ask questions.")

    selected_model = model or DEFAULT_MODEL

    system_prompt = (
        "You are WattWise AI, an expert energy advisor. The user has uploaded an electricity bill and is asking follow-up questions. "
        "Use the provided bill analysis data to give clear, friendly, and practical advice. Reference their specific numbers (kWh, tariff rate, total cost, slabs) where relevant."
    )

    context_str = json.dumps(bill_context, indent=2)

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": f"Here is my electricity bill analysis data:\n```json\n{context_str}\n```\n\nMy Question: {question}",
        },
    ]

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "WattWise Bill Assistant",
    }

    body = {
        "messages": messages,
        "temperature": 0.4,
    }

    return call_openrouter_api(
        headers=headers,
        body=body,
        requested_model=selected_model,
        max_tokens=1000,
    )


def general_energy_chat(
    question: str,
    chat_history: Optional[list] = None,
    context_info: Optional[Dict[str, Any]] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> str:
    """Answer general energy, forecasting, or efficiency queries using OpenRouter."""
    key = get_api_key(api_key)
    if not key:
        raise ValueError("OpenRouter API key is required.")

    selected_model = model or DEFAULT_MODEL

    ctx_text = ""
    if context_info:
        ctx_text = f"\nHousehold Live Telemetry & Model Context:\n" + "\n".join(
            f"- {k}: {v}" for k, v in context_info.items()
        )

    system_prompt = (
        "You are WattWise AI, an expert household energy consultant and forecasting assistant.\n"
        "You have deep knowledge of electrical power, tariffs, energy conservation, solar PV systems, "
        "and time-series load forecasting.\n"
        f"{ctx_text}\n\n"
        "Guidelines:\n"
        "- Give clear, conversational, actionable, and mathematically grounded answers.\n"
        "- Use markdown formatting (**bolding**, bullet lists, tables where relevant) for high readability.\n"
        "- When asked about forecasts or dataset stats, reference the live telemetry context above.\n"
        "- For appliances or energy-saving tips, provide realistic wattage figures and dollar/rupee estimates."
    )

    messages = [{"role": "system", "content": system_prompt}]

    # Include recent chat history (up to last 6 messages)
    if chat_history:
        for msg in chat_history[-6:]:
            role = msg.get("role", "user")
            text = msg.get("text", "")
            if text and role in ("user", "assistant"):
                messages.append({"role": role, "content": text})

    messages.append({"role": "user", "content": question})

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "WattWise Energy AI",
    }

    body = {
        "messages": messages,
        "temperature": 0.4,
    }

    return call_openrouter_api(
        headers=headers,
        body=body,
        requested_model=selected_model,
        max_tokens=1500,
    )


def analyze_multi_month_bills(
    monthly_bills: list[Dict[str, Any]],
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """Perform comparative analysis across multiple months of utility bills."""
    if not monthly_bills:
        raise ValueError("Please provide at least one month's bill record.")

    # Calculate deterministic summary metrics
    total_spend = sum(float(b.get("amount", 0)) for b in monthly_bills)
    total_units = sum(float(b.get("units_kwh", 0)) for b in monthly_bills)
    count = len(monthly_bills)
    avg_spend = round(total_spend / max(1, count), 2)
    avg_units = round(total_units / max(1, count), 2)

    # Sort bills chronologically if dates exist or preserve order
    sorted_bills = sorted(monthly_bills, key=lambda b: float(b.get("units_kwh", 0)))
    min_month = sorted_bills[0] if sorted_bills else {}
    max_month = sorted_bills[-1] if sorted_bills else {}

    key = get_api_key(api_key)
    if not key:
        # High quality offline fallback analysis
        variance_pct = 0
        if float(min_month.get("units_kwh", 0)) > 0:
            diff = float(max_month.get("units_kwh", 0)) - float(min_month.get("units_kwh", 0))
            variance_pct = round((diff / float(min_month.get("units_kwh", 1))) * 100, 1)

        markdown_report = f"""### Multi-Month Energy Consumption Overview

- **Total Tracked Months:** {count}
- **Total Electricity Consumed:** {total_units:,.1f} kWh
- **Total Amount Paid:** ${total_spend:,.2f}
- **Monthly Average Consumption:** {avg_units:,.1f} kWh / month (${avg_spend:,.2f} / month)
- **Peak Consumption Month:** **{max_month.get('month', 'N/A')}** ({max_month.get('units_kwh', 0)} kWh · ${max_month.get('amount', 0)})
- **Lowest Consumption Month:** **{min_month.get('month', 'N/A')}** ({min_month.get('units_kwh', 0)} kWh · ${min_month.get('amount', 0)})
- **Seasonal Spread:** {variance_pct}% increase between baseline and peak months.

#### Key Takeaways:
1. **Seasonal Demand Surge:** Peak usage in **{max_month.get('month', 'peak month')}** is significantly higher than your baseline shoulder season. This typically reflects space cooling (air conditioning) or space heating loads.
2. **Effective Rate Fluctuation:** In higher consumption months, higher tariff tiers or fuel surcharges inflate your blended cost per kWh.
3. **Targeted Savings:** Trimming just 15% off your peak season usage could save an estimated **${(avg_spend * 0.15 * count):.2f} annually**.
"""
        return {
            "total_spend": total_spend,
            "total_units": total_units,
            "avg_spend": avg_spend,
            "avg_units": avg_units,
            "peak_month": max_month.get("month", "N/A"),
            "lowest_month": min_month.get("month", "N/A"),
            "variance_pct": variance_pct,
            "summary": f"Analyzed {count} billing periods totaling {total_units:,.1f} kWh (${total_spend:,.2f}).",
            "markdown_report": markdown_report,
            "key_trends": [
                f"Peak consumption occurred in {max_month.get('month')} with {max_month.get('units_kwh')} kWh.",
                f"Lowest consumption occurred in {min_month.get('month')} with {min_month.get('units_kwh')} kWh.",
                f"Average monthly energy cost is ${avg_spend:.2f} across {count} months.",
            ],
            "seasonal_observations": [
                f"A {variance_pct}% usage disparity exists between minimum and maximum months, highlighting prominent seasonal climate control impact.",
                "Shifting high-consumption cycles during peak months yields the greatest return on effort.",
            ],
            "annual_savings_roadmap": [
                {
                    "action": "Smart Thermostat Setback during Summer/Winter Peaks",
                    "target_months": f"Peak months around {max_month.get('month', 'summer')}",
                    "potential_annual_savings": f"${(avg_spend * 0.12 * 4):.2f}",
                },
                {
                    "action": "Vampire / Standby Load Curtailment",
                    "target_months": "Year-round",
                    "potential_annual_savings": f"${(avg_spend * 0.08 * 12):.2f}",
                },
                {
                    "action": "Solar PV Self-Consumption Offset",
                    "target_months": "Annual generation",
                    "potential_annual_savings": f"${(total_spend * 0.70):.2f}",
                },
            ],
        }

    # OpenRouter Multi-Month Analysis
    selected_model = model or DEFAULT_MODEL
    system_prompt = (
        "You are an expert utility tariff and energy efficiency auditor for WattWise. "
        "Analyze a multi-month dataset of electricity bills for a household. "
        "Identify seasonal consumption shifts, tariff slab creep, cost anomalies, and generate a concrete annual savings roadmap.\n"
        "Return a strictly valid JSON object with:\n"
        "{\n"
        '  "summary": "Concise executive summary",\n'
        '  "key_trends": ["trend 1", "trend 2", "trend 3"],\n'
        '  "seasonal_observations": ["observation 1", "observation 2"],\n'
        '  "cost_anomalies": ["anomaly 1", "anomaly 2"],\n'
        '  "annual_savings_roadmap": [\n'
        '    {"action": "...", "target_months": "...", "potential_annual_savings": "..."}\n'
        "  ],\n"
        '  "estimated_annual_savings_total": "$XXX",\n'
        '  "markdown_report": "A complete, beautifully formatted markdown analysis report with headers, bullet points, and actionable advice."\n'
        "}"
    )

    user_content = (
        f"Here is the household's multi-month electricity billing record ({count} months):\n"
        f"```json\n{json.dumps(monthly_bills, indent=2)}\n```\n"
        f"Deterministic metrics: Total Units = {total_units} kWh, Total Cost = ${total_spend}, "
        f"Average Monthly Units = {avg_units} kWh, Average Cost = ${avg_spend}.\n\n"
        "Please provide a comprehensive multi-month trend analysis."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "WattWise Multi-Month Auditor",
    }

    body = {
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    try:
        raw_content = call_openrouter_api(
            headers=headers,
            body=body,
            requested_model=selected_model,
            max_tokens=2500,
        )
        parsed = extract_json_from_response(raw_content)
        parsed["total_spend"] = total_spend
        parsed["total_units"] = total_units
        parsed["avg_spend"] = avg_spend
        parsed["avg_units"] = avg_units
        parsed["peak_month"] = max_month.get("month", "N/A")
        parsed["lowest_month"] = min_month.get("month", "N/A")
        return parsed
    except Exception as exc:
        logger.warning("OpenRouter multi-month analysis failed, using fallback engine: %s", exc)
        # Fallback to deterministic calculation with user notice
        diff = float(max_month.get("units_kwh", 0)) - float(min_month.get("units_kwh", 0))
        variance_pct = round((diff / max(1.0, float(min_month.get("units_kwh", 1)))) * 100, 1)
        fallback_res = {
            "total_spend": total_spend,
            "total_units": total_units,
            "avg_spend": avg_spend,
            "avg_units": avg_units,
            "peak_month": max_month.get("month", "N/A"),
            "lowest_month": min_month.get("month", "N/A"),
            "variance_pct": variance_pct,
            "summary": f"Analyzed {count} billing periods totaling {total_units:,.1f} kWh (${total_spend:,.2f}).",
            "key_trends": [
                f"Peak consumption observed in {max_month.get('month')} with {max_month.get('units_kwh')} kWh.",
                f"Lowest consumption observed in {min_month.get('month')} with {min_month.get('units_kwh')} kWh.",
                f"Monthly average spend is ${avg_spend:.2f} across the recorded intervals.",
            ],
            "seasonal_observations": [
                f"A {variance_pct}% usage surge is visible between baseline and peak months, reflecting seasonal thermal conditioning (AC/heating).",
                "Higher consumption months pushed average unit costs upward due to progressive slab creep.",
            ],
            "annual_savings_roadmap": [
                {
                    "action": "Peak Month Thermostat Scheduling",
                    "target_months": f"Surrounding {max_month.get('month', 'summer')}",
                    "potential_annual_savings": f"${(avg_spend * 0.12 * 4):.2f}",
                },
                {
                    "action": "Vampire / Standby Load Curtailment",
                    "target_months": "Year-round",
                    "potential_annual_savings": f"${(avg_spend * 0.08 * 12):.2f}",
                },
            ],
            "estimated_annual_savings_total": f"${(avg_spend * 0.15 * count):.2f}",
            "markdown_report": f"""### Multi-Month Seasonal Trend Analysis

> **Notice:** Generated using WattWise's mathematical tariff engine (OpenRouter returned: {exc}).

- **Total Tracked Months:** {count}
- **Total Electricity Consumed:** {total_units:,.1f} kWh
- **Total Cost:** ${total_spend:,.2f}
- **Monthly Average:** {avg_units:,.1f} kWh/month (${avg_spend:,.2f}/month)
- **Peak Month:** **{max_month.get('month', 'N/A')}** ({max_month.get('units_kwh', 0)} kWh)
- **Lowest Month:** **{min_month.get('month', 'N/A')}** ({min_month.get('units_kwh', 0)} kWh)
- **Seasonal Spread:** **{variance_pct}%** increase from minimum to peak.

#### Key Auditor Findings:
1. **Seasonal Demand Surge:** Peak consumption in **{max_month.get('month', 'peak')}** reveals major seasonal air conditioning or space heating loads.
2. **Rate Slab Creep:** In peak months, electricity units crossed into higher pricing tiers, increasing effective cost per unit.
3. **Savings Potential:** Shaving 15% off peak season cooling can yield an estimated **${(avg_spend * 0.15 * count):.2f} annual savings**.
""",
        }
        return fallback_res



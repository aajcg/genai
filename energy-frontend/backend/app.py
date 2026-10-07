from pathlib import Path
import json
import threading

import joblib
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "hourly_energy.csv"
MODEL_PATH = BASE_DIR / "xgb_model.joblib"
FEATURES_PATH = BASE_DIR / "feature_columns.json"
METRICS_PATH = BASE_DIR / "model_metrics.json"

app = Flask(__name__)
CORS(app)

for required_path in (DATA_PATH, MODEL_PATH, FEATURES_PATH, METRICS_PATH):
    if not required_path.exists():
        raise FileNotFoundError(
            f"Missing {required_path.name}. Keep the four exported artifacts next to app.py."
        )

energy_df = pd.read_csv(DATA_PATH, parse_dates=["Datetime"])
energy_df["Global_active_power"] = pd.to_numeric(
    energy_df["Global_active_power"], errors="coerce"
)
energy_df = (
    energy_df.dropna(subset=["Datetime", "Global_active_power"])
    .sort_values("Datetime")
    .drop_duplicates("Datetime")
    .set_index("Datetime")
)
energy = energy_df["Global_active_power"].astype(float).sort_index()

xgb_model = joblib.load(MODEL_PATH)
with FEATURES_PATH.open("r", encoding="utf-8") as f:
    feature_columns = json.load(f)
with METRICS_PATH.open("r", encoding="utf-8") as f:
    model_metrics = json.load(f)

# DistilBART is loaded on the first chat request, not at Flask startup.
# If the optional NLP dependencies/model download are unavailable, keyword fallback remains usable.
_nlp_classifier = None
_nlp_attempted = False
_nlp_lock = threading.Lock()
NLP_MODEL_NAME = "valhalla/distilbart-mnli-12-1"
INTENTS = [
    "ask for average energy consumption",
    "ask for maximum energy consumption",
    "ask for minimum energy consumption",
    "ask about recent energy consumption trends",
    "ask for a next-hour energy consumption forecast",
    "compare forecasting model evaluation metrics",
    "ask what the application or model can do",
]


def get_nlp_classifier():
    global _nlp_classifier, _nlp_attempted
    if _nlp_attempted:
        return _nlp_classifier
    with _nlp_lock:
        if _nlp_attempted:
            return _nlp_classifier
        try:
            from transformers import pipeline
            _nlp_classifier = pipeline(
                "zero-shot-classification", model=NLP_MODEL_NAME
            )
            app.logger.info("DistilBART zero-shot classifier loaded.")
        except Exception as exc:
            _nlp_classifier = None
            app.logger.warning(
                "DistilBART unavailable; using rule-based assistant fallback: %s", exc
            )
        _nlp_attempted = True
    return _nlp_classifier


def make_next_hour_features(history):
    """Build calendar and lag features matching the exported training schema."""
    history = history.dropna().sort_index()
    if len(history) < 24:
        raise ValueError("At least 24 hourly observations are required.")
    next_time = history.index[-1] + pd.Timedelta(hours=1)
    row = {
        "hour": next_time.hour,
        "day": next_time.day,
        "weekday": next_time.weekday(),
        "month": next_time.month,
    }
    # lag_1 is the latest known hourly observation.
    recent_values = history.iloc[-24:].to_numpy()[::-1]
    for lag in range(1, 25):
        row[f"lag_{lag}"] = float(recent_values[lag - 1])
    features = pd.DataFrame([row]).reindex(columns=feature_columns)
    if features.isna().any().any():
        missing = features.columns[features.isna().any()].tolist()
        raise ValueError(f"Could not construct model features: {missing}")
    return next_time, features


def forecast_next_hour():
    timestamp, features = make_next_hour_features(energy)
    raw_prediction = float(xgb_model.predict(features)[0])
    # Power consumption cannot be negative; clip physically impossible predictions.
    prediction = max(0.0, raw_prediction)
    return {
        "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
        "forecast": round(prediction, 4),
        "model": "XGBoost",
        "unit": "kW",
        "forecast_basis": "next hour after the final observation in the historical dataset",
        "is_live_forecast": False,
        "last_observation": energy.index[-1].strftime("%Y-%m-%d %H:%M:%S"),
        "note": "This is a forecast along the historical dataset timeline, not a live forecast for the current date."
    }


def classify_intent(question):
    """Return an intent label, confidence, and whether DistilBART classified it."""
    classifier = get_nlp_classifier()
    if classifier is not None:
        try:
            result = classifier(question, candidate_labels=INTENTS, multi_label=False)
            return result["labels"][0], float(result["scores"][0]), True
        except Exception:
            app.logger.exception("DistilBART classification failed; using keyword fallback")
    q = question.lower()
    if any(w in q for w in ("forecast", "predict", "next hour", "tomorrow")):
        intent = INTENTS[4]
    elif any(w in q for w in ("compare", "metrics", "mae", "rmse", "r2", "r²", "model performance")):
        intent = INTENTS[5]
    elif any(w in q for w in ("average", "mean")):
        intent = INTENTS[0]
    elif any(w in q for w in ("maximum", "max", "peak", "highest")):
        intent = INTENTS[1]
    elif any(w in q for w in ("minimum", "min", "lowest")):
        intent = INTENTS[2]
    elif any(w in q for w in ("trend", "recent", "change", "increased", "decreased")):
        intent = INTENTS[3]
    else:
        intent = INTENTS[6]
    return intent, None, False


@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "message": "WattWise backend is running",
        "dataset": "UCI household power consumption hourly series",
        "observations": int(len(energy)),
        "model_loaded": True,
        "dataset_start": energy.index.min().strftime("%Y-%m-%d %H:%M:%S"),
        "dataset_end": energy.index.max().strftime("%Y-%m-%d %H:%M:%S"),
        "nlp_model": NLP_MODEL_NAME,
        "nlp_status": "loaded" if _nlp_classifier is not None else (
            "not_attempted" if not _nlp_attempted else "fallback_mode"
        ),
    })


@app.get("/api/summary")
def summary():
    return jsonify({
        "average": round(float(energy.mean()), 3),
        "maximum": round(float(energy.max()), 3),
        "minimum": round(float(energy.min()), 3),
        "observations": int(len(energy)),
        "start": energy.index.min().strftime("%Y-%m-%d %H:%M:%S"),
        "end": energy.index.max().strftime("%Y-%m-%d %H:%M:%S"),
        "unit": "kW",
    })


@app.get("/api/consumption")
def consumption():
    try:
        limit = int(request.args.get("limit", 168))
    except (TypeError, ValueError):
        limit = 168
    limit = max(1, min(limit, 2000))
    recent = energy.tail(limit)
    return jsonify([
        {
            "time": timestamp.strftime("%m-%d %H:%M"),
            "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "usage": round(float(value), 4),
        }
        for timestamp, value in recent.items()
    ])


@app.get("/api/forecast")
def forecast():
    try:
        return jsonify(forecast_next_hour())
    except Exception as exc:
        app.logger.exception("Forecast failed")
        return jsonify({"error": str(exc)}), 500


@app.get("/api/metrics")
def metrics():
    return jsonify(model_metrics)


@app.post("/api/assistant")
def assistant():
    data = request.get_json(silent=True) or {}
    question = str(data.get("question", "")).strip()
    if not question:
        return jsonify({"error": "Please enter a question."}), 400
    if len(question) > 1000:
        return jsonify({"error": "Please keep your question under 1000 characters."}), 400

    intent, confidence, used_nlp = classify_intent(question)
    try:
        if intent == INTENTS[4]:
            result = forecast_next_hour()
            answer = (
                f"The XGBoost model predicts {result['forecast']:.4f} kW for "
                f"{result['timestamp']}. This timestamp is the next hour after the "
                "last observation in the historical dataset, not the current date."
            )
        elif intent == INTENTS[0]:
            answer = f"The average hourly active power in the loaded dataset is {energy.mean():.3f} kW."
        elif intent == INTENTS[1]:
            answer = f"The maximum hourly active power in the loaded dataset is {energy.max():.3f} kW."
        elif intent == INTENTS[2]:
            answer = f"The minimum hourly active power in the loaded dataset is {energy.min():.3f} kW."
        elif intent == INTENTS[3]:
            recent = energy.tail(min(24, len(energy)))
            change = float(recent.iloc[-1] - recent.iloc[0])
            direction = "increased" if change > 0 else "decreased" if change < 0 else "remained approximately unchanged"
            answer = (
                f"Across the latest {len(recent)} hourly observations in the dataset, "
                f"consumption {direction} by {abs(change):.3f} kW from the first to the last observation."
            )
        elif intent == INTENTS[5]:
            ranked = sorted(model_metrics.items(), key=lambda item: item[1]["MAE"])
            lines = [f"{name}: MAE {m['MAE']:.3f}, RMSE {m['RMSE']:.3f}, R² {m['R2']:.3f}" for name, m in ranked]
            answer = "Model metrics from the exported evaluation: " + "; ".join(lines) + ". XGBoost has the lowest MAE and RMSE and highest R² in these reported results."
        else:
            answer = (
                "I can answer questions about average, maximum, minimum, recent trends, "
                "the next historical-hour XGBoost forecast, and model metrics. Try asking "
                "'compare model metrics' or 'what is the average consumption?'"
            )
        return jsonify({
            "answer": answer,
            "question": question,
            "intent": intent,
            "classifier": "DistilBART" if used_nlp else "keyword_fallback",
            "confidence": round(confidence, 4) if confidence is not None else None,
        })
    except Exception as exc:
        app.logger.exception("Assistant request failed")
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    # debug=False avoids reloading large ML models twice in development.
    app.run(host="127.0.0.1", port=5000, debug=False)

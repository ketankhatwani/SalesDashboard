"""Sales Dashboard Flask app.

Reads the monthly Excel workbook, builds all aggregates, and serves a
browser-based dashboard with KPI cards, Chart.js charts and data tables.
"""

from __future__ import annotations

import json
from flask import Flask, render_template, jsonify, request

from data_processor import load_all

app = Flask(__name__)

# Load all data once at startup
DASHBOARD_DATA = load_all()


@app.route("/")
def index():
    return render_template("index.html", data=json.dumps(DASHBOARD_DATA, default=str))


@app.route("/api/data")
def api_data():
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    return jsonify(load_all(start_date=start, end_date=end))


@app.route("/api/kpis")
def api_kpis():
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    return jsonify(load_all(start_date=start, end_date=end)["kpis"])


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)

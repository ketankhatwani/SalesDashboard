"""Sales Dashboard Flask app.

Reads the monthly Excel workbook, builds all aggregates, and serves a
browser-based dashboard with KPI cards, Chart.js charts and data tables.
"""

from __future__ import annotations

import json
from flask import Flask, render_template, jsonify

from data_processor import load_all

app = Flask(__name__)

# Load all data once at startup
DASHBOARD_DATA = load_all()


@app.route("/")
def index():
    return render_template("index.html", data=json.dumps(DASHBOARD_DATA, default=str))


@app.route("/api/data")
def api_data():
    return jsonify(DASHBOARD_DATA)


@app.route("/api/kpis")
def api_kpis():
    return jsonify(DASHBOARD_DATA["kpis"])


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)

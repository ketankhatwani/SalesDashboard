"""Data processor for the sales Excel workbook.

Reads all monthly sheets, normalizes them into a single tidy DataFrame,
evaluates the Collection formula used in Jan-Mar sheets, and computes
all aggregates needed by the dashboard.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pandas as pd

EXCEL_PATH = Path(__file__).resolve().parent / "Data" / "SALES 3-9-2025 TO 31-3-2026.xlsx"

MONTH_ORDER = [
    "September", "October", "November", "December",
    "January", "February", "March", "April", "May", "June", "July", "August"
]

SHEET_ALIASES = {"Dcember": "December"}

COLUMNS = ["Date", "Day", "Collection", "Credit", "Debit", "Total"]


def _clean_sheet_name(name: str) -> str:
    return SHEET_ALIASES.get(name.strip(), name.strip())


def load_sales_data(excel_path: str | Path = EXCEL_PATH) -> pd.DataFrame:
    """Read every monthly sheet and return one tidy DataFrame."""
    excel_path = Path(excel_path)
    raw = pd.read_excel(excel_path, sheet_name=None, engine="openpyxl")

    frames = []
    for sheet_name, df in raw.items():
        clean_name = _clean_sheet_name(sheet_name)
        df = df.loc[:, COLUMNS].copy()
        df = df.dropna(how="all")
        df = df[df["Date"].notna()]

        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
        df = df[df["Date"].notna()]

        for col in ("Collection", "Credit", "Debit", "Total"):
            df[col] = pd.to_numeric(df[col], errors="coerce")

        # Jan-Mar store Collection as an Excel formula string like '=(F3-E3-D3)'
        # Business rule discovered from the data: Collection = Total - Credit - Debit
        mask = df["Collection"].isna()
        df.loc[mask, "Collection"] = (
            df.loc[mask, "Total"] - df.loc[mask, "Credit"] - df.loc[mask, "Debit"]
        )

        df["Month"] = clean_name
        df["MonthNum"] = df["Date"].dt.month
        df["Year"] = df["Date"].dt.year
        df["DayName"] = df["Date"].dt.day_name()

        frames.append(df[["Date", "Day", "DayName", "Month", "MonthNum", "Year",
                          "Collection", "Credit", "Debit", "Total"]])

    data = pd.concat(frames, ignore_index=True)
    data = data.sort_values("Date").reset_index(drop=True)

    month_rank = {m: i for i, m in enumerate(MONTH_ORDER)}
    data["_rank"] = data["Month"].map(month_rank)
    data = data.sort_values(["_rank", "Date"]).drop(columns="_rank").reset_index(drop=True)
    return data


def compute_kpis(df: pd.DataFrame) -> dict:
    """Top-line KPI values for the dashboard cards."""
    total_debit = float(df["Debit"].sum())
    total_collection = float(df["Collection"].sum())
    total_credit = float(df["Credit"].sum())
    grand_total = float(df["Total"].sum())
    n_days = int(df["Date"].nunique())
    avg_daily_collection = (total_collection + total_debit) / n_days if n_days else 0.0

    monthly = (
        df.groupby("Month", as_index=False)[["Collection", "Credit", "Debit", "Total"]]
        .sum()
    )
    monthly["_rank"] = monthly["Month"].map({m: i for i, m in enumerate(MONTH_ORDER)})
    monthly = monthly.sort_values("_rank").drop(columns="_rank")

    best_month_row = monthly.loc[monthly["Total"].idxmax()]
    best_month = {
        "name": best_month_row["Month"],
        "total": float(best_month_row["Total"]),
        "collection": float(best_month_row["Collection"]),
    }

    daily = df.groupby("Date", as_index=False)["Total"].sum()
    best_day_row = daily.loc[daily["Total"].idxmax()]
    best_day = {
        "date": best_day_row["Date"].strftime("%d %b %Y"),
        "day": best_day_row["Date"].strftime("%A"),
        "total": float(best_day_row["Total"]),
    }

    return {
        "total_collection": round(total_collection, 2),
        "total_credit": round(total_credit, 2),
        "total_debit": round(total_debit, 2),
        "grand_total": round(grand_total, 2),
        "n_days": n_days,
        "avg_daily_collection": round(avg_daily_collection, 2),
        "best_month": best_month,
        "best_day": best_day,
    }


def monthly_summary(df: pd.DataFrame) -> list[dict]:
    """Per-month aggregates in workbook order."""
    monthly = (
        df.groupby("Month", as_index=False)[["Collection", "Credit", "Debit", "Total"]]
        .sum()
    )
    monthly["_rank"] = monthly["Month"].map({m: i for i, m in enumerate(MONTH_ORDER)})
    monthly = monthly.sort_values("_rank").drop(columns="_rank").reset_index(drop=True)

    result = []
    for _, row in monthly.iterrows():
        n = int(df[df["Month"] == row["Month"]]["Date"].nunique())
        result.append({
            "month": row["Month"],
            "days": n,
            "collection": round(float(row["Collection"]), 2),
            "credit": round(float(row["Credit"]), 2),
            "debit": round(float(row["Debit"]), 2),
            "total": round(float(row["Total"]), 2),
            "avg_daily": round(float(row["Total"]) / n, 2) if n else 0.0,
        })
    return result


def daily_series(df: pd.DataFrame) -> list[dict]:
    """Daily totals for the trend chart."""
    daily = df.groupby("Date", as_index=False)[["Collection", "Credit", "Debit", "Total"]].sum()
    daily = daily.sort_values("Date")
    return [{
        "date": row["Date"].strftime("%d %b"),
        "collection": round(float(row["Collection"]), 2),
        "credit": round(float(row["Credit"]), 2),
        "debit": round(float(row["Debit"]), 2),
        "total": round(float(row["Total"]), 2),
    } for _, row in daily.iterrows()]


def weekday_summary(df: pd.DataFrame) -> list[dict]:
    """Aggregates by day of week."""
    order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    grp = df.groupby("DayName", as_index=False)[["Collection", "Credit", "Debit", "Total"]].sum()
    grp["_rank"] = grp["DayName"].map({d: i for i, d in enumerate(order)})
    grp = grp.sort_values("_rank").drop(columns="_rank").reset_index(drop=True)

    return [{
        "day": row["DayName"],
        "collection": round(float(row["Collection"]), 2),
        "credit": round(float(row["Credit"]), 2),
        "debit": round(float(row["Debit"]), 2),
        "total": round(float(row["Total"]), 2),
    } for _, row in grp.iterrows()]


def top_days(df: pd.DataFrame, limit: int = 10) -> list[dict]:
    """Best performing days."""
    daily = df.groupby(["Date", "DayName"], as_index=False)[["Collection", "Credit", "Debit", "Total"]].sum()
    daily = daily.sort_values("Total", ascending=False).head(limit)
    return [{
        "date": row["Date"].strftime("%d %b %Y"),
        "day": row["DayName"],
        "collection": round(float(row["Collection"]), 2),
        "credit": round(float(row["Credit"]), 2),
        "debit": round(float(row["Debit"]), 2),
        "total": round(float(row["Total"]), 2),
    } for _, row in daily.iterrows()]


def recent_transactions(df: pd.DataFrame, limit: int = 12) -> list[dict]:
    """Most recent transactions for the table."""
    recent = df.sort_values("Date", ascending=False).head(limit)
    return [{
        "date": row["Date"].strftime("%d %b %Y"),
        "day": row["DayName"],
        "month": row["Month"],
        "collection": round(float(row["Collection"]), 2),
        "credit": round(float(row["Credit"]), 2),
        "debit": round(float(row["Debit"]), 2),
        "total": round(float(row["Total"]), 2),
    } for _, row in recent.iterrows()]


def load_all(start_date: str | None = None, end_date: str | None = None) -> dict:
    """Convenience: load data + every aggregate the dashboard needs.
    Optionally filter by inclusive date range (YYYY-MM-DD).
    """
    df = load_sales_data()
    if start_date:
        df = df[df["Date"] >= pd.to_datetime(start_date)]
    if end_date:
        df = df[df["Date"] <= pd.to_datetime(end_date)]

    date_min = df["Date"].min()
    date_max = df["Date"].max()

    return {
        "kpis": compute_kpis(df),
        "monthly": monthly_summary(df),
        "daily": daily_series(df),
        "weekday": weekday_summary(df),
        "top_days": top_days(df),
        "recent": recent_transactions(df),
        "months": MONTH_ORDER,
        "date_range": {
            "min": date_min.strftime("%Y-%m-%d") if pd.notna(date_min) else "",
            "max": date_max.strftime("%Y-%m-%d") if pd.notna(date_max) else "",
        },
        "updated_at": datetime.now().strftime("%d %b %Y, %I:%M %p"),
    }

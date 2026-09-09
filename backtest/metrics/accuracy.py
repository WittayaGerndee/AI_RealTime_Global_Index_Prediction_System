import math
from typing import List, Dict, Any

class AccuracyMetrics:
    """
    Computes rigorous statistical and trading accuracy metrics
    conforming strictly to requirement sections 2, 20, 21.
    No hardcoded values.
    """

    @staticmethod
    def calculate_metrics(evaluations: List[Dict[str, Any]], tick_size: float = 1.0) -> Dict[str, Any]:
        if not evaluations:
            return {
                "total_predictions": 0,
                "mae": 0.0,
                "rmse": 0.0,
                "smape": 0.0,
                "direction_accuracy": 0.0,
                "range_coverage": 0.0,
                "stabilization_hit_rate": 0.0,
                "tolerances": {
                    "exact_match": 0.0,
                    "within_0_05_pct": 0.0,
                    "within_0_10_pct": 0.0,
                    "within_0_20_pct": 0.0,
                    "within_0_30_pct": 0.0,
                }
            }

        n = len(evaluations)
        abs_errors = []
        sq_errors = []
        smape_terms = []
        direction_hits = 0
        range_hits = 0
        stabilization_hits = 0

        exact_hits = 0
        tol_05_hits = 0
        tol_10_hits = 0
        tol_20_hits = 0
        tol_30_hits = 0

        for item in evaluations:
            pred = float(item["expected_price"])
            actual = float(item["actual_price"])
            curr = float(item.get("current_price", actual))
            err = abs(pred - actual)
            abs_errors.append(err)
            sq_errors.append(err ** 2)

            # SMAPE term: |pred - actual| / ((|actual| + |pred|) / 2) * 100
            denom = (abs(actual) + abs(pred)) / 2.0
            if denom > 0:
                smape_terms.append((err / denom) * 100.0)

            # Direction evaluation: Did price move in predicted direction?
            pred_dir = item.get("direction", "SIDEWAYS")
            actual_move = actual - curr
            if pred_dir == "UP" and actual_move > 0:
                direction_hits += 1
            elif pred_dir == "DOWN" and actual_move < 0:
                direction_hits += 1
            elif pred_dir == "SIDEWAYS" and abs(actual_move) <= (curr * 0.0003):
                direction_hits += 1

            # Range coverage
            low = float(item.get("lower_bound", pred))
            high = float(item.get("upper_bound", pred))
            if low <= actual <= high:
                range_hits += 1

            # Stabilization zone hit
            stab_low = float(item.get("stabilization_low", low))
            stab_high = float(item.get("stabilization_high", high))
            if stab_low <= actual <= stab_high:
                stabilization_hits += 1

            # Multi-tolerance checks (Requirement Section 21)
            pct_err = (err / actual * 100.0) if actual > 0 else 0.0
            if err <= tick_size:
                exact_hits += 1
            if pct_err <= 0.05:
                tol_05_hits += 1
            if pct_err <= 0.10:
                tol_10_hits += 1
            if pct_err <= 0.20:
                tol_20_hits += 1
            if pct_err <= 0.30:
                tol_30_hits += 1

        mae = float(sum(abs_errors) / len(abs_errors)) if abs_errors else 0.0
        rmse = float(math.sqrt(sum(sq_errors) / len(sq_errors))) if sq_errors else 0.0
        smape = float(sum(smape_terms) / len(smape_terms)) if smape_terms else 0.0

        return {
            "total_predictions": n,
            "mae": round(mae, 2),
            "rmse": round(rmse, 2),
            "smape": round(smape, 2),
            "direction_accuracy": round((direction_hits / n) * 100.0, 1),
            "range_coverage": round((range_hits / n) * 100.0, 1),
            "stabilization_hit_rate": round((stabilization_hits / n) * 100.0, 1),
            "tolerances": {
                "exact_match": round((exact_hits / n) * 100.0, 1),
                "within_0_05_pct": round((tol_05_hits / n) * 100.0, 1),
                "within_0_10_pct": round((tol_10_hits / n) * 100.0, 1),
                "within_0_20_pct": round((tol_20_hits / n) * 100.0, 1),
                "within_0_30_pct": round((tol_30_hits / n) * 100.0, 1),
            }
        }

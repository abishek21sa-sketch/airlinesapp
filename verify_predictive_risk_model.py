from __future__ import annotations
from dataclasses import dataclass
from typing import Any
import numpy as np

def _sigmoid(values: np.ndarray) -> np.ndarray:
    clipped = np.clip(values, -35.0, 35.0)
    return 1.0 / (1.0 + np.exp(-clipped))

@dataclass
class Standardizer:
    mean: np.ndarray
    scale: np.ndarray

    @classmethod
    def fit(cls, values: np.ndarray) -> "Standardizer":
        mean = values.mean(axis=0)
        scale = values.std(axis=0)
        scale = np.where(scale < 1e-9, 1.0, scale)
        return cls(mean=mean, scale=scale)

    def transform(self, values: np.ndarray) -> np.ndarray:
        return (values - self.mean) / self.scale

@dataclass
class LogisticModel:
    coefficients: np.ndarray
    intercept: float

    def decision_function(self, values: np.ndarray) -> np.ndarray:
        return values @ self.coefficients + self.intercept

    def predict_proba(self, values: np.ndarray) -> np.ndarray:
        return _sigmoid(self.decision_function(values))

def fit_logistic_regression(values, labels, *, learning_rate=0.05, iterations=2500, l2=0.02, positive_weight=None):
    if len(values) != len(labels) or len(values) < 4:
        raise ValueError("At least four aligned training examples are required.")
    if len(np.unique(labels)) < 2:
        raise ValueError("Training labels must contain both risk classes.")
    coefficients = np.zeros(values.shape[1], dtype=float)
    intercept = 0.0
    if positive_weight is None:
        positives = max(float(labels.sum()), 1.0)
        negatives = max(float(len(labels) - labels.sum()), 1.0)
        positive_weight = negatives / positives
    sample_weight = np.where(labels == 1, positive_weight, 1.0)
    normalizer = float(sample_weight.sum())
    for _ in range(iterations):
        probabilities = _sigmoid(values @ coefficients + intercept)
        error = (probabilities - labels) * sample_weight
        gradient = values.T @ error / normalizer + l2 * coefficients
        intercept_gradient = float(error.sum() / normalizer)
        coefficients -= learning_rate * gradient
        intercept -= learning_rate * intercept_gradient
    return LogisticModel(coefficients=coefficients, intercept=intercept)

def fit_platt_calibrator(scores, labels):
    values = np.asarray(scores, dtype=float).reshape(-1, 1)
    if len(values) < 4 or len(np.unique(labels)) < 2:
        return LogisticModel(coefficients=np.array([1.0]), intercept=0.0)
    return fit_logistic_regression(values, labels, learning_rate=0.03, iterations=1500, l2=0.01, positive_weight=1.0)

def _pr_auc(labels, probabilities):
    order = np.argsort(-probabilities)
    sorted_labels = labels[order]
    positives = float(sorted_labels.sum())
    if positives == 0:
        return 0.0
    tp = np.cumsum(sorted_labels)
    fp = np.cumsum(1 - sorted_labels)
    precision = tp / np.maximum(tp + fp, 1)
    recall = tp / positives
    return float(np.trapezoid(np.r_[1.0, precision], np.r_[0.0, recall]))

def evaluate_probabilities(labels, probabilities):
    clipped = np.clip(probabilities, 1e-9, 1 - 1e-9)
    brier = float(np.mean((clipped - labels) ** 2))
    log_loss = float(-np.mean(labels * np.log(clipped) + (1 - labels) * np.log(1 - clipped)))
    bins = []
    for lower in np.linspace(0.0, 0.8, 5):
        upper = lower + 0.2
        mask = (clipped >= lower) & (clipped < upper if upper < 1.0 else clipped <= upper)
        if mask.any():
            bins.append({
                "probability_band": f"{lower:.1f}-{upper:.1f}",
                "count": int(mask.sum()),
                "mean_predicted_probability": round(float(clipped[mask].mean()), 4),
                "observed_risk_rate": round(float(labels[mask].mean()), 4),
            })
    return {
        "examples": int(len(labels)),
        "positive_rate": round(float(labels.mean()), 4),
        "brier_score": round(brier, 6),
        "log_loss": round(log_loss, 6),
        "precision_recall_auc": round(_pr_auc(labels, clipped), 6),
        "calibration_bins": bins,
    }


if __name__ == "__main__":
    import numpy as np

    np.random.seed(42)
    print("Synthetic verification -- confirms the model-fitting/calibration/")
    print("evaluation LOGIC is correct. This is NOT a test against real BTS")
    print("data (this script has no warehouse access) -- it generates data")
    print("with a KNOWN true relationship and checks the model recovers it.\n")

    n = 2000
    severe_delay_rate = np.random.uniform(0, 0.3, n)
    noise_features = np.random.normal(0, 1, (n, 3))
    true_logit = 6 * (severe_delay_rate - 0.15) + 0.1 * noise_features[:, 0]
    true_prob = 1 / (1 + np.exp(-true_logit))
    labels = (np.random.uniform(0, 1, n) < true_prob).astype(int)

    X = np.column_stack([severe_delay_rate, noise_features])
    split, val_split = int(n * 0.6), int(n * 0.8)
    X_train, y_train = X[:split], labels[:split]
    X_val, y_val = X[split:val_split], labels[split:val_split]
    X_test, y_test = X[val_split:], labels[val_split:]

    standardizer = Standardizer.fit(X_train)
    model = fit_logistic_regression(standardizer.transform(X_train), y_train)
    print("Coefficients (feature 0 = real strong signal, feature 1 = real weak")
    print("signal, features 2-3 = pure noise -- should be large, moderate, ~0, ~0):")
    print(" ", model.coefficients)

    val_scores = model.decision_function(standardizer.transform(X_val))
    calibrator = fit_platt_calibrator(val_scores, y_val)
    test_scores = model.decision_function(standardizer.transform(X_test))
    test_probs = calibrator.predict_proba(test_scores.reshape(-1, 1))

    metrics = evaluate_probabilities(y_test, test_probs)
    print("\nTest-set metrics:", {k: v for k, v in metrics.items() if k != "calibration_bins"})
    print("\nCalibration bins (mean_predicted should track observed_risk_rate):")
    for b in metrics["calibration_bins"]:
        print(" ", b)

    baseline = round(float(y_test.mean()), 3)
    print(f"\nRandom-baseline PR-AUC would be ~{baseline}")
    print(f"Model PR-AUC: {metrics['precision_recall_auc']} -- should clear the baseline")
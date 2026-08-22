"use client";

import { CARRIER_NAMES } from "../lib/carriers";

export type Filters = {
  carrier: string; // "" = all carriers
  startDate: string; // "" = no lower bound
  endDate: string; // "" = no upper bound
};

export default function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  return (
    <div className="filter-bar">
      <label className="filter-field">
        <span className="filter-label">Carrier</span>
        <select
          value={filters.carrier}
          onChange={(e) => onChange({ ...filters, carrier: e.target.value })}
        >
          <option value="">All carriers</option>
          {Object.entries(CARRIER_NAMES).map(([code, name]) => (
            <option key={code} value={code}>
              {code} &mdash; {name}
            </option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span className="filter-label">From</span>
        <input
          type="date"
          value={filters.startDate}
          min="2018-01-01"
          onChange={(e) => onChange({ ...filters, startDate: e.target.value })}
        />
      </label>

      <label className="filter-field">
        <span className="filter-label">To</span>
        <input
          type="date"
          value={filters.endDate}
          min="2018-01-01"
          onChange={(e) => onChange({ ...filters, endDate: e.target.value })}
        />
      </label>

      {(filters.carrier || filters.startDate || filters.endDate) && (
        <button
          type="button"
          className="filter-reset"
          onClick={() => onChange({ carrier: "", startDate: "", endDate: "" })}
        >
          Reset
        </button>
      )}
    </div>
  );
}

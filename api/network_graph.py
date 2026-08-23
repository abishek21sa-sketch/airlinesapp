"""
Route network graph + centrality -- Phase 4 of the OR/statistics upgrade
roadmap, and a genuinely NEW capability: this project had zero graph
modeling anywhere before this (confirmed via grep across the whole
codebase). Every existing route query operates on one origin/destination
pair at a time; nothing here today answers a network-LEVEL question like
"which airports are structural bridges."

Airports are nodes, directional routes (Origin -> Dest) are edges, built
from the whole network (not just the top-15 shown on the Routes page)
above a minimum-volume floor -- same discipline as minimum_flights
elsewhere in this project (predictive_risk.py, health_score.py):
excludes one-off/rare routes so the graph reflects real recurring service,
disclosed as a real filtering choice, not silently applied.

Two SEPARATE, DISCLOSED centrality measures -- deliberately never
combined into one "importance score," matching this project's own
consistent discipline (Health Score components, Network Protection
Portfolio's never-blended metrics):

  degree centrality (raw hub-ness): how many distinct routes touch this
      airport, plus total flight VOLUME through it -- a simple count of
      direct connections. High degree = well-connected, not necessarily
      structurally critical.

  betweenness centrality (structural bridge-ness): the fraction of
      shortest paths between OTHER airport pairs that pass through this
      one. Computed on the UNWEIGHTED directed graph (shortest path =
      fewest hops, not fewest miles or lowest flight volume) -- this is
      the standard definition and answers "if this airport vanished, how
      much of the network's shortest connectivity would break," a
      genuinely different question from raw traffic volume. A low-volume
      regional airport can have high betweenness if it's the only link
      between two otherwise-disconnected clusters; a high-volume airport
      with many alternate routes around it can have surprisingly low
      betweenness.

Betweenness centrality is a PROXY for structural importance, not a full
node-removal connectivity simulation (which would be a different, more
expensive computation -- not done here, disclosed as a limitation).
"""

from __future__ import annotations

from typing import Any

import networkx as nx

from api.db import open_readonly_connection

DEFAULT_MINIMUM_ROUTE_FLIGHTS = 50


def _query_route_edges(minimum_flights: int) -> list[tuple[str, str, int]]:
    query = """
        SELECT Origin, Dest, COUNT(*) AS total_flights
        FROM flights
        WHERE Origin IS NOT NULL AND Dest IS NOT NULL AND Origin != Dest
        GROUP BY Origin, Dest
        HAVING COUNT(*) >= ?
    """
    with open_readonly_connection() as connection:
        rows = connection.execute(query, [minimum_flights]).fetchall()
    return [(r[0], r[1], int(r[2])) for r in rows]


def build_route_graph(minimum_flights: int = DEFAULT_MINIMUM_ROUTE_FLIGHTS) -> nx.DiGraph:
    """Directed graph: node = airport code, edge Origin->Dest weighted by
    total_flights (the weight is carried for reference/display -- NOT used
    in betweenness, which is computed unweighted/by hop count; see module
    docstring for why)."""
    graph = nx.DiGraph()
    for origin, dest, total_flights in _query_route_edges(minimum_flights):
        graph.add_edge(origin, dest, flights=total_flights)
    return graph


def compute_network_resilience(
    minimum_flights: int = DEFAULT_MINIMUM_ROUTE_FLIGHTS, top_n: int = 15,
) -> dict[str, Any]:
    graph = build_route_graph(minimum_flights)
    if graph.number_of_nodes() == 0:
        return {"error": f"No routes met the minimum_flights={minimum_flights} floor."}

    # Degree centrality: raw connection count (networkx normalizes to
    # [0,1] by dividing by n-1 possible neighbors) plus the actual flight
    # volume through each airport, reported separately -- connection COUNT
    # and traffic VOLUME are genuinely different things (an airport can
    # have few routes but huge volume on each, or many thin routes).
    in_degree = dict(graph.in_degree())
    out_degree = dict(graph.out_degree())
    volume_through: dict[str, int] = {node: 0 for node in graph.nodes()}
    for origin, dest, data in graph.edges(data=True):
        volume_through[origin] = volume_through.get(origin, 0) + data["flights"]
        volume_through[dest] = volume_through.get(dest, 0) + data["flights"]

    # Betweenness centrality: unweighted, standard networkx implementation
    # (Brandes' algorithm) -- see module docstring for why unweighted.
    betweenness = nx.betweenness_centrality(graph, normalized=True)

    def top(mapping: dict[str, float], n: int) -> list[dict[str, Any]]:
        ranked = sorted(mapping.items(), key=lambda kv: kv[1], reverse=True)[:n]
        return [{"airport": airport, "value": round(float(value), 6)} for airport, value in ranked]

    return {
        "scope": {
            "minimum_flights_per_route": minimum_flights,
            "airport_count": graph.number_of_nodes(),
            "route_count": graph.number_of_edges(),
        },
        "degree_centrality": {
            "top_by_route_count": top(
                {node: in_degree.get(node, 0) + out_degree.get(node, 0) for node in graph.nodes()}, top_n
            ),
            "top_by_flight_volume": top(volume_through, top_n),
        },
        "betweenness_centrality": {
            "top_structural_bridges": top(betweenness, top_n),
        },
        "methodology": {
            "framework": "Directed graph (airports as nodes, routes as edges) built from the whole network above a minimum-flights floor, not just the busiest routes shown elsewhere on this site.",
            "degree_centrality": "Raw connection count (distinct routes touching this airport) and separately, total flight volume through it -- deliberately not combined into one number.",
            "betweenness_centrality": "Brandes' algorithm, UNWEIGHTED (shortest path = fewest hops) -- fraction of shortest paths between OTHER airport pairs passing through this one. A proxy for structural bridge-ness, not a full node-removal connectivity simulation.",
            "combination_policy": "Degree and betweenness are never blended into one 'importance score' -- consistent with this project's Health Score and Network Protection Portfolio, which report every component separately for the same reason.",
            "limitations": [
                f"Routes below {minimum_flights} total flights across the whole dataset are excluded from the graph entirely -- a real filtering choice, not a complete picture of every route ever flown.",
                "Betweenness centrality is a topological proxy for structural importance, not a literal simulation of what happens to network connectivity if this airport were actually removed.",
                "This graph is static (built from the FULL historical date range) -- it doesn't reflect how the network's structure has changed over time.",
            ],
        },
    }

"""
Tests for the route network graph + centrality module (Phase 4 of the OR/
statistics upgrade roadmap, api/network_graph.py) -- a genuinely new
capability, this project had zero graph modeling anywhere before this.
"""

import sys
from pathlib import Path

import networkx as nx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.network_graph import build_route_graph


class TestBetweennessOnAKnownSyntheticGraph:
    """Synthetic graphs with a mathematically KNOWN correct betweenness
    ranking -- if these don't hold, the centrality computation itself is
    wrong, independent of anything about real airline data."""

    def test_path_graph_middle_node_has_all_the_betweenness(self):
        """A-B-C, bidirectional (A->B, B->A, B->C, C->B), no direct A-C
        edge. Every shortest path between A and C MUST pass through B --
        a textbook result: B's betweenness > 0, A and C's betweenness = 0
        exactly (an endpoint is never on any OTHER pair's shortest path
        in a 3-node path graph)."""
        graph = nx.DiGraph()
        graph.add_edge("A", "B", flights=100)
        graph.add_edge("B", "A", flights=100)
        graph.add_edge("B", "C", flights=100)
        graph.add_edge("C", "B", flights=100)

        betweenness = nx.betweenness_centrality(graph, normalized=True)
        assert betweenness["B"] > 0
        assert betweenness["A"] == 0
        assert betweenness["C"] == 0
        assert betweenness["B"] > betweenness["A"]
        assert betweenness["B"] > betweenness["C"]

    def test_star_graph_center_dominates_betweenness(self):
        """One hub connected to 5 spokes, no spoke-spoke edges -- every
        spoke-to-spoke path must go through the hub. Hub betweenness must
        be strictly greater than every spoke's (which should be exactly
        0 -- spokes are never on any other pair's shortest path here)."""
        graph = nx.DiGraph()
        spokes = ["S1", "S2", "S3", "S4", "S5"]
        for spoke in spokes:
            graph.add_edge("HUB", spoke, flights=50)
            graph.add_edge(spoke, "HUB", flights=50)

        betweenness = nx.betweenness_centrality(graph, normalized=True)
        assert betweenness["HUB"] > 0
        for spoke in spokes:
            assert betweenness[spoke] == 0
            assert betweenness["HUB"] > betweenness[spoke]

    def test_bridge_node_between_two_clusters_has_high_betweenness_despite_low_degree(self):
        """This is the real point of betweenness over raw degree: a node
        with only 2 connections (BRIDGE) can have HIGHER betweenness than
        a node with many connections (a cluster member), if it's the only
        path between two otherwise-disconnected clusters. Two triangles
        (fully connected 3-node clusters) joined only by BRIDGE."""
        graph = nx.DiGraph()
        cluster_a = ["A1", "A2", "A3"]
        cluster_b = ["B1", "B2", "B3"]
        for cluster in (cluster_a, cluster_b):
            for u in cluster:
                for v in cluster:
                    if u != v:
                        graph.add_edge(u, v, flights=10)
        # BRIDGE is the ONLY connection between the two clusters
        graph.add_edge("A1", "BRIDGE", flights=10)
        graph.add_edge("BRIDGE", "A1", flights=10)
        graph.add_edge("BRIDGE", "B1", flights=10)
        graph.add_edge("B1", "BRIDGE", flights=10)

        betweenness = nx.betweenness_centrality(graph, normalized=True)
        in_degree = dict(graph.in_degree())
        out_degree = dict(graph.out_degree())
        degree = {n: in_degree[n] + out_degree[n] for n in graph.nodes()}

        # BRIDGE has low degree (only 2 real connections) but is on every
        # single cross-cluster shortest path -- must outrank at least one
        # higher-degree cluster member on betweenness despite that.
        assert degree["BRIDGE"] < degree["A1"]  # A1 has 2 in-cluster + 1 bridge edge = more raw connections
        assert betweenness["BRIDGE"] > betweenness["A2"]  # A2 is a pure in-cluster node, no cross-cluster role
        assert betweenness["BRIDGE"] > betweenness["A1"]


class TestBuildRouteGraphAgainstRealWarehouse:
    def test_major_hubs_rank_among_the_busiest_by_degree(self):
        """Sanity check against known aviation geography, not a synthetic
        example: ATL/ORD/DFW are real major US hub airports with dozens of
        routes each -- they should be near the top of the graph by raw
        route count, at minimum comfortably above a typical small regional
        airport. This doesn't test centrality math (that's the synthetic
        tests above) -- it tests that build_route_graph's real SQL query
        produces a sane graph from the actual warehouse."""
        graph = build_route_graph(minimum_flights=50)
        assert graph.number_of_nodes() > 50  # real network, not a degenerate/empty graph
        in_degree = dict(graph.in_degree())
        out_degree = dict(graph.out_degree())
        degree = {n: in_degree.get(n, 0) + out_degree.get(n, 0) for n in graph.nodes()}
        median_degree = sorted(degree.values())[len(degree) // 2]
        for hub in ("ATL", "ORD", "DFW"):
            assert hub in degree, f"{hub} should be a node in the real route graph"
            assert degree[hub] > median_degree, f"{hub} should be well above the median-connectivity airport"

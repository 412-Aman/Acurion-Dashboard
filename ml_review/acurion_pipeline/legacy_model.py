"""Archived architecture and graph encoding, copied without training entry points.
Source: train_network_gnn_v3.py and detect_aml_networks.py in supplied milestone.
Do not change this encoding while reusing the existing checkpoints.
"""
import numpy as np
import torch
from torch import nn
from collections import defaultdict
HIDDEN=48
NODE_DIM=5
EDGE_DIM=14
GLOBAL_DIM=4

def collate(graphs):
    nodes = []
    sources = []
    destinations = []
    edges = []
    globals_ = []
    groups = []
    labels = []

    offset = 0

    for i, graph in enumerate(graphs):
        nodes.append(graph["node"].float())
        sources.append(graph["src"].long() + offset)
        destinations.append(graph["dst"].long() + offset)
        edges.append(graph["edge"].float())
        globals_.append(graph["global"].float())

        groups.append(
            torch.full(
                (len(graph["node"]),),
                i,
                dtype=torch.long
            )
        )

        labels.append(graph["label"])
        offset += len(graph["node"])

    return (
        torch.cat(nodes),
        torch.cat(sources),
        torch.cat(destinations),
        torch.cat(edges),
        torch.stack(globals_),
        torch.cat(groups),
        torch.tensor(labels, dtype=torch.float32)
    )

class MixedPaymentGNN(nn.Module):
    def __init__(self):
        super().__init__()

        self.node_input = nn.Linear(NODE_DIM, HIDDEN)
        self.edge_input = nn.Linear(EDGE_DIM, HIDDEN)

        self.layers = nn.ModuleList([
            nn.Linear(HIDDEN * 3, HIDDEN)
            for _ in range(3)
        ])

        self.head = nn.Sequential(
            nn.Linear(HIDDEN * 2 + GLOBAL_DIM, 96),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(96, 1)
        )

    def forward(self, batch):
        (
            nodes, src, dst, edge,
            globals_, groups, _
        ) = batch

        h = torch.relu(self.node_input(nodes))
        edge_h = torch.tanh(self.edge_input(edge))

        n = len(h)

        in_degree = torch.bincount(
            dst, minlength=n
        ).clamp_min(1).unsqueeze(1)

        out_degree = torch.bincount(
            src, minlength=n
        ).clamp_min(1).unsqueeze(1)

        for layer in self.layers:
            incoming = torch.zeros_like(h)
            outgoing = torch.zeros_like(h)

            incoming.index_add_(
                0, dst, h[src] + edge_h
            )

            outgoing.index_add_(
                0, src, h[dst] + edge_h
            )

            updated = torch.relu(
                layer(
                    torch.cat([
                        h,
                        incoming / in_degree,
                        outgoing / out_degree
                    ], dim=1)
                )
            )

            h = (h + updated) / 2

        graph_count = len(globals_)

        mean = torch.zeros(
            (graph_count, HIDDEN),
            dtype=h.dtype
        )

        mean.index_add_(0, groups, h)

        counts = torch.bincount(
            groups, minlength=graph_count
        ).clamp_min(1).unsqueeze(1)

        mean = mean / counts

        maximum = torch.full_like(mean, -1e9)

        maximum.scatter_reduce_(
            0,
            groups[:, None].expand(-1, HIDDEN),
            h,
            reduce="amax",
            include_self=True
        )

        combined = torch.cat(
            [mean, maximum, globals_],
            dim=1
        )

        return self.head(combined).squeeze(1)

def graph_from_transactions(transfers):
    """Exact feature preparation used by the original IBM network GNN.

    Input rows: (timestamp, sender_key, receiver_key, paid, received,
                 same_currency, cross_bank). Returns a graph dictionary with
    5 node features, 6 edge features and 4 whole-graph features.
    """
    import numpy as np
    import torch

    ordered = sorted(transfers, key=lambda e: e[0])[:48]
    if len(ordered) < 2:
        return None

    node_map = {}
    src, dst = [], []
    for edge in ordered:
        if edge[1] not in node_map:
            node_map[edge[1]] = len(node_map)
        if edge[2] not in node_map:
            node_map[edge[2]] = len(node_map)
        src.append(node_map[edge[1]])
        dst.append(node_map[edge[2]])

    n = len(node_map)
    node_x = np.zeros((n, 5), dtype=np.float32)
    out_connections = defaultdict(set)
    in_connections = defaultdict(set)
    stamps = [e[0] for e in ordered]
    duration = max((stamps[-1] - stamps[0]).total_seconds() / 3600, 0.)
    e_x = np.zeros((len(ordered), 6), dtype=np.float32)
    last_t = stamps[0]

    for i, (edge, u, v) in enumerate(zip(ordered, src, dst)):
        timestamp, _, _, paid, received, curr_match, crossbank = edge
        gap = max((timestamp - last_t).total_seconds() / 3600, 0.)
        age = max((timestamp - stamps[0]).total_seconds() / 3600, 0.)
        last_t = timestamp
        node_x[u, 0] += 1
        node_x[v, 1] += 1
        node_x[u, 3] += np.log1p(paid)
        node_x[v, 4] += np.log1p(received)
        out_connections[u].add(v)
        in_connections[v].add(u)
        e_x[i] = [
            min(np.log1p(paid)/20, 2), min(np.log1p(received)/20, 2),
            min(age / 240, 2), min(gap / 48, 2), float(curr_match), float(crossbank)
        ]

    node_x[:, 2] = [
        np.log1p(len(in_connections[i]) + len(out_connections[i]))
        for i in range(n)
    ]
    node_x[:, :2] = np.log1p(node_x[:, :2])
    node_x[:, 3] /= np.maximum(np.expm1(node_x[:, 0]), 1)
    node_x[:, 4] /= np.maximum(np.expm1(node_x[:, 1]), 1)
    node_x[:, 3:] /= 20
    global_x = np.array([
        min(n / 40, 2), min(len(ordered) / 40, 2),
        min(duration / 240, 2), float(len(ordered) / max(n, 1)) / 5
    ], dtype=np.float32)

    return {
        'node': torch.from_numpy(node_x),
        'src': torch.tensor(src, dtype=torch.long),
        'dst': torch.tensor(dst, dtype=torch.long),
        'edge': torch.from_numpy(e_x),
        'global': torch.from_numpy(global_x),
        'label': 0,  # Inference placeholder only; no IBM annotations are used.
        'scenario': 'UNLABELED_CANDIDATE',
    }

import '../styles/main.css';
import { animate } from 'animejs';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';
import { renderLayout } from '../components/layout.js';
import { getGraphData, getAlerts } from '../lib/dataService.js';
import { severityBadgeClass } from '../lib/utils.js';

cytoscape.use(cola);

const main = renderLayout({
  active: 'graph.html',
  pageTitle: 'Graph Investigation',
  pageSubtitle: 'Multi-layer account network — transactions, shared devices & IPs',
});

main.innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 280px;gap:16px;">
    <div class="card" style="padding:0;overflow:hidden;position:relative;">
      <div style="position:absolute;top:12px;left:12px;z-index:10;display:flex;flex-wrap:wrap;gap:6px;">
        <button class="btn-ghost" style="font-size:11px;padding:4px 10px;" data-filter="all">All</button>
        <button class="btn-ghost" style="font-size:11px;padding:4px 10px;" data-filter="transaction">IBM AML</button>
        <button class="btn-ghost" style="font-size:11px;padding:4px 10px;" data-filter="suspicious">PaySim</button>
        <button class="btn-ghost" style="font-size:11px;padding:4px 10px;" data-filter="flagged">Flagged</button>
      </div>
      <div style="position:absolute;top:12px;right:12px;z-index:10;display:flex;gap:6px;">
        <button id="zoom-in" class="btn-ghost" style="font-size:13px;padding:4px 10px;font-weight:600;">+</button>
        <button id="zoom-out" class="btn-ghost" style="font-size:13px;padding:4px 10px;font-weight:600;">−</button>
        <button id="fit" class="btn-ghost" style="font-size:11px;padding:4px 10px;">Fit</button>
      </div>
      <div id="cy" style="width:100%;height:560px;"></div>
      <div style="position:absolute;bottom:12px;left:12px;z-index:10;display:flex;align-items:center;gap:14px;padding:6px 12px;background:rgba(24,22,20,0.85);border:1px solid var(--color-border);border-radius:8px;backdrop-filter:blur(8px);font-size:11px;color:var(--color-text-faint);">
        <span style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:99px;background:#5c5650;display:inline-block;"></span>Low</span>
        <span style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:99px;background:#d4a84b;display:inline-block;"></span>Medium</span>
        <span style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:99px;background:#d46b5a;display:inline-block;"></span>High</span>
        <span style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:99px;background:#d4f040;display:inline-block;"></span>Critical</span>
      </div>
    </div>

    <div class="card" id="node-detail" style="overflow-y:auto;max-height:600px;">
      <div style="text-align:center;padding:48px 0;color:var(--color-text-faint);font-size:13px;">
        Click a node to inspect.
      </div>
    </div>
  </div>
`;

let cy;
let alertsByAccount = {};

const RISK_COLOR = {
  low:      '#3d3935',
  medium:   '#6b5e1a',
  high:     '#6b2d1e',
  critical: '#d4f040',
};
const RISK_BORDER = {
  low:      '#5c5650',
  medium:   '#d4a84b',
  high:     '#d46b5a',
  critical: '#d4f040',
};
const RISK_SIZE = { low: 26, medium: 32, high: 38, critical: 44 };

async function init() {
  const [graphData, alerts] = await Promise.all([getGraphData(), getAlerts()]);
  alertsByAccount = Object.fromEntries(alerts.map((a) => [a.suspiciousAccount, a]));

  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: [...graphData.nodes, ...graphData.edges],
    style: [
      {
        selector: 'node',
        style: {
          'background-color': (n) => RISK_COLOR[n.data('risk')] || RISK_COLOR.low,
          'width':  (n) => RISK_SIZE[n.data('risk')] || RISK_SIZE.low,
          'height': (n) => RISK_SIZE[n.data('risk')] || RISK_SIZE.low,
          'label': 'data(label)',
          'color': '#a89e94',
          'font-size': '8px',
          'font-family': 'JetBrains Mono, monospace',
          'text-valign': 'bottom',
          'text-margin-y': 5,
          'border-width': 1.5,
          'border-color': (n) => RISK_BORDER[n.data('risk')] || RISK_BORDER.low,
        },
      },
      {
        selector: 'edge[type = "transaction"]',
        style: {
          'width': 1,
          'line-color': '#3d3935',
          'target-arrow-color': '#3d3935',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 0.7,
        },
      },
      {
        selector: 'edge[type = "shared_device"]',
        style: {
          'width': 1,
          'line-color': '#2e2b28',
          'line-style': 'dashed',
          'curve-style': 'bezier',
          'target-arrow-shape': 'none',
        },
      },
      {
        selector: 'edge[type = "shared_ip"]',
        style: {
          'width': 1,
          'line-color': '#2e2b28',
          'line-style': 'dotted',
          'curve-style': 'bezier',
          'target-arrow-shape': 'none',
        },
      },
      {
        selector: 'edge[type = "suspicious"]',
        style: {
          'width': 1.5,
          'line-color': '#5c3a2e',
          'line-style': 'dashed',
          'target-arrow-color': '#5c3a2e',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 0.7,
        },
      },
      {
        selector: 'edge[flagged = "true"], edge[?flagged]',
        style: {
          'line-color': '#d4a84b',
          'target-arrow-color': '#d4a84b',
          'opacity': 0.85,
        },
      },
      {
        selector: '.faded',
        style: { 'opacity': 0.08 },
      },
      {
        selector: '.highlighted',
        style: {
          'border-width': 2.5,
          'border-color': '#d4f040',
        },
      },
    ],
    layout: {
      name: 'cose',
      animate: false,
      randomize: true,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 80,
      edgeElasticity: () => 100,
      nestingFactor: 5,
      gravity: 80,
      numIter: 1000,
      initialTemp: 200,
      coolingFactor: 0.95,
      minTemp: 1,
      fit: true,
      padding: 40,
    },
    minZoom: 0.25,
    maxZoom: 3,
  });

  cy.on('tap', 'node', (evt) => {
    const node = evt.target;
    cy.elements().removeClass('faded highlighted');
    const neighborhood = node.closedNeighborhood();
    cy.elements().not(neighborhood).addClass('faded');
    node.addClass('highlighted');
    renderNodeDetail(node);
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      cy.elements().removeClass('faded highlighted');
      document.getElementById('node-detail').innerHTML = `
        <div class="text-center py-16 text-text-faint text-sm">
          Click a node to inspect account relationships.
        </div>
      `;
    }
  });

  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((b) => b.classList.remove('!border-border-light', '!text-text'));
      btn.classList.add('!border-border-light', '!text-text');
      cy.edges().forEach((edge) => {
        let show = false;
        if (filter === 'all') {
          show = true;
        } else if (filter === 'flagged') {
          show = edge.data('flagged') === true;
        } else {
          show = edge.data('type') === filter;
        }
        edge.style('display', show ? 'element' : 'none');
      });
    });
  });

  document.getElementById('zoom-in').addEventListener('click', () => cy.zoom(cy.zoom() * 1.3));
  document.getElementById('zoom-out').addEventListener('click', () => cy.zoom(cy.zoom() * 0.7));
  document.getElementById('fit').addEventListener('click', () => cy.fit(undefined, 40));
}

function renderNodeDetail(node) {
  const id          = node.data('id');
  const risk        = node.data('risk');
  const cluster     = node.data('cluster');      // bankId
  const bankName    = node.data('bankName')    || '';
  const entityName  = node.data('entityName')  || '';
  const sourceDs    = node.data('sourceDataset') || '';
  const alert       = alertsByAccount[id];
  const neighbors   = node.neighborhood('node');
  const txEdges     = node.connectedEdges('[type = "transaction"]');
  const fraudEdges  = node.connectedEdges('[type = "suspicious"]');

  const panel = document.getElementById('node-detail');
  panel.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;">
        <h3 style="font-family:var(--font-mono);font-size:12px;color:var(--color-text);word-break:break-all;">${id}</h3>
        <span class="badge ${severityBadgeClass(risk)}" style="flex-shrink:0;">${risk}</span>
      </div>
      <p style="font-size:11px;color:var(--color-text-faint);">${neighbors.length} connected account${neighbors.length === 1 ? '' : 's'}</p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      <div style="background:var(--color-surface-2);border-radius:8px;padding:10px;">
        <div style="font-size:10px;color:var(--color-text-faint);margin-bottom:4px;">Tx edges</div>
        <div style="font-family:var(--font-mono);font-size:18px;color:var(--color-text);">${txEdges.length}</div>
      </div>
      <div style="background:var(--color-surface-2);border-radius:8px;padding:10px;">
        <div style="font-size:10px;color:var(--color-text-faint);margin-bottom:4px;">Fraud edges</div>
        <div style="font-family:var(--font-mono);font-size:18px;color:var(--color-text);">${fraudEdges.length}</div>
      </div>
    </div>

    ${(bankName || entityName || cluster || sourceDs) ? `
      <div style="background:var(--color-surface-2);border-radius:8px;padding:10px;margin-bottom:16px;">
        <div style="font-size:10px;color:var(--color-text-faint);font-weight:500;margin-bottom:8px;">Account Info</div>
        ${bankName   ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;"><span style="color:var(--color-text-faint);">Bank</span><span style="font-family:var(--font-mono);color:var(--color-text-dim);">${bankName}</span></div>` : ''}
        ${entityName ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;"><span style="color:var(--color-text-faint);">Entity</span><span style="font-family:var(--font-mono);color:var(--color-text-dim);font-size:10px;">${entityName}</span></div>` : ''}
        ${cluster    ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;"><span style="color:var(--color-text-faint);">Bank ID</span><span style="font-family:var(--font-mono);color:var(--color-text-dim);">${cluster}</span></div>` : ''}
        ${sourceDs   ? `<div style="display:flex;justify-content:space-between;font-size:11px;"><span style="color:var(--color-text-faint);">Dataset</span><span style="font-family:var(--font-mono);color:var(--color-text-dim);">${sourceDs}</span></div>` : ''}
      </div>
    ` : ''}

    ${alert ? `
      <div style="margin-bottom:16px;">
        <h4 style="font-size:12px;font-weight:500;color:var(--color-text);margin-bottom:8px;">Active Alert</h4>
        <div style="background:var(--color-surface-2);border-radius:8px;padding:10px;font-size:11px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:var(--color-text-faint);">ID</span><span style="font-family:var(--font-mono);">${alert.id}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:var(--color-text-faint);">Risk</span><span style="font-family:var(--font-mono);">${alert.riskScore.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--color-text-faint);">Decision</span><span style="font-family:var(--font-mono);">${alert.decision}</span></div>
        </div>
        <a href="alerts.html" class="btn-primary" style="width:100%;margin-top:10px;font-size:12px;">View Alert →</a>
      </div>
    ` : `<p style="font-size:11px;color:var(--color-text-faint);margin-bottom:16px;">No active alerts.</p>`}

    <div>
      <h4 style="font-size:12px;font-weight:500;color:var(--color-text);margin-bottom:8px;">Connected Accounts</h4>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">
        ${neighbors.map((n) => `<span style="font-family:var(--font-mono);font-size:10px;padding:2px 7px;border-radius:99px;background:var(--color-surface-2);color:var(--color-text-dim);border:1px solid var(--color-border);">${n.id()}</span>`).join('')}
      </div>
    </div>
  `;
  animate(panel, { opacity: [0, 1], translateY: [8, 0], duration: 350, ease: 'outQuad' });
}

init();

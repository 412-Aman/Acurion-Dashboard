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
  <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
    <div class="lg:col-span-3 card !p-0 overflow-hidden relative">
      <div class="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
        <button class="btn-ghost text-xs" data-filter="all">All edges</button>
        <button class="btn-ghost text-xs" data-filter="transaction">IBM AML</button>
        <button class="btn-ghost text-xs" data-filter="suspicious">PaySim Fraud</button>
        <button class="btn-ghost text-xs" data-filter="flagged">Flagged only</button>
      </div>
      <div class="absolute top-4 right-4 z-10 flex gap-2">
        <button id="zoom-in" class="btn-ghost text-xs !px-2.5">+</button>
        <button id="zoom-out" class="btn-ghost text-xs !px-2.5">−</button>
        <button id="fit" class="btn-ghost text-xs">Fit</button>
      </div>
      <div id="cy" class="w-full h-[600px]"></div>
      <div class="absolute bottom-4 left-4 z-10 glass-panel px-3 py-2 text-xs text-text-faint flex items-center gap-4">
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-text-faint inline-block"></span> Low risk</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-text-dim inline-block"></span> Medium</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-text inline-block"></span> High / Critical</span>
      </div>
    </div>

    <div class="card" id="node-detail">
      <div class="text-center py-16 text-text-faint text-sm">
        Click a node to inspect account relationships.
      </div>
    </div>
  </div>
`;

let cy;
let alertsByAccount = {};

const RISK_COLOR = { low: '#6b6b6b', medium: '#a3a3a3', high: '#f5f5f5', critical: '#ffffff' };
const RISK_SIZE = { low: 28, medium: 34, high: 42, critical: 48 };

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
          'width': (n) => RISK_SIZE[n.data('risk')] || RISK_SIZE.low,
          'height': (n) => RISK_SIZE[n.data('risk')] || RISK_SIZE.low,
          'label': 'data(label)',
          'color': '#a3a3a3',
          'font-size': '9px',
          'font-family': 'JetBrains Mono, monospace',
          'text-valign': 'bottom',
          'text-margin-y': 6,
          'border-width': 2,
          'border-color': '#0a0a0a',
        },
      },
      {
        selector: 'edge[type = "transaction"]',
        style: {
          'width': 1.5,
          'line-color': '#3a3a3a',
          'target-arrow-color': '#3a3a3a',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 0.8,
        },
      },
      {
        selector: 'edge[type = "shared_device"]',
        style: {
          'width': 1.5,
          'line-color': '#6b6b6b',
          'line-style': 'dashed',
          'curve-style': 'bezier',
          'target-arrow-shape': 'none',
        },
      },
      {
        selector: 'edge[type = "shared_ip"]',
        style: {
          'width': 1.5,
          'line-color': '#6b6b6b',
          'line-style': 'dotted',
          'curve-style': 'bezier',
          'target-arrow-shape': 'none',
        },
      },
      {
        selector: 'edge[type = "suspicious"]',
        style: {
          'width': 2,
          'line-color': '#a3a3a3',
          'line-style': 'dashed',
          'target-arrow-color': '#a3a3a3',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 0.8,
        },
      },
      {
        selector: 'edge[flagged = "true"], edge[?flagged]',
        style: {
          'line-color': '#f5f5f5',
          'target-arrow-color': '#f5f5f5',
          'opacity': 0.8,
        },
      },
      {
        selector: '.faded',
        style: { 'opacity': 0.1 },
      },
      {
        selector: '.highlighted',
        style: {
          'border-width': 3,
          'border-color': '#ffffff',
        },
      },
    ],
    layout: {
      name: 'cola',
      animate: true,
      randomize: true,
      maxSimulationTime: 1500,
      nodeSpacing: 18,
    },
    minZoom: 0.3,
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
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="font-semibold font-mono text-sm">${id}</h3>
        <p class="text-xs text-text-faint mt-0.5">${neighbors.length} connected account${neighbors.length === 1 ? '' : 's'}</p>
      </div>
      <span class="badge ${severityBadgeClass(risk)}">${risk}</span>
    </div>

    <div class="grid grid-cols-2 gap-3 mb-4 text-xs">
      <div class="bg-surface-2 rounded-lg p-3">
        <div class="text-text-faint mb-1">Transaction edges</div>
        <div class="font-mono text-lg">${txEdges.length}</div>
      </div>
      <div class="bg-surface-2 rounded-lg p-3">
        <div class="text-text-faint mb-1">Fraud edges</div>
        <div class="font-mono text-lg">${fraudEdges.length}</div>
      </div>
    </div>

    ${(bankName || entityName || cluster || sourceDs) ? `
      <div class="bg-surface-2 rounded-lg p-3 mb-4 text-xs space-y-1.5">
        <div class="text-text-faint font-medium mb-2">Account Info</div>
        ${bankName   ? `<div class="flex justify-between"><span class="text-text-faint">Bank</span><span class="font-mono">${bankName}</span></div>` : ''}
        ${entityName ? `<div class="flex justify-between"><span class="text-text-faint">Entity</span><span class="font-mono text-xs">${entityName}</span></div>` : ''}
        ${cluster    ? `<div class="flex justify-between"><span class="text-text-faint">Bank ID</span><span class="font-mono">${cluster}</span></div>` : ''}
        ${sourceDs   ? `<div class="flex justify-between"><span class="text-text-faint">Dataset</span><span class="font-mono">${sourceDs}</span></div>` : ''}
      </div>
    ` : ''}

    ${alert ? `
      <div class="mb-4">
        <h4 class="text-sm font-medium mb-2">Active Alert</h4>
        <div class="bg-surface-2 rounded-lg p-3 text-xs space-y-1">
          <div class="flex justify-between"><span class="text-text-faint">Alert ID</span><span class="font-mono">${alert.id}</span></div>
          <div class="flex justify-between"><span class="text-text-faint">Risk Score</span><span class="font-mono">${alert.riskScore.toFixed(2)}</span></div>
          <div class="flex justify-between"><span class="text-text-faint">Decision</span><span class="font-mono">${alert.decision}</span></div>
        </div>
        <a href="alerts.html" class="btn-primary w-full mt-3 text-xs">View Full Alert</a>
      </div>
    ` : `
      <div class="text-xs text-text-faint mb-4">No active alerts for this account.</div>
    `}

    <div>
      <h4 class="text-sm font-medium mb-2">Connected Accounts</h4>
      <div class="flex flex-wrap gap-1.5">
        ${neighbors.map((n) => `<span class="badge border-border text-text-dim bg-surface-2 font-mono text-xs">${n.id()}</span>`).join('')}
      </div>
    </div>
  `;
  animate(panel, { opacity: [0, 1], translateY: [8, 0], duration: 350, ease: 'outQuad' });
}

init();

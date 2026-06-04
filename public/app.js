const MAX_VISIBLE_NODES = 100;
const PLAY_INTERVAL_MS = 1200;
const NODE_WIDTH = 264;
const NODE_HEIGHT = 80;
const INITIAL_ZOOM = 1;
const INITIAL_PAN = { x: 72, y: 150 };
const GRAPH_ANIMATION_MS = 260;
const SLIDER_ANIMATION_MS = 220;

const state = {
  timeline: [],
  snapshots: new Map(),
  visibleNodeIds: new Set(),
  nodePositions: new Map(),
  currentIndex: 0,
  timer: undefined,
  hasSetInitialViewport: false,
  sliderAnimationFrame: undefined,
};

const cy = cytoscape({
  container: document.getElementById("cy"),
  elements: [],
  style: [
    {
      selector: "node",
      style: {
        shape: "round-rectangle",
        "background-color": "#2563eb",
        "border-color": "#2563eb",
        "border-width": 1.5,
        color: "#ffffff",
        label: "data(label)",
        "font-size": 22,
        "font-weight": 700,
        "min-zoomed-font-size": 12,
        "text-halign": "center",
        "text-valign": "center",
        "text-wrap": "wrap",
        "text-max-width": 232,
        "text-overflow-wrap": "anywhere",
        "shadow-blur": 22,
        "shadow-color": "rgba(15, 23, 42, 0.34)",
        "shadow-offset-x": 0,
        "shadow-offset-y": 10,
        "shadow-opacity": 1,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      },
    },
    {
      selector: "edge",
      style: {
        width: 4,
        "line-color": "#94a3b8",
        "target-arrow-color": "#94a3b8",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "shadow-blur": 12,
        "shadow-color": "rgba(15, 23, 42, 0.26)",
        "shadow-offset-x": 0,
        "shadow-offset-y": 5,
        "shadow-opacity": 1,
      },
    },
  ],
  layout: { name: "preset" },
});

const elements = {
  commitMeta: document.getElementById("commitMeta"),
  nodeCount: document.getElementById("nodeCount"),
  edgeCount: document.getElementById("edgeCount"),
  playButton: document.getElementById("playButton"),
  slider: document.getElementById("commitSlider"),
  sliderOutput: document.getElementById("sliderOutput"),
};

async function init() {
  try {
    const timelineResponse = await fetch("/data/timeline.json");
    if (!timelineResponse.ok) {
      throw new Error("data/timeline.json was not found. Run scan before serve.");
    }

    state.timeline = await timelineResponse.json();
    if (!Array.isArray(state.timeline) || state.timeline.length === 0) {
      throw new Error("Timeline is empty. Run scan with at least one commit.");
    }

    elements.commitMeta.textContent = "Loading graph snapshots...";
    await loadAllSnapshots();
    buildStableLayout();

    elements.slider.max = String(state.timeline.length - 1);
    elements.slider.value = "0";
    loadSnapshot(0);
  } catch (error) {
    showError(error);
  }
}

async function loadAllSnapshots() {
  const snapshots = await Promise.all(
    state.timeline.map(async (entry) => {
      const response = await fetch(`/data/snapshots/${entry.commit}.json`);
      if (!response.ok) {
        throw new Error(`Snapshot not found for ${entry.commit}`);
      }

      return response.json();
    }),
  );

  for (const snapshot of snapshots) {
    state.snapshots.set(snapshot.commit, snapshot);
  }
}

function buildStableLayout() {
  const nodesByFirstAppearance = new Map();

  for (const entry of state.timeline) {
    const snapshot = state.snapshots.get(entry.commit);
    for (const node of snapshot.nodes) {
      if (!nodesByFirstAppearance.has(node.id)) {
        nodesByFirstAppearance.set(node.id, node);
      }
    }
  }

  const visibleNodes = [...nodesByFirstAppearance.values()].slice(0, MAX_VISIBLE_NODES);
  state.visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  state.nodePositions = new Map(visibleNodes.map((node, index) => [node.id, getStableNodePosition(index)]));
}

function loadSnapshot(index) {
  state.currentIndex = index;
  const entry = state.timeline[index];
  const snapshot = state.snapshots.get(entry.commit);
  if (!snapshot) {
    throw new Error(`Snapshot not loaded for ${entry.commit}`);
  }

  const visibleNodes = snapshot.nodes
    .filter((node) => state.visibleNodeIds.has(node.id))
    .map((node) => ({
      data: node,
      position: state.nodePositions.get(node.id),
    }));
  const visibleEdges = snapshot.edges
    .filter((edge) => state.visibleNodeIds.has(edge.source) && state.visibleNodeIds.has(edge.target))
    .map((edge, edgeIndex) => ({
      data: {
        id: `${edge.source}->${edge.target}:${edgeIndex}`,
        source: edge.source,
        target: edge.target,
        type: edge.type,
      },
    }));

  updateGraphElements(visibleNodes, visibleEdges);
  cy.layout({ name: "preset", animate: false, fit: false }).run();
  if (!state.hasSetInitialViewport) {
    cy.zoom(INITIAL_ZOOM);
    cy.pan(INITIAL_PAN);
    state.hasSetInitialViewport = true;
  }

  elements.nodeCount.textContent = String(visibleNodes.length);
  elements.edgeCount.textContent = String(visibleEdges.length);
  animateSliderTo(index);
  elements.sliderOutput.textContent = `${index + 1} / ${state.timeline.length}`;
  elements.commitMeta.classList.remove("error");
  elements.commitMeta.textContent = `${shortCommit(snapshot.commit)}  ${snapshot.date}`;
}

function updateGraphElements(nextNodes, nextEdges) {
  const nextNodeIds = new Set(nextNodes.map((node) => node.data.id));
  const nextEdgeIds = new Set(nextEdges.map((edge) => edge.data.id));

  cy.nodes().forEach((node) => {
    if (!nextNodeIds.has(node.id())) {
      node.data("pendingRemoval", true);
      node.animate(
        {
          style: {
            opacity: 0,
            width: NODE_WIDTH * 0.76,
            height: NODE_HEIGHT * 0.76,
          },
        },
        { duration: GRAPH_ANIMATION_MS },
      );
      window.setTimeout(() => {
        if (node.data("pendingRemoval")) {
          node.remove();
        }
      }, GRAPH_ANIMATION_MS);
    }
  });

  cy.edges().forEach((edge) => {
    if (!nextEdgeIds.has(edge.id())) {
      edge.data("pendingRemoval", true);
      edge.animate({ style: { opacity: 0 } }, { duration: GRAPH_ANIMATION_MS });
      window.setTimeout(() => {
        if (edge.data("pendingRemoval")) {
          edge.remove();
        }
      }, GRAPH_ANIMATION_MS);
    }
  });

  for (const node of nextNodes) {
    const existing = cy.getElementById(node.data.id);
    if (existing.length > 0) {
      existing.removeData("pendingRemoval");
      existing.data(node.data);
      existing.position(node.position);
      existing.animate(
        {
          style: {
            opacity: 1,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          },
        },
        { duration: GRAPH_ANIMATION_MS },
      );
      continue;
    }

    const added = cy.add(node);
    added.style({
      opacity: 0,
      width: NODE_WIDTH * 0.76,
      height: NODE_HEIGHT * 0.76,
    });
    added.animate(
      {
        style: {
          opacity: 1,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        },
      },
      { duration: GRAPH_ANIMATION_MS },
    );
  }

  for (const edge of nextEdges) {
    const existing = cy.getElementById(edge.data.id);
    if (existing.length > 0) {
      existing.removeData("pendingRemoval");
      existing.data(edge.data);
      existing.animate({ style: { opacity: 1 } }, { duration: GRAPH_ANIMATION_MS });
      continue;
    }

    const added = cy.add(edge);
    added.style({
      opacity: 0,
    });
    added.animate({ style: { opacity: 1 } }, { duration: GRAPH_ANIMATION_MS });
  }
}

function startPlayback() {
  if (state.timer) {
    return;
  }

  if (state.currentIndex >= state.timeline.length - 1) {
    loadSnapshot(0);
  }

  elements.playButton.textContent = "Stop";
  state.timer = window.setInterval(() => {
    const nextIndex = state.currentIndex + 1;

    if (nextIndex >= state.timeline.length) {
      stopPlayback();
      return;
    }

    try {
      loadSnapshot(nextIndex);
      if (nextIndex >= state.timeline.length - 1) {
        stopPlayback();
      }
    } catch (error) {
      showError(error);
    }
  }, PLAY_INTERVAL_MS);
}

function stopPlayback() {
  if (!state.timer) {
    return;
  }

  window.clearInterval(state.timer);
  state.timer = undefined;
  elements.playButton.textContent = "Play";
}

function showError(error) {
  stopPlayback();
  elements.commitMeta.classList.add("error");
  elements.commitMeta.textContent = error instanceof Error ? error.message : String(error);
}

function shortCommit(commit) {
  return commit.slice(0, 10);
}

function animateSliderTo(index) {
  if (state.sliderAnimationFrame) {
    window.cancelAnimationFrame(state.sliderAnimationFrame);
  }

  const from = Number(elements.slider.value);
  const startedAt = performance.now();

  function tick(now) {
    const progress = Math.min(1, (now - startedAt) / SLIDER_ANIMATION_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    elements.slider.value = String(from + (index - from) * eased);

    if (progress < 1) {
      state.sliderAnimationFrame = window.requestAnimationFrame(tick);
      return;
    }

    elements.slider.value = String(index);
    state.sliderAnimationFrame = undefined;
  }

  state.sliderAnimationFrame = window.requestAnimationFrame(tick);
}

function getStableNodePosition(index) {
  const columns = 5;
  const column = index % columns;
  const row = Math.floor(index / columns);

  return {
    x: column * 300,
    y: row * 156,
  };
}

elements.slider.addEventListener("input", () => {
  stopPlayback();
  try {
    loadSnapshot(Number(elements.slider.value));
  } catch (error) {
    showError(error);
  }
});

elements.playButton.addEventListener("click", () => {
  if (state.timer) {
    stopPlayback();
  } else {
    startPlayback();
  }
});

init();

const MAX_VISIBLE_NODES = 100;
const PLAY_INTERVAL_MS = 1200;
const NODE_WIDTH = 184;
const NODE_HEIGHT = 56;
const INITIAL_ZOOM = 1;
const GRID_SIZE = 28;
const INITIAL_PAN = {
  x: GRID_SIZE + NODE_WIDTH / 2,
  y: GRID_SIZE + NODE_HEIGHT / 2,
};
const GRAPH_ANIMATION_MS = 260;
const SLIDER_ANIMATION_MS = 220;

const state = {
  timeline: [],
  snapshots: new Map(),
  visibleNodeIds: new Set(),
  nodePositions: new Map(),
  currentIndex: 0,
  playbackFrame: undefined,
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
        "background-color": "#bfdbfe",
        "border-color": "#bfdbfe",
        "border-width": 1.5,
        color: "#1e3a8a",
        label: "data(label)",
        "font-size": 15,
        "font-weight": 500,
        "min-zoomed-font-size": 9,
        "text-halign": "center",
        "text-valign": "center",
        "text-wrap": "wrap",
        "text-max-width": 160,
        "text-overflow-wrap": "anywhere",
        "shadow-blur": 24,
        "shadow-color": "rgba(15, 23, 42, 0.24)",
        "shadow-offset-x": 0,
        "shadow-offset-y": 10,
        "shadow-opacity": 1,
        ghost: "yes",
        "ghost-color": "rgba(15, 23, 42, 0.22)",
        "ghost-offset-x": 4,
        "ghost-offset-y": 5,
        "ghost-opacity": 0.26,
        "corner-radius": 14,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      },
    },
    {
      selector: "node.important-node",
      style: {
        "background-color": "#60a5fa",
        "border-color": "#60a5fa",
        color: "#0f2857",
        "border-width": 2,
      },
    },
    {
      selector: "node.test-node",
      style: {
        "background-color": "#e2e8f0",
        "border-color": "#e2e8f0",
        color: "#475569",
      },
    },
    {
      selector: "node.hover-node",
      style: {
        "border-color": "#bfdbfe",
        "shadow-blur": 30,
        "shadow-color": "rgba(15, 23, 42, 0.30)",
        "shadow-offset-y": 12,
        "ghost-color": "rgba(15, 23, 42, 0.28)",
        "ghost-offset-x": 5,
        "ghost-offset-y": 5,
        "ghost-opacity": 0.32,
        width: NODE_WIDTH + 6,
        height: NODE_HEIGHT + 4,
      },
    },
    {
      selector: "edge",
      style: {
        width: 3,
        "line-color": "#8c959f",
        "target-arrow-color": "#6e7781",
        "target-arrow-shape": "triangle",
        "arrow-scale": 1.15,
        "curve-style": "bezier",
        opacity: 0.72,
        "shadow-blur": 14,
        "shadow-color": "rgba(15, 23, 42, 0.20)",
        "shadow-offset-x": 0,
        "shadow-offset-y": 6,
        "shadow-opacity": 1,
        ghost: "yes",
        "ghost-color": "rgba(15, 23, 42, 0.18)",
        "ghost-offset-x": 4,
        "ghost-offset-y": 4,
        "ghost-opacity": 0.22,
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

function loadSnapshot(index, options = {}) {
  state.currentIndex = index;
  const entry = state.timeline[index];
  const snapshot = state.snapshots.get(entry.commit);
  if (!snapshot) {
    throw new Error(`Snapshot not loaded for ${entry.commit}`);
  }

  const degreeCounts = getDegreeCounts(snapshot.edges);
  const importantThreshold = getImportantThreshold(degreeCounts);
  const visibleNodes = snapshot.nodes
    .filter((node) => state.visibleNodeIds.has(node.id))
    .map((node) => ({
      data: node,
      classes: getNodeClasses(node.id, degreeCounts.get(node.id) ?? 0, importantThreshold),
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
  if (options.animateSlider ?? true) {
    animateSliderTo(index);
  }
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
      existing.classes(node.classes);
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
  if (state.playbackFrame) {
    return;
  }

  if (state.currentIndex >= state.timeline.length - 1) {
    loadSnapshot(0, { animateSlider: false });
    elements.slider.value = "0";
  }

  const startedAt = performance.now();
  const startValue = state.currentIndex;
  const endValue = state.timeline.length - 1;
  const duration = Math.max(0, endValue - startValue) * PLAY_INTERVAL_MS;

  elements.playButton.textContent = "Stop";

  function tick(now) {
    const progress = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);
    const sliderValue = startValue + (endValue - startValue) * progress;
    const nextIndex = Math.min(endValue, Math.floor(sliderValue));

    elements.slider.value = String(sliderValue);

    if (nextIndex !== state.currentIndex) {
      try {
        loadSnapshot(nextIndex, { animateSlider: false });
      } catch (error) {
        showError(error);
        return;
      }
    }

    if (progress >= 1) {
      loadSnapshot(endValue, { animateSlider: false });
      elements.slider.value = String(endValue);
      stopPlayback();
      return;
    }

    state.playbackFrame = window.requestAnimationFrame(tick);
  }

  state.playbackFrame = window.requestAnimationFrame(tick);
}

function stopPlayback() {
  if (!state.playbackFrame) {
    return;
  }

  window.cancelAnimationFrame(state.playbackFrame);
  state.playbackFrame = undefined;
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

function getDegreeCounts(edges) {
  const degreeCounts = new Map();

  for (const edge of edges) {
    degreeCounts.set(edge.source, (degreeCounts.get(edge.source) ?? 0) + 1);
    degreeCounts.set(edge.target, (degreeCounts.get(edge.target) ?? 0) + 1);
  }

  return degreeCounts;
}

function getImportantThreshold(degreeCounts) {
  const degrees = [...degreeCounts.values()].sort((a, b) => b - a);
  return Math.max(3, degrees[Math.min(4, degrees.length - 1)] ?? 3);
}

function getNodeClasses(id, degree, importantThreshold) {
  const classes = [];

  if (degree >= importantThreshold) {
    classes.push("important-node");
  }

  if (isTestNode(id)) {
    classes.push("test-node");
  }

  return classes.join(" ");
}

function isTestNode(id) {
  return /(^|[/\\])(__tests__|tests?|spec)([/\\]|$)|[._-](test|spec)\.[cm]?[jt]sx?$|[._-](test|spec)\.py$/iu.test(id);
}

elements.slider.addEventListener("input", () => {
  stopPlayback();
  try {
    const index = Math.round(Number(elements.slider.value));
    loadSnapshot(index);
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

cy.on("mouseover", "node", (event) => {
  event.target.addClass("hover-node");
});

cy.on("mouseout", "node", (event) => {
  event.target.removeClass("hover-node");
});

init();

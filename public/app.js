const MAX_VISIBLE_NODES = 100;
const PLAY_INTERVAL_MS = 1200;
const NODE_WIDTH = 132;
const NODE_HEIGHT = 40;
const INITIAL_ZOOM = 0.9;

const state = {
  timeline: [],
  currentIndex: 0,
  timer: undefined,
  hasSetInitialViewport: false,
};

const cy = cytoscape({
  container: document.getElementById("cy"),
  elements: [],
  style: [
    {
      selector: "node",
      style: {
        shape: "round-rectangle",
        "background-color": "#fffdf8",
        "border-color": "#134e4a",
        "border-width": 2,
        color: "#1c1a17",
        label: "data(label)",
        "font-size": 11,
        "font-weight": 700,
        "min-zoomed-font-size": 8,
        "text-halign": "center",
        "text-valign": "center",
        "text-wrap": "wrap",
        "text-max-width": 116,
        "text-overflow-wrap": "anywhere",
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      },
    },
    {
      selector: "edge",
      style: {
        width: 1.5,
        "line-color": "#9f8f7d",
        "target-arrow-color": "#9f8f7d",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
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

    elements.slider.max = String(state.timeline.length - 1);
    elements.slider.value = "0";
    await loadSnapshot(0);
  } catch (error) {
    showError(error);
  }
}

async function loadSnapshot(index) {
  state.currentIndex = index;
  const entry = state.timeline[index];
  const response = await fetch(`/data/snapshots/${entry.commit}.json`);
  if (!response.ok) {
    throw new Error(`Snapshot not found for ${entry.commit}`);
  }

  const snapshot = await response.json();
  const visibleNodeIds = new Set(snapshot.nodes.slice(0, MAX_VISIBLE_NODES).map((node) => node.id));
  const visibleNodes = snapshot.nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .map((node) => ({
      data: node,
      position: getStableNodePosition(node.id),
    }));
  const visibleEdges = snapshot.edges
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .map((edge, edgeIndex) => ({
      data: {
        id: `${edge.source}->${edge.target}:${edgeIndex}`,
        source: edge.source,
        target: edge.target,
        type: edge.type,
      },
    }));

  cy.elements().remove();
  cy.add([...visibleNodes, ...visibleEdges]);
  cy.layout({ name: "preset", animate: false, fit: false }).run();
  if (!state.hasSetInitialViewport) {
    cy.zoom(INITIAL_ZOOM);
    cy.center();
    state.hasSetInitialViewport = true;
  }

  elements.nodeCount.textContent = String(visibleNodes.length);
  elements.edgeCount.textContent = String(visibleEdges.length);
  elements.slider.value = String(index);
  elements.sliderOutput.textContent = `${index + 1} / ${state.timeline.length}`;
  elements.commitMeta.classList.remove("error");
  elements.commitMeta.textContent = `${shortCommit(snapshot.commit)}  ${snapshot.date}`;
}

function startPlayback() {
  if (state.timer) {
    return;
  }

  elements.playButton.textContent = "Stop";
  state.timer = window.setInterval(() => {
    const nextIndex = (state.currentIndex + 1) % state.timeline.length;
    loadSnapshot(nextIndex).catch(showError);
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

function getStableNodePosition(id) {
  const hash = hashString(id);
  const columns = 12;
  const rows = 12;
  const column = hash % columns;
  const row = Math.floor(hash / columns) % rows;

  return {
    x: (column - Math.floor(columns / 2)) * 118,
    y: (row - Math.floor(rows / 2)) * 72,
  };
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

elements.slider.addEventListener("input", () => {
  stopPlayback();
  loadSnapshot(Number(elements.slider.value)).catch(showError);
});

elements.playButton.addEventListener("click", () => {
  if (state.timer) {
    stopPlayback();
  } else {
    startPlayback();
  }
});

init();

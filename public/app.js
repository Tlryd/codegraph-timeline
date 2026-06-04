const MAX_VISIBLE_NODES = 100;
const PLAY_INTERVAL_MS = 1200;

const state = {
  timeline: [],
  currentIndex: 0,
  timer: undefined,
};

const cy = cytoscape({
  container: document.getElementById("cy"),
  elements: [],
  style: [
    {
      selector: "node",
      style: {
        "background-color": "#0f766e",
        "border-color": "#134e4a",
        "border-width": 1,
        color: "#1c1a17",
        label: "data(label)",
        "font-size": 10,
        "min-zoomed-font-size": 8,
        "text-background-color": "#fffdf8",
        "text-background-opacity": 0.86,
        "text-background-padding": 2,
        "text-valign": "bottom",
        "text-margin-y": 6,
        width: 18,
        height: 18,
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
  layout: { name: "grid" },
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
    .map((node) => ({ data: node }));
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
  cy.layout({ name: "cose", animate: false, fit: true, padding: 28 }).run();

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

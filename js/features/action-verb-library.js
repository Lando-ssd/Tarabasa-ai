const TENSE_LABELS = ["present", "past", "future", "continuous"];

window.tbVerbPractice = {
  selectedVerb: null,
  selectedTense: "present",
  verbCards: [],
  searchQuery: ""
};

function formatVerbByTense(verb, tense) {
  if (tense === "past") return `${verb}ed`;
  if (tense === "future") return `will ${verb}`;
  if (tense === "continuous") return `${verb}ing`;
  return verb;
}

function renderTenseSelector() {
  const holder = document.getElementById("tense-selector");
  if (!holder) return;
  holder.innerHTML = TENSE_LABELS.map((tense) => `
    <button
      class="btn ${window.tbVerbPractice.selectedTense === tense ? "btn-success" : "btn-info"}"
      onclick="setSelectedTense('${tense}')"
    >
      ${tense}
    </button>
  `).join("");
}

function renderVerbCards() {
  const grid = document.getElementById("verb-library-grid");
  if (!grid) return;
  const tense = window.tbVerbPractice.selectedTense;
  const searchQuery = window.tbVerbPractice.searchQuery.toLowerCase().trim();
  
  // Filter cards based on search query
  const filteredCards = window.tbVerbPractice.verbCards.filter(card => 
    card.verb.toLowerCase().includes(searchQuery)
  );
  
  if (filteredCards.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: #999;">No verbs found matching "' + searchQuery + '"</div>';
    return;
  }
  
  grid.innerHTML = filteredCards.map((card) => `
    <div class="verb-card ${window.tbVerbPractice.selectedVerb === card.verb ? "active" : ""}" onclick="selectVerbCard('${card.verb}')">
      <img src="${card.image}" alt="${card.verb}" class="verb-card-image">
      <div class="verb-card-title">${formatVerbByTense(card.verb, tense)}</div>
      <div class="verb-card-text">${card.lessonText}</div>
    </div>
  `).join("");
}

function selectVerbCard(verb) {
  window.tbVerbPractice.selectedVerb = verb;
  renderVerbCards();
  const label = document.getElementById("selected-verb-label");
  if (label) {
    label.textContent = `Target: ${formatVerbByTense(verb, window.tbVerbPractice.selectedTense)}`;
  }
}

function setSelectedTense(tense) {
  window.tbVerbPractice.selectedTense = tense;
  renderTenseSelector();
  renderVerbCards();
  if (window.tbVerbPractice.selectedVerb) {
    selectVerbCard(window.tbVerbPractice.selectedVerb);
  }
}

async function initActionVerbLibrary() {
  const cards = await getActionVerbCards();
  window.tbVerbPractice.verbCards = cards;
  renderTenseSelector();
  renderVerbCards();
  initSearchListener();
}

function initSearchListener() {
  const searchInput = document.getElementById("verb-search");
  if (!searchInput) return;
  
  searchInput.addEventListener("input", (e) => {
    window.tbVerbPractice.searchQuery = e.target.value;
    renderVerbCards();
  });
}

window.initActionVerbLibrary = initActionVerbLibrary;
window.selectVerbCard = selectVerbCard;
window.setSelectedTense = setSelectedTense;
window.formatVerbByTense = formatVerbByTense;
window.initSearchListener = initSearchListener;

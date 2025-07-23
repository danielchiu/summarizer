const keyInput = document.getElementById("key");
const saved    = document.getElementById("saved");

/* NEW refs ----------------------------------------------------------- */
const modelSel  = document.getElementById("model");
const sentInput = document.getElementById("sentences"); 
const fontInput  = document.getElementById("fontSize");
const promptTA   = document.getElementById("prompt");
const TTL       = 86_400_000;          // 24 h

chrome.storage.sync.get(
  ["apiKey","model","sentences","fontSize","customPrompt"],
  async cfg => {
  const { apiKey, model, sentences, fontSize, customPrompt } = cfg;

  if (apiKey) keyInput.value = apiKey;

  /* sentence */
  sentInput.value = sentences ?? 5;

  /* font size & custom prompt */
  fontInput.value   = fontSize   ?? 14;
  promptTA.value    = customPrompt ?? "";

  /* model list (with 24 h cache) */
  const models = await loadModelList(apiKey);
  modelSel.innerHTML = models.map(m=>`<option value="${m}">${m}</option>`).join("");
  const prefer = (model && models.includes(model))
               ? model 
               : (models.includes("gpt-4o") ? "gpt-4o" : models[0]);
  modelSel.value = prefer;

  if (!model) chrome.storage.sync.set({ model: prefer });
});

document.getElementById("save").addEventListener("click", () => {
  const k = keyInput.value.trim();
  if (!/^sk-[\w-]{32,}$/.test(k)) {
    saved.textContent = "Seems to be an invalid key.";
    saved.style.color = "#b30000";
    return;
  }
  chrome.storage.sync.set({ apiKey: k }, () => {
    saved.textContent = "Saved ✔";
    saved.style.color = "#008000";
  });
});

/* ----------‑ live‑save model & sentences --------------------------- */

modelSel.addEventListener("change", () =>
    chrome.storage.sync.set({ model: modelSel.value }));

sentInput.addEventListener("change", () => {
  let n = Math.max(1, Math.min(100, parseInt(sentInput.value,10)||5));
  sentInput.value = n;
  chrome.storage.sync.set({ sentences: n });
});

fontInput.addEventListener("change", () => {
  let n = Math.max(8, Math.min(32, parseInt(fontInput.value,10)||14));
  fontInput.value = n;
  chrome.storage.sync.set({ fontSize: n });
});

promptTA.addEventListener("input", () =>
  chrome.storage.sync.set({ customPrompt: promptTA.value.trim() })
);

/* ----------‑ helpers ------------------------------------------------ */

async function loadModelList(apiKey) {
  /* 1. 24 h cache in storage.local */
  const { modelList, modelListTS } = await chrome.storage.local.get(
    ["modelList", "modelListTS"]);
  if (modelList && modelListTS && Date.now()-modelListTS < TTL) return modelList;

  /* 2. attempt fetch (needs key) */
  if (apiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/models",
        { headers: { Authorization:`Bearer ${apiKey}` } });
      if (res.ok) {
        const data = await res.json();
        const list = data.data
          .map(x=>x.id)
          .filter(id=>/gpt|turbo|chat|mixtral|command/i.test(id))
          .sort((a,b)=>a.localeCompare(b));
        await chrome.storage.local.set({ modelList: list, modelListTS: Date.now() });
        return list;
      }
    } catch(e){ console.warn("Model fetch failed, using fallback.", e); }
  }
  /* 3. fallback list */
  return ["gpt-4o","gpt-4o-mini","gpt-3.5-turbo-0125"];
}

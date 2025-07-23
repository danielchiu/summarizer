/** OpenAI call wrapped in a single function */
async function summarizeWithOpenAI(apiKey, text, model, nSent) {
  const systemPrompt =
    `You are a concise assistant. Summarize the following HTML text in `
  + `${nSent} sentence${nSent === 1 ? "" : "s"}.`;

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: `TEXT:\n"""\n${text}\n"""` }
    ],
    temperature: 0.3
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "No summary returned.";
}


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "summarize") {
    (async () => {
      try {
        const { apiKey, model = "gpt-4o", sentences = 5, customPrompt } =
          await chrome.storage.sync.get(
            ["apiKey","model","sentences","customPrompt"]);

        if (!apiKey) throw new Error("No API key set. Click the extension ► ⚙ Options.");

        // clamp sentences
        const nSent = Math.min(Math.max(parseInt(sentences, 10) || 5, 1), 100);

        const summary = await summarisePossiblyLarge(
          apiKey, msg.text, model, nSent, customPrompt);
        sendResponse({ ok: true, summary });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  // 0. make sure an API key exists
  const { apiKey } = await chrome.storage.sync.get("apiKey");
  if (!apiKey) { chrome.runtime.openOptionsPage(); return; }

  // 1. ping the tab – fast, no visual effect
  chrome.tabs.sendMessage(tab.id, { type: "ping" }, async () => {
    if (chrome.runtime.lastError) {
      // 1a. no script – inject once
      await chrome.scripting.executeScript({ target:{tabId:tab.id}, files:["content.js"] });
      await chrome.scripting.insertCSS({ target:{tabId:tab.id}, files:["ui.css"] });
    }
    // 2. now definitely present → toggle pick mode
    chrome.tabs.sendMessage(tab.id, { type: "toggle-pick" });
  });
});

/* --------------------------------------------------------------------- *
 * High‑level dispatcher: chunk large texts, then merge partials         *
 * --------------------------------------------------------------------- */
async function summarisePossiblyLarge(apiKey, fullText, model, nSent, customPrompt="") {
  const MAX_CHARS = 12_000;                // safe for GPT‑4o k‑limits

  if (fullText.length <= MAX_CHARS) {
    return summarizeChunk(apiKey, fullText, model, nSent, customPrompt);   // trivial path
  }

  /* 1. split on paragraph boundaries */
  const paras = fullText.split(/\n{2,}/);  // empty lines
  const chunks = [];
  let buf = "";
  for (const p of paras) {
    if ((buf + p).length > MAX_CHARS) {
      chunks.push(buf); buf = p;
    } else {
      buf += (buf ? "\n\n" : "") + p;
    }
  }
  if (buf) chunks.push(buf);

  /* 2. summarise each chunk sequentially (could be parallel) */
  const partials = [];
  for (const c of chunks) {
    partials.push(await summarizeChunk(apiKey, c, model, nSent, customPrompt));
  }

  /* 3. merge – ask the model once more to compress the partial summaries */
  const mergePrompt = partials.map((s,i)=>`Chunk ${i+1}:\n${s}`).join("\n\n");
  return summarizeChunk(apiKey, mergePrompt, model, nSent, customPrompt);
}

/* --------------------------------------------------------------------- *
 * Summarise a single chunk                                              *
 * --------------------------------------------------------------------- */
async function summarizeChunk(apiKey, text, model, nSent, customPrompt="") {
  const template = customPrompt?.trim();
  const systemPrompt = template
    ? template.replace(/\{nSent\}/g, nSent)
    : `You are a concise assistant. Summarize the following text in `
    + `${nSent} sentence${nSent===1?"":"s"}.`;

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: `TEXT:\n"""\n${text}\n"""` }
    ],
    temperature: 0.3
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "No summary returned.";
}

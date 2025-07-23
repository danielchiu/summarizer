(function () {
  if (window.__ELEMENT_SUMMARIZER_LOADED__) return;
  window.__ELEMENT_SUMMARIZER_LOADED__ = true;

  /**************************************************************************
   *  GLOBAL STATE  (lives exactly once per tab)                            *
   **************************************************************************/
  let picking      = false;
  let hoverBox     = null;
  let lastHoverEl  = null;
  let overlayEl    = null;
  let outlinedEl   = null;

  /**************************************************************************
   *  1. messages from background                                           *
   **************************************************************************/
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "toggle-pick") {
      picking ? exitPickMode() : enterPickMode();
      sendResponse({ ok: true });             // <-- IMPORTANT
    } else if (msg.type === "ping") {
      sendResponse({ ok: true });
    }
    /* return false = no async reply */
  });

  /**************************************************************************
   *  2. escape cancels pick mode                                           *
   **************************************************************************/
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && picking) {
        exitPickMode();
      }
    },
    true
  );

  /**************************************************************************
   *  3. enter / exit pick mode                                             *
   **************************************************************************/
  function enterPickMode() {
    if (picking) return;
    picking = true;

    document.body.style.cursor = "crosshair";

    hoverBox = document.createElement("div");
    hoverBox.className = "ehover-box";
    document.body.appendChild(hoverBox);

    window.addEventListener("mousemove", onMouseMove,   true);
    window.addEventListener("click",     onMouseClick,  true);
    window.addEventListener("scroll",    syncBox, true);
    window.addEventListener("resize",    syncBox, true);
  }

  function exitPickMode() {
    picking = false;
    document.body.style.cursor = "";

    hoverBox?.remove();
    hoverBox     = null;
    lastHoverEl  = null;

    window.removeEventListener("mousemove", onMouseMove,   true);
    window.removeEventListener("click",     onMouseClick,  true);
    window.removeEventListener("scroll",    syncBox, true);
    window.removeEventListener("resize",    syncBox, true);
  }

  /**************************************************************************
   *  4. live outline helpers                                               *
   **************************************************************************/
  function onMouseMove(e) {
    if (!picking) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === lastHoverEl) return;
    lastHoverEl = el;
    drawOutline(el);
  }

  function syncBox() {
    if (lastHoverEl) drawOutline(lastHoverEl);
  }

  function drawOutline(el) {
    const r = el.getBoundingClientRect();
    hoverBox.style.top    = `${r.top  + scrollY}px`;
    hoverBox.style.left   = `${r.left + scrollX}px`;
    hoverBox.style.width  = `${r.width}px`;
    hoverBox.style.height = `${r.height}px`;
  }

  /**************************************************************************
   *  5. final click → request summary                                      *
   **************************************************************************/
  function onMouseClick(e) {
    if (!picking) return;
    e.preventDefault();
    e.stopPropagation();

    outlinedEl = lastHoverEl || e.target;
    exitPickMode();

    outlinedEl.classList.add("eprocessing");
    const text = getAllText(outlinedEl);

    chrome.runtime.sendMessage({ type: "summarize", text }, (resp) => {
      if (!resp) return;
      const msg = resp.ok ? resp.summary
                          : `❗ ${resp.error}`;
      showOverlay(msg, !resp.ok);
    });
  }

  /**************************************************************************
   *  6. overlay helpers                                                    *
   **************************************************************************/
  async function showOverlay(message, isError = false) {
    overlayEl?.remove();
    overlayEl = document.createElement("div");
    overlayEl.className = "esummary";
    if (isError) overlayEl.classList.add("error");

    /* close button */
    const close = document.createElement("span");
    close.className = "esum-close";
    close.textContent = "×";
    close.title = "Close";
    close.addEventListener("click", dismissOverlay);
    overlayEl.appendChild(close);

    /* body */
    const body = document.createElement("div");
    body.style.paddingTop = "8px";
    body.textContent = message;
    overlayEl.appendChild(body);

    document.body.appendChild(overlayEl);

    /* ----- apply user‑chosen font size -------------------------------- */
    const { fontSize = 14 } = await chrome.storage.sync.get("fontSize");
    overlayEl.style.fontSize = `${fontSize}px`;
  }

  function dismissOverlay() {
    overlayEl?.remove();
    overlayEl  = null;
    outlinedEl?.classList.remove("eprocessing");
    outlinedEl = null;
  }

  /**************************************************************************
   *  7. misc helpers                                                       *
   **************************************************************************/
  function getAllText(el) {
    if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) return "";
    return (el.innerText || "").replace(/\s+/g, " ").trim();
  }
})();   /*  <-- end of singleton IIFE  */

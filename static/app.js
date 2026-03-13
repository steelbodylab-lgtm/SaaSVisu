(function () {
  const API = "";
  let projectId = null;
  /** Texte renvoyé par la dernière détection (pour savoir si l’utilisateur a modifié avant rendu) */
  /** Segments (mots + timestamps) après détection, pour le rendu (même ordre que les boxes). */
  let currentSegments = null;
  const PHRASE_PAUSE_MS = 650;
  const WORDS_PER_LINE_MIN = 3;
  const WORDS_PER_LINE_MAX = 4;

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
  function groupSegmentsIntoPhrases(segments, pauseMs) {
    if (!segments || !segments.length) return [];
    var sorted = segments.slice().sort(function (a, b) { return (a.start_time_ms || 0) - (b.start_time_ms || 0); });
    var phrases = [];
    var current = [sorted[0]];
    for (var i = 1; i < sorted.length; i++) {
      var prevEnd = sorted[i - 1].end_time_ms || 0;
      var currStart = sorted[i].start_time_ms || 0;
      if (currStart - prevEnd >= pauseMs) { phrases.push(current); current = [sorted[i]]; } else { current.push(sorted[i]); }
    }
    if (current.length) phrases.push(current);
    return phrases;
  }

  /** Découpe les phrases en lignes de 3–4 mots (évite les lignes de 1–2 mots). */
  function phrasesToLines(phrases) {
    var lines = [];
    for (var p = 0; p < phrases.length; p++) {
      var phrase = phrases[p];
      if (!phrase || !phrase.length) continue;
      for (var i = 0; i < phrase.length; i += WORDS_PER_LINE_MAX) {
        var chunk = phrase.slice(i, i + WORDS_PER_LINE_MAX);
        if (chunk.length === 0) continue;
        if (chunk.length >= WORDS_PER_LINE_MIN || lines.length === 0) {
          lines.push(chunk);
        } else {
          lines[lines.length - 1] = lines[lines.length - 1].concat(chunk);
        }
      }
    }
    return lines;
  }

  function setStatus(elId, text, isError) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text || "";
    el.className = "feedback" + (text ? (isError ? " err" : " ok") : "");
  }

  function setProjectBadge(id) {
    projectId = id;
    const el = document.getElementById("project-badge");
    if (el) el.textContent = id ? `Projet : ${id}` : "";
  }

  async function ensureProject() {
    if (projectId) return projectId;
    const name = "Visualizer " + new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const r = await fetch(API + "/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || "Erreur création projet");
    setProjectBadge(data.id);
    return data.id;
  }

  function setupDropzone(dropzoneId, inputId, filenameId, uploadFn) {
    var dropzone = document.getElementById(dropzoneId);
    var input = document.getElementById(inputId);
    var filenameEl = document.getElementById(filenameId);
    if (!dropzone || !input) return;

    function setFile(name) {
      dropzone.classList.toggle("has-file", !!name);
      if (filenameEl) filenameEl.textContent = name || "";
    }

    function doUpload(file) {
      setFile(file.name);
      setStatus("upload-status", "Envoi…");
      uploadFn(file);
    }

    function onFileSelected() {
      var file = input.files && input.files[0];
      if (!file) return;
      try { doUpload(file); } catch (e) { setStatus("upload-status", "Erreur: " + (e && e.message ? e.message : String(e)), true); }
    }

    input.addEventListener("change", onFileSelected);
    input.addEventListener("focus", function () {
      setTimeout(function () {
        var file = input.files && input.files[0];
        if (file) onFileSelected();
      }, 50);
    });
    dropzone.addEventListener("click", function (e) {
      if (e.target === input) return;
      e.preventDefault();
      input.click();
    });

    dropzone.addEventListener("dragover", function (e) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", function (e) {
      if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", function (e) {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      doUpload(files[0]);
    });
  }

  async function uploadAudioFile(file) {
    setStatus("upload-status", "Envoi…");
    try {
      var id = projectId;
      if (!id) id = await ensureProject();
      var form = new FormData();
      form.append("file", file);
      var r = await fetch(API + "/projects/" + id + "/audio", { method: "POST", body: form });
      var text = await r.text();
      var data = {};
      try { data = JSON.parse(text); } catch (_) { data = { detail: text || "Erreur serveur" }; }
      if (r.ok) {
        setStatus("upload-status", "Audio enregistré. Choisis un extrait de 20 s ci-dessous.");
        showExcerptPanel(data.duration_seconds);
      } else {
        setStatus("upload-status", data.detail || "Erreur " + r.status, true);
      }
    } catch (e) {
      setStatus("upload-status", "Erreur: " + (e && e.message ? e.message : String(e)), true);
    }
  }

  function showExcerptPanel(durationSeconds) {
    var panel = document.getElementById("excerpt-panel");
    var startInput = document.getElementById("excerpt-start");
    var durationInput = document.getElementById("excerpt-duration");
    if (!panel || !startInput) return;
    if (durationSeconds != null && durationSeconds > 0) {
      startInput.max = Math.max(0, durationSeconds - 1);
      startInput.placeholder = "0 à " + Math.floor(durationSeconds);
    } else {
      fetch(API + "/projects/" + projectId + "/audio/duration")
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.duration_seconds > 0) {
            startInput.max = Math.max(0, d.duration_seconds - 1);
            startInput.placeholder = "0 à " + Math.floor(d.duration_seconds);
          }
        })
        .catch(function () {});
    }
    panel.classList.remove("hidden");
  }

  async function applyExcerpt() {
    var id = projectId;
    if (!id) return;
    var startInput = document.getElementById("excerpt-start");
    var durationInput = document.getElementById("excerpt-duration");
    var statusEl = document.getElementById("excerpt-status");
    var start = parseFloat(startInput && startInput.value) || 0;
    var duration = parseFloat(durationInput && durationInput.value) || 20;
    if (duration <= 0 || duration > 120) duration = 20;
    if (start < 0) start = 0;
    if (statusEl) statusEl.textContent = "Application de l'extrait…";
    try {
      var r = await fetch(API + "/projects/" + id + "/audio/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_seconds: start, duration_seconds: duration }),
      });
      var text = await r.text();
      var data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { detail: text || "Erreur serveur" }; }
      if (r.ok) {
        if (statusEl) { statusEl.textContent = "Extrait appliqué. Tu peux maintenant détecter les paroles (étape 2)."; statusEl.className = "feedback ok"; }
      } else {
        var msg = data.detail || ("Erreur " + r.status);
        if (r.status === 404 && (msg === "Not Found" || !data.detail)) {
          msg = "Route introuvable. Redémarre le serveur (uvicorn) puis réessaie.";
        }
        if (statusEl) { statusEl.textContent = msg; statusEl.className = "feedback err"; }
      }
    } catch (e) {
      if (statusEl) { statusEl.textContent = "Erreur: " + (e && e.message ? e.message : String(e)); statusEl.className = "feedback err"; }
    }
  }

  async function uploadBackgroundFile(file) {
    setStatus("upload-status", "Envoi…");
    try {
      var id = projectId;
      if (!id) id = await ensureProject();
      var form = new FormData();
      form.append("file", file);
      var r = await fetch(API + "/projects/" + id + "/background", { method: "POST", body: form });
      var text = await r.text();
      var data = {};
      try { data = JSON.parse(text); } catch (_) { data = { detail: text || "Erreur serveur" }; }
      if (r.ok) setStatus("upload-status", "Fond enregistré.");
      else setStatus("upload-status", data.detail || "Erreur " + r.status, true);
    } catch (e) {
      setStatus("upload-status", "Erreur: " + (e && e.message ? e.message : String(e)), true);
    }
  }

  var effectLabels = { minimal: "Minimal", classique: "Classique", outline_fin: "Contour fin", outline: "Contour", outline_epais: "Contour épais", outline_tres_epais: "Contour très épais", ombre: "Ombre", ombre_forte: "Ombre forte", ombre_tres_forte: "Ombre très forte", outline_ombre: "Contour + ombre", outline_ombre_fort: "Contour + ombre fort", gras: "Gras", gras_epais: "Gras épais", italique: "Italique", gras_italique: "Gras + italique", neon: "Néon", pop: "Pop", elegant: "Élégant", retro: "Rétro", discret: "Discret" };

  function fillDefaultOptions() {
    var fontSelect = document.getElementById("select-font");
    var effectSelect = document.getElementById("select-effect");
    if (fontSelect && !fontSelect.options.length) {
      ["Arial", "Impact", "Georgia", "Verdana", "Segoe UI", "Times New Roman"].forEach(function (f) {
        fontSelect.appendChild(new Option(f, f));
      });
    }
    if (effectSelect && !effectSelect.options.length) {
      [{ v: "classique", l: "Classique" }, { v: "outline", l: "Contour" }, { v: "gras", l: "Gras" }, { v: "minimal", l: "Minimal" }].forEach(function (o) {
        effectSelect.appendChild(new Option(o.l, o.v));
      });
    }
  }

  function loadRenderOptions() {
    fetch(API + "/config/options")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var fontSelect = document.getElementById("select-font");
        var effectSelect = document.getElementById("select-effect");
        if (fontSelect && data.fonts && data.fonts.length) {
          fontSelect.innerHTML = data.fonts.map(function (f) { return "<option value=\"" + f + "\">" + f + "</option>"; }).join("");
        }
        if (effectSelect && data.effects && data.effects.length) {
          effectSelect.innerHTML = data.effects.map(function (e) { return "<option value=\"" + e + "\">" + (effectLabels[e] || e) + "</option>"; }).join("");
        }
        fillDefaultOptions();
      })
      .catch(function () {
        fillDefaultOptions();
      });
  }

  function loadSpeechConfig() {
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 10000);
    fetch(API + "/config/speech?t=" + Date.now(), { signal: controller.signal })
      .then(function (r) { clearTimeout(timeoutId); return r.json(); })
      .then(function (data) {
        var badge = document.getElementById("engine-badge");
        var opts = document.getElementById("whisper-options");
        var wrap = document.getElementById("engine-select-wrap");
        var select = document.getElementById("select-engine");
        if (select) {
          var hasHeart = data.heartmula_available;
          var hasAzure = data.azure_available;
          select.innerHTML = "";
          if (hasHeart) select.appendChild(new Option(data.heartmula_local ? "HeartMuLa (local, gratuit)" : "HeartMuLa (WaveSpeed)", "heartmula"));
          if (hasAzure) select.appendChild(new Option("Azure Speech", "azure"));
          select.appendChild(new Option("Whisper", "whisper"));
          if (wrap) wrap.classList.toggle("hidden", !hasHeart && !hasAzure);
        }
        if (badge) {
          if (data.heartmula_available) badge.textContent = "Moteur : HeartMuLa";
          else if (data.azure_available) badge.textContent = "Moteur : Azure Speech";
          else badge.textContent = "Moteur : Whisper";
          badge.classList.toggle("whisper", !data.azure_available && !data.heartmula_available);
        }
        if (opts) opts.classList.toggle("hidden", data.heartmula_available || data.azure_available);
      })
      .catch(function () {
        clearTimeout(timeoutId);
        var badge = document.getElementById("engine-badge");
        var opts = document.getElementById("whisper-options");
        if (badge) { badge.textContent = "Moteur : Whisper"; badge.classList.add("whisper"); }
        if (opts) opts.classList.remove("hidden");
      });
  }

  function getWordsFromBoxes() {
    var out = [];
    document.querySelectorAll("#lyrics-words .word-box").forEach(function (box) {
      out.push((box.textContent || "").trim().replace(/\s+/g, " ") || "");
    });
    return out;
  }

  function getSegmentsFromBoxes() {
    var out = [];
    if (!currentSegments || !currentSegments.length) return out;
    document.querySelectorAll("#lyrics-words .word-box-wrap").forEach(function (wrap) {
      var idx = parseInt(wrap.getAttribute("data-segment-index"), 10);
      var seg = currentSegments[idx];
      if (!seg) return;
      var box = wrap.querySelector(".word-box");
      var text = (box && box.textContent ? box.textContent : "").trim().replace(/\s+/g, " ") || seg.text;
      out.push({ start_time_ms: seg.start_time_ms, end_time_ms: seg.end_time_ms, text: text });
    });
    return out;
  }

  function addWordAfterIndex(afterIdx) {
    if (!currentSegments || afterIdx < 0) return;
    var endMs = (currentSegments[afterIdx] && currentSegments[afterIdx].end_time_ms) || 0;
    var nextSeg = currentSegments[afterIdx + 1];
    var startMs = endMs + 100;
    var endMsNew = nextSeg ? Math.min((nextSeg.start_time_ms || 0) - 50, startMs + 500) : startMs + 500;
    if (endMsNew <= startMs) endMsNew = startMs + 400;
    var newSeg = { start_time_ms: startMs, end_time_ms: endMsNew, text: "" };
    currentSegments.splice(afterIdx + 1, 0, newSeg);
    document.querySelectorAll("#lyrics-words .word-box-wrap").forEach(function (wrap) {
      var idx = parseInt(wrap.getAttribute("data-segment-index"), 10);
      if (idx > afterIdx) wrap.setAttribute("data-segment-index", String(idx + 1));
    });
    document.querySelectorAll("#lyrics-words .add-word-btn").forEach(function (btn) {
      var v = btn.getAttribute("data-insert-after");
      if (v !== null) {
        var idx = parseInt(v, 10);
        if (idx > afterIdx) btn.setAttribute("data-insert-after", String(idx + 1));
      }
    });
    var wrapHtml = "<span class=\"word-box-wrap\" data-segment-index=\"" + (afterIdx + 1) + "\"><span class=\"word-box\" contenteditable=\"true\" spellcheck=\"false\"></span><button type=\"button\" class=\"word-box-delete\" aria-label=\"Supprimer le mot\">×</button></span>";
    var nextAdd = document.querySelector("#lyrics-words .word-box-wrap[data-segment-index=\"" + (afterIdx + 2) + "\"]");
    var insertBefore = nextAdd ? nextAdd.previousElementSibling : null;
    if (insertBefore && insertBefore.classList.contains("add-word-btn")) {
      var div = document.createElement("span");
      div.innerHTML = wrapHtml;
      insertBefore.parentNode.insertBefore(div.firstChild, insertBefore);
    } else {
      var refWrap = document.querySelector("#lyrics-words .word-box-wrap[data-segment-index=\"" + (afterIdx + 1) + "\"]");
      if (refWrap && refWrap.nextElementSibling && refWrap.nextElementSibling.classList.contains("add-word-btn")) {
        var div = document.createElement("span");
        div.innerHTML = wrapHtml;
        refWrap.parentNode.insertBefore(div.firstChild, refWrap.nextElementSibling);
      }
    }
  }

  function getPreviewStyle() {
    var fontSelect = document.getElementById("select-font");
    var effectSelect = document.getElementById("select-effect");
    var colorEl = document.getElementById("input-text-color");
    var sizeEl = document.getElementById("input-font-size");
    var posSelect = document.getElementById("select-position");
    return {
      font: (fontSelect && fontSelect.value) ? fontSelect.value : "Arial",
      effect: (effectSelect && effectSelect.value) ? effectSelect.value : "classique",
      color: (colorEl && colorEl.value) ? colorEl.value : "#FFFFFF",
      size: (sizeEl && sizeEl.value) ? parseInt(sizeEl.value, 10) : 48,
      position: (posSelect && posSelect.value) ? posSelect.value : "bottom",
    };
  }

  /** Affichage strict : le mot n'apparaît que entre start_time_ms et end_time_ms (les pauses restent vides). */
  function updatePreviewOverlay() {
    var overlay = document.getElementById("preview-overlay");
    var audio = document.getElementById("preview-audio");
    if (!overlay || !audio || !currentSegments || !currentSegments.length) return;
    var tMs = (audio.currentTime || 0) * 1000;
    var idx = -1;
    for (var i = 0; i < currentSegments.length; i++) {
      var s = currentSegments[i];
      var startMs = s.start_time_ms || 0;
      var endMs = s.end_time_ms || 0;
      if (tMs >= startMs && tMs < endMs) {
        idx = i;
        break;
      }
    }
    var text = "";
    document.querySelectorAll("#lyrics-words .word-box-wrap").forEach(function (w) { w.classList.remove("current-word"); });
    if (idx >= 0) {
      var wrap = document.querySelector("#lyrics-words .word-box-wrap[data-segment-index=\"" + idx + "\"]");
      if (wrap) wrap.classList.add("current-word");
      var box = wrap && wrap.querySelector(".word-box");
      text = (box && box.textContent ? box.textContent : "").trim().replace(/\s+/g, " ") || (currentSegments[idx].text || "");
    }
    overlay.textContent = text;
    var st = getPreviewStyle();
    overlay.style.fontFamily = st.font;
    overlay.style.fontSize = st.size + "px";
    overlay.style.color = st.color;
    overlay.className = "preview-overlay preview-pos-" + st.position;
  }

  var previewAnimationId = null;
  function previewSyncLoop() {
    updatePreviewOverlay();
    var audio = document.getElementById("preview-audio");
    if (audio && !audio.paused && !audio.ended) {
      previewAnimationId = requestAnimationFrame(previewSyncLoop);
    } else {
      previewAnimationId = null;
    }
  }

  function setPreviewStageRatio() {
    var stage = document.getElementById("preview-stage");
    var ratioEl = document.getElementById("select-ratio");
    if (stage && ratioEl) stage.setAttribute("data-ratio", ratioEl.value || "16:9");
  }

  function startPreview() {
    if (!projectId || !currentSegments || !currentSegments.length) return;
    var area = document.getElementById("preview-area");
    var audio = document.getElementById("preview-audio");
    var stage = document.getElementById("preview-stage");
    var bgImg = document.getElementById("preview-bg-img");
    var bgVideo = document.getElementById("preview-bg-video");
    if (!area || !audio) return;
    area.classList.remove("hidden");
    setPreviewStageRatio();
    var ratioEl = document.getElementById("select-ratio");
    if (ratioEl) ratioEl.addEventListener("change", setPreviewStageRatio);
    audio.src = API + "/projects/" + projectId + "/audio";
    audio.onseeked = function () {
      updatePreviewOverlay();
      if (previewAnimationId == null && !audio.paused) previewAnimationId = requestAnimationFrame(previewSyncLoop);
    };
    audio.onplay = function () {
      if (previewAnimationId != null) cancelAnimationFrame(previewAnimationId);
      previewAnimationId = requestAnimationFrame(previewSyncLoop);
    };
    audio.onpause = audio.onended = function () {
      if (previewAnimationId != null) {
        cancelAnimationFrame(previewAnimationId);
        previewAnimationId = null;
      }
      updatePreviewOverlay();
    };
    audio.ontimeupdate = function () {
      if (bgVideo && bgVideo.classList.contains("active")) {
        bgVideo.currentTime = audio.currentTime;
      }
    };
    fetch(API + "/projects/" + projectId + "/project-info")
      .then(function (r) { return r.json(); })
      .then(function (info) {
        if (info.background_type && stage) {
          var url = API + "/projects/" + projectId + "/background";
          if (info.background_type === "video") {
            bgVideo.src = url;
            bgVideo.classList.add("active");
            bgImg.classList.remove("active");
          } else {
            bgImg.src = url;
            bgImg.classList.add("active");
            bgVideo.classList.remove("active");
          }
        } else {
          bgImg.classList.remove("active");
          bgVideo.classList.remove("active");
        }
      })
      .catch(function () {
        bgImg.classList.remove("active");
        bgVideo.classList.remove("active");
      });
    ["select-font", "select-effect", "input-text-color", "input-font-size", "select-position"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", updatePreviewOverlay);
      if (id === "input-font-size") {
        if (el) el.addEventListener("input", updatePreviewOverlay);
      }
    });
    updatePreviewOverlay();
  }

  document.addEventListener("DOMContentLoaded", function () {
    fillDefaultOptions();
    setupDropzone("dropzone-audio", "input-audio", "audio-filename", uploadAudioFile);
    setupDropzone("dropzone-background", "input-background", "background-filename", uploadBackgroundFile);
    var btnApplyExcerpt = document.getElementById("btn-apply-excerpt");
    if (btnApplyExcerpt) btnApplyExcerpt.addEventListener("click", applyExcerpt);
    ensureProject().then(function () {}, function () {});
    loadRenderOptions();
    loadSpeechConfig();

    document.getElementById("lyrics-words").addEventListener("click", function (e) {
      /* Édition du texte des mots uniquement (pas de suppression ni d’ajout). */
    });

    document.getElementById("btn-detect-lyrics").addEventListener("click", async function () {
    try {
      const id = await ensureProject();
      const modelEl = document.getElementById("select-whisper-model");
      const model = modelEl ? modelEl.value : "large";
      var phraseHints = getWordsFromBoxes().filter(Boolean).join(" ");
      if (!phraseHints && currentSegments && currentSegments.length) phraseHints = currentSegments.map(function (s) { return s.text; }).join(" ");
      setStatus("sync-status", "Détection en cours…");
      var engineEl = document.getElementById("select-engine");
      var engine = (engineEl && engineEl.value) ? engineEl.value : "whisper";
      var query = "engine=" + encodeURIComponent(engine);
      if (engine === "whisper") query = "whisper_model=" + encodeURIComponent(model) + "&" + query;
      const opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: phraseHints ? JSON.stringify({ phrase_hints: phraseHints }) : "{}" };
      const r = await fetch(API + "/projects/" + id + "/analyze?" + query, opts);
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur");
      const wordsContainer = document.getElementById("lyrics-words");
      if (data.segments && data.segments.length && wordsContainer) {
        currentSegments = data.segments;
        wordsContainer.innerHTML = data.segments.map(function (w, idx) {
          return "<span class=\"word-box-wrap\" data-segment-index=\"" + idx + "\"><span class=\"word-box\" contenteditable=\"true\" spellcheck=\"false\">" + escapeHtml(w.text || "") + "</span></span>";
        }).join(" ");
        wordsContainer.classList.remove("hidden");
        startPreview();
      }
      var engineLabel = data.engine === "heartmula" ? "HeartMuLa" : (data.engine === "azure" ? "Azure Speech" : "Whisper");
      setStatus("sync-status", data.words_count + " mots détectés (" + engineLabel + "). Les mots s’afficheront en même temps qu’ils sont chantés au rendu.");
    } catch (e) {
      setStatus("sync-status", e.message, true);
    }
  });

    var btnExport = document.getElementById("btn-export");
    if (btnExport) btnExport.addEventListener("click", async function () {
    try {
      const id = await ensureProject();
      var segments = getSegmentsFromBoxes();
      if (!segments || !segments.length) {
        setStatus("render-status", "Détecte les paroles d'abord ou ajoute des mots.", true);
        return;
      }
      const ratio = document.getElementById("select-ratio").value;
      const resolution = document.getElementById("select-resolution").value;
      const fontSelect = document.getElementById("select-font");
      const effectSelect = document.getElementById("select-effect");
      const font = (fontSelect && fontSelect.value) ? fontSelect.value : "Arial";
      const effect = (effectSelect && effectSelect.value) ? effectSelect.value : "classique";
      const colorEl = document.getElementById("input-text-color");
      const textColor = colorEl ? colorEl.value : "#FFFFFF";

      setStatus("render-status", "Enregistrement des mots et rendu…");
      let r = await fetch(API + "/projects/" + id + "/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: segments }),
      });
      let data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur synchro");

      setStatus("render-status", "Rendu en cours (1–2 min)…");
      const sizeEl = document.getElementById("input-font-size");
      const fontSize = (sizeEl && sizeEl.value) ? parseInt(sizeEl.value, 10) : 48;
      const params = new URLSearchParams({ template: "minimal_16x9", ratio: ratio, resolution: resolution, font: font, effect: effect, font_size: String(fontSize) });
      if (textColor) params.set("text_color", textColor.replace(/^#/, ""));
      const r2 = await fetch(API + "/projects/" + id + "/render?" + params.toString(), { method: "POST" });
      const text = await r2.text();
      let data2 = {};
      try { data2 = text ? JSON.parse(text) : {}; } catch (_) {}
      const msg = Array.isArray(data2.detail) ? data2.detail.map(function (d) { return d.msg || d; }).join(", ") : (data2.detail || data2.message || text || "Erreur serveur");
      if (!r2.ok) throw new Error(msg);
      setStatus("render-status", "Vidéo générée.");
      showDownloadLink();
    } catch (e) {
      setStatus("render-status", e.message, true);
    }
  });

  }); // DOMContentLoaded

  function showDownloadLink() {
    if (!projectId) return;
    var link = document.getElementById("link-download");
    var postExport = document.getElementById("post-export");
    if (link) {
      link.href = API + "/projects/" + projectId + "/download";
      link.download = "saasvisu_output.mp4";
    }
    if (postExport) postExport.classList.remove("hidden");
  }
})();

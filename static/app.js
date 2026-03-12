(function () {
  const API = "";
  let projectId = null;

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
    const dropzone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    const filenameEl = document.getElementById(filenameId);
    if (!dropzone || !input) return;

    function setFile(name) {
      dropzone.classList.toggle("has-file", !!name);
      if (filenameEl) filenameEl.textContent = name ? name : "";
    }

    dropzone.addEventListener("click", () => input.click());
    dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (!file) return;
      input.files = e.dataTransfer.files;
      setFile(file.name);
      uploadFn(file);
    });

    input.addEventListener("change", () => {
      const file = input.files[0];
      if (!file) return;
      setFile(file.name);
      uploadFn(file);
    });
  }

  async function uploadAudioFile(file) {
    setStatus("upload-status", "Envoi de l’audio…");
    try {
      const id = await ensureProject();
      const form = new FormData();
      form.append("file", file);
      const r = await fetch(API + "/projects/" + id + "/audio", { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur");
      setStatus("upload-status", "Audio enregistré.");
    } catch (e) {
      setStatus("upload-status", e.message, true);
    }
  }

  async function uploadBackgroundFile(file) {
    setStatus("upload-status", "Envoi du fond…");
    try {
      const id = await ensureProject();
      const form = new FormData();
      form.append("file", file);
      const r = await fetch(API + "/projects/" + id + "/background", { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur");
      setStatus("upload-status", "Fond enregistré.");
    } catch (e) {
      setStatus("upload-status", e.message, true);
    }
  }

  function loadRenderOptions() {
    fetch(API + "/config/options")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var fontSelect = document.getElementById("select-font");
        var effectSelect = document.getElementById("select-effect");
        var effectLabels = { minimal: "Minimal", classique: "Classique", outline_fin: "Contour fin", outline: "Contour", outline_epais: "Contour épais", outline_tres_epais: "Contour très épais", ombre: "Ombre", ombre_forte: "Ombre forte", ombre_tres_forte: "Ombre très forte", outline_ombre: "Contour + ombre", outline_ombre_fort: "Contour + ombre fort", gras: "Gras", gras_epais: "Gras épais", italique: "Italique", gras_italique: "Gras + italique", neon: "Néon", pop: "Pop", elegant: "Élégant", retro: "Rétro", discret: "Discret" };
        if (fontSelect && data.fonts && data.fonts.length) {
          fontSelect.innerHTML = data.fonts.map(function (f) { return "<option value=\"" + f + "\">" + f + "</option>"; }).join("");
        }
        if (effectSelect && data.effects && data.effects.length) {
          effectSelect.innerHTML = data.effects.map(function (e) { return "<option value=\"" + e + "\">" + (effectLabels[e] || e) + "</option>"; }).join("");
        }
      })
      .catch(function () {
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
      });
  }

  function loadSpeechConfig() {
    fetch(API + "/config/speech")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var el = document.getElementById("detect-engine-label");
        if (el) el.textContent = data.azure_available ? "Azure (cloud, gratuit 5 h/mois)" : "Whisper (local)";
      })
      .catch(function () {
        var el = document.getElementById("detect-engine-label");
        if (el) el.textContent = "Whisper (local)";
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupDropzone("dropzone-audio", "input-audio", "audio-filename", uploadAudioFile);
    setupDropzone("dropzone-background", "input-background", "background-filename", uploadBackgroundFile);
    ensureProject();
    loadRenderOptions();
    loadSpeechConfig();
  });

  document.getElementById("btn-detect-lyrics").addEventListener("click", async function () {
    try {
      const id = await ensureProject();
      const modelEl = document.getElementById("select-whisper-model");
      const model = modelEl ? modelEl.value : "large";
      setStatus("sync-status", "Détection en cours… (quelques instants avec Azure, plus long avec Whisper)");
      const r = await fetch(API + "/projects/" + id + "/analyze?whisper_model=" + encodeURIComponent(model), { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur");
      var engineLabel = data.engine === "azure" ? " (Azure)" : " (Whisper)";
      setStatus("sync-status", data.words_count + " mots détectés" + engineLabel + ". Tu peux lancer le rendu.");
    } catch (e) {
      setStatus("sync-status", e.message, true);
    }
  });

  document.getElementById("btn-analyze").addEventListener("click", async function () {
    try {
      const id = await ensureProject();
      const text = document.getElementById("lyrics-text").value.trim();
      if (!text) {
        setStatus("sync-status", "Saisis les paroles ou utilise la détection auto d’analyser.", true);
        return;
      }
      setStatus("sync-status", "Enregistrement des paroles…");
      let r = await fetch(API + "/projects/" + id + "/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      let data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur paroles");
      setStatus("sync-status", "Analyse de la voix (Whisper), ça peut prendre 1–2 min…");
      r = await fetch(API + "/projects/" + id + "/sync?use_whisper=true", { method: "POST" });
      data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur synchro");
      setStatus("sync-status", data.segments_count + " segments alignés sur la voix.");
    } catch (e) {
      setStatus("sync-status", e.message, true);
    }
  });

  document.getElementById("btn-render").addEventListener("click", async function () {
    try {
      const id = await ensureProject();
      const ratio = document.getElementById("select-ratio").value;
      const resolution = document.getElementById("select-resolution").value;
      const font = (document.getElementById("select-font") && document.getElementById("select-font").value) || "";
      const effect = (document.getElementById("select-effect") && document.getElementById("select-effect").value) || "";
      const colorEl = document.getElementById("input-text-color");
      const textColor = colorEl ? colorEl.value : "#FFFFFF";
      setStatus("render-status", "Rendu en cours (1–2 min)…");
      const params = new URLSearchParams({ template: "minimal_16x9", ratio: ratio, resolution: resolution });
      if (font) params.set("font", font);
      if (effect) params.set("effect", effect);
      if (textColor) params.set("text_color", textColor.replace(/^#/, ""));
      const r = await fetch(API + "/projects/" + id + "/render?" + params.toString(), { method: "POST" });
      const text = await r.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (_) {}
      const msg = Array.isArray(data.detail) ? data.detail.map(d => d.msg || d).join(", ") : (data.detail || data.message || text || "Erreur serveur");
      if (!r.ok) throw new Error(msg);
      setStatus("render-status", "Vidéo générée.");
      showVideo();
    } catch (e) {
      setStatus("render-status", e.message, true);
    }
  });

  function showVideo() {
    if (!projectId) return;
    const video = document.getElementById("video-player");
    const placeholder = document.getElementById("video-placeholder");
    const link = document.getElementById("link-download");
    video.src = API + "/projects/" + projectId + "/video?t=" + Date.now();
    video.dataset.ready = "true";
    placeholder.classList.add("hidden");
    link.href = API + "/projects/" + projectId + "/download";
    link.download = "saasvisu_output.mp4";
    link.style.display = "inline-block";
    video.load();
  }
})();

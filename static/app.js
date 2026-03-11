(function () {
  const API = "";
  let projectId = null;

  function setStatus(elId, text, isError) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text || "";
    el.className = "status" + (text ? (isError ? " err" : " ok") : "");
  }

  function setProjectId(id) {
    projectId = id;
    const el = document.getElementById("project-id");
    if (el) el.textContent = id ? `Projet actif : ${id}` : "";
  }

  async function createProject() {
    const name = document.getElementById("project-name").value.trim() || "Sans titre";
    setStatus("project-status", "Création…");
    try {
      const r = await fetch(API + "/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur");
      setProjectId(data.id);
      setStatus("project-status", `Projet créé : ${data.name}`);
    } catch (e) {
      setStatus("project-status", e.message, true);
    }
  }

  async function uploadAudio() {
    if (!projectId) { setStatus("audio-status", "Créez d’abord un projet.", true); return; }
    const input = document.getElementById("input-audio");
    if (!input.files.length) { setStatus("audio-status", "Choisissez un fichier.", true); return; }
    setStatus("audio-status", "Envoi…");
    const form = new FormData();
    form.append("file", input.files[0]);
    try {
      const r = await fetch(API + "/projects/" + projectId + "/audio", { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur");
      setStatus("audio-status", "Audio enregistré.");
    } catch (e) {
      setStatus("audio-status", e.message, true);
    }
  }

  async function uploadBackground() {
    if (!projectId) { setStatus("background-status", "Créez d’abord un projet.", true); return; }
    const input = document.getElementById("input-background");
    if (!input.files.length) { setStatus("background-status", "Choisissez une photo ou une vidéo.", true); return; }
    setStatus("background-status", "Envoi…");
    const form = new FormData();
    form.append("file", input.files[0]);
    try {
      const r = await fetch(API + "/projects/" + projectId + "/background", { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur");
      setStatus("background-status", "Fond enregistré.");
    } catch (e) {
      setStatus("background-status", e.message, true);
    }
  }

  async function saveLyrics() {
    if (!projectId) { setStatus("lyrics-status", "Créez d’abord un projet.", true); return; }
    const text = document.getElementById("lyrics-text").value.trim();
    if (!text) { setStatus("lyrics-status", "Saisissez les paroles.", true); return; }
    setStatus("lyrics-status", "Enregistrement…");
    try {
      const r = await fetch(API + "/projects/" + projectId + "/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur");
      setStatus("lyrics-status", data.lines_count + " lignes enregistrées.");
    } catch (e) {
      setStatus("lyrics-status", e.message, true);
    }
  }

  async function runSync() {
    if (!projectId) { setStatus("sync-status", "Créez d’abord un projet.", true); return; }
    setStatus("sync-status", "Synchronisation…");
    try {
      const r = await fetch(API + "/projects/" + projectId + "/sync", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur");
      setStatus("sync-status", data.segments_count + " segments synchronisés.");
    } catch (e) {
      setStatus("sync-status", e.message, true);
    }
  }

  async function runRender() {
    if (!projectId) { setStatus("render-status", "Créez d’abord un projet.", true); return; }
    const template = document.getElementById("select-template").value;
    const ratio = document.getElementById("select-ratio").value;
    const resolution = document.getElementById("select-resolution").value;
    setStatus("render-status", "Rendu en cours (peut prendre 1–2 min)…");
    try {
      const r = await fetch(
        API + "/projects/" + projectId + "/render?template=" + encodeURIComponent(template) +
        "&ratio=" + encodeURIComponent(ratio) + "&resolution=" + encodeURIComponent(resolution),
        { method: "POST" }
      );
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
  }

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

  document.getElementById("btn-create-project").addEventListener("click", createProject);
  document.getElementById("btn-upload-audio").addEventListener("click", uploadAudio);
  document.getElementById("btn-upload-background").addEventListener("click", uploadBackground);
  document.getElementById("btn-save-lyrics").addEventListener("click", saveLyrics);
  document.getElementById("btn-sync").addEventListener("click", runSync);
  document.getElementById("btn-render").addEventListener("click", runRender);
})();

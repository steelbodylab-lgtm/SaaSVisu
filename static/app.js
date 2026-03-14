(function () {
  var API = "";
  var projectId = null;
  var currentSegments = null;
  var currentPhrases = [];
  var displayMode = "mot";
  var PHRASE_GAP_MS = 550;
  var currentBeats = [];
  var beatEffect = "none";
  var lastBeatIdx = -1;

  function groupIntoPhrases(segments) {
    if (!segments || !segments.length) return [];
    var phrases = [];
    var cur = [{ seg: segments[0], idx: 0 }];
    for (var i = 1; i < segments.length; i++) {
      var prevEnd = segments[i - 1].end_time_ms || 0;
      var currStart = segments[i].start_time_ms || 0;
      if (currStart - prevEnd >= PHRASE_GAP_MS) {
        phrases.push(cur);
        cur = [{ seg: segments[i], idx: i }];
      } else {
        cur.push({ seg: segments[i], idx: i });
      }
    }
    if (cur.length) phrases.push(cur);
    return phrases;
  }

  /* ======== AUDIO-REACTIVE : Web Audio API ======== */
  var audioCtx = null;
  var analyser = null;
  var audioSource = null;
  var bassData = new Uint8Array(0);
  var bassEnergy = 0;
  var bassSmooth = 0;
  var audioReactiveRunning = false;

  function initAudioContext(audioEl) {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      bassData = new Uint8Array(analyser.frequencyBinCount);
      audioSource = audioCtx.createMediaElementSource(audioEl);
      audioSource.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch (_) {}
  }

  function getBassEnergy() {
    if (!analyser) return 0;
    analyser.getByteFrequencyData(bassData);
    var sum = 0;
    var bassBins = 6;
    for (var i = 0; i < bassBins; i++) sum += bassData[i];
    return sum / (bassBins * 255);
  }

  function audioReactiveLoop() {
    if (!audioReactiveRunning) return;
    bassEnergy = getBassEnergy();
    bassSmooth += (bassEnergy - bassSmooth) * 0.3;

    var stage = document.getElementById("preview-stage");
    if (stage) {
      if (bassSmooth > 0.15) {
        stage.classList.add("bass-hit");
        var sc = 1 + bassSmooth * 0.025;
        stage.style.transform = "scale(" + sc.toFixed(4) + ")";
      } else {
        stage.classList.remove("bass-hit");
        stage.style.transform = "";
      }
    }

    var bgImg = document.getElementById("preview-bg-img");
    var bgVid = document.getElementById("preview-bg-video");
    var activeBg = (bgVid && bgVid.classList.contains("active")) ? bgVid : bgImg;
    if (activeBg && activeBg.classList.contains("active")) {
      var bright = 1 + bassSmooth * 0.15;
      activeBg.style.filter = "brightness(" + bright.toFixed(3) + ")";
    }

    requestAnimationFrame(audioReactiveLoop);
  }

  function startAudioReactive() {
    if (audioReactiveRunning) return;
    audioReactiveRunning = true;
    requestAnimationFrame(audioReactiveLoop);
  }
  function stopAudioReactive() {
    audioReactiveRunning = false;
    var stage = document.getElementById("preview-stage");
    if (stage) { stage.classList.remove("bass-hit"); stage.style.transform = ""; }
    var bgImg = document.getElementById("preview-bg-img");
    var bgVid = document.getElementById("preview-bg-video");
    if (bgImg) bgImg.style.filter = "";
    if (bgVid) bgVid.style.filter = "";
  }

  /* ======== EXTRACTION COULEUR DOMINANTE ======== */
  function extractDominantColor(imgEl) {
    try {
      var cv = document.createElement("canvas");
      var sz = 32;
      cv.width = sz; cv.height = sz;
      var ctx = cv.getContext("2d");
      ctx.drawImage(imgEl, 0, 0, sz, sz);
      var data = ctx.getImageData(0, 0, sz, sz).data;
      var rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (var i = 0; i < data.length; i += 16) {
        var r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 128) continue;
        var lum = r * 0.299 + g * 0.587 + b * 0.114;
        if (lum < 20 || lum > 240) continue;
        rSum += r; gSum += g; bSum += b; count++;
      }
      if (count > 0) {
        applyDominantColor(Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count));
      }
    } catch (_) {}
  }

  function extractDominantColorFromVideo(vidEl) {
    try {
      var cv = document.createElement("canvas");
      cv.width = 32; cv.height = 32;
      var ctx = cv.getContext("2d");
      ctx.drawImage(vidEl, 0, 0, 32, 32);
      var data = ctx.getImageData(0, 0, 32, 32).data;
      var rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (var i = 0; i < data.length; i += 16) {
        var r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 128) continue;
        var lum = r * 0.299 + g * 0.587 + b * 0.114;
        if (lum < 20 || lum > 240) continue;
        rSum += r; gSum += g; bSum += b; count++;
      }
      if (count > 0) applyDominantColor(Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count));
    } catch (_) {}
  }

  function applyDominantColor(r, g, b) {
    var root = document.documentElement;
    root.style.setProperty("--dominant-r", r);
    root.style.setProperty("--dominant-g", g);
    root.style.setProperty("--dominant-b", b);
  }

  /* ======== PARTICLES (60fps, non-linear motion) ======== */
  function initParticles() {
    var c = document.getElementById("particles");
    if (!c) return;
    var ctx = c.getContext("2d");
    var pts = [];
    var count = 50;
    function resize() { c.width = window.innerWidth; c.height = window.innerHeight; }
    resize();
    window.addEventListener("resize", resize);
    for (var i = 0; i < count; i++) {
      pts.push({
        x: Math.random() * c.width, y: Math.random() * c.height,
        r: Math.random() * 2 + .5,
        vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4,
        o: Math.random() * .4 + .1,
        phase: Math.random() * Math.PI * 2
      });
    }
    var time = 0;
    (function draw() {
      ctx.clearRect(0, 0, c.width, c.height);
      time += 0.008;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var wave = Math.sin(time + p.phase) * 0.15;
        p.x += p.vx + wave;
        p.y += p.vy + Math.cos(time + p.phase) * 0.1;
        if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0;
        if (p.y < 0) p.y = c.height; if (p.y > c.height) p.y = 0;
        var pulsedR = p.r + bassSmooth * 2;
        var pulsedO = p.o + bassSmooth * 0.3;
        ctx.beginPath(); ctx.arc(p.x, p.y, pulsedR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(167,139,250," + pulsedO.toFixed(3) + ")"; ctx.fill();
      }
      for (var i = 0; i < pts.length; i++) {
        for (var j = i + 1; j < pts.length; j++) {
          var dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = "rgba(124,92,191," + (.08 * (1 - dist / 120) + bassSmooth * 0.06).toFixed(4) + ")";
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    })();
  }

  /* ======== ANIM CAROUSEL (showcase lyric animations) ======== */
  var selectedLyricAnim = null;
  var lastOverlayWordIdx = -1;

  var LYRIC_ANIMS = [
    { cls: "lyric-anim-fadeIn", label: "Fade In" },
    { cls: "lyric-anim-slideUp", label: "Slide Up" },
    { cls: "lyric-anim-slideDown", label: "Slide Down" },
    { cls: "lyric-anim-scaleIn", label: "Scale In" },
    { cls: "lyric-anim-bounceIn", label: "Bounce In" },
    { cls: "lyric-anim-glitch", label: "Glitch" },
    { cls: "lyric-anim-blurReveal", label: "Blur Reveal" },
    { cls: "lyric-anim-flipIn", label: "Flip 3D" },
    { cls: "lyric-anim-neonPulse", label: "Néon Pulse" },
    { cls: "lyric-anim-dropIn", label: "Drop In" },
    { cls: "lyric-anim-zoomBlur", label: "Zoom Blur" },
    { cls: "lyric-anim-typewriter", label: "Typewriter" },
    { cls: "lyric-anim-waveIn", label: "Wave In" },
    { cls: "lyric-anim-splitReveal", label: "Split Reveal" },
    { cls: "lyric-anim-spinIn", label: "Spin In" }
  ];
  var DEMO_PHRASES = [
    "Tes paroles prennent vie",
    "La musique guide les mots",
    "Chaque syllabe vibre",
    "Le beat pulse dans le texte",
    "Les mots dansent sur le son",
    "Un flow visuel unique",
    "Ta voix en mouvement"
  ];

  function initAnimCarousel() {
    var textEl = document.getElementById("anim-demo-text");
    var labelEl = document.getElementById("anim-label");
    var dotsEl = document.getElementById("anim-dots");
    var prevBtn = document.getElementById("anim-prev");
    var nextBtn = document.getElementById("anim-next");
    var shuffleBtn = document.getElementById("anim-shuffle");
    var applyBtn = document.getElementById("anim-apply");
    var selectedLabel = document.getElementById("anim-selected-label");
    if (!textEl || !labelEl || !dotsEl) return;

    var total = LYRIC_ANIMS.length;
    var currentIdx = 0;
    var autoId = null;
    var shuffledOrder = [];
    var browsingAnimIdx = 0;

    function shuffleArray(arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
      return a;
    }

    function generateOrder() {
      shuffledOrder = shuffleArray(Array.from({ length: total }, function (_, i) { return i; }));
    }
    generateOrder();

    for (var d = 0; d < total; d++) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "anim-carousel-dot" + (d === 0 ? " active" : "");
      (function (idx) { dot.addEventListener("click", function () { goTo(idx); }); })(d);
      dotsEl.appendChild(dot);
    }

    function goTo(idx) {
      currentIdx = ((idx % total) + total) % total;
      browsingAnimIdx = shuffledOrder[currentIdx];
      var anim = LYRIC_ANIMS[browsingAnimIdx];

      LYRIC_ANIMS.forEach(function (a) { textEl.classList.remove(a.cls); });
      textEl.style.animation = "none";
      void textEl.offsetWidth;
      textEl.style.animation = "";

      textEl.textContent = DEMO_PHRASES[Math.floor(Math.random() * DEMO_PHRASES.length)];
      textEl.classList.add(anim.cls);
      labelEl.textContent = anim.label;

      dotsEl.querySelectorAll(".anim-carousel-dot").forEach(function (dd, i) {
        dd.classList.toggle("active", i === currentIdx);
      });
    }

    function next() { goTo(currentIdx + 1); }
    function prev() { goTo(currentIdx - 1); }

    function startAuto() {
      stopAuto();
      autoId = setInterval(next, 3000);
    }
    function stopAuto() { if (autoId) { clearInterval(autoId); autoId = null; } }

    if (prevBtn) prevBtn.addEventListener("click", function () { prev(); startAuto(); });
    if (nextBtn) nextBtn.addEventListener("click", function () { next(); startAuto(); });
    if (shuffleBtn) shuffleBtn.addEventListener("click", function () {
      generateOrder();
      goTo(0);
      startAuto();
    });

    if (applyBtn) applyBtn.addEventListener("click", function () {
      var anim = LYRIC_ANIMS[browsingAnimIdx];
      selectedLyricAnim = anim;
      lastOverlayWordIdx = -1;
      if (selectedLabel) selectedLabel.textContent = "Animation active : " + anim.label;
      stopAuto();
    });

    var carousel = document.getElementById("anim-carousel");
    if (carousel) {
      carousel.addEventListener("mouseenter", stopAuto);
      carousel.addEventListener("mouseleave", function () { if (!selectedLyricAnim) startAuto(); });
    }

    goTo(0);
    startAuto();
  }

  /* ======== SCROLL ANIMATIONS ======== */
  function initScrollAnimations() {
    var els = document.querySelectorAll(".anim-reveal,.anim-fade,.anim-slide-up,.anim-slide-right,.anim-word");
    if (!els.length) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); } });
    }, { threshold: .12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (el) { obs.observe(el); });
  }

  /* ======== FULLSCREEN STEPS — zoom in/out ======== */
  function initFullstepScroll() {
    var steps = document.querySelectorAll(".fullstep");
    if (!steps.length) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in-view");
          e.target.classList.remove("zoom-out");
        } else {
          if (e.target.classList.contains("in-view")) {
            e.target.classList.add("zoom-out");
            e.target.classList.remove("in-view");
          }
        }
      });
    }, { threshold: .25, rootMargin: "-5% 0px -5% 0px" });
    steps.forEach(function (s) { obs.observe(s); });

    document.querySelectorAll(".btn-next, .btn-prev").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = document.getElementById(btn.dataset.goto);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  /* ======== VIGNETTES ======== */
  function initVignettes() {
    document.querySelectorAll(".vignette").forEach(function (v) {
      v.addEventListener("click", function () {
        document.querySelectorAll(".vignette").forEach(function (x) { x.classList.remove("vignette-selected"); });
        v.classList.add("vignette-selected");
        var fmt = v.dataset.format;
        if (fmt) {
          var ratioInput = document.getElementById("select-ratio");
          if (ratioInput) ratioInput.value = fmt;
          document.querySelectorAll('.pill[data-ratio]').forEach(function (p) {
            p.classList.toggle("pill-active", p.dataset.ratio === fmt);
          });
          setPreviewStageRatio();
        }
      });
    });
  }

  /* ======== PILLS ======== */
  function initPills() {
    document.querySelectorAll(".format-pills").forEach(function (group) {
      group.querySelectorAll(".pill").forEach(function (pill) {
        pill.addEventListener("click", function () {
          group.querySelectorAll(".pill").forEach(function (p) { p.classList.remove("pill-active"); });
          pill.classList.add("pill-active");
          if (pill.dataset.ratio) document.getElementById("select-ratio").value = pill.dataset.ratio;
          if (pill.dataset.res) document.getElementById("select-resolution").value = pill.dataset.res;
          if (pill.dataset.pos) {
            document.getElementById("select-position").value = pill.dataset.pos;
            if (pill.dataset.pos === "drag") enableDragMode(); else disableDragMode();
          }
          if (pill.dataset.display) {
            displayMode = pill.dataset.display;
            document.getElementById("select-display").value = pill.dataset.display;
          }
          if (pill.dataset.beat) {
            beatEffect = pill.dataset.beat;
            document.getElementById("select-beat-effect").value = pill.dataset.beat;
          }
          setPreviewStageRatio();
          updatePreviewOverlay();
        });
      });
    });
    var sizeInput = document.getElementById("input-font-size");
    var sizeVal = document.getElementById("font-size-val");
    if (sizeInput && sizeVal) {
      sizeInput.addEventListener("input", function () { sizeVal.textContent = sizeInput.value; updatePreviewOverlay(); });
    }
  }

  /* ======== DRAG OVERLAY ======== */
  var isDragMode = false, isDragging = false, dragOffset = { x: 0, y: 0 };
  function enableDragMode() {
    isDragMode = true;
    var ov = document.getElementById("preview-overlay");
    if (ov) { ov.classList.add("preview-pos-drag"); ov.classList.remove("preview-pos-bottom", "preview-pos-center", "preview-pos-top"); ov.style.left = "50%"; ov.style.top = "50%"; ov.style.right = "auto"; ov.style.transform = "translate(-50%,-50%)"; }
  }
  function disableDragMode() {
    isDragMode = false; isDragging = false;
    var ov = document.getElementById("preview-overlay");
    if (ov) { ov.classList.remove("preview-pos-drag", "dragging"); ov.style.left = ""; ov.style.top = ""; ov.style.right = ""; ov.style.transform = ""; }
  }
  function initOverlayDrag() {
    var ov = document.getElementById("preview-overlay");
    var stage = document.getElementById("preview-stage");
    if (!ov || !stage) return;
    function startDrag(ex, ey) { if (!isDragMode) return; isDragging = true; ov.classList.add("dragging"); var r = ov.getBoundingClientRect(); dragOffset.x = ex - r.left; dragOffset.y = ey - r.top; }
    function moveDrag(ex, ey) { if (!isDragging) return; var sr = stage.getBoundingClientRect(); var x = Math.max(0, Math.min(ex - sr.left - dragOffset.x, sr.width - ov.offsetWidth)); var y = Math.max(0, Math.min(ey - sr.top - dragOffset.y, sr.height - ov.offsetHeight)); ov.style.left = x + "px"; ov.style.top = y + "px"; ov.style.transform = "none"; ov.style.right = "auto"; }
    function endDrag() { isDragging = false; ov.classList.remove("dragging"); }
    ov.addEventListener("mousedown", function (e) { e.preventDefault(); startDrag(e.clientX, e.clientY); });
    document.addEventListener("mousemove", function (e) { moveDrag(e.clientX, e.clientY); });
    document.addEventListener("mouseup", endDrag);
    ov.addEventListener("touchstart", function (e) { if (e.touches.length === 1) { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
    document.addEventListener("touchmove", function (e) { if (isDragging && e.touches.length === 1) moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    document.addEventListener("touchend", endDrag);
  }

  /* ======== UTILS ======== */
  function escapeHtml(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function setStatus(elId, text, isError) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text || "";
    el.className = "feedback" + (text ? (isError ? " err" : " ok") : "");
  }
  function setProjectBadge(id) {
    projectId = id;
    var el = document.getElementById("project-badge");
    if (el) el.textContent = id ? "Projet : " + id : "";
  }
  async function ensureProject() {
    if (projectId) return projectId;
    var name = "Visualizer " + new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    var r = await fetch(API + "/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name }) });
    var data = await r.json();
    if (!r.ok) throw new Error(data.detail || "Erreur création projet");
    setProjectBadge(data.id);
    return data.id;
  }

  /* ======== DROPZONES ======== */
  function setupDropzone(dzId, inputId, fnId, uploadFn) {
    var dz = document.getElementById(dzId);
    var input = document.getElementById(inputId);
    var fnEl = document.getElementById(fnId);
    if (!dz || !input) return;
    function setFile(name) { dz.classList.toggle("has-file", !!name); if (fnEl) fnEl.textContent = name || ""; }
    function doUpload(file) { setFile(file.name); setStatus("upload-status", "Envoi…"); uploadFn(file); }
    input.addEventListener("change", function () { if (input.files && input.files[0]) doUpload(input.files[0]); });
    dz.addEventListener("click", function (e) { if (e.target !== input) { e.preventDefault(); input.click(); } });
    dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("dragover"); });
    dz.addEventListener("dragleave", function (e) { if (!dz.contains(e.relatedTarget)) dz.classList.remove("dragover"); });
    dz.addEventListener("drop", function (e) { e.preventDefault(); dz.classList.remove("dragover"); if (e.dataTransfer && e.dataTransfer.files.length) doUpload(e.dataTransfer.files[0]); });
  }

  /* ======== UPLOAD ======== */
  async function uploadAudioFile(file) {
    try {
      var id = projectId || await ensureProject();
      var form = new FormData(); form.append("file", file);
      var r = await fetch(API + "/projects/" + id + "/audio", { method: "POST", body: form });
      var data = {}; try { data = JSON.parse(await r.text()); } catch (_) {}
      if (r.ok) { setStatus("upload-status", "Audio enregistré."); showExcerptPanel(data.duration_seconds); }
      else setStatus("upload-status", data.detail || "Erreur " + r.status, true);
    } catch (e) { setStatus("upload-status", e.message, true); }
  }
  function showExcerptPanel(dur) {
    var panel = document.getElementById("excerpt-panel");
    var si = document.getElementById("excerpt-start");
    if (!panel || !si) return;
    if (dur > 0) { si.max = Math.max(0, dur - 1); si.placeholder = "0 à " + Math.floor(dur); }
    panel.classList.remove("hidden");
  }
  async function applyExcerpt() {
    var id = projectId; if (!id) return;
    var start = parseFloat(document.getElementById("excerpt-start").value) || 0;
    var dur = parseFloat(document.getElementById("excerpt-duration").value) || 20;
    if (dur <= 0 || dur > 120) dur = 20;
    setStatus("excerpt-status", "Application…");
    try {
      var r = await fetch(API + "/projects/" + id + "/audio/segment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start_seconds: start, duration_seconds: dur }) });
      var data = {}; try { data = JSON.parse(await r.text()); } catch (_) {}
      if (r.ok) setStatus("excerpt-status", "Extrait appliqué.");
      else setStatus("excerpt-status", data.detail || "Erreur", true);
    } catch (e) { setStatus("excerpt-status", e.message, true); }
  }
  async function uploadBackgroundFile(file) {
    try {
      var id = projectId || await ensureProject();
      var form = new FormData(); form.append("file", file);
      var r = await fetch(API + "/projects/" + id + "/background", { method: "POST", body: form });
      var data = {}; try { data = JSON.parse(await r.text()); } catch (_) {}
      if (r.ok) setStatus("upload-status", "Fond enregistré.");
      else setStatus("upload-status", data.detail || "Erreur " + r.status, true);
    } catch (e) { setStatus("upload-status", e.message, true); }
  }

  /* ======== OPTIONS ======== */
  var effectLabels = { minimal:"Minimal",classique:"Classique",outline_fin:"Contour fin",outline:"Contour",outline_epais:"Contour épais",outline_tres_epais:"Contour très épais",ombre:"Ombre",ombre_forte:"Ombre forte",ombre_tres_forte:"Ombre très forte",outline_ombre:"Contour+ombre",outline_ombre_fort:"Contour+ombre fort",gras:"Gras",gras_epais:"Gras épais",italique:"Italique",gras_italique:"Gras+italique",neon:"Néon",pop:"Pop",elegant:"Élégant",retro:"Rétro",discret:"Discret" };
  function fillDefaultOptions() {
    var fs = document.getElementById("select-font");
    var es = document.getElementById("select-effect");
    if (fs && !fs.options.length) ["Arial","Impact","Georgia","Verdana","Segoe UI","Times New Roman"].forEach(function (f) { fs.appendChild(new Option(f, f)); });
    if (es && !es.options.length) [{ v:"classique",l:"Classique" },{ v:"outline",l:"Contour" },{ v:"gras",l:"Gras" },{ v:"minimal",l:"Minimal" }].forEach(function (o) { es.appendChild(new Option(o.l, o.v)); });
  }
  function loadRenderOptions() {
    fetch(API + "/config/options").then(function (r) { return r.json(); }).then(function (data) {
      var fs = document.getElementById("select-font");
      var es = document.getElementById("select-effect");
      if (fs && data.fonts && data.fonts.length) fs.innerHTML = data.fonts.map(function (f) { return '<option value="' + f + '">' + f + '</option>'; }).join("");
      if (es && data.effects && data.effects.length) es.innerHTML = data.effects.map(function (e) { return '<option value="' + e + '">' + (effectLabels[e] || e) + '</option>'; }).join("");
      fillDefaultOptions();
    }).catch(fillDefaultOptions);
  }
  function loadSpeechConfig() {
    var ctrl = new AbortController();
    var tid = setTimeout(function () { ctrl.abort(); }, 10000);
    fetch(API + "/config/speech?t=" + Date.now(), { signal: ctrl.signal }).then(function (r) { clearTimeout(tid); return r.json(); }).then(function (data) {
      var badge = document.getElementById("engine-badge");
      var wrap = document.getElementById("engine-select-wrap");
      var sel = document.getElementById("select-engine");
      var opts = document.getElementById("whisper-options");
      if (sel) {
        sel.innerHTML = "";
        if (data.heartmula_available) sel.appendChild(new Option(data.heartmula_local ? "HeartMuLa (local)" : "HeartMuLa", "heartmula"));
        if (data.azure_available) sel.appendChild(new Option("Azure Speech", "azure"));
        sel.appendChild(new Option("Whisper", "whisper"));
        if (wrap) wrap.classList.toggle("hidden", !data.heartmula_available && !data.azure_available);
      }
      if (badge) { badge.textContent = data.heartmula_available ? "HeartMuLa" : (data.azure_available ? "Azure" : "Whisper"); badge.classList.toggle("whisper", !data.azure_available && !data.heartmula_available); }
      if (opts) opts.classList.toggle("hidden", data.heartmula_available || data.azure_available);
    }).catch(function () {
      clearTimeout(tid);
      var badge = document.getElementById("engine-badge");
      var opts = document.getElementById("whisper-options");
      if (badge) { badge.textContent = "Whisper"; badge.classList.add("whisper"); }
      if (opts) opts.classList.remove("hidden");
    });
  }

  /* ======== WORDS ======== */
  function getWordsFromBoxes() {
    var out = [];
    document.querySelectorAll("#lyrics-words .word-box").forEach(function (b) { out.push((b.textContent || "").trim().replace(/\s+/g, " ")); });
    return out;
  }
  function getSegmentsFromBoxes() {
    var out = [];
    if (!currentSegments) return out;
    document.querySelectorAll("#lyrics-words .word-box-wrap").forEach(function (w) {
      var idx = parseInt(w.dataset.segmentIndex, 10);
      var seg = currentSegments[idx]; if (!seg) return;
      var box = w.querySelector(".word-box");
      out.push({ start_time_ms: seg.start_time_ms, end_time_ms: seg.end_time_ms, text: (box ? box.textContent : "").trim() || seg.text });
    });
    return out;
  }

  /* ======== PREVIEW ======== */
  function getPreviewStyle() {
    var fs = document.getElementById("select-font");
    var es = document.getElementById("select-effect");
    var ce = document.getElementById("input-text-color");
    var se = document.getElementById("input-font-size");
    var pe = document.getElementById("select-position");
    return {
      font: (fs && fs.value) || "Arial",
      effect: (es && es.value) || "classique",
      color: (ce && ce.value) || "#FFFFFF",
      size: (se && se.value) ? parseInt(se.value, 10) : 48,
      position: (pe && pe.value) || "center"
    };
  }

  function _getWordText(segIdx) {
    var w = document.querySelector('#lyrics-words .word-box-wrap[data-segment-index="' + segIdx + '"]');
    var box = w && w.querySelector(".word-box");
    return (box ? box.textContent : "").trim() || (currentSegments[segIdx] && currentSegments[segIdx].text) || "";
  }

  function _findActiveSegIdx(tMs) {
    for (var i = 0; i < currentSegments.length; i++) {
      if (tMs >= (currentSegments[i].start_time_ms || 0) && tMs < (currentSegments[i].end_time_ms || 0)) return i;
    }
    return -1;
  }

  function _findPhraseForIdx(segIdx) {
    for (var p = 0; p < currentPhrases.length; p++) {
      for (var w = 0; w < currentPhrases[p].length; w++) {
        if (currentPhrases[p][w].idx === segIdx) return { phraseIdx: p, wordIdx: w };
      }
    }
    return null;
  }

  function _buildPhraseHtml(phrase, activeSegIdx) {
    var parts = [];
    for (var i = 0; i < phrase.length; i++) {
      var word = phrase[i];
      var txt = escapeHtml(_getWordText(word.idx));
      var cls = "lyric-w";
      if (word.idx === activeSegIdx) cls += " w-active";
      else if (word.idx < activeSegIdx) cls += " w-past";
      else cls += " w-future";
      parts.push('<span class="' + cls + '">' + txt + '</span>');
    }
    return parts.join(" ");
  }

  function updatePreviewOverlay() {
    var ov = document.getElementById("preview-overlay");
    var audio = document.getElementById("preview-audio");
    if (!ov || !audio || !currentSegments || !currentSegments.length) return;
    var tMs = (audio.currentTime || 0) * 1000;
    var idx = _findActiveSegIdx(tMs);

    document.querySelectorAll("#lyrics-words .word-box-wrap").forEach(function (w) { w.classList.remove("current-word"); });
    if (idx >= 0) {
      var wEl = document.querySelector('#lyrics-words .word-box-wrap[data-segment-index="' + idx + '"]');
      if (wEl) wEl.classList.add("current-word");
    }

    var hasWord = idx >= 0;
    var html = "";

    if (displayMode === "mot" || !currentPhrases.length) {
      html = hasWord ? escapeHtml(_getWordText(idx)) : "";
    } else {
      var loc = hasWord ? _findPhraseForIdx(idx) : null;
      if (!loc) {
        html = "";
      } else {
        var phrase = currentPhrases[loc.phraseIdx];
        if (displayMode === "accumulation") {
          var parts = [];
          for (var i = 0; i <= loc.wordIdx; i++) {
            var w = phrase[i];
            var txt = escapeHtml(_getWordText(w.idx));
            var cls = (i === loc.wordIdx) ? "lyric-w w-active" : "lyric-w w-past";
            parts.push('<span class="' + cls + '">' + txt + '</span>');
          }
          html = parts.join(" ");
        } else if (displayMode === "ligne") {
          html = _buildPhraseHtml(phrase, idx);
        } else if (displayMode === "scroll") {
          html = _buildPhraseHtml(phrase, idx);
          if (loc.phraseIdx + 1 < currentPhrases.length) {
            var nextPhrase = currentPhrases[loc.phraseIdx + 1];
            var nextParts = [];
            for (var j = 0; j < nextPhrase.length; j++) {
              nextParts.push('<span class="lyric-w w-future">' + escapeHtml(_getWordText(nextPhrase[j].idx)) + '</span>');
            }
            html += '<span class="lyric-next">' + nextParts.join(" ") + '</span>';
          }
        }
      }
    }

    ov.innerHTML = html;
    var st = getPreviewStyle();
    ov.style.fontFamily = st.font;
    ov.style.fontSize = st.size + "px";
    ov.style.color = st.color;

    var baseCls = "preview-overlay";
    if (!isDragMode) {
      baseCls += " preview-pos-" + st.position;
    } else {
      baseCls += " preview-pos-drag";
      if (isDragging) baseCls += " dragging";
    }
    baseCls += " effect-" + (st.effect || "classique");
    baseCls += hasWord ? " word-active" : " word-idle";

    if (selectedLyricAnim && hasWord && idx !== lastOverlayWordIdx) {
      LYRIC_ANIMS.forEach(function (a) { ov.classList.remove(a.cls); });
      ov.style.animation = "none";
      void ov.offsetWidth;
      ov.style.animation = "";
      baseCls += " " + selectedLyricAnim.cls;
      lastOverlayWordIdx = idx;
    } else if (selectedLyricAnim && hasWord) {
      baseCls += " " + selectedLyricAnim.cls;
    }
    if (!hasWord) lastOverlayWordIdx = -1;

    ov.className = baseCls;
  }

  var previewAnimId = null;
  function previewLoop() {
    updatePreviewOverlay();
    var audio = document.getElementById("preview-audio");
    if (audio && !audio.paused && !audio.ended) {
      checkBeats((audio.currentTime || 0) * 1000);
      previewAnimId = requestAnimationFrame(previewLoop);
    } else {
      previewAnimId = null;
    }
  }
  function setPreviewStageRatio() {
    var stage = document.getElementById("preview-stage");
    var re = document.getElementById("select-ratio");
    if (stage && re) stage.setAttribute("data-ratio", re.value || "16:9");
  }

  function startPreview() {
    if (!projectId || !currentSegments || !currentSegments.length) return;
    var area = document.getElementById("preview-area");
    var audio = document.getElementById("preview-audio");
    var bgImg = document.getElementById("preview-bg-img");
    var bgVideo = document.getElementById("preview-bg-video");
    if (!area || !audio) return;
    area.classList.remove("hidden");
    setPreviewStageRatio();
    audio.src = API + "/projects/" + projectId + "/audio";

    initAudioContext(audio);

    audio.onseeked = function () {
      updatePreviewOverlay();
      if (previewAnimId == null && !audio.paused) previewAnimId = requestAnimationFrame(previewLoop);
    };
    audio.onplay = function () {
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      startAudioReactive();
      if (previewAnimId != null) cancelAnimationFrame(previewAnimId);
      previewAnimId = requestAnimationFrame(previewLoop);
    };
    audio.onpause = audio.onended = function () {
      if (previewAnimId != null) { cancelAnimationFrame(previewAnimId); previewAnimId = null; }
      stopAudioReactive();
      updatePreviewOverlay();
    };

    fetch(API + "/projects/" + projectId + "/project-info").then(function (r) { return r.json(); }).then(function (info) {
      if (info.background_type) {
        var url = API + "/projects/" + projectId + "/background";
        if (info.background_type === "video") {
          bgVideo.src = url; bgVideo.classList.add("active"); bgImg.classList.remove("active");
          bgVideo.addEventListener("loadeddata", function () { extractDominantColorFromVideo(bgVideo); }, { once: true });
        } else {
          bgImg.src = url; bgImg.classList.add("active"); bgVideo.classList.remove("active");
          bgImg.addEventListener("load", function () { extractDominantColor(bgImg); }, { once: true });
        }
      }
    }).catch(function () {});

    ["select-font", "select-effect", "input-text-color"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", updatePreviewOverlay);
    });
    updatePreviewOverlay();
  }

  /* ======== CREDITS ======== */
  var CREDITS_KEY = "saasvisu_credits";

  function getCredits() {
    try { return JSON.parse(localStorage.getItem(CREDITS_KEY)); } catch (_) { return null; }
  }

  function saveCredits(data) {
    localStorage.setItem(CREDITS_KEY, JSON.stringify(data));
    updateCreditsBadge();
  }

  function updateCreditsBadge() {
    var badge = document.getElementById("credits-badge");
    if (!badge) return;
    var data = getCredits();
    if (!data) { badge.textContent = "?"; badge.classList.add("low"); return; }
    badge.textContent = data.credits_remaining + " cr.";
    badge.classList.toggle("low", data.credits_remaining <= 3);
  }

  function useCredit() {
    var data = getCredits();
    if (!data) return false;
    if (data.credits_remaining <= 0) return false;
    data.credits_remaining--;
    data.total_used++;
    data.history.push({ date: new Date().toISOString(), project: projectId });
    saveCredits(data);
    return true;
  }

  function choosePlan(plan, credits) {
    saveCredits({ plan: plan, credits_remaining: credits, total_used: 0, history: [] });
    var modal = document.getElementById("credits-modal");
    if (modal) modal.classList.add("hidden");
  }

  function initCredits() {
    var data = getCredits();
    if (!data) {
      var modal = document.getElementById("credits-modal");
      if (modal) modal.classList.remove("hidden");
    }
    updateCreditsBadge();
    document.querySelectorAll(".modal-plan").forEach(function (btn) {
      btn.addEventListener("click", function () {
        choosePlan(btn.dataset.plan, parseInt(btn.dataset.credits, 10) || 10);
      });
    });
    var badge = document.getElementById("credits-badge");
    if (badge) badge.addEventListener("click", function () {
      var modal = document.getElementById("credits-modal");
      if (modal) modal.classList.toggle("hidden");
    });
  }

  /* ======== BEATS ======== */
  async function detectBeats() {
    if (!projectId) { setStatus("beats-status", "Crée un projet d'abord.", true); return; }
    setStatus("beats-status", "Détection des beats…");
    try {
      var r = await fetch(API + "/projects/" + projectId + "/beats", { method: "POST" });
      var d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Erreur");
      currentBeats = d.beats || [];
      setStatus("beats-status", currentBeats.length + " beats détectés.");
    } catch (e) { setStatus("beats-status", e.message, true); }
  }

  async function loadBeats() {
    if (!projectId) return;
    try {
      var r = await fetch(API + "/projects/" + projectId + "/beats");
      var d = await r.json();
      currentBeats = d.beats || [];
    } catch (_) { currentBeats = []; }
  }

  function triggerBeatEffect(stage) {
    if (beatEffect === "flash") {
      var overlay = stage.querySelector(".beat-overlay");
      if (overlay) {
        overlay.classList.remove("flash");
        void overlay.offsetWidth;
        overlay.classList.add("flash");
      }
    } else if (beatEffect === "zoom") {
      stage.classList.remove("beat-zoom");
      void stage.offsetWidth;
      stage.classList.add("beat-zoom");
    } else if (beatEffect === "shake") {
      stage.classList.remove("beat-shake");
      void stage.offsetWidth;
      stage.classList.add("beat-shake");
    }
  }

  function checkBeats(tMs) {
    if (beatEffect === "none" || !currentBeats.length) return;
    var stage = document.getElementById("preview-stage");
    if (!stage) return;
    for (var i = 0; i < currentBeats.length; i++) {
      if (Math.abs(tMs - currentBeats[i]) < 50 && i !== lastBeatIdx) {
        lastBeatIdx = i;
        triggerBeatEffect(stage);
        return;
      }
    }
  }

  /* ======== PRESETS ======== */
  function collectCurrentPreset() {
    return {
      font: (document.getElementById("select-font") || {}).value || "Arial",
      font_size: parseInt((document.getElementById("input-font-size") || {}).value, 10) || 48,
      effect: (document.getElementById("select-effect") || {}).value || "classique",
      text_color: (document.getElementById("input-text-color") || {}).value || "#FFFFFF",
      position: (document.getElementById("select-position") || {}).value || "center",
      display_mode: displayMode || "mot",
      lyric_animation: selectedLyricAnim ? selectedLyricAnim.cls.replace("lyric-anim-", "") : "",
      ratio: (document.getElementById("select-ratio") || {}).value || "16:9",
      resolution: (document.getElementById("select-resolution") || {}).value || "720p",
      beat_effect: (document.getElementById("select-beat-effect") || {}).value || "none"
    };
  }

  function applyPreset(p) {
    if (!p) return;
    function setVal(id, val) { var el = document.getElementById(id); if (el && val !== undefined) el.value = val; }
    setVal("select-font", p.font);
    setVal("select-effect", p.effect);
    setVal("input-font-size", p.font_size);
    var sv = document.getElementById("font-size-val"); if (sv) sv.textContent = p.font_size || 48;
    setVal("input-text-color", p.text_color);
    setVal("select-ratio", p.ratio);
    setVal("select-resolution", p.resolution);
    setVal("select-position", p.position);
    setVal("select-display", p.display_mode);
    displayMode = p.display_mode || "mot";
    document.querySelectorAll('.pill[data-ratio]').forEach(function (pill) { pill.classList.toggle("pill-active", pill.dataset.ratio === p.ratio); });
    document.querySelectorAll('.pill[data-res]').forEach(function (pill) { pill.classList.toggle("pill-active", pill.dataset.res === p.resolution); });
    document.querySelectorAll('.pill[data-pos]').forEach(function (pill) { pill.classList.toggle("pill-active", pill.dataset.pos === p.position); });
    document.querySelectorAll('.pill[data-display]').forEach(function (pill) { pill.classList.toggle("pill-active", pill.dataset.display === p.display_mode); });
    if (p.position === "drag") enableDragMode(); else disableDragMode();
    if (p.lyric_animation) {
      var match = LYRIC_ANIMS.find(function (a) { return a.cls === "lyric-anim-" + p.lyric_animation; });
      if (match) { selectedLyricAnim = match; var lbl = document.getElementById("anim-selected-label"); if (lbl) lbl.textContent = "Animation active : " + match.label; }
    }
    setPreviewStageRatio();
    updatePreviewOverlay();
  }

  async function loadPresets() {
    if (!projectId) return;
    var sel = document.getElementById("select-preset");
    if (!sel) return;
    try {
      var r = await fetch(API + "/projects/" + projectId + "/presets");
      var data = await r.json();
      sel.innerHTML = '<option value="">— Aucun —</option>';
      (data.presets || []).forEach(function (p) {
        sel.appendChild(new Option(p.name, p.name));
      });
    } catch (_) {}
  }

  async function savePreset() {
    if (!projectId) { setStatus("render-status", "Crée un projet d'abord.", true); return; }
    var name = prompt("Nom du preset :");
    if (!name || !name.trim()) return;
    var preset = collectCurrentPreset();
    preset.name = name.trim();
    try {
      var r = await fetch(API + "/projects/" + projectId + "/presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preset) });
      var d = await r.json();
      if (r.ok) { setStatus("render-status", "Preset « " + d.name + " » sauvegardé."); loadPresets(); }
      else setStatus("render-status", d.detail || "Erreur", true);
    } catch (e) { setStatus("render-status", e.message, true); }
  }

  function initPresets() {
    var btnSave = document.getElementById("btn-save-preset");
    if (btnSave) btnSave.addEventListener("click", savePreset);
    var sel = document.getElementById("select-preset");
    if (sel) sel.addEventListener("change", async function () {
      if (!sel.value || !projectId) return;
      try {
        var r = await fetch(API + "/projects/" + projectId + "/presets/" + encodeURIComponent(sel.value));
        if (r.ok) applyPreset(await r.json());
      } catch (_) {}
    });
  }

  /* ======== REMIX ======== */
  var remixCount = 0;

  function showRemixPanel() {
    var panel = document.getElementById("remix-panel");
    if (panel) panel.classList.remove("hidden");
    loadRemixPresets();
  }

  async function loadRemixPresets() {
    if (!projectId) return;
    var sel = document.getElementById("remix-preset");
    if (!sel) return;
    try {
      var r = await fetch(API + "/projects/" + projectId + "/presets");
      var data = await r.json();
      sel.innerHTML = '<option value="">Aléatoire</option>';
      (data.presets || []).forEach(function (p) { sel.appendChild(new Option(p.name, p.name)); });
    } catch (_) {}
  }

  function initRemix() {
    var btn = document.getElementById("btn-remix");
    if (!btn) return;
    btn.addEventListener("click", async function () {
      if (!projectId) return;
      var cr = getCredits();
      if (cr && cr.credits_remaining <= 0) { setStatus("remix-status", "Plus de crédits ! Change de plan.", true); return; }
      var sel = document.getElementById("remix-preset");
      var presetName = sel ? sel.value : "";
      setStatus("remix-status", "Remix en cours…");
      try {
        var body = presetName ? { preset_name: presetName } : {};
        var r = await fetch(API + "/projects/" + projectId + "/remix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        var d = await r.json();
        if (!r.ok) throw new Error(d.detail || "Erreur remix");
        remixCount++;
        var countEl = document.getElementById("remix-count");
        if (countEl) countEl.textContent = remixCount + " variation" + (remixCount > 1 ? "s" : "") + " générée" + (remixCount > 1 ? "s" : "");
        setStatus("remix-status", "Remix terminé !");
        useCredit();
        showDownloadLink();
      } catch (e) { setStatus("remix-status", e.message, true); }
    });
  }

  /* ======== DOWNLOAD ======== */
  function showDownloadLink() {
    if (!projectId) return;
    var link = document.getElementById("link-download");
    var pe = document.getElementById("post-export");
    if (link) { link.href = API + "/projects/" + projectId + "/download"; link.download = "saasvisu_output.mp4"; }
    if (pe) pe.classList.remove("hidden");
  }

  /* ======== INIT ======== */
  document.addEventListener("DOMContentLoaded", function () {
    initParticles();
    initScrollAnimations();
    initFullstepScroll();
    initAnimCarousel();
    initVignettes();
    initPills();
    initOverlayDrag();
    initPresets();
    initRemix();
    initCredits();
    fillDefaultOptions();

    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href");
        if (!id || id === "#") return;
        var el = document.querySelector(id);
        if (el) { e.preventDefault(); el.scrollIntoView({ behavior: "smooth", block: "center" }); }
      });
    });

    setupDropzone("dropzone-audio", "input-audio", "audio-filename", uploadAudioFile);
    setupDropzone("dropzone-background", "input-background", "background-filename", uploadBackgroundFile);
    var btnExcerpt = document.getElementById("btn-apply-excerpt");
    if (btnExcerpt) btnExcerpt.addEventListener("click", applyExcerpt);
    ensureProject().then(function () { loadPresets(); }).catch(function () {});
    loadRenderOptions();
    loadSpeechConfig();

    /* Détection paroles */
    var btnDetect = document.getElementById("btn-detect-lyrics");
    if (btnDetect) btnDetect.addEventListener("click", async function () {
      try {
        var id = await ensureProject();
        var modelEl = document.getElementById("select-whisper-model");
        var model = modelEl ? modelEl.value : "large";
        var hints = getWordsFromBoxes().filter(Boolean).join(" ");
        if (!hints && currentSegments) hints = currentSegments.map(function (s) { return s.text; }).join(" ");
        setStatus("sync-status", "Détection en cours…");
        var engEl = document.getElementById("select-engine");
        var engine = (engEl && engEl.value) || "whisper";
        var query = "engine=" + encodeURIComponent(engine);
        if (engine === "whisper") query = "whisper_model=" + encodeURIComponent(model) + "&" + query;
        var r = await fetch(API + "/projects/" + id + "/analyze?" + query, { method: "POST", headers: { "Content-Type": "application/json" }, body: hints ? JSON.stringify({ phrase_hints: hints }) : "{}" });
        var data = await r.json();
        if (!r.ok) throw new Error(data.detail || "Erreur");
        var wc = document.getElementById("lyrics-words");
        if (data.segments && data.segments.length && wc) {
          currentSegments = data.segments;
          currentPhrases = groupIntoPhrases(currentSegments);
          wc.innerHTML = data.segments.map(function (w, i) {
            return '<span class="word-box-wrap" data-segment-index="' + i + '"><span class="word-box" contenteditable="true" spellcheck="false">' + escapeHtml(w.text || "") + '</span></span>';
          }).join(" ");
          wc.classList.remove("hidden");
          startPreview();
        }
        var lbl = data.engine === "heartmula" ? "HeartMuLa" : (data.engine === "azure" ? "Azure" : "Whisper");
        setStatus("sync-status", data.words_count + " mots détectés (" + lbl + ").");
      } catch (e) { setStatus("sync-status", e.message, true); }
    });

    /* Détection beats */
    var btnBeats = document.getElementById("btn-detect-beats");
    if (btnBeats) btnBeats.addEventListener("click", detectBeats);

    /* Export MP4 */
    var btnExport = document.getElementById("btn-export");
    if (btnExport) btnExport.addEventListener("click", async function () {
      try {
        var cr = getCredits();
        if (cr && cr.credits_remaining <= 0) { setStatus("render-status", "Plus de crédits ! Change de plan.", true); return; }
        var id = await ensureProject();
        var segments = getSegmentsFromBoxes();
        if (!segments.length) { setStatus("render-status", "Détecte les paroles d'abord.", true); return; }
        var ratio = document.getElementById("select-ratio").value;
        var resolution = document.getElementById("select-resolution").value;
        var fs = document.getElementById("select-font");
        var es = document.getElementById("select-effect");
        var font = (fs && fs.value) || "Arial";
        var effect = (es && es.value) || "classique";
        var ce = document.getElementById("input-text-color");
        var color = ce ? ce.value : "#FFFFFF";
        setStatus("render-status", "Enregistrement…");
        var r = await fetch(API + "/projects/" + id + "/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ segments: segments }) });
        var d = await r.json(); if (!r.ok) throw new Error(d.detail || "Erreur synchro");
        setStatus("render-status", "Rendu en cours (1–2 min)…");
        var se = document.getElementById("input-font-size");
        var fontSize = (se && se.value) ? parseInt(se.value, 10) : 48;
        var params = new URLSearchParams({ template: "minimal_16x9", ratio: ratio, resolution: resolution, font: font, effect: effect, font_size: String(fontSize) });
        if (color) params.set("text_color", color.replace(/^#/, ""));
        var posEl = document.getElementById("select-position");
        var position = (posEl && posEl.value) || "center";
        params.set("position", position);
        if (position === "drag") {
          var ovEl = document.getElementById("preview-overlay");
          var stageEl = document.getElementById("preview-stage");
          if (ovEl && stageEl) {
            var sr = stageEl.getBoundingClientRect();
            var ovr = ovEl.getBoundingClientRect();
            params.set("pos_x_pct", ((ovr.left + ovr.width / 2 - sr.left) / sr.width * 100).toFixed(1));
            params.set("pos_y_pct", ((ovr.top + ovr.height / 2 - sr.top) / sr.height * 100).toFixed(1));
          }
        }
        if (selectedLyricAnim) {
          params.set("lyric_animation", selectedLyricAnim.cls.replace("lyric-anim-", ""));
        }
        params.set("display_mode", displayMode || "mot");
        params.set("beat_effect", beatEffect || "none");
        var r2 = await fetch(API + "/projects/" + id + "/render?" + params.toString(), { method: "POST" });
        var t = await r2.text(); var d2 = {}; try { d2 = JSON.parse(t); } catch (_) {}
        if (!r2.ok) throw new Error(d2.detail || d2.message || t || "Erreur serveur");
        setStatus("render-status", "Vidéo générée !");
        useCredit();
        showDownloadLink();
        showRemixPanel();
      } catch (e) { setStatus("render-status", e.message, true); }
    });

  });
})();

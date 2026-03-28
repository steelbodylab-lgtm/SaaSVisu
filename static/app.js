(function () {
  var API = "";
  var projectId = null;
  var currentSegments = null;
  var currentPhrases = [];
  var displayMode = "mot";
  var lastPhraseScrollIdx = -1;
  var currentBeats = [];
  var beatEffect = "none";
  var lastBeatIdx = -1;
  var excerptInfo = { start: 0, duration: 20 };
  var syncProgressInterval = null;
  var tlPeaks = null;
  var tlDuration = 0;
  var tlZoom = 1;
  var tlViewStart = 0;
  var tlSelStart = 0;
  var tlSelDur = 30;
  var tlDrag = null;
  var tlCanvasW = 800;
  var tlCanvasH = 88;
  var tlUiInited = false;

  var phraseLineMirror = null;
  function getPhraseLineMirror() {
    if (phraseLineMirror) return phraseLineMirror;
    phraseLineMirror = document.createElement("div");
    phraseLineMirror.setAttribute("aria-hidden", "true");
    phraseLineMirror.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;overflow:hidden;box-sizing:border-box;padding:.4rem .5rem;font-size:.88rem;line-height:1.4;font-family:inherit;border:1px solid transparent;min-height:36px;";
    document.body.appendChild(phraseLineMirror);
    return phraseLineMirror;
  }
  function resizePhraseLine(ta) {
    if (!ta || ta.nodeName !== "TEXTAREA") return;
    var mirror = getPhraseLineMirror();
    var style = window.getComputedStyle(ta);
    mirror.style.width = ta.offsetWidth + "px";
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.padding = style.padding;
    mirror.style.letterSpacing = style.letterSpacing;
    var val = (ta.value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    mirror.textContent = val || " ";
    var h = Math.max(mirror.offsetHeight, 36);
    ta.style.overflowY = "hidden";
    ta.style.height = h + "px";
  }
  function resizeAllPhraseLines() {
    document.querySelectorAll("#lyrics-phrases .app-phrase-line").forEach(resizePhraseLine);
  }

  function _segmentWordCount(seg) {
    var t = (seg && seg.text ? seg.text : "").trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }
  function _endsSentencePunctuation(text) {
    var t = (text || "").replace(/\s+$/, "");
    if (!t) return false;
    return /[.!?…][\s"'»”’)\]]*$/u.test(t) || /[.!?…]$/.test(t);
  }
  function _endsClausePause(text) {
    var t = (text || "").replace(/\s+$/, "");
    if (!t) return false;
    return /[,;:…][\s"'»”’)\]]*$/u.test(t) || /[,;:]$/.test(t);
  }
  /**
   * Regroupe les segments (1 segment = 1 mot côté synchro) en lignes « phrase » pour l’affichage.
   * Ne modifie pas les timestamps : l’export reste aligné mot à mot via getSegmentsFromBoxesFromPhraseLines.
   */
  function groupIntoPhrases(segments) {
    if (!segments || !segments.length) return [];
    var STRONG_GAP_MS = 480;
    var WEAK_GAP_MS = 320;
    var TIGHT_GAP_MS = 120;
    var MAX_WORDS_PER_PHRASE = 22;
    var MIN_WORDS_WEAK_BREAK = 8;
    var phrases = [];
    var cur = [{ seg: segments[0], idx: 0 }];
    var curWordCount = _segmentWordCount(segments[0]);
    for (var i = 1; i < segments.length; i++) {
      var prev = segments[i - 1];
      var curr = segments[i];
      var prevEnd = prev.end_time_ms || 0;
      var currStart = curr.start_time_ms || 0;
      var gap = currStart - prevEnd;
      var prevText = (prev.text || "").trim();
      var nextWords = _segmentWordCount(curr);
      var startNew = false;
      if (_endsSentencePunctuation(prevText)) {
        startNew = true;
      } else if (gap < TIGHT_GAP_MS) {
        startNew = false;
      } else if (gap >= STRONG_GAP_MS) {
        startNew = true;
      } else if (curWordCount + nextWords > MAX_WORDS_PER_PHRASE) {
        startNew = true;
      } else if (gap >= WEAK_GAP_MS && curWordCount >= MIN_WORDS_WEAK_BREAK) {
        if (_endsClausePause(prevText) || curWordCount >= 14) startNew = true;
      }
      if (startNew) {
        phrases.push(cur);
        cur = [{ seg: curr, idx: i }];
        curWordCount = nextWords;
      } else {
        cur.push({ seg: curr, idx: i });
        curWordCount += nextWords;
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
    { cls: "lyric-anim-noiseFill", label: "Noise / Grain" },
    { cls: "lyric-anim-flameFade", label: "Fade / Flamme" },
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
    if (ov) { ov.classList.add("preview-pos-drag"); ov.classList.remove("preview-pos-bottom", "preview-pos-center", "preview-pos-top"); }
    applyOverlayPosition((document.getElementById("select-position") || {}).value || "center");
  }
  function disableDragMode() {
    isDragMode = false; isDragging = false;
    var ov = document.getElementById("preview-overlay");
    if (ov) { ov.classList.remove("preview-pos-drag", "dragging"); ov.style.left = ""; ov.style.top = ""; ov.style.right = ""; ov.style.bottom = ""; ov.style.transform = ""; }
  }
  function applyOverlayPosition(pos) {
    var ov = document.getElementById("preview-overlay");
    if (!ov || !isDragMode) return;
    if (pos === "top") { ov.style.left = "50%"; ov.style.top = "1rem"; ov.style.right = "auto"; ov.style.bottom = "auto"; ov.style.transform = "translateX(-50%)"; }
    else if (pos === "bottom") { ov.style.left = "50%"; ov.style.top = "auto"; ov.style.right = "auto"; ov.style.bottom = "1rem"; ov.style.transform = "translateX(-50%)"; }
    else { ov.style.left = "50%"; ov.style.top = "50%"; ov.style.right = "auto"; ov.style.bottom = "auto"; ov.style.transform = "translate(-50%,-50%)"; }
  }
  function initOverlayDrag() {
    var ov = document.getElementById("preview-overlay");
    var stage = document.getElementById("preview-stage");
    if (!ov || !stage) return;
    var SNAP_THRESHOLD = 0.12;
    function startDrag(ex, ey) { if (!isDragMode) return; isDragging = true; ov.classList.add("dragging"); var r = ov.getBoundingClientRect(); dragOffset.x = ex - r.left; dragOffset.y = ey - r.top; }
    function moveDrag(ex, ey) { if (!isDragging) return; var sr = stage.getBoundingClientRect(); var x = Math.max(0, Math.min(ex - sr.left - dragOffset.x, sr.width - ov.offsetWidth)); var y = Math.max(0, Math.min(ey - sr.top - dragOffset.y, sr.height - ov.offsetHeight)); ov.style.left = x + "px"; ov.style.top = y + "px"; ov.style.transform = "none"; ov.style.right = "auto"; }
    function endDrag() {
      isDragging = false;
      ov.classList.remove("dragging");
      if (isDragMode && isAppNewUI()) {
        var sr = stage.getBoundingClientRect();
        var ovr = ov.getBoundingClientRect();
        var cx = ovr.left - sr.left + ovr.width / 2;
        var cy = ovr.top - sr.top + ovr.height / 2;
        var stageCx = sr.width / 2, stageCy = sr.height / 2;
        if (Math.abs(cx - stageCx) < sr.width * SNAP_THRESHOLD && Math.abs(cy - stageCy) < sr.height * SNAP_THRESHOLD) {
          ov.style.left = "50%"; ov.style.top = "50%"; ov.style.right = "auto"; ov.style.transform = "translate(-50%,-50%)";
          var pe = document.getElementById("select-position"); if (pe) pe.value = "center";
        }
      }
    }
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

  function isAppNewUI() { return !!document.getElementById("dropzone-main"); }

  var WORKFLOW_HINTS = {
    1: "Étape 1 — Ajoute ton fond visuel et ton audio.",
    2: "Étape 2 — Lance la détection des paroles sur ton audio.",
    3: "Étape 3 — Ajuste le texte, le style et exporte la vidéo."
  };

  function goWorkflowStep(n) {
    if (n < 1 || n > 3) return;
    var p1 = document.getElementById("panel-step-1");
    var p2 = document.getElementById("panel-step-2");
    var p3 = document.getElementById("panel-step-3");
    if (!p1 && !p2 && !p3) return;
    if (p1) p1.hidden = n !== 1;
    if (p2) p2.hidden = n !== 2;
    if (p3) p3.hidden = n !== 3;
    document.querySelectorAll(".app-workflow-btn").forEach(function (btn) {
      var s = parseInt(btn.getAttribute("data-wf-step"), 10);
      if (isNaN(s)) return;
      btn.classList.toggle("is-current", s === n);
      btn.classList.toggle("is-done", s < n);
    });
    var hint = document.getElementById("workflow-step-hint");
    if (hint && WORKFLOW_HINTS[n]) hint.textContent = WORKFLOW_HINTS[n];
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (_) { window.scrollTo(0, 0); }
  }

  function initWorkflowNav() {
    if (!document.getElementById("panel-step-1")) return;
    document.querySelectorAll(".app-workflow-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var s = parseInt(btn.getAttribute("data-wf-step"), 10);
        if (!isNaN(s)) goWorkflowStep(s);
      });
    });
    var b2 = document.getElementById("btn-wf-go-2");
    if (b2) b2.addEventListener("click", function () { goWorkflowStep(2); });
    var back1 = document.getElementById("btn-wf-back-1");
    if (back1) back1.addEventListener("click", function () { goWorkflowStep(1); });
    var ph2 = document.getElementById("btn-wf-from-placeholder-2");
    if (ph2) ph2.addEventListener("click", function () { goWorkflowStep(2); });
    var back23 = document.getElementById("btn-wf-back-2-from-3");
    if (back23) back23.addEventListener("click", function () { goWorkflowStep(2); });
    goWorkflowStep(1);
  }

  var uploadedAudioName = "";
  var uploadedBgName = "";

  function updateDropzoneDisplay() {
    var dz = document.getElementById("dropzone-filenames");
    var main = document.getElementById("dropzone-main");
    if (!dz) return;
    var parts = [];
    parts.push("Audio: " + (uploadedAudioName || "—"));
    parts.push("Vidéo/Image: " + (uploadedBgName || "—"));
    dz.textContent = parts.join("  ·  ");
    if (main) main.classList.toggle("has-file", !!uploadedAudioName);
  }

  function showSyncProgressOverlay() {
    var ov = document.getElementById("sync-progress-overlay");
    if (!ov) return;
    ov.classList.remove("hidden");
    document.body.classList.add("app-sync-open");
    var fill = document.getElementById("sync-progress-fill");
    var pct = document.getElementById("sync-progress-pct");
    var detail = document.getElementById("sync-progress-detail");
    var statusline = document.getElementById("sync-progress-statusline");
    var v = 2;
    if (fill) fill.style.width = "0%";
    if (pct) pct.textContent = "0%";
    if (detail) detail.textContent = "Connexion au moteur…";
    if (statusline) statusline.textContent = "Transcription et calage en cours…";
    if (syncProgressInterval) clearInterval(syncProgressInterval);
    syncProgressInterval = setInterval(function () {
      if (v < 88) {
        v += 1.5 + Math.random() * 3.5;
        if (v > 88) v = 88;
        if (fill) fill.style.width = v + "%";
        if (pct) pct.textContent = Math.round(v) + "%";
      }
      if (detail && Math.random() > 0.65) {
        var msgs = ["Analyse du signal audio…", "Détection de la parole…", "Alignement des mots…", "Finalisation…"];
        detail.textContent = msgs[Math.floor(Math.random() * msgs.length)];
      }
    }, 400);
  }

  function hideSyncProgressOverlay(success) {
    if (syncProgressInterval) {
      clearInterval(syncProgressInterval);
      syncProgressInterval = null;
    }
    var ov = document.getElementById("sync-progress-overlay");
    var fill = document.getElementById("sync-progress-fill");
    var pct = document.getElementById("sync-progress-pct");
    var detail = document.getElementById("sync-progress-detail");
    if (success) {
      if (fill) fill.style.width = "100%";
      if (pct) pct.textContent = "100%";
      if (detail) detail.textContent = "Terminé.";
    }
    var delay = success ? 450 : 0;
    setTimeout(function () {
      if (ov) ov.classList.add("hidden");
      document.body.classList.remove("app-sync-open");
      if (fill) fill.style.width = "0%";
      if (pct) pct.textContent = "0%";
    }, delay);
  }

  function computeAudioPeaks(audioBuffer, count) {
    var ch = audioBuffer.numberOfChannels;
    var len = audioBuffer.length;
    var block = Math.floor(len / count) || 1;
    var peaks = new Float32Array(count);
    for (var c = 0; c < ch; c++) {
      var data = audioBuffer.getChannelData(c);
      for (var i = 0; i < count; i++) {
        var start = i * block;
        var end = Math.min(start + block, len);
        var max = 0;
        for (var j = start; j < end; j++) {
          var v = Math.abs(data[j]);
          if (v > max) max = v;
        }
        if (max > peaks[i]) peaks[i] = max;
      }
    }
    return peaks;
  }

  function tlViewDuration() {
    return tlDuration / Math.max(1, tlZoom);
  }

  function clampTlViewStart() {
    var vd = tlViewDuration();
    if (tlDuration <= vd || !tlDuration) {
      tlViewStart = 0;
      return;
    }
    if (tlViewStart + vd > tlDuration) tlViewStart = tlDuration - vd;
    if (tlViewStart < 0) tlViewStart = 0;
  }

  function clampTlSelection() {
    if (!tlDuration) return;
    if (tlSelDur < 1) tlSelDur = 1;
    if (tlSelStart < 0) tlSelStart = 0;
    if (tlSelStart + tlSelDur > tlDuration) {
      if (tlSelDur > tlDuration) {
        tlSelDur = tlDuration;
        tlSelStart = 0;
      } else {
        tlSelStart = tlDuration - tlSelDur;
      }
    }
  }

  function timelineClientToTime(clientX) {
    var wrap = document.getElementById("timeline-wave-wrap");
    if (!wrap || !tlDuration) return 0;
    var r = wrap.getBoundingClientRect();
    var frac = (clientX - r.left) / Math.max(1, r.width);
    if (frac < 0) frac = 0;
    if (frac > 1) frac = 1;
    return tlViewStart + frac * tlViewDuration();
  }

  function timelineHitMode(t) {
    var edge = Math.max(0.12, tlSelDur * 0.035);
    if (t <= tlSelStart + edge && t >= tlSelStart - edge * 0.5) return "left";
    if (t >= tlSelStart + tlSelDur - edge && t <= tlSelStart + tlSelDur + edge * 0.5) return "right";
    if (t > tlSelStart && t < tlSelStart + tlSelDur) return "move";
    return "seek";
  }

  function syncTimelineToInputs() {
    var si = document.getElementById("excerpt-start");
    var di = document.getElementById("excerpt-duration");
    if (si) si.value = String(Math.round(tlSelStart * 10) / 10);
    if (di) di.value = String(Math.round(tlSelDur * 10) / 10);
    excerptInfo.start = tlSelStart;
    excerptInfo.duration = tlSelDur;
    if (typeof updateStudioSelectedLabel === "function") updateStudioSelectedLabel();
    if (typeof updateStudioWaveWindow === "function") updateStudioWaveWindow();
    var readout = document.getElementById("timeline-pos-readout");
    if (readout) {
      var m = Math.floor(tlSelStart / 60);
      var s = tlSelStart - m * 60;
      readout.textContent = m + ":" + (s < 10 ? "0" : "") + s.toFixed(1) + " · " + tlSelDur.toFixed(1) + " s";
    }
    updateDurChipsActive();
  }

  function updateDurChipsActive() {
    document.querySelectorAll(".app-chip-dur").forEach(function (b) {
      var d = parseFloat(b.getAttribute("data-dur"), 10);
      b.classList.toggle("is-active", Math.abs(tlSelDur - d) < 0.51);
    });
  }

  function syncInputsToTimeline() {
    var si = document.getElementById("excerpt-start");
    var di = document.getElementById("excerpt-duration");
    if (!si || !di || !tlDuration) return;
    tlSelStart = parseFloat(si.value) || 0;
    tlSelDur = parseFloat(di.value) || 15;
    clampTlSelection();
    clampTlViewStart();
    ensureViewShowsSelection();
    drawTimelineCanvas();
    syncTimelineToInputs();
  }

  function ensureViewShowsSelection() {
    var vd = tlViewDuration();
    if (!tlDuration || vd >= tlDuration) return;
    if (tlSelStart < tlViewStart) tlViewStart = Math.max(0, tlSelStart - vd * 0.05);
    if (tlSelStart + tlSelDur > tlViewStart + vd) tlViewStart = Math.min(tlDuration - vd, tlSelStart + tlSelDur - vd * 0.95);
    clampTlViewStart();
  }

  function drawTimelineCanvas() {
    var canvas = document.getElementById("waveform-canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    var w = tlCanvasW;
    var h = tlCanvasH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0c0c10";
    ctx.fillRect(0, 0, w, h);
    if (!tlPeaks || !tlDuration) return;
    var vd = Math.max(0.001, tlViewDuration());
    var n = tlPeaks.length;
    var i0 = Math.floor((tlViewStart / tlDuration) * n);
    var i1 = Math.ceil(((tlViewStart + vd) / tlDuration) * n);
    i0 = Math.max(0, i0);
    i1 = Math.min(n, i1);
    var count = Math.max(1, i1 - i0);
    var barW = w / count;
    for (var i = i0; i < i1; i++) {
      var t = ((i + 0.5) / n) * tlDuration;
      var x = ((t - tlViewStart) / vd) * w;
      var amp = Math.max(1.5, tlPeaks[i] * h * 0.42);
      var grd = ctx.createLinearGradient(0, h / 2 - amp, 0, h / 2 + amp);
      grd.addColorStop(0, "rgba(0,229,255,0.85)");
      grd.addColorStop(1, "rgba(124,92,191,0.45)");
      ctx.fillStyle = grd;
      ctx.fillRect(x - barW * 0.35, h / 2 - amp, Math.max(1.2, barW * 0.65), amp * 2);
    }
    var x1 = ((tlSelStart - tlViewStart) / vd) * w;
    var x2 = ((tlSelStart + tlSelDur - tlViewStart) / vd) * w;
    if (x2 > 0 && x1 < w) {
      var left = Math.max(0, x1);
      var right = Math.min(w, x2);
      ctx.fillStyle = "rgba(0,229,255,0.14)";
      ctx.fillRect(left, 0, right - left, h);
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(left + 1, 2, Math.max(0, right - left - 2), h - 4);
    }
  }

  function resizeTimelineCanvas() {
    var canvas = document.getElementById("waveform-canvas");
    var wrap = document.getElementById("timeline-wave-wrap");
    if (!canvas || !wrap) return;
    var dpr = window.devicePixelRatio || 1;
    tlCanvasW = Math.max(200, Math.floor(wrap.clientWidth));
    tlCanvasH = 88;
    canvas.style.width = tlCanvasW + "px";
    canvas.style.height = tlCanvasH + "px";
    canvas.width = Math.floor(tlCanvasW * dpr);
    canvas.height = Math.floor(tlCanvasH * dpr);
    drawTimelineCanvas();
  }

  function endTlDrag() {
    if (!tlDrag) return;
    tlDrag = null;
    clampTlSelection();
    ensureViewShowsSelection();
    syncTimelineToInputs();
    drawTimelineCanvas();
  }

  function onTlPointerMove(clientX) {
    if (!tlDrag || !tlDuration) return;
    var t = timelineClientToTime(clientX);
    var dt = t - tlDrag.tDown;
    if (tlDrag.mode === "left") {
      var ns = tlDrag.sel0 + dt;
      var nd = tlDrag.dur0 - dt;
      if (nd >= 1 && ns >= 0 && ns + nd <= tlDrag.sel0 + tlDrag.dur0 + 0.001) {
        tlSelStart = ns;
        tlSelDur = nd;
      }
    } else if (tlDrag.mode === "right") {
      var nd2 = Math.max(1, Math.min(tlDrag.dur0 + dt, tlDuration - tlDrag.sel0));
      tlSelStart = tlDrag.sel0;
      tlSelDur = nd2;
    } else if (tlDrag.mode === "move") {
      var ns2 = Math.max(0, Math.min(tlDrag.sel0 + dt, tlDuration - tlDrag.dur0));
      tlSelStart = ns2;
      tlSelDur = tlDrag.dur0;
    }
    clampTlSelection();
    drawTimelineCanvas();
    syncTimelineToInputs();
  }

  async function loadTimelinePeaks() {
    if (!isAppNewUI()) return;
    var id = projectId;
    if (!id) return;
    var fb = document.getElementById("timeline-fallback");
    var wrap = document.getElementById("timeline-wave-wrap");
    tlPeaks = null;
    if (fb) fb.classList.add("hidden");
    try {
      var r = await fetch(API + "/projects/" + id + "/audio");
      if (!r.ok) throw new Error("no audio");
      var buf = await r.arrayBuffer();
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("no ctx");
      var ac = new AC();
      var audioBuf = await ac.decodeAudioData(buf.slice(0));
      tlDuration = audioBuf.duration;
      tlPeaks = computeAudioPeaks(audioBuf, 2800);
      try {
        ac.close();
      } catch (_) {}
      var si = document.getElementById("excerpt-start");
      var di = document.getElementById("excerpt-duration");
      tlSelStart = si ? parseFloat(si.value) || 0 : 0;
      tlSelDur = di ? parseFloat(di.value) || 15 : 15;
      clampTlSelection();
      var zEl = document.getElementById("timeline-zoom");
      if (zEl) tlZoom = Math.max(1, parseInt(zEl.value, 10) / 100);
      clampTlViewStart();
      ensureViewShowsSelection();
      resizeTimelineCanvas();
      syncTimelineToInputs();
      if (fb) fb.classList.add("hidden");
    } catch (e) {
      tlPeaks = null;
      if (fb) fb.classList.remove("hidden");
      resizeTimelineCanvas();
    }
  }

  function initTimelineUI() {
    if (!isAppNewUI() || tlUiInited) return;
    var wrap = document.getElementById("timeline-wave-wrap");
    var canvas = document.getElementById("waveform-canvas");
    if (!wrap || !canvas) return;
    tlUiInited = true;
    wrap.addEventListener("mousedown", function (e) {
      if (!tlPeaks || !tlDuration) return;
      e.preventDefault();
      var t = timelineClientToTime(e.clientX);
      var mode = timelineHitMode(t);
      if (mode === "seek") {
        tlSelStart = t - tlSelDur / 2;
        clampTlSelection();
        ensureViewShowsSelection();
        syncTimelineToInputs();
        drawTimelineCanvas();
        return;
      }
      tlDrag = { mode: mode, tDown: t, sel0: tlSelStart, dur0: tlSelDur };
    });
    window.addEventListener("mousemove", function (e) {
      if (tlDrag) onTlPointerMove(e.clientX);
    });
    window.addEventListener("mouseup", endTlDrag);
    wrap.addEventListener("wheel", function (e) {
      if (!e.ctrlKey || !tlPeaks) return;
      e.preventDefault();
      var zEl = document.getElementById("timeline-zoom");
      var delta = e.deltaY > 0 ? -0.12 : 0.12;
      tlZoom = Math.max(1, Math.min(5, tlZoom * (1 + delta)));
      if (zEl) zEl.value = String(Math.round(tlZoom * 100));
      updateZoomLabel();
      clampTlViewStart();
      ensureViewShowsSelection();
      drawTimelineCanvas();
    }, { passive: false });
    var zIn = document.getElementById("timeline-zoom");
    function updateZoomLabel() {
      var el = document.getElementById("timeline-zoom-val");
      if (el) el.textContent = (Math.round(tlZoom * 10) / 10).toFixed(1) + "×";
    }
    if (zIn) {
      zIn.addEventListener("input", function () {
        tlZoom = Math.max(1, Math.min(5, parseInt(zIn.value, 10) / 100));
        updateZoomLabel();
        clampTlViewStart();
        ensureViewShowsSelection();
        drawTimelineCanvas();
      });
    }
    document.querySelectorAll(".app-chip-dur").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var d = parseFloat(btn.getAttribute("data-dur"), 10);
        if (!tlDuration || isNaN(d)) return;
        tlSelDur = Math.min(d, tlDuration - tlSelStart);
        if (tlSelDur < 1) {
          tlSelStart = Math.max(0, tlDuration - d);
          tlSelDur = Math.min(d, tlDuration - tlSelStart);
        }
        clampTlSelection();
        ensureViewShowsSelection();
        syncTimelineToInputs();
        drawTimelineCanvas();
      });
    });
    var pm = document.getElementById("timeline-pos-minus");
    var pp = document.getElementById("timeline-pos-plus");
    if (pm) pm.addEventListener("click", function () {
      if (!tlDuration) return;
      tlSelStart = Math.max(0, tlSelStart - 0.5);
      clampTlSelection();
      ensureViewShowsSelection();
      syncTimelineToInputs();
      drawTimelineCanvas();
    });
    if (pp) pp.addEventListener("click", function () {
      if (!tlDuration) return;
      tlSelStart = Math.min(tlDuration - tlSelDur, tlSelStart + 0.5);
      clampTlSelection();
      ensureViewShowsSelection();
      syncTimelineToInputs();
      drawTimelineCanvas();
    });
    var si = document.getElementById("excerpt-start");
    var di = document.getElementById("excerpt-duration");
    if (si) si.addEventListener("change", syncInputsToTimeline);
    if (di) di.addEventListener("change", syncInputsToTimeline);
    window.addEventListener("resize", function () {
      if (tlPeaks && document.getElementById("excerpt-panel") && !document.getElementById("excerpt-panel").classList.contains("hidden")) resizeTimelineCanvas();
    });
  }

  async function handleFiles(files) {
    if (!files || !files.length) return;
    var id = await ensureProject();
    var list = Array.from(files);
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var t = (f.type || "").toLowerCase();
      var name = f.name || "";
      if (t.indexOf("audio") >= 0) {
        setStatus("upload-status", "Envoi de l’audio…");
        try {
          var form = new FormData(); form.append("file", f);
          var r = await fetch(API + "/projects/" + id + "/audio", { method: "POST", body: form });
          var d = {}; try { d = JSON.parse(await r.text()); } catch (_) {}
          if (r.ok) {
            uploadedAudioName = name;
            updateDropzoneDisplay();
            setStatus("upload-status", "Audio enregistré.");
            if (d.duration_seconds > 0) showExcerptPanel(d.duration_seconds);
          } else setStatus("upload-status", d.detail || "Erreur audio", true);
        } catch (e) { setStatus("upload-status", e.message, true); }
      } else if (t.indexOf("video") >= 0 || t.indexOf("image") >= 0) {
        setStatus("upload-status", "Envoi du fond…");
        try {
          var form2 = new FormData(); form2.append("file", f);
          var r2 = await fetch(API + "/projects/" + id + "/background", { method: "POST", body: form2 });
          var d2 = {}; try { d2 = JSON.parse(await r2.text()); } catch (_) {}
          if (r2.ok) { uploadedBgName = name; updateDropzoneDisplay(); setStatus("upload-status", "Fond enregistré."); }
          else setStatus("upload-status", d2.detail || "Erreur fond", true);
        } catch (e) { setStatus("upload-status", e.message, true); }
      } else {
        setStatus("upload-status", "Type non supporté : " + name + " (il faut un audio et/ou une vidéo ou image).", true);
      }
    }
    if (uploadedAudioName) setStatus("upload-status", uploadedBgName ? "Fichiers prêts." : "Audio prêt. Tu peux ajouter une vidéo/image ou lancer la détection.");
  }

  function setupSingleDropzone() {
    var dz = document.getElementById("dropzone-main");
    var input = document.getElementById("input-files");
    if (!dz || !input) return;
    function onFiles(files) {
      if (!files || !files.length) return;
      handleFiles(Array.from(files));
      input.value = "";
    }
    input.addEventListener("change", function () { if (input.files && input.files.length) onFiles(input.files); });
    dz.addEventListener("click", function (e) { if (e.target !== input) { e.preventDefault(); input.click(); } });
    dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("dragover"); });
    dz.addEventListener("dragleave", function (e) { if (!dz.contains(e.relatedTarget)) dz.classList.remove("dragover"); });
    dz.addEventListener("drop", function (e) {
      e.preventDefault();
      dz.classList.remove("dragover");
      if (e.dataTransfer && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
    });
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
    var di = document.getElementById("excerpt-duration");
    var info = document.getElementById("excerpt-duration-info");
    if (!panel || !si) return;
    if (dur > 0) {
      si.max = Math.max(0, dur - 0.5);
      si.placeholder = "0 à " + Math.floor(dur);
      if (di) {
        di.max = dur;
        di.placeholder = "1 à " + Math.floor(dur);
        var defDur = Math.min(30, Math.max(1, Math.floor(dur)));
        di.value = defDur;
      }
      if (info) info.textContent = "Durée totale : " + (Math.floor(dur * 10) / 10) + " s";
    }
    panel.classList.remove("hidden");
    initTimelineUI();
    if (isAppNewUI()) loadTimelinePeaks();
  }
  async function applyExcerpt() {
    var id = projectId; if (!id) return;
    var start = parseFloat(document.getElementById("excerpt-start").value) || 0;
    var dur = parseFloat(document.getElementById("excerpt-duration").value) || 20;
    var di = document.getElementById("excerpt-duration");
    var maxDur = di && di.max ? parseFloat(di.max) : 0;
    if (dur <= 0) dur = 20;
    if (maxDur > 0 && dur > maxDur) dur = maxDur;
    excerptInfo.start = start;
    excerptInfo.duration = dur;
    if (typeof updateStudioSelectedLabel === "function") updateStudioSelectedLabel();
    if (typeof updateStudioWaveWindow === "function") updateStudioWaveWindow();
    setStatus("excerpt-status", "Application…");
    try {
      var r = await fetch(API + "/projects/" + id + "/audio/segment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start_seconds: start, duration_seconds: dur }) });
      var data = {}; try { data = JSON.parse(await r.text()); } catch (_) {}
      if (r.ok) {
        setStatus("excerpt-status", "Extrait appliqué. Tu peux lancer « Détecter les paroles » sur cet extrait.");
        if (data.duration_seconds > 0) showExcerptPanel(data.duration_seconds);
      } else setStatus("excerpt-status", data.detail || "Erreur", true);
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
  var effectLabels = { minimal:"Minimal",classique:"Classique",outline:"Contour",outline_tres_epais:"Contour très épais",outline_ombre:"Contour + ombre",outline_ombre_fort:"Contour + ombre fort",gras_epais:"Gras épais",italique:"Italique",neon:"Néon",elegant:"Élégant" };
  var textureEffectUrls = {};
  var bundledFontFiles = {};
  var APP_FONTS = ["Arial", "Arial Black", "Impact", "Times New Roman", "Comic Sans MS", "Franklin Gothic Medium", "Consolas", "Segoe UI Light", "Gill Sans MT", "Vivaldi", "Papyrus", "Rockwell Condensed"];
  function injectBundledFontFaces(map) {
    var old = document.getElementById("bundled-font-faces");
    if (old) old.remove();
    if (!map || typeof map !== "object") return;
    var parts = [];
    Object.keys(map).forEach(function (fam) {
      var url = map[fam];
      if (!url) return;
      var fmt = (url.toLowerCase().indexOf(".otf") !== -1) ? "opentype" : "truetype";
      parts.push("@font-face{font-family:" + JSON.stringify(fam) + ";src:url(" + JSON.stringify(url) + ") format(\"" + fmt + "\");font-display:swap;}");
    });
    if (!parts.length) return;
    var st = document.createElement("style");
    st.id = "bundled-font-faces";
    st.textContent = parts.join("\n");
    document.head.appendChild(st);
  }
  function rebuildFontCarousel(fonts) {
    var wrap = document.getElementById("font-carousel");
    if (!wrap) return;
    wrap.innerHTML = "";
    if (!fonts || !fonts.length) return;
    var list = fonts.slice().sort(function (a, b) { return a.localeCompare(b, "fr", { sensitivity: "base" }); });
    list.forEach(function (f) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "app-font-tile";
      btn.setAttribute("data-font", f);
      var prev = document.createElement("span");
      prev.className = "app-font-tile-preview";
      prev.textContent = "Aa";
      prev.style.fontFamily = '"' + f.replace(/"/g, "") + '", sans-serif';
      var lab = document.createElement("span");
      lab.className = "app-font-tile-name";
      lab.textContent = f.length > 18 ? f.slice(0, 16) + "…" : f;
      btn.appendChild(prev);
      btn.appendChild(lab);
      wrap.appendChild(btn);
    });
  }
  function rebuildEffectCarousel(effects) {
    var wrap = document.getElementById("effect-carousel");
    if (!wrap) return;
    wrap.innerHTML = "";
    if (!effects || !effects.length) return;
    effects.forEach(function (eff) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "app-effect-tile";
      btn.setAttribute("data-effect", eff);
      var prev = document.createElement("span");
      prev.className = "app-effect-tile-preview";
      prev.textContent = "Lyric";
      var lab = document.createElement("span");
      lab.className = "app-effect-tile-label";
      lab.textContent = effectLabels[eff] || eff;
      btn.appendChild(prev);
      btn.appendChild(lab);
      wrap.appendChild(btn);
    });
  }
  function syncFontCarouselFromSelect() {
    var fs = document.getElementById("select-font");
    var v = fs && fs.value;
    document.querySelectorAll("#font-carousel .app-font-tile").forEach(function (p) {
      p.classList.toggle("active", (p.getAttribute("data-font") || "") === v);
    });
  }
  function syncEffectTilesFromSelect() {
    var es = document.getElementById("select-effect");
    var val = es && es.value ? es.value : "neon";
    document.querySelectorAll("#effect-carousel .app-effect-tile").forEach(function (p) {
      p.classList.toggle("active", (p.getAttribute("data-effect") || "") === val);
    });
  }
  function initFontCarousel() {
    var wrap = document.getElementById("font-carousel");
    if (!wrap || wrap.dataset.boundCarousel) return;
    wrap.dataset.boundCarousel = "1";
    wrap.addEventListener("click", function (e) {
      var tile = e.target.closest(".app-font-tile");
      if (!tile) return;
      var name = tile.getAttribute("data-font");
      var fs = document.getElementById("select-font");
      if (fs && name) fs.value = name;
      syncFontCarouselFromSelect();
      updatePreviewOverlay();
    });
  }
  function initEffectCarousel() {
    var wrap = document.getElementById("effect-carousel");
    if (!wrap || wrap.dataset.boundEffect) return;
    wrap.dataset.boundEffect = "1";
    wrap.addEventListener("click", function (e) {
      var tile = e.target.closest(".app-effect-tile");
      if (!tile) return;
      var eff = tile.getAttribute("data-effect");
      var sel = document.getElementById("select-effect");
      if (sel && eff) sel.value = eff;
      syncEffectTilesFromSelect();
      updatePreviewOverlay();
    });
  }
  function initStyleStudioRail() {
    var rail = document.querySelector(".app-style-rail");
    if (!rail || rail.dataset.boundRail) return;
    rail.dataset.boundRail = "1";
    rail.addEventListener("click", function (e) {
      var btn = e.target.closest(".app-style-rail-btn");
      if (!btn) return;
      var id = btn.getAttribute("data-style-panel");
      if (!id) return;
      rail.querySelectorAll(".app-style-rail-btn").forEach(function (b) { b.classList.toggle("is-active", b === btn); });
      document.querySelectorAll(".app-style-panel").forEach(function (p) {
        var show = p.id === "style-panel-" + id;
        p.hidden = !show;
        p.classList.toggle("is-active", show);
      });
    });
  }
  function fillDefaultOptions() {
    var fs = document.getElementById("select-font");
    var es = document.getElementById("select-effect");
    if (fs && !fs.options.length) APP_FONTS.forEach(function (f) { fs.appendChild(new Option(f, f)); });
    if (es && es.tagName === "SELECT" && !es.options.length) [{ v:"classique",l:"Classique" },{ v:"outline",l:"Contour" },{ v:"gras_epais",l:"Gras épais" },{ v:"minimal",l:"Minimal" },{ v:"neon",l:"Néon" }].forEach(function (o) { es.appendChild(new Option(o.l, o.v)); });
    if (document.getElementById("effect-carousel") && es && es.options.length) {
      var effs = [];
      for (var j = 0; j < es.options.length; j++) effs.push(es.options[j].value);
      rebuildEffectCarousel(effs);
      syncEffectTilesFromSelect();
    }
  }
  function loadRenderOptions() {
    fetch(API + "/config/options").then(function (r) { return r.json(); }).then(function (data) {
      var fs = document.getElementById("select-font");
      var es = document.getElementById("select-effect");
      if (data && data.effect_labels) {
        Object.keys(data.effect_labels).forEach(function (k) { effectLabels[k] = data.effect_labels[k]; });
      }
      textureEffectUrls = (data && data.texture_effects) ? data.texture_effects : {};
      bundledFontFiles = (data && data.font_files) ? data.font_files : {};
      injectBundledFontFaces(bundledFontFiles);
      if (fs && data.fonts && data.fonts.length) {
        var prevFont = fs.value;
        var fontsSorted = data.fonts.slice().sort(function (a, b) { return a.localeCompare(b, "fr", { sensitivity: "base" }); });
        fs.innerHTML = "";
        fontsSorted.forEach(function (f) {
          var o = document.createElement("option");
          o.value = f;
          o.textContent = f;
          fs.appendChild(o);
        });
        rebuildFontCarousel(fontsSorted);
        if (prevFont && fontsSorted.indexOf(prevFont) >= 0) fs.value = prevFont;
        else if (fontsSorted.indexOf("Impact") >= 0) fs.value = "Impact";
        else fs.selectedIndex = 0;
        syncFontCarouselFromSelect();
      }
      if (es && es.tagName === "SELECT" && data.effects && data.effects.length) {
        var prevEff = es.value;
        es.innerHTML = data.effects.map(function (e) { return '<option value="' + e + '">' + (effectLabels[e] || e) + '</option>'; }).join("");
        var allowed = data.effects;
        if (prevEff && allowed.indexOf(prevEff) >= 0) {
          es.value = prevEff;
        } else if (allowed.indexOf("neon") >= 0) {
          es.value = "neon";
        } else if (es.options.length) {
          es.selectedIndex = 0;
        }
        rebuildEffectCarousel(allowed);
        syncEffectTilesFromSelect();
      }
      fillDefaultOptions();
    }).catch(fillDefaultOptions);
  }
  function initNewUIPills() {
    var es = document.getElementById("select-effect");
    if (es && es.tagName === "SELECT") {
      es.addEventListener("change", function () { syncEffectTilesFromSelect(); updatePreviewOverlay(); });
    }
    var selDisplay = document.getElementById("select-display");
    if (selDisplay) {
      displayMode = selDisplay.value || "mot";
      selDisplay.addEventListener("change", function () {
        displayMode = selDisplay.value || "mot";
        updatePreviewOverlay();
      });
    }
    document.querySelectorAll(".app-pill-pos").forEach(function (pill) {
      pill.addEventListener("click", function () {
        document.querySelectorAll(".app-pill-pos").forEach(function (p) { p.classList.remove("active"); });
        pill.classList.add("active");
        var pos = pill.dataset.pos || "center";
        var hid = document.getElementById("select-position");
        if (hid) hid.value = pos;
        applyOverlayPosition(pos);
        updatePreviewOverlay();
      });
    });
    var sizeInput = document.getElementById("input-font-size");
    var sizeVal = document.getElementById("font-size-val");
    if (sizeInput && sizeVal) {
      sizeInput.addEventListener("input", function () { sizeVal.textContent = sizeInput.value; updatePreviewOverlay(); });
    }
    ["select-font", "input-text-color"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", function () {
          if (id === "select-font") syncFontCarouselFromSelect();
          updatePreviewOverlay();
        });
        el.addEventListener("input", updatePreviewOverlay);
      }
    });
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
        if (data.audioshake_available) sel.appendChild(new Option("AudioShake (qualité pro — recommandé)", "audioshake"));
        if (data.assemblyai_available) sel.appendChild(new Option("AssemblyAI Pro + Demucs", "assemblyai"));
        if (data.azure_available) sel.appendChild(new Option("Azure Speech", "azure"));
        if (data.heartmula_available) {
          if (data.heartmula_local) sel.appendChild(new Option("HeartMuLa (local)", "heartmula"));
          else sel.appendChild(new Option("HeartMuLa (WaveSpeed)", "heartmula"));
        }
        sel.appendChild(new Option("Whisper (local)", "whisper"));
        if (wrap) wrap.classList.remove("hidden");
      }
      var isWhisperOnly = !data.audioshake_available && !data.assemblyai_available && !data.azure_available && !data.heartmula_available;
      if (badge) {
        badge.textContent = data.audioshake_available && sel && sel.value === "audioshake" ? "AudioShake" : data.assemblyai_available && sel && sel.value === "assemblyai" ? "AssemblyAI" : (data.azure_available && sel && sel.value === "azure") ? "Azure" : (data.heartmula_available && sel && sel.value === "heartmula") ? "HeartMuLa" : "Whisper";
        badge.classList.toggle("whisper", !data.audioshake_available && !data.assemblyai_available && (!sel || sel.value === "whisper"));
      }
      if (opts) opts.classList.toggle("hidden", data.audioshake_available || data.assemblyai_available || (sel && (sel.value === "azure" || sel.value === "heartmula")));
    }).catch(function () {
      clearTimeout(tid);
      var badge = document.getElementById("engine-badge");
      var opts = document.getElementById("whisper-options");
      var sel = document.getElementById("select-engine");
      if (sel) {
        sel.innerHTML = "";
        sel.appendChild(new Option("AudioShake (qualité pro — recommandé)", "audioshake"));
        sel.appendChild(new Option("AssemblyAI Pro + Demucs", "assemblyai"));
        sel.appendChild(new Option("Azure Speech", "azure"));
        sel.appendChild(new Option("HeartMuLa (local)", "heartmula"));
        sel.appendChild(new Option("Whisper (local)", "whisper"));
      }
      if (badge) { badge.textContent = "Whisper"; badge.classList.add("whisper"); }
      if (opts) opts.classList.remove("hidden");
    });
  }

  /* ======== WORDS ======== */
  function getWordsFromBoxes() {
    if (isAppNewUI()) {
      var out = [];
      document.querySelectorAll("#lyrics-phrases .app-phrase-line").forEach(function (line) {
        var t = (line.value || line.textContent || "").trim().split(/\s+/).filter(Boolean);
        out = out.concat(t);
      });
      return out;
    }
    var out = [];
    document.querySelectorAll("#lyrics-words .word-box").forEach(function (b) { out.push((b.textContent || "").trim().replace(/\s+/g, " ")); });
    return out;
  }
  function getSegmentsFromBoxesFromPhraseLines() {
    var out = [];
    if (!currentSegments || !currentPhrases.length) return out;
    var container = document.getElementById("lyrics-phrases");
    if (!container) return out;
    var lines = container.querySelectorAll(".app-phrase-line");
    for (var i = 0; i < currentPhrases.length && i < lines.length; i++) {
      var phrase = currentPhrases[i];
      var lineEl = lines[i];
      var text = (lineEl.value || lineEl.textContent || "").trim();
      var words = text.split(/\s+/).filter(Boolean);
      for (var j = 0; j < words.length && j < phrase.length; j++) {
        var segIdx = phrase[j].idx;
        var seg = currentSegments[segIdx];
        if (seg) out.push({ start_time_ms: seg.start_time_ms, end_time_ms: seg.end_time_ms, text: words[j] });
      }
    }
    return out;
  }
  function getSegmentsFromBoxes() {
    if (isAppNewUI() && document.getElementById("lyrics-phrases") && document.querySelectorAll("#lyrics-phrases .app-phrase-line").length) {
      return getSegmentsFromBoxesFromPhraseLines();
    }
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
    var effectVal = (es && (es.value !== undefined && es.value !== null)) ? es.value : (isAppNewUI() ? "neon" : "classique");
    return {
      font: (fs && fs.value) || "Impact",
      effect: effectVal,
      color: (ce && ce.value) || "#FFFFFF",
      size: (se && se.value) ? parseInt(se.value, 10) : 48,
      position: (pe && pe.value) || "center"
    };
  }

  function _getWordText(segIdx) {
    if (isAppNewUI() && currentPhrases.length) {
      for (var p = 0; p < currentPhrases.length; p++) {
        for (var w = 0; w < currentPhrases[p].length; w++) {
          if (currentPhrases[p][w].idx === segIdx) {
            var line = document.querySelector('#lyrics-phrases .app-phrase-line[data-phrase-idx="' + p + '"]');
            if (!line) return (currentSegments[segIdx] && currentSegments[segIdx].text) || "";
            var words = (line.value || line.textContent || "").trim().split(/\s+/).filter(Boolean);
            return words[w] || (currentSegments[segIdx] && currentSegments[segIdx].text) || "";
          }
        }
      }
      return (currentSegments[segIdx] && currentSegments[segIdx].text) || "";
    }
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
    if (isAppNewUI() && currentPhrases.length) {
      document.querySelectorAll("#lyrics-phrases .app-phrase-line").forEach(function (l) { l.classList.remove("current-phrase"); });
      var loc = idx >= 0 ? _findPhraseForIdx(idx) : null;
      if (loc !== null) {
        var pl = document.querySelector('#lyrics-phrases .app-phrase-line[data-phrase-idx="' + loc.phraseIdx + '"]');
        if (pl) {
          pl.classList.add("current-phrase");
          if (loc.phraseIdx !== lastPhraseScrollIdx) {
            lastPhraseScrollIdx = loc.phraseIdx;
            requestAnimationFrame(function () {
              pl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
            });
          }
        }
      } else if (idx < 0) {
        lastPhraseScrollIdx = -1;
      }
    }
    if (idx >= 0 && !isAppNewUI()) {
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
    // Effets externes texture: appliquer dynamiquement le remplissage image en preview.
    var texUrl = textureEffectUrls[st.effect || ""] || "";
    if (texUrl) {
      ov.style.backgroundImage = 'url(\"' + texUrl + '\")';
      ov.style.backgroundSize = "cover";
      ov.style.backgroundPosition = "center";
      ov.style.backgroundRepeat = "no-repeat";
      ov.style.webkitBackgroundClip = "text";
      ov.style.backgroundClip = "text";
      ov.style.color = "transparent";
      ov.style.webkitTextFillColor = "transparent";
      ov.style.textShadow = "0 2px 6px rgba(0,0,0,.45)";
      ov.style.fontWeight = "800";
    } else {
      ov.style.backgroundImage = "";
      ov.style.backgroundSize = "";
      ov.style.backgroundPosition = "";
      ov.style.backgroundRepeat = "";
      ov.style.webkitBackgroundClip = "";
      ov.style.backgroundClip = "";
      ov.style.webkitTextFillColor = "";
    }
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
    if (isAppNewUI()) enableDragMode();
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

    // Met à jour la fenêtre sur la mini-waveform studio si présente
    updateStudioWaveWindow();

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
      if (el) {
        el.addEventListener("change", function () {
          if (id === "select-font") syncFontCarouselFromSelect();
          updatePreviewOverlay();
        });
        el.addEventListener("input", updatePreviewOverlay);
      }
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

  /* ======== CAPTIONS + TIMELINE (étape 3) ======== */
  function _formatTime(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ":" + (s < 10 ? "0" + s : s);
  }

  function refreshCaptionsTable() {
    var tbody = document.querySelector("#captions-table tbody");
    if (!tbody) return;
    if (!currentSegments || !currentSegments.length) {
      tbody.innerHTML = "";
      return;
    }
    var html = "";
    for (var i = 0; i < currentSegments.length; i++) {
      var seg = currentSegments[i] || {};
      var startMs = seg.start_time_ms || 0;
      var endMs = seg.end_time_ms || seg.end_time || startMs;
      html += "<tr><td>" + _formatTime(startMs) + "</td><td>" + _formatTime(endMs) + "</td><td>" + escapeHtml(seg.text || "") + "</td></tr>";
    }
    tbody.innerHTML = html;
  }

  function updateStudioSelectedLabel() {
    var el = document.getElementById("studio-selected-range");
    if (!el) return;
    if (!excerptInfo || !excerptInfo.duration) {
      el.textContent = "Extrait : piste complète";
      return;
    }
    var start = excerptInfo.start || 0;
    var end = start + excerptInfo.duration;
    el.textContent = "Extrait : " + _formatTime(start * 1000) + " – " + _formatTime(end * 1000);
  }

  function updateStudioWaveWindow() {
    var win = document.getElementById("studio-wave-window");
    if (!win) return;
    var start = excerptInfo.start || 0;
    var dur = excerptInfo.duration || 0;
    if (!dur) {
      win.style.left = "8%";
      win.style.right = "8%";
      return;
    }
    // On suppose que l'extrait fait partie d'une piste ~60s pour un visuel équilibré
    var approxTotal = 60;
    var ratioStart = Math.min(1, Math.max(0, start / approxTotal));
    var ratioEnd = Math.min(1, Math.max(ratioStart + dur / approxTotal, ratioStart + 0.05));
    var left = 5 + ratioStart * 80;
    var right = 95 - ratioEnd * 80;
    win.style.left = left.toFixed(1) + "%";
    win.style.right = right.toFixed(1) + "%";
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
    var sfont = document.getElementById("select-font");
    if (sfont && sfont.tagName === "SELECT" && sfont.options.length && p.font !== undefined) {
      var hf = false;
      for (var fi = 0; fi < sfont.options.length; fi++) { if (sfont.options[fi].value === p.font) { hf = true; break; } }
      if (!hf) {
        sfont.value = sfont.querySelector('option[value="Arial"]') ? "Arial" : (sfont.options[0] && sfont.options[0].value) || "Arial";
      }
    }
    syncFontCarouselFromSelect();
    setVal("select-effect", p.effect);
    var se = document.getElementById("select-effect");
    if (se && se.tagName === "SELECT" && se.options.length && p.effect !== undefined) {
      var has = false;
      for (var ei = 0; ei < se.options.length; ei++) { if (se.options[ei].value === p.effect) { has = true; break; } }
      if (!has) {
        se.value = se.querySelector('option[value="neon"]') ? "neon" : (se.options[0] && se.options[0].value) || "classique";
      }
    }
    syncEffectTilesFromSelect();
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
    if (isAppNewUI()) { enableDragMode(); applyOverlayPosition(p.position || "center"); } else { if (p.position === "drag") enableDragMode(); else disableDragMode(); }
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
    initWorkflowNav();
    if (!isAppNewUI()) {
      initParticles();
      initScrollAnimations();
      initFullstepScroll();
      initAnimCarousel();
      initVignettes();
      initPills();
      updateStudioSelectedLabel();
      updateStudioWaveWindow();
    } else {
      setupSingleDropzone();
      initTimelineUI();
      initFontCarousel();
      initEffectCarousel();
      initStyleStudioRail();
      loadRenderOptions();
      initNewUIPills();
      window.addEventListener("resize", function () { resizeAllPhraseLines(); });
    }
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

    if (document.getElementById("dropzone-audio")) setupDropzone("dropzone-audio", "input-audio", "audio-filename", uploadAudioFile);
    if (document.getElementById("dropzone-background")) setupDropzone("dropzone-background", "input-background", "background-filename", uploadBackgroundFile);
    var btnExcerpt = document.getElementById("btn-apply-excerpt");
    if (btnExcerpt) btnExcerpt.addEventListener("click", applyExcerpt);
    ensureProject().then(function () { loadPresets(); }).catch(function () {});
    loadRenderOptions();
    loadSpeechConfig();

    var selEngine = document.getElementById("select-engine");
    var engineBadge = document.getElementById("engine-badge");
    var whisperOpts = document.getElementById("whisper-options");
    if (selEngine) {
      selEngine.addEventListener("change", function () {
        var v = selEngine.value;
        var label = (selEngine.selectedIndex >= 0 && selEngine.options[selEngine.selectedIndex]) ? selEngine.options[selEngine.selectedIndex].text : v;
        if (engineBadge) { engineBadge.textContent = label.split(" ")[0]; engineBadge.classList.toggle("whisper", v === "whisper"); }
        if (whisperOpts) whisperOpts.classList.toggle("hidden", v !== "whisper");
      });
    }

    /* Détection paroles */
    var btnDetect = document.getElementById("btn-detect-lyrics");
    if (btnDetect) btnDetect.addEventListener("click", async function () {
      var ok = false;
      showSyncProgressOverlay();
      try {
        var id = await ensureProject();
        var startEl = document.getElementById("excerpt-start");
        var durEl = document.getElementById("excerpt-duration");
        var start = (startEl && parseFloat(startEl.value)) || 0;
        var dur = (durEl && parseFloat(durEl.value)) || 0;
        var body = {};
        var hints = getWordsFromBoxes().filter(Boolean).join(" ");
        if (!hints && currentSegments) hints = currentSegments.map(function (s) { return s.text; }).join(" ");
        if (hints) body.phrase_hints = hints;
        if (dur > 0) {
          body.start_seconds = start;
          body.duration_seconds = dur;
        }
        var modelEl = document.getElementById("select-whisper-model");
        var model = modelEl ? modelEl.value : "large";
        setStatus("sync-status", dur > 0 ? "Détection sur l’extrait indiqué…" : "Détection en cours…");
        var engEl = document.getElementById("select-engine");
        var engine = (engEl && engEl.value) || "whisper";
        var query = "whisper_model=" + encodeURIComponent(model) + "&engine=" + encodeURIComponent(engine);
        var abort = new AbortController();
        var timeoutId = setTimeout(function () { abort.abort(); }, 300000);
        var r;
        try {
          r = await fetch(API + "/projects/" + id + "/analyze?" + query, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: abort.signal });
        } catch (e) {
          clearTimeout(timeoutId);
          if (e.name === "AbortError") throw new Error("Détection trop longue (timeout 5 min). Réessaie avec un extrait plus court.");
          throw e;
        }
        clearTimeout(timeoutId);
        var data = await r.json();
        if (!r.ok) throw new Error(data.detail || "Erreur");
        if (data.segments && data.segments.length) {
          currentSegments = data.segments;
          currentPhrases = groupIntoPhrases(currentSegments);
          lastPhraseScrollIdx = -1;
          if (isAppNewUI()) {
            var container = document.getElementById("lyrics-phrases");
            var cardRender = document.getElementById("card-render");
            if (container) {
              container.innerHTML = "";
              for (var i = 0; i < currentPhrases.length; i++) {
                var phraseText = currentPhrases[i].map(function (x) { return (currentSegments[x.idx] && currentSegments[x.idx].text) || ""; }).join(" ").trim();
                var lineEl = document.createElement("div");
                lineEl.className = "app-phrase-line";
                lineEl.setAttribute("contenteditable", "true");
                lineEl.setAttribute("spellcheck", "false");
                lineEl.setAttribute("data-phrase-idx", String(i));
                lineEl.setAttribute("data-placeholder", "Phrase " + (i + 1));
                lineEl.textContent = phraseText;
                container.appendChild(lineEl);
              }
            }
            if (cardRender) cardRender.classList.remove("hidden");
            var phOld = document.getElementById("step-montage-placeholder");
            if (phOld) phOld.classList.add("hidden");
            startPreview();
            goWorkflowStep(3);
          } else {
            var wc = document.getElementById("lyrics-words");
            if (wc) {
              wc.innerHTML = data.segments.map(function (w, i) {
                return '<span class="word-box-wrap" data-segment-index="' + i + '"><span class="word-box" contenteditable="true" spellcheck="false">' + escapeHtml(w.text || "") + '</span></span>';
              }).join(" ");
              wc.classList.remove("hidden");
            }
            startPreview();
            refreshCaptionsTable();
          }
        }
        var engineLabels = {
          "audioshake": "AudioShake (qualité pro)",
          "assemblyai": "AssemblyAI Pro + Demucs",
          "azure": "Azure Speech",
          "heartmula": "HeartMuLa",
          "whisper": "Whisper (local)"
        };
        var lbl = engineLabels[data.engine] || data.engine;
        setStatus("sync-status", data.words_count + " mots détectés — " + lbl + " ✓");
        ok = true;
      } catch (e) {
        setStatus("sync-status", e.message, true);
      } finally {
        hideSyncProgressOverlay(ok);
      }
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

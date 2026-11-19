(function () {
    "use strict";

    // ============================================================
    // ASCII icons
    // Usage: an <img class="ascii-icon"> inside a sized box.
    // The characters use the box's text colour (set it in Webflow).
    // Optional attributes on the img:
    //   data-ascii-mode="alpha" | "dark" | "light"
    //     (default: anything that differs from the image's background)
    //   data-ascii-chars=" .+#@"          (lightest to densest)
    // ============================================================
    function initAsciiIcons() {
        const FONT_SIZE = 10; // px; smaller = more detail
        const CELL_W = FONT_SIZE * 0.6; // monospace characters are ~0.6 as wide as tall
        const CELL_H = FONT_SIZE;
        const FONT = `500 ${FONT_SIZE}px ui-monospace, Menlo, Consolas, monospace`;
        const GLYPHS = "@#+=*%.:-";
        const reduceMotion = matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        document.querySelectorAll("img.ascii-icon").forEach((img) => {
            // Load a CORS-enabled copy of the image so its pixels can be read
            const src = new Image();
            src.crossOrigin = "anonymous";
            src.onload = () => start(img.parentElement, src, img);
            src.src = img.currentSrc || img.src;
        });

        function start(box, src, img) {
            const chars = img.dataset.asciiChars || " .+#@";
            const mode = img.dataset.asciiMode || "auto";
            if (getComputedStyle(box).position === "static")
                box.style.position = "relative";
            img.style.opacity = "0"; // keep it for layout, size and alt text

            const canvas = document.createElement("canvas");
            canvas.setAttribute("aria-hidden", "true");
            canvas.style.cssText =
                "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
            box.appendChild(canvas);
            const ctx = canvas.getContext("2d");

            let cols, rows, density, scramble, color;
            let hoverX = -1,
                hoverY = -1,
                visible = false;

            function build() {
                const dpr = window.devicePixelRatio || 1;
                const w = box.clientWidth,
                    h = box.clientHeight;
                if (!w || !h) {
                    console.warn(
                        "ascii-icon: the box has no size, give it a width and height",
                        box,
                    );
                    return;
                }
                canvas.width = w * dpr;
                canvas.height = h * dpr;
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                color = getComputedStyle(box).color;
                cols = Math.floor(w / CELL_W);
                rows = Math.floor(h / CELL_H);

                // Draw the image at full size, fitted inside with some padding
                const off = document.createElement("canvas");
                off.width = Math.round(w);
                off.height = Math.round(h);
                const o = off.getContext("2d", { willReadFrequently: true });
                const iw = src.naturalWidth || 24,
                    ih = src.naturalHeight || 24;
                const s = Math.min(w / iw, h / ih) * 0.85;
                o.drawImage(
                    src,
                    (w - iw * s) / 2,
                    (h - ih * s) / 2,
                    iw * s,
                    ih * s,
                );
                const px = o.getImageData(0, 0, off.width, off.height).data;

                // Work out what counts as "shape": by default, anything that
                // differs from the background colour found in the image corners
                // (or from transparency, for icons without a background)
                const bg = cornerColor();
                function value(p) {
                    const a = px[p + 3] / 255;
                    const r = px[p],
                        g = px[p + 1],
                        b = px[p + 2];
                    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                    if (mode === "dark") return a * (1 - lum);
                    if (mode === "light") return a * lum;
                    if (mode === "alpha" || !bg) return a;
                    const dist =
                        Math.hypot(r - bg[0], g - bg[1], b - bg[2]) / 441;
                    return a * dist;
                }

                // Average every cell's pixels, so edges get partial values
                const cov = new Float32Array(cols * rows);
                for (let cy = 0; cy < rows; cy++) {
                    for (let cx = 0; cx < cols; cx++) {
                        let sum = 0,
                            n = 0;
                        const x0 = Math.floor(cx * CELL_W),
                            x1 = Math.floor((cx + 1) * CELL_W);
                        const y0 = Math.floor(cy * CELL_H),
                            y1 = Math.floor((cy + 1) * CELL_H);
                        for (let y = y0; y < y1; y += 2) {
                            for (let x = x0; x < x1; x += 2) {
                                sum += value((y * off.width + x) * 4);
                                n++;
                            }
                        }
                        cov[cy * cols + cx] = n ? sum / n : 0;
                    }
                }

                // Fake depth: blur the shape and use it to make the middle denser
                // and the edges lighter, plus light coming from the top left
                const blur = boxBlur(boxBlur(cov, 2), 2);
                density = new Float32Array(cols * rows);
                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++) {
                        const i = y * cols + x;
                        const light =
                            0.85 + 0.15 * (1 - (x / cols + y / rows) / 2);
                        density[i] = cov[i] * (0.6 + 0.4 * blur[i]) * light;
                    }
                }

                // Stretch the contrast so the densest parts reach the last character
                const sorted = Array.from(density)
                    .filter((v) => v > 0.02)
                    .sort((a, b) => a - b);
                const top = sorted.length
                    ? sorted[Math.floor(sorted.length * 0.95)]
                    : 1;
                for (let i = 0; i < density.length; i++) {
                    density[i] = Math.pow(Math.min(1, density[i] / top), 0.8);
                }
                scramble = new Float32Array(cols * rows).fill(1); // start scrambled
            }

            // Average colour of the image's corners, or null if they're transparent
            function cornerColor() {
                const c = document.createElement("canvas");
                c.width = c.height = 32;
                const cc = c.getContext("2d", { willReadFrequently: true });
                cc.drawImage(src, 0, 0, 32, 32);
                const d = cc.getImageData(0, 0, 32, 32).data;
                let r = 0,
                    g = 0,
                    b = 0,
                    a = 0;
                for (const [x, y] of [
                    [0, 0],
                    [31, 0],
                    [0, 31],
                    [31, 31],
                ]) {
                    const p = (y * 32 + x) * 4;
                    r += d[p];
                    g += d[p + 1];
                    b += d[p + 2];
                    a += d[p + 3];
                }
                return a / 4 < 128 ? null : [r / 4, g / 4, b / 4];
            }

            function boxBlur(src, r) {
                const out = new Float32Array(src.length);
                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++) {
                        let sum = 0,
                            n = 0;
                        for (let dy = -r; dy <= r; dy++) {
                            for (let dx = -r; dx <= r; dx++) {
                                const xx = x + dx,
                                    yy = y + dy;
                                n++;
                                if (
                                    xx < 0 ||
                                    yy < 0 ||
                                    xx >= cols ||
                                    yy >= rows
                                )
                                    continue;
                                sum += src[yy * cols + xx];
                            }
                        }
                        out[y * cols + x] = sum / n;
                    }
                }
                return out;
            }

            function draw(t) {
                if (!density) return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.font = FONT;
                ctx.textBaseline = "top";
                ctx.fillStyle = color;
                const last = chars.length - 1;

                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++) {
                        const i = y * cols + x;
                        if (density[i] < 0.02) continue;

                        // A soft band of light sweeps diagonally across the shape
                        const sweep = reduceMotion
                            ? 1
                            : 0.85 +
                              0.15 * Math.sin(t * 1.5 - (x * 0.6 + y) * 0.25);
                        let ch =
                            chars[
                                Math.min(
                                    last,
                                    Math.round(density[i] * sweep * last),
                                )
                            ];

                        // Scramble near the cursor, plus occasional random flicker
                        if (
                            hoverX >= 0 &&
                            Math.hypot((x - hoverX) * 0.6, y - hoverY) < 3
                        )
                            scramble[i] = 1;
                        if (!reduceMotion && Math.random() < 0.001)
                            scramble[i] = 0.6;
                        if (scramble[i] > 0) {
                            if (Math.random() < scramble[i])
                                ch =
                                    GLYPHS[(Math.random() * GLYPHS.length) | 0];
                            scramble[i] = Math.max(
                                0,
                                scramble[i] - 0.02 - Math.random() * 0.03,
                            );
                        }

                        if (ch !== " ")
                            ctx.fillText(ch, x * CELL_W, y * CELL_H);
                    }
                }
            }

            function frame(t) {
                if (visible) draw(t / 1000);
                requestAnimationFrame(frame);
            }

            box.addEventListener("pointermove", (e) => {
                const r = box.getBoundingClientRect();
                hoverX = (e.clientX - r.left) / CELL_W;
                hoverY = (e.clientY - r.top) / CELL_H;
            });
            box.addEventListener("pointerleave", () => (hoverX = hoverY = -1));

            // Only animate while the icon is on screen
            new IntersectionObserver(
                ([entry]) => (visible = entry.isIntersecting),
            ).observe(box);
            new ResizeObserver(build).observe(box);
            build();
            requestAnimationFrame(frame);
        }
    }

    // ============================================================
    // Button hover (GSAP): text "encryption" + arrow nudge
    // Targets .button > .btn-text and .button > .btn-icon.
    // Opt out of the scramble with data-scramble="off" on the button.
    // Needs GSAP only (no ScrambleText plugin).
    // ============================================================
    function initButtonScramble() {
        if (!window.gsap) return;
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        const GLYPHS = "!<>-_\\/[]{}=+*^?#%@$&01ABCDEFXZ";
        const DURATION = 0.4; // seconds for the full decrypt
        const randomGlyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

        const ARROW_SHIFT = 4; // px the arrow nudges right on hover

        document.querySelectorAll(".button").forEach((btn) => {
            // Arrow nudge (runs even when the scramble is turned off)
            const arrow = btn.querySelector(".btn-icon");
            if (arrow) {
                const nudge = (x) =>
                    gsap.to(arrow, {
                        x,
                        duration: 0.3,
                        ease: "power2.out",
                        overwrite: true,
                    });
                btn.addEventListener("mouseenter", () => nudge(ARROW_SHIFT));
                btn.addEventListener("mouseleave", () => nudge(0));
                btn.addEventListener(
                    "focus",
                    () => btn.matches(":focus-visible") && nudge(ARROW_SHIFT),
                );
                btn.addEventListener("blur", () => nudge(0));
            }

            if (btn.dataset.scramble === "off") return;
            const label = btn.querySelector(".btn-text");
            if (!label) return;

            const original = label.textContent;
            const chars = [...original];
            // Screen readers keep the real label while the text is scrambled
            if (!btn.hasAttribute("aria-label"))
                btn.setAttribute("aria-label", original.trim());
            label.setAttribute("aria-hidden", "true");

            let tween;
            const glyphs = chars.map(randomGlyph);

            function play() {
                if (tween) tween.kill();
                // Lock the width so the button doesn't jitter while glyphs swap
                gsap.set(label, {
                    width: label.getBoundingClientRect().width,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                });

                const state = { progress: 0 };
                tween = gsap.to(state, {
                    progress: 1,
                    duration: DURATION,
                    ease: "power1.inOut",
                    onUpdate() {
                        const revealed = Math.floor(
                            state.progress * chars.length,
                        );
                        let out = "";
                        for (let i = 0; i < chars.length; i++) {
                            if (i < revealed || chars[i] === " ") {
                                out += chars[i];
                            } else {
                                // Swap glyphs on roughly every other frame so it reads, not strobes
                                if (Math.random() < 0.5)
                                    glyphs[i] = randomGlyph();
                                out += glyphs[i];
                            }
                        }
                        label.textContent = out;
                    },
                    onComplete: reset,
                    onInterrupt: reset,
                });
            }

            function reset() {
                label.textContent = original;
                gsap.set(label, { clearProps: "width,whiteSpace,overflow" });
            }

            btn.addEventListener("mouseenter", play);
            btn.addEventListener("focus", () => {
                if (btn.matches(":focus-visible")) play();
            });
        });
    }

    // ============================================================
    // ASCII field (Firecrawl-style decoration)
    // Fills every .s_gap (and any [data-ascii-field]) with a faint,
    // drifting field of monospace characters drawn on a canvas,
    // redrawn as "frames" every 80ms like a flipbook.
    // The section's existing background image stays as the fallback
    // (no JS / reduced motion shows a single still frame instead).
    // Optional attributes on the section:
    //   data-ascii-chars=" .:-=+*x#"   (lightest to densest)
    //   data-ascii-opacity="0.22"      (character opacity, uses the text colour)
    //   data-ascii-speed="1"           (drift speed multiplier)
    //   data-ascii-avoid="h1, .button" (keep the characters away from these
    //                                   elements' text; the header container has a default)
    //   data-ascii-clear="32"          (px of empty space around avoided text)
    //   data-ascii-fade="120"          (px over which characters fade back in)
    //   data-ascii-fade-top="0.6"      (fade out towards the top: fraction of the
    //                                   height where it's fully visible, 0 = off)
    //   data-ascii-fade-sides="0.15"   (fade out towards the left and right edges:
    //                                   fraction of the width from each edge, 0 = off)
    //   data-ascii-field="off"         (no field here: put it on a header, its
    //                                   .container or any wrapper around them)
    // ============================================================
    function initAsciiField() {
        const FONT_SIZE = 8; // px, same as Firecrawl
        const LINE_H = 10; // px between rows
        const FONT = `${FONT_SIZE}px "Roboto Mono", ui-monospace, Menlo, Consolas, monospace`;
        const FRAME_MS = 80; // flipbook frame rate (~12fps)
        const reduceMotion = matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        // Smooth value noise in 3D (x, y, time), no dependencies
        const perm = new Uint8Array(512);
        for (let i = 0; i < 256; i++) perm[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [perm[i], perm[j]] = [perm[j], perm[i]];
        }
        for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
        const hash = (x, y, z) =>
            perm[(perm[(perm[x & 255] + y) & 255] + z) & 255] / 255;
        const fade = (t) => t * t * (3 - 2 * t);
        const lerp = (a, b, t) => a + (b - a) * t;
        function noise(x, y, z) {
            const xi = Math.floor(x),
                yi = Math.floor(y),
                zi = Math.floor(z);
            const u = fade(x - xi),
                v = fade(y - yi),
                w = fade(z - zi);
            const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
            return lerp(
                lerp(
                    lerp(c(0, 0, 0), c(1, 0, 0), u),
                    lerp(c(0, 1, 0), c(1, 1, 0), u),
                    v,
                ),
                lerp(
                    lerp(c(0, 0, 1), c(1, 0, 1), u),
                    lerp(c(0, 1, 1), c(1, 1, 1), u),
                    v,
                ),
                w,
            );
        }

        // Per-section defaults (each can be overridden with the data attributes)
        const DEFAULTS = {
            // Header: only inside its .container, not edge to edge,
            // kept off the copy and fading out towards the top
            "header.header-main > .container": {
                avoid: "h1, .text-lg, .button-wrap",
                fadeTop: 0.6,
                fadeSides: 0.15,
            },
            // CTA: same treatment inside its .container
            ".s_cta > .container": {
                avoid: "h2, .btn-wrap",
                fadeTop: 0.6,
                fadeSides: 0.15,
            },
        };
        const targets = new Set(
            document.querySelectorAll(
                ".s_gap, header.header-main > .container, .s_cta > .container, [data-ascii-field]",
            ),
        );
        // Opt out: data-ascii-field="off" on the section, its .container
        // or any ancestor (e.g. a page wrapper) skips everything inside it
        targets.forEach((box) => {
            if (!box.closest('[data-ascii-field="off"]')) start(box);
        });

        function start(box) {
            const chars = box.dataset.asciiChars || " .:-=+*x#";
            const opacity = parseFloat(box.dataset.asciiOpacity || "0.22");
            const speed = parseFloat(box.dataset.asciiSpeed || "1");
            const defaultKey = Object.keys(DEFAULTS).find((sel) =>
                box.matches(sel),
            );
            const def = defaultKey ? DEFAULTS[defaultKey] : {};
            const avoidSel = box.dataset.asciiAvoid ?? def.avoid ?? "";
            const fadeTop = parseFloat(
                box.dataset.asciiFadeTop ?? def.fadeTop ?? 0,
            );
            const fadeSides = parseFloat(
                box.dataset.asciiFadeSides ?? def.fadeSides ?? 0,
            );
            const clear = parseFloat(box.dataset.asciiClear || "32");
            const fadeDist = parseFloat(box.dataset.asciiFade || "120");

            if (getComputedStyle(box).position === "static")
                box.style.position = "relative";
            box.style.overflow = "hidden";

            const canvas = document.createElement("canvas");
            canvas.className = "ascii-field";
            canvas.setAttribute("aria-hidden", "true");
            canvas.style.cssText =
                "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0";
            box.prepend(canvas);
            // Keep the section's own content above the canvas
            for (const child of box.children) {
                if (child === canvas) continue;
                const cs = getComputedStyle(child);
                if (cs.position === "static") child.style.position = "relative";
                if (cs.zIndex === "auto") child.style.zIndex = "1";
            }
            box.style.backgroundImage = "none"; // the canvas replaces the static gap.png
            const ctx = canvas.getContext("2d");

            let cols = 0,
                rows = 0,
                cellW = 6,
                color = "#000",
                frame = 0;
            let timer = null,
                visible = false;
            let mask = null; // per-cell 0..1, 0 = keep empty (around avoided text)

            // Rectangles of the actual text lines (not the full-width blocks),
            // relative to the box, so the field hugs the copy
            function avoidRects() {
                if (!avoidSel) return [];
                const b = box.getBoundingClientRect();
                const rects = [];
                box.querySelectorAll(avoidSel).forEach((el) => {
                    const range = document.createRange();
                    range.selectNodeContents(el);
                    const list = [...range.getClientRects()];
                    if (!list.length) list.push(el.getBoundingClientRect());
                    list.forEach((r) => {
                        if (r.width && r.height)
                            rects.push([
                                r.left - b.left,
                                r.top - b.top,
                                r.right - b.left,
                                r.bottom - b.top,
                            ]);
                    });
                });
                return rects;
            }

            function buildMask() {
                const rects = avoidRects();
                if (!rects.length && !fadeTop && !fadeSides)
                    return (mask = null);
                const w = box.clientWidth;
                const fadeTopPx = fadeTop * rows * LINE_H;
                const fadeSidesPx = fadeSides * w;
                mask = new Float32Array(cols * rows);
                for (let y = 0; y < rows; y++) {
                    const py = y * LINE_H + LINE_H / 2;
                    // 0 at the top edge, easing up to 1 at fadeTop of the height
                    const top = fadeTopPx
                        ? fade(Math.min(1, py / fadeTopPx))
                        : 1;
                    for (let x = 0; x < cols; x++) {
                        const px = x * cellW + cellW / 2;
                        // 0 at the left/right edges, easing up to 1 at fadeSides of the width
                        const side = fadeSidesPx
                            ? fade(
                                  Math.max(
                                      0,
                                      Math.min(
                                          1,
                                          Math.min(px, w - px) / fadeSidesPx,
                                      ),
                                  ),
                              )
                            : 1;
                        let d = Infinity;
                        for (const [l, t, r, btm] of rects) {
                            const dx = Math.max(l - px, 0, px - r);
                            const dy = Math.max(t - py, 0, py - btm);
                            d = Math.min(d, Math.hypot(dx, dy));
                        }
                        mask[y * cols + x] =
                            top *
                            side *
                            Math.max(0, Math.min(1, (d - clear) / fadeDist));
                    }
                }
            }

            function build() {
                const dpr = window.devicePixelRatio || 1;
                const w = box.clientWidth,
                    h = box.clientHeight;
                if (!w || !h) return;
                canvas.width = Math.round(w * dpr);
                canvas.height = Math.round(h * dpr);
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.font = FONT;
                cellW = ctx.measureText("X").width;
                cols = Math.ceil(w / cellW);
                rows = Math.ceil(h / LINE_H);
                color = getComputedStyle(box).color;
                buildMask();
                draw();
            }

            function draw() {
                if (!cols) return;
                const t = frame * 0.04 * speed;
                const w = canvas.width,
                    h = canvas.height;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, w, h);
                const dpr = window.devicePixelRatio || 1;
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.font = FONT;
                ctx.textBaseline = "top";
                ctx.fillStyle = color;
                ctx.globalAlpha = opacity;
                const last = chars.length - 1;

                for (let y = 0; y < rows; y++) {
                    let line = "";
                    for (let x = 0; x < cols; x++) {
                        // Two octaves drifting sideways at different speeds,
                        // cells are ~2x taller than wide so squash x
                        const nx = x * 0.05,
                            ny = y * 0.18;
                        let n =
                            noise(nx - t * 1.6, ny, t * 0.5) * 0.65 +
                            noise(nx * 2.3 + t * 0.9, ny * 2.3, t * 0.8 + 10) *
                                0.35;
                        // Push into clusters with empty space between them
                        n = (n - 0.42) / 0.58;
                        // Fade out towards avoided text, nothing on top of it
                        if (mask) n *= mask[y * cols + x];
                        if (n <= 0) {
                            line += " ";
                            continue;
                        }
                        // A little per-cell shimmer so characters flicker like frames
                        if (Math.random() < 0.04)
                            n += (Math.random() - 0.5) * 0.4;
                        line +=
                            chars[
                                Math.max(
                                    0,
                                    Math.min(last, Math.round(n * last)),
                                )
                            ];
                    }
                    ctx.fillText(line, 0, y * LINE_H);
                }
                ctx.globalAlpha = 1;
            }

            function tick() {
                frame++;
                draw();
            }

            function update() {
                const run = visible && !document.hidden && !reduceMotion;
                if (run && !timer) timer = setInterval(tick, FRAME_MS);
                else if (!run && timer) {
                    clearInterval(timer);
                    timer = null;
                }
            }

            new IntersectionObserver(
                ([entry]) => {
                    visible = entry.isIntersecting;
                    update();
                },
                { rootMargin: "100px" },
            ).observe(box);
            document.addEventListener("visibilitychange", update);
            new ResizeObserver(build).observe(box);
            // Redraw once the web font is in, so cell widths are right
            if (document.fonts && document.fonts.ready)
                document.fonts.ready.then(build);
            build();
        }
    }

    // ============================================================
    // Alert bar
    // Clicking .alert-close hides the .s-alert bar, and it stays
    // hidden on every page for the rest of the browser session.
    // ============================================================
    function initAlertBar() {
        const STORAGE_KEY = "cm-alert-dismissed";
        const bar = document.querySelector(".s-alert");
        if (!bar) return;

        let dismissed = false;
        try {
            dismissed = sessionStorage.getItem(STORAGE_KEY) === "1";
        } catch (e) {}
        if (dismissed) {
            bar.style.display = "none";
            return;
        }

        const closeBtn = bar.querySelector(".alert-close");
        if (!closeBtn) return;
        closeBtn.style.cursor = "pointer";
        closeBtn.setAttribute("role", "button");
        closeBtn.setAttribute("tabindex", "0");
        closeBtn.setAttribute("aria-label", "Dismiss notification");

        function dismiss() {
            bar.style.display = "none";
            try {
                sessionStorage.setItem(STORAGE_KEY, "1");
            } catch (e) {}
        }

        closeBtn.addEventListener("click", dismiss);
        closeBtn.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                dismiss();
            }
        });
    }

    // ============================================================
    // Quotes slider (Swiper) with line-by-line "decrypt" text
    // Markup (Webflow): .quotes_grid contains
    //   .swiper.swiper-quotes > .swiper-wrapper > .swiper-slide
    //   .slider-arrow.arrow-left / .slider-arrow.arrow-right
    // Swiper is loaded from the CDN if the page doesn't already have it.
    // When a slide appears, each text line fades in and its characters
    // scramble in place, then resolve left to right.
    // Needs GSAP + SplitText (both already on the page).
    // ============================================================
    const SWIPER_VERSION = "11.1.15";

    function loadSwiper() {
        if (window.Swiper) return Promise.resolve(window.Swiper);
        const base = `https://cdn.jsdelivr.net/npm/swiper@${SWIPER_VERSION}`;
        if (!document.querySelector(`link[href^="${base}"]`)) {
            const css = document.createElement("link");
            css.rel = "stylesheet";
            css.href = `${base}/swiper-bundle.min.css`;
            document.head.appendChild(css);
        }
        return new Promise((resolve, reject) => {
            const js = document.createElement("script");
            js.src = `${base}/swiper-bundle.min.js`;
            js.onload = () => resolve(window.Swiper);
            js.onerror = reject;
            document.head.appendChild(js);
        });
    }

    function initQuotesSlider() {
        const grid = document.querySelector(".quotes_grid");
        const el = grid && grid.querySelector(".swiper-quotes");
        if (!el) return;

        const reduceMotion = matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        const canAnimate = !reduceMotion && window.gsap && window.SplitText;
        if (canAnimate) gsap.registerPlugin(SplitText);

        const TEXT_SEL =
            ".testim-quote_text, .testim-quote_job, .testim-quote_business";
        const GLYPHS = "!<>-_\\/[]{}=+*^?#%@$&01ABCDEFXZ";
        const randomGlyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

        // Hide the text before Swiper shows anything, so there's no flash
        if (canAnimate)
            gsap.set(el.querySelectorAll(TEXT_SEL), { autoAlpha: 0 });

        const splits = new Map(); // text element -> SplitText instance
        const running = new Map(); // slide -> timeline

        function splitText(textEl) {
            if (splits.has(textEl)) return splits.get(textEl);
            const split = SplitText.create(textEl, {
                type: "lines,words,chars",
                linesClass: "scramble-line",
                aria: "auto", // screen readers read the original text
            });
            // Lock each character's width so swapping glyphs never shifts the line
            split.chars.forEach((c) => {
                c.dataset.char = c.textContent;
                c.style.display = "inline-block";
                c.style.width = c.getBoundingClientRect().width + "px";
                c.style.textAlign = "center";
            });
            splits.set(textEl, split);
            return split;
        }

        function scrambleLine(line, duration) {
            const chars = [...line.querySelectorAll("[data-char]")];
            const state = { p: 0 };
            return gsap.to(state, {
                p: 1,
                duration,
                ease: "power1.inOut",
                onStart() {
                    chars.forEach((c) => (c.textContent = randomGlyph()));
                },
                onUpdate() {
                    const revealed = Math.floor(state.p * chars.length);
                    chars.forEach((c, i) => {
                        if (i < revealed) c.textContent = c.dataset.char;
                        else if (Math.random() < 0.5)
                            c.textContent = randomGlyph();
                    });
                },
                onComplete() {
                    chars.forEach((c) => (c.textContent = c.dataset.char));
                },
            });
        }

        function resetSlide(slide) {
            const tl = running.get(slide);
            if (tl) tl.progress(1).kill();
            running.delete(slide);
        }

        function hideSlide(slide) {
            if (!canAnimate) return;
            resetSlide(slide);
            gsap.set(slide.querySelectorAll(TEXT_SEL), { autoAlpha: 0 });
        }

        function revealSlide(slide) {
            if (!canAnimate || !slide) return;
            resetSlide(slide);
            const tl = gsap.timeline();
            let at = 0;
            slide.querySelectorAll(TEXT_SEL).forEach((textEl) => {
                const split = splitText(textEl);
                gsap.set(textEl, { autoAlpha: 1 });
                split.lines.forEach((line) => {
                    tl.fromTo(
                        line,
                        { autoAlpha: 0 },
                        { autoAlpha: 1, duration: 0.4, ease: "power1.out" },
                        at,
                    );
                    tl.add(scrambleLine(line, 0.7), at);
                    at += 0.1; // stagger between lines
                });
            });
            running.set(slide, tl);
        }

        loadSwiper()
            .then((Swiper) => {
                const prev = grid.querySelector(".arrow-left");
                const next = grid.querySelector(".arrow-right");
                // The arrows are links with href="#": don't jump to the top
                [prev, next].forEach(
                    (a) =>
                        a &&
                        a.addEventListener("click", (e) => e.preventDefault()),
                );

                let started = false;
                const swiper = new Swiper(el, {
                    effect: "fade",
                    fadeEffect: { crossFade: true },
                    speed: 500,
                    rewind: true, // wrap around without cloning slides
                    slidesPerView: 1,
                    grabCursor: true,
                    a11y: { enabled: true },
                    keyboard: { enabled: true, onlyInViewport: true },
                    navigation: { prevEl: prev, nextEl: next },
                    on: {
                        slideChangeTransitionStart(s) {
                            if (!started) return;
                            s.slides.forEach(
                                (slide, i) =>
                                    i !== s.activeIndex && hideSlide(slide),
                            );
                            revealSlide(s.slides[s.activeIndex]);
                        },
                    },
                });

                // Play the first slide's reveal when the slider scrolls into view
                const show = () => {
                    if (started) return;
                    started = true;
                    revealSlide(swiper.slides[swiper.activeIndex]);
                };
                const io = new IntersectionObserver(
                    ([entry]) => {
                        if (!entry.isIntersecting) return;
                        io.disconnect();
                        // Wait for the web font so the line splits are right
                        (document.fonts
                            ? document.fonts.ready
                            : Promise.resolve()
                        ).then(show);
                    },
                    { threshold: 0.3 },
                );
                io.observe(el);

                // Re-split on resize, since line breaks change
                let lastW = el.clientWidth;
                new ResizeObserver(() => {
                    if (el.clientWidth === lastW) return;
                    lastW = el.clientWidth;
                    running.forEach((tl) => tl.progress(1).kill());
                    running.clear();
                    splits.forEach((split) => split.revert());
                    splits.clear();
                    if (started) {
                        swiper.slides.forEach((slide, i) => {
                            if (i !== swiper.activeIndex) hideSlide(slide);
                        });
                    }
                }).observe(el);
            })
            .catch(() => {
                // Swiper failed to load: just show the text
                if (canAnimate)
                    gsap.set(el.querySelectorAll(TEXT_SEL), { autoAlpha: 1 });
            });
    }

    // ============================================================
    // Accessible names for generic FAQ buttons ("learn more",
    // "read the docs"...): screen readers list links out of
    // context, so name each one after its FAQ item title.
    // ============================================================
    function initFaqLinkLabels() {
        document.querySelectorAll(".faq_item .button").forEach((a) => {
            if (a.hasAttribute("aria-label")) return;
            const title = a.closest(".faq_item").querySelector(".faq_title");
            if (!title) return;
            const text = a.textContent.trim();
            const name = title.textContent.trim();
            const external = a.target === "_blank" ? " (opens in a new tab)" : "";
            a.setAttribute("aria-label", text + ": " + name + external);
        });
    }

    // ============================================================
    // Language switcher
    // Usage: a wrapper with [data-lang-switcher] holding links with
    // data-locale="" (primary language) or data-locale="fr" etc. (the
    // locale's subdirectory), plus an element with [data-lang-current].
    // Each link is pointed at the current page in that language, so
    // /plans becomes /fr/plans. The links keep their own href as a
    // fallback if this script doesn't run.
    // ============================================================
    function initLangSwitcher() {
        document.querySelectorAll("[data-lang-switcher]").forEach((box) => {
            const links = [...box.querySelectorAll("[data-locale]")];
            if (!links.length) return;
            const locales = links
                .map((a) => a.dataset.locale)
                .filter(Boolean);

            // Split "/fr/plans" into the locale ("fr") and the rest ("/plans")
            const parts = location.pathname.split("/");
            const current = locales.includes(parts[1]) ? parts[1] : "";
            const rest =
                (current ? "/" + parts.slice(2).join("/") : location.pathname) ||
                "/";

            links.forEach((a) => {
                const loc = a.dataset.locale;
                const href = loc
                    ? "/" + loc + (rest === "/" ? "" : rest)
                    : rest;
                a.setAttribute("href", href);
                const active = loc === current;
                a.classList.toggle("is-active", active);
                if (active) a.setAttribute("aria-current", "true");
                else a.removeAttribute("aria-current");
            });

            const label = box.querySelector("[data-lang-current]");
            if (label) label.textContent = (current || "en").toUpperCase();
        });
    }

    // ============================================================
    // Init
    // ============================================================
    function init() {
        initLangSwitcher();
        initAlertBar();
        initAsciiIcons();
        initAsciiField();
        initFaqLinkLabels(); // before the scramble, which labels buttons with their own text
        initButtonScramble();
        initQuotesSlider();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

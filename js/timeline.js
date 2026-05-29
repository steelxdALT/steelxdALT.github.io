document.addEventListener("DOMContentLoaded", () => {
    const timelineRuler = document.getElementById("timeline-ruler");
    const mediaGrid = document.getElementById("media-grid");
    const trackRows = document.querySelectorAll(".timeline-track-row");
    const workspaceWrapper = document.querySelector(".timeline-workspace-wrapper");
    const scrollContainer = document.querySelector(".timeline-scroll-container");
    
    const canvas = document.getElementById("main-canvas");
    const ctx = canvas ? canvas.getContext("2d") : null;

    let PIXELS_PER_SECOND = 15;
    const MAX_TIMELINE_DURATION = 300;
    const TRACK_OFFSET = 90;

    window.currentTimelineTime = 0;
    let isPlayingTimeline = false;
    let lastTime = performance.now();
    let selectedClip = null;

    const playhead = document.createElement("div");
    playhead.className = "timeline-playhead";
    if (workspaceWrapper) workspaceWrapper.appendChild(playhead);

    const timeDisplay = document.createElement("div");
    timeDisplay.id = "timeline-time-display";
    timeDisplay.style.cssText = "position: absolute; left: -85px; top: 5px; color: #0a84ff; font-family: monospace; font-size: 13px; font-weight: bold; width: 80px; text-align: center;";
    if (timelineRuler) timelineRuler.appendChild(timeDisplay);

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        const ms = Math.floor((secs % 1) * 10).toString();
        return `${m}:${s}.${ms}`;
    };

    const updatePlayhead = (time) => {
        window.currentTimelineTime = time;
        playhead.style.left = `${(time * PIXELS_PER_SECOND) + TRACK_OFFSET}px`;
        timeDisplay.innerText = formatTime(time);
    };
    updatePlayhead(0);

    const updateTimelineLayout = () => {
        Array.from(timelineRuler.children).forEach(c => { if (c.id !== 'timeline-time-display') c.remove(); });

        const idealStep = 100 / PIXELS_PER_SECOND;
        const validSteps = [1, 2, 5, 10, 15, 30, 60, 120, 300];
        let step = validSteps[0];
        for (let s of validSteps) {
            if (Math.abs(s - idealStep) < Math.abs(step - idealStep)) step = s;
        }

        for (let i = 0; i <= MAX_TIMELINE_DURATION; i += step) {
            const tick = document.createElement("div");
            tick.className = "ruler-tick";
            tick.style.left = `${i * PIXELS_PER_SECOND}px`;
            tick.innerText = `${Math.floor(i / 60).toString().padStart(2, '0')}:${(i % 60).toString().padStart(2, '0')}`;
            timelineRuler.appendChild(tick);
        }
        
        document.querySelectorAll('.timeline-clip').forEach(clip => {
            clip.style.left = `${parseFloat(clip.dataset.startSeconds) * PIXELS_PER_SECOND}px`;
            clip.style.width = `${parseFloat(clip.dataset.durationSeconds) * PIXELS_PER_SECOND}px`;
        });
        
        updatePlayhead(window.currentTimelineTime);
    };

    scrollContainer.addEventListener("wheel", (e) => {
        if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) {
            e.preventDefault();
            
            const rect = workspaceWrapper.getBoundingClientRect();
            let mouseX = e.clientX - rect.left - TRACK_OFFSET;
            if (mouseX < 0) mouseX = 0;

            const timeAtCursor = mouseX / PIXELS_PER_SECOND;
            const zoomFactor = 1.15;
            
            if (e.deltaY < 0) PIXELS_PER_SECOND *= zoomFactor;
            else PIXELS_PER_SECOND /= zoomFactor;
            
            PIXELS_PER_SECOND = Math.max(2, Math.min(PIXELS_PER_SECOND, 300));
            updateTimelineLayout();

            const newMouseX = (timeAtCursor * PIXELS_PER_SECOND) + TRACK_OFFSET;
            scrollContainer.scrollLeft = newMouseX - (e.clientX - scrollContainer.getBoundingClientRect().left);
        }
    }, { passive: false });

    let initialPinchDistance = null;
    let initialPPS = null;
    scrollContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            initialPinchDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            initialPPS = PIXELS_PER_SECOND;
        }
    }, {passive: false});
    scrollContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && initialPinchDistance) {
            e.preventDefault();
            const currentDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            const scale = currentDistance / initialPinchDistance;
            PIXELS_PER_SECOND = Math.max(2, Math.min(initialPPS * scale, 300));
            updateTimelineLayout();
        }
    }, {passive: false});


    const deselectClip = () => {
        if (selectedClip) selectedClip.classList.remove('selected');
        selectedClip = null;
    };

    const selectClip = (clip) => {
        deselectClip();
        selectedClip = clip;
        clip.classList.add('selected');
    };

    document.addEventListener("mousedown", (e) => {
        if (e.target.closest('.timeline-clip')) return;
        if (e.target.closest('.timeline-tools') || e.target.closest('.playback-controls')) return;
        deselectClip();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') deselectClip();
        if ((e.key === 'Backspace' || e.key === 'Delete') && selectedClip) {
            if (selectedClip.mediaObj && selectedClip.mediaObj.pause) selectedClip.mediaObj.pause();
            selectedClip.remove();
            selectedClip = null;
        }
    });


    const forcePreviewMode = () => {
        if (window.setPreviewMode) window.setPreviewMode(false);
    };

    let isScrubbing = false;
    workspaceWrapper.addEventListener("mousedown", (e) => {
        if (e.target.closest('.timeline-clip') || e.target.closest('.clip-handle') || e.target.closest('.track-label')) return;
        forcePreviewMode();
        isScrubbing = true;
        updatePlayhead(Math.max(0, (e.clientX - workspaceWrapper.getBoundingClientRect().left - TRACK_OFFSET) / PIXELS_PER_SECOND));
    });

    window.addEventListener("mousemove", (e) => {
        if (isScrubbing) updatePlayhead(Math.max(0, (e.clientX - workspaceWrapper.getBoundingClientRect().left - TRACK_OFFSET) / PIXELS_PER_SECOND));
    });
    window.addEventListener("mouseup", () => isScrubbing = false);

    document.addEventListener('timeline-toggle-play', () => {
        forcePreviewMode();
        isPlayingTimeline = !isPlayingTimeline;
        lastTime = performance.now();
        document.dispatchEvent(new CustomEvent('timeline-playing-status', { detail: { isPlaying: isPlayingTimeline }}));
        if (isPlayingTimeline) requestAnimationFrame(timelineLoop);
    });

    document.addEventListener('timeline-seek', (e) => { forcePreviewMode(); updatePlayhead(e.detail); });
    document.addEventListener('timeline-seek-relative', (e) => { forcePreviewMode(); updatePlayhead(Math.max(0, window.currentTimelineTime + e.detail)); });

    const checkCollision = (lane, testLeft, testWidth, ignoreClip) => {
        const testRight = testLeft + testWidth;
        const siblings = Array.from(lane.querySelectorAll('.timeline-clip')).filter(c => c !== ignoreClip);
        for (let sib of siblings) {
            const sLeft = parseFloat(sib.dataset.startSeconds) * PIXELS_PER_SECOND;
            const sWidth = parseFloat(sib.dataset.durationSeconds) * PIXELS_PER_SECOND;
            if (testLeft < sLeft + sWidth && testRight > sLeft) return true; 
        }
        return false;
    };

    let dragState = null;
    document.addEventListener("mousedown", (e) => {
        const handle = e.target.closest('.clip-handle');
        const clip = e.target.closest('.timeline-clip');
        if (!clip) return;
        
        selectClip(clip);
        let action = 'move';
        if (handle) action = handle.classList.contains('left-handle') ? 'resize-left' : 'resize-right';
        
        dragState = {
            action, clip, lane: clip.parentElement, row: clip.closest('.timeline-track-row'),
            type: Array.from(clip.classList).find(c => c.startsWith('clip-type-')).replace('clip-type-', ''),
            startX: e.clientX, 
            startSecs: parseFloat(clip.dataset.startSeconds),
            startDurSecs: parseFloat(clip.dataset.durationSeconds)
        };
        clip.classList.add('moving');
        e.preventDefault(); 
    });

    document.addEventListener("mousemove", (e) => {
        if (!dragState) return;
        const deltaSecs = (e.clientX - dragState.startX) / PIXELS_PER_SECOND;
        
        if (dragState.action === 'move') {
            let hoverRow = dragState.row;
            trackRows.forEach(row => {
                const rect = row.getBoundingClientRect();
                if (e.clientY >= rect.top && e.clientY <= rect.bottom) hoverRow = row;
            });
            
            const currentLane = hoverRow.querySelector('.track-lane');
            const allowedType = hoverRow.getAttribute("data-track-type");
            let isMatch = (allowedType === "video" && (dragState.type === "video" || dragState.type === "image")) || (allowedType === dragState.type);
            
            let proposedLeftSecs = Math.max(0, dragState.startSecs + deltaSecs);

            if (isMatch && currentLane !== dragState.lane) {
                if (!checkCollision(currentLane, proposedLeftSecs * PIXELS_PER_SECOND, dragState.startDurSecs * PIXELS_PER_SECOND, dragState.clip)) {
                    currentLane.appendChild(dragState.clip);
                    dragState.lane = currentLane;
                    dragState.row = hoverRow;
                }
            }
            if (!checkCollision(dragState.lane, proposedLeftSecs * PIXELS_PER_SECOND, dragState.startDurSecs * PIXELS_PER_SECOND, dragState.clip)) {
                dragState.clip.dataset.startSeconds = proposedLeftSecs;
                dragState.clip.style.left = `${proposedLeftSecs * PIXELS_PER_SECOND}px`;
            }

        } else if (dragState.action === 'resize-right') {
            let proposedDur = Math.max(0.5, dragState.startDurSecs + deltaSecs); 
            if (!checkCollision(dragState.lane, dragState.startSecs * PIXELS_PER_SECOND, proposedDur * PIXELS_PER_SECOND, dragState.clip)) {
                dragState.clip.dataset.durationSeconds = proposedDur;
                dragState.clip.style.width = `${proposedDur * PIXELS_PER_SECOND}px`;
            }
        } else if (dragState.action === 'resize-left') {
            let proposedStart = dragState.startSecs + deltaSecs;
            let proposedDur = dragState.startDurSecs - deltaSecs;
            if (proposedStart < 0) { proposedDur += proposedStart; proposedStart = 0; }
            if (proposedDur >= 0.5 && !checkCollision(dragState.lane, proposedStart * PIXELS_PER_SECOND, proposedDur * PIXELS_PER_SECOND, dragState.clip)) {
                dragState.clip.dataset.startSeconds = proposedStart;
                dragState.clip.dataset.durationSeconds = proposedDur;
                dragState.clip.style.left = `${proposedStart * PIXELS_PER_SECOND}px`;
                dragState.clip.style.width = `${proposedDur * PIXELS_PER_SECOND}px`;
            }
        }
    });

    document.addEventListener("mouseup", () => {
        if (dragState) {
            dragState.clip.classList.remove('moving');
            dragState = null;
        }
    });

    if (mediaGrid) {
        mediaGrid.addEventListener("dragstart", (e) => {
            const item = e.target.closest(".media-item");
            if (!item) return;
            const type = item.dataset.filetype.startsWith("image") ? "image" : item.dataset.filetype.startsWith("audio") ? "audio" : "video";
            e.dataTransfer.setData("application/json", JSON.stringify({
                name: item.dataset.filename, type: type, duration: parseFloat(item.dataset.duration) || 5, url: item.dataset.fileUrl
            }));
        });
    }

    trackRows.forEach(row => {
        const lane = row.querySelector(".track-lane");
        const allowedType = row.getAttribute("data-track-type");

        row.addEventListener("dragover", (e) => { e.preventDefault(); row.classList.add("drag-hover-track"); });
        row.addEventListener("dragleave", () => row.classList.remove("drag-hover-track"));

        row.addEventListener("drop", (e) => {
            e.preventDefault();
            row.classList.remove("drag-hover-track");
            try {
                const asset = JSON.parse(e.dataTransfer.getData("application/json"));
                if ((allowedType !== "video" || (asset.type !== "video" && asset.type !== "image")) && allowedType !== asset.type) return;

                const dropSecs = Math.max(0, (e.clientX - lane.getBoundingClientRect().left) / PIXELS_PER_SECOND);
                
                const clipBlock = document.createElement("div");
                clipBlock.className = `timeline-clip clip-type-${asset.type}`;
                clipBlock.dataset.startSeconds = dropSecs;
                clipBlock.dataset.durationSeconds = asset.duration;
                clipBlock.dataset.trackId = row.dataset.trackId;
                clipBlock.style.left = `${dropSecs * PIXELS_PER_SECOND}px`;
                clipBlock.style.width = `${asset.duration * PIXELS_PER_SECOND}px`;

                clipBlock.innerHTML = `
                    <div class="clip-handle left-handle"></div>
                    <span class="clip-title">${asset.name}</span>
                    <div class="clip-handle right-handle"></div>
                `;
                
                if (asset.type === 'video') {
                    const v = document.createElement('video');
                    v.src = asset.url; 
                    v.muted = false;
                    v.preload = "auto";
                    v.load();
                    clipBlock.mediaObj = v;
                } else if (asset.type === 'audio') {
                    const a = document.createElement('audio');
                    a.src = asset.url;
                    a.preload = "auto";
                    a.load();
                    clipBlock.mediaObj = a;
                } else if (asset.type === 'image') {
                    const img = new Image();
                    img.src = asset.url;
                    clipBlock.mediaObj = img;
                }

                lane.appendChild(clipBlock);
                selectClip(clipBlock);
            } catch (err) {}
        });
    });

    updateTimelineLayout();

    const TrackLayerPriority = { "video-1": 1, "video-2": 2, "video-3": 3 };

    const timelineLoop = (now) => {
        if (!isPlayingTimeline) return;
        
        const delta = ((now - lastTime) / 1000) * (window.playbackSpeed || 1);
        lastTime = now;
        updatePlayhead(window.currentTimelineTime + delta);

        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let activeClips = [];
            document.querySelectorAll('.timeline-clip').forEach(clip => {
                const start = parseFloat(clip.dataset.startSeconds);
                const dur = parseFloat(clip.dataset.durationSeconds);
                const isPlayingNow = window.currentTimelineTime >= start && window.currentTimelineTime <= start + dur;
                
                if (isPlayingNow) {
                    activeClips.push(clip);
                } else {
                    if (clip.mediaObj && clip.mediaObj.pause && !clip.mediaObj.paused) {
                        clip.mediaObj.pause();
                    }
                }
            });

            const visualClips = activeClips.filter(c => c.dataset.trackId.startsWith('video'));
            visualClips.sort((a, b) => TrackLayerPriority[a.dataset.trackId] - TrackLayerPriority[b.dataset.trackId]);

            activeClips.forEach(clip => {
                const media = clip.mediaObj;
                if (!media) return;
                
                const localTime = window.currentTimelineTime - parseFloat(clip.dataset.startSeconds);

                if (media.tagName === 'VIDEO' || media.tagName === 'AUDIO') {
                    if (Math.abs(media.currentTime - localTime) > 0.25) media.currentTime = localTime;
                    media.playbackRate = window.playbackSpeed || 1;
                    if (media.paused) media.play().catch(()=>{});
                }
            });

            visualClips.forEach(clip => {
                const media = clip.mediaObj;
                if (media && (media.tagName === 'IMG' || media.tagName === 'VIDEO')) {
                    const mWidth = media.videoWidth || media.naturalWidth;
                    const mHeight = media.videoHeight || media.naturalHeight;
                    if (mWidth && mHeight) {
                        const scale = Math.min(canvas.width / mWidth, canvas.height / mHeight);
                        const dw = mWidth * scale; const dh = mHeight * scale;
                        const dx = (canvas.width - dw) / 2; const dy = (canvas.height - dh) / 2;
                        ctx.drawImage(media, dx, dy, dw, dh);
                    }
                }
            });
        }
        
        requestAnimationFrame(timelineLoop);
    };

    setInterval(() => {
        if (!isPlayingTimeline && ctx && canvas && !window.isPreviewing) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let activeClips = Array.from(document.querySelectorAll('.timeline-clip'))
                .filter(c => window.currentTimelineTime >= parseFloat(c.dataset.startSeconds) && window.currentTimelineTime <= parseFloat(c.dataset.startSeconds) + parseFloat(c.dataset.durationSeconds));
            
            activeClips.forEach(clip => {
                if (clip.mediaObj && (clip.mediaObj.tagName === 'VIDEO' || clip.mediaObj.tagName === 'AUDIO')) {
                    clip.mediaObj.pause();
                    clip.mediaObj.currentTime = window.currentTimelineTime - parseFloat(clip.dataset.startSeconds);
                }
            });

            let visuals = activeClips.filter(c => c.dataset.trackId.startsWith('video')).sort((a, b) => TrackLayerPriority[a.dataset.trackId] - TrackLayerPriority[b.dataset.trackId]);
            visuals.forEach(clip => {
                const media = clip.mediaObj;
                if (media && (media.tagName === 'IMG' || media.tagName === 'VIDEO')) {
                    const mWidth = media.videoWidth || media.naturalWidth;
                    const mHeight = media.videoHeight || media.naturalHeight;
                    if (mWidth && mHeight) {
                        const scale = Math.min(canvas.width / mWidth, canvas.height / mHeight);
                        ctx.drawImage(media, (canvas.width - (mWidth * scale)) / 2, (canvas.height - (mHeight * scale)) / 2, mWidth * scale, mHeight * scale);
                    }
                }
            });
        }
    }, 100);
});
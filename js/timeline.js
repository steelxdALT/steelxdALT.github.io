document.addEventListener("DOMContentLoaded", () => {
    const timelineRuler = document.getElementById("timeline-ruler");
    const mediaGrid = document.getElementById("media-grid");
    let trackRows = document.querySelectorAll(".timeline-track-row");
    const workspaceWrapper = document.querySelector(".timeline-workspace-wrapper");
    const scrollContainer = document.querySelector(".timeline-scroll-container");
    const timelineTracksContainer = document.getElementById('timeline-tracks');

    if (timelineTracksContainer && timelineTracksContainer.children.length === 0) {
        const defaultTracks = [
            { id: 'video-1', type: 'video', label: 'Video 1' },
            { id: 'video-2', type: 'video', label: 'Video 2' },
            { id: 'audio-1', type: 'audio', label: 'Audio 1' }
        ];
        const tmpl = document.getElementById('track-template');
        defaultTracks.forEach(t => {
            let row;
            if (tmpl && tmpl.content.firstElementChild) {
                row = tmpl.content.firstElementChild.cloneNode(true);
                row.dataset.trackId = t.id;
                row.dataset.trackType = t.type;
                const lbl = row.querySelector('.track-label');
                if (lbl) lbl.textContent = t.label;
            } else {
                row = document.createElement('div');
                row.className = 'timeline-track-row';
                row.dataset.trackId = t.id;
                row.dataset.trackType = t.type;
                const lbl = document.createElement('div');
                lbl.className = 'track-label';
                lbl.textContent = t.label;
                const lane = document.createElement('div');
                lane.className = 'track-lane';
                row.appendChild(lbl);
                row.appendChild(lane);
            }
            timelineTracksContainer.appendChild(row);
        });
        trackRows = document.querySelectorAll('.timeline-track-row');
    }
    const timelinePanel = document.querySelector(".timeline-panel");
    const timelineResizeHandle = document.getElementById("timeline-resize-handle");
    const timelineCollapseToggle = document.getElementById("timeline-collapse-toggle");
    const canvas = document.getElementById("main-canvas");
    const ctx = canvas ? canvas.getContext("2d") : null;
    const contextMenu = document.getElementById("context-menu");
    const menuRename = document.getElementById("menu-rename");

    let PIXELS_PER_SECOND = 15;
    const MAX_TIMELINE_DURATION = 300;
    const TRACK_OFFSET = 90;
    const MIN_TIMELINE_HEIGHT = 200;
    let isPlayingTimeline = false;
    let lastTime = performance.now();
    let selectedClip = null;
    let activeTrackRenameTarget = null;

    const setContextMenuItemVisibility = (menu, visibleId) => {
        menu.querySelectorAll('.menu-item').forEach(item => {
            const shouldShow = item.id === visibleId;
            item.classList.toggle('hidden', !shouldShow);
            item.style.display = shouldShow ? '' : 'none';
        });
    };

    const updateCanvasForDPR = (canvas) => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round(rect.width * dpr));
        const height = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    };

    const seekVideoToTime = (video, time) => {
        return new Promise((resolve) => {
            const dur = isNaN(video.duration) ? time + 1 : video.duration;
            const target = Math.min(time, Math.max(0, dur - 0.05));
            
            if (Math.abs(video.currentTime - target) < 0.02) {
                return resolve();
            }
            
            let timeoutId;
            const onSeeked = () => {
                clearTimeout(timeoutId);
                video.removeEventListener('seeked', onSeeked);
                resolve();
            };
            
            timeoutId = setTimeout(onSeeked, 500); 
            video.addEventListener('seeked', onSeeked);
            video.currentTime = target;
        });
    };

    const renderClipPreview = async (clip) => {
        const previewCanvas = clip.querySelector('.clip-preview');
        if (!previewCanvas) return;

        if (previewCanvas.clientWidth === 0) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }

        const previewMedia = clip.previewMedia;
        const ctx = updateCanvasForDPR(previewCanvas);
        if (!ctx) return;

        const width = previewCanvas.clientWidth;
        const height = previewCanvas.clientHeight;
        
        if (width === 0 || height === 0) return;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#131313';
        ctx.fillRect(0, 0, width, height);

        if (!previewMedia) return;

        const assetType = clip.dataset.assetType;
        const isGif = clip.dataset.isGif === 'true';
        const duration = Math.max(0.5, parseFloat(clip.dataset.durationSeconds) || 1);
        const frameCount = Math.min(12, Math.max(1, Math.ceil(width / 72)));
        const frameWidth = width / frameCount;
        const frameHeight = height;

        const drawFrame = (media, frameIndex) => {
            const mWidth = media.videoWidth || media.naturalWidth || media.width;
            const mHeight = media.videoHeight || media.naturalHeight || media.height;
            if (!mWidth || !mHeight) return;

            const scale = Math.min(frameWidth / mWidth, frameHeight / mHeight);
            const dw = mWidth * scale;
            const dh = mHeight * scale;
            const dx = frameIndex * frameWidth + (frameWidth - dw) / 2;
            const dy = (frameHeight - dh) / 2;
            ctx.drawImage(media, dx, dy, dw, dh);
        };

        if (assetType === 'video' && !isGif) {
            if (previewMedia.readyState < 2) {
                previewMedia.addEventListener('loadeddata', () => renderClipPreview(clip), { once: true });
                return;
            }
            for (let i = 0; i < frameCount; i += 1) {
                const sampleTime = Math.min(duration, (i / frameCount) * duration);
                try {
                    await seekVideoToTime(previewMedia, sampleTime);
                } catch (err) {
                    continue;
                }
                drawFrame(previewMedia, i);
            }
            return;
        }

        if (assetType === 'image' || isGif) {
            if (!previewMedia.complete) {
                previewMedia.addEventListener('load', () => renderClipPreview(clip), { once: true });
                return;
            }
            for (let i = 0; i < frameCount; i += 1) {
                drawFrame(previewMedia, i);
            }
            return;
        }
    };

    const refreshClipPreviews = () => {
        document.querySelectorAll('.timeline-clip').forEach((clip) => {
            renderClipPreview(clip).catch(() => {});
        });
    };
    let isTimelineCollapsed = false;
    let isTimelineResizing = false;
    let timelinePreviousHeight = null;
    let isScrubbing = false;
    let dragState = null;
    let initialPinchDistance = null;
    let initialPPS = null;

    window.currentTimelineTime = 0;
    window.__activeTrackRenameTarget = null;

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

    const setTimelineHeight = (height) => {
        if (!timelinePanel) return;
        const maxHeight = Math.max(MIN_TIMELINE_HEIGHT, window.innerHeight * 0.5);
        const nextHeight = Math.max(MIN_TIMELINE_HEIGHT, Math.min(height, maxHeight));
        timelinePanel.style.height = `${nextHeight}px`;
        timelinePanel.dataset.height = `${nextHeight}`;
    };

    const applyTimelineCollapseState = () => {
        if (!timelinePanel) return;
        if (isTimelineCollapsed) {
            timelinePanel.classList.add("collapsed");
            timelinePanel.style.height = "44px";
            timelineCollapseToggle.textContent = "▸";
            timelineCollapseToggle.setAttribute("aria-expanded", "false");
            return;
        }

        timelinePanel.classList.remove("collapsed");
        timelineCollapseToggle.textContent = "▾";
        timelineCollapseToggle.setAttribute("aria-expanded", "true");
        const preferredHeight = parseFloat(timelinePanel.dataset.height || "") || Math.min(380, Math.max(MIN_TIMELINE_HEIGHT, window.innerHeight * 0.35));
        setTimelineHeight(preferredHeight);
    };

    const startTrackRename = (labelEl) => {
        if (!labelEl) return;

        if (activeTrackRenameTarget && activeTrackRenameTarget !== labelEl) {
            const currentValue = activeTrackRenameTarget.textContent.trim();
            activeTrackRenameTarget.textContent = currentValue || activeTrackRenameTarget.dataset.originalText || "Track";
            activeTrackRenameTarget.contentEditable = "false";
            activeTrackRenameTarget.classList.remove("editing");
        }

        activeTrackRenameTarget = labelEl;
        window.__activeTrackRenameTarget = labelEl;
        labelEl.dataset.originalText = labelEl.textContent.trim();
        labelEl.contentEditable = "true";
        labelEl.classList.add("editing");
        labelEl.focus();

        const range = document.createRange();
        range.selectNodeContents(labelEl);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    };

    const finishTrackRename = (restoreOriginal = false) => {
        if (!activeTrackRenameTarget) return;

        const labelEl = activeTrackRenameTarget;
        const originalText = labelEl.dataset.originalText || "Track";
        const nextValue = restoreOriginal ? originalText : labelEl.textContent.replace(/\s+/g, " ").trim() || originalText;

        labelEl.textContent = nextValue;
        labelEl.contentEditable = "false";
        labelEl.classList.remove("editing");
        activeTrackRenameTarget = null;
        window.__activeTrackRenameTarget = null;
        window.getSelection()?.removeAllRanges();
    };

    window.startTrackRename = startTrackRename;

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

        const gridSize = step * PIXELS_PER_SECOND;
        document.querySelectorAll('.track-lane').forEach(lane => {
            lane.style.setProperty('--timeline-grid-size', `${gridSize}px`);
        });

        workspaceWrapper.style.width = `${Math.max(4500, TRACK_OFFSET + (MAX_TIMELINE_DURATION * PIXELS_PER_SECOND) + 200)}px`;

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
            refreshClipPreviews();

            const newMouseX = (timeAtCursor * PIXELS_PER_SECOND) + TRACK_OFFSET;
            scrollContainer.scrollLeft = newMouseX - (e.clientX - scrollContainer.getBoundingClientRect().left);
        }
    }, { passive: false });

    scrollContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            initialPinchDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            initialPPS = PIXELS_PER_SECOND;
        }
    }, { passive: false });
    scrollContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && initialPinchDistance) {
            e.preventDefault();
            const currentDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            const scale = currentDistance / initialPinchDistance;
            PIXELS_PER_SECOND = Math.max(2, Math.min(initialPPS * scale, 300));
            updateTimelineLayout();
            refreshClipPreviews();
        }
    }, { passive: false });

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
        if (e.key === 'Escape') {
            if (activeTrackRenameTarget) {
                finishTrackRename(true);
            } else {
                deselectClip();
            }
        }
        if ((e.key === 'Backspace' || e.key === 'Delete') && selectedClip) {
            if (selectedClip.mediaObj && selectedClip.mediaObj.pause) selectedClip.mediaObj.pause();
            selectedClip.remove();
            selectedClip = null;
        }
    });

    const forcePreviewMode = () => {
        if (window.setPreviewMode) window.setPreviewMode(false);
    };

    workspaceWrapper.addEventListener("mousedown", (e) => {
        if (e.target.closest('.timeline-clip') || e.target.closest('.clip-handle') || e.target.closest('.track-label')) return;
        forcePreviewMode();
        isScrubbing = true;
        updatePlayhead(Math.max(0, (e.clientX - workspaceWrapper.getBoundingClientRect().left - TRACK_OFFSET) / PIXELS_PER_SECOND));
    });

    window.addEventListener("mousemove", (e) => {
        if (isScrubbing) updatePlayhead(Math.max(0, (e.clientX - workspaceWrapper.getBoundingClientRect().left - TRACK_OFFSET) / PIXELS_PER_SECOND));
        if (isTimelineResizing && timelinePanel) {
            const nextHeight = window.innerHeight - e.clientY;
            setTimelineHeight(nextHeight);
        }
    });
    window.addEventListener("mouseup", () => {
        isScrubbing = false;
        if (isTimelineResizing) {
            isTimelineResizing = false;
            document.body.style.cursor = 'default';
        }
    });

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
                name: item.dataset.filename,
                type,
                duration: parseFloat(item.dataset.duration) || 5,
                url: item.dataset.fileUrl,
                isGif: item.dataset.isGif === "true"
            }));
        });
    }

    trackRows.forEach(row => {
        const lane = row.querySelector(".track-lane");
        const allowedType = row.getAttribute("data-track-type");
        const trackLabel = row.querySelector('.track-label');

        const refreshPreviewForClipsInRow = () => {
            row.querySelectorAll('.timeline-clip').forEach((clip) => {
                renderClipPreview(clip).catch(() => {});
            });
        };

        row.addEventListener("dragover", (e) => { e.preventDefault(); row.classList.add("drag-hover-track"); });
        row.addEventListener("dragleave", () => row.classList.remove("drag-hover-track"));

        trackLabel?.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            startTrackRename(trackLabel);
        });

        trackLabel?.addEventListener('blur', () => {
            if (activeTrackRenameTarget === trackLabel) {
                finishTrackRename(false);
            }
        });

        trackLabel?.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (contextMenu) {
                contextMenu.dataset.mode = 'track';
                setContextMenuItemVisibility(contextMenu, 'menu-rename');
                contextMenu.style.top = `${e.clientY}px`;
                contextMenu.style.left = `${e.clientX}px`;
                contextMenu.classList.remove('hidden');
                window.__activeTrackRenameTarget = trackLabel;
            }
        });

        let longPressTimeout = null;
        trackLabel?.addEventListener('touchstart', (e) => {
            if (longPressTimeout) clearTimeout(longPressTimeout);
            longPressTimeout = setTimeout(() => {
                if (contextMenu) {
                    contextMenu.dataset.mode = 'track';
                    setContextMenuItemVisibility(contextMenu, 'menu-rename');
                    contextMenu.style.top = `${e.touches[0].clientY}px`;
                    contextMenu.style.left = `${e.touches[0].clientX}px`;
                    contextMenu.classList.remove('hidden');
                    window.__activeTrackRenameTarget = trackLabel;
                }
            }, 500);
        }, { passive: true });

        trackLabel?.addEventListener('touchend', () => {
            if (longPressTimeout) clearTimeout(longPressTimeout);
        });
        trackLabel?.addEventListener('touchcancel', () => {
            if (longPressTimeout) clearTimeout(longPressTimeout);
        });

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
                    ${asset.type === 'video' || asset.type === 'image' || asset.isGif ? '<canvas class="clip-preview"></canvas>' : ''}
                    ${asset.type === 'audio' ? '<canvas class="clip-waveform" width="140" height="48"></canvas>' : ''}
                    <span class="clip-title">${asset.name}</span>
                    <div class="clip-handle right-handle"></div>
                `;

                clipBlock.dataset.assetUrl = asset.url;
                clipBlock.dataset.assetType = asset.type;
                clipBlock.dataset.isGif = asset.isGif ? 'true' : 'false';

                const previewCanvas = clipBlock.querySelector('.clip-preview');

                if (asset.type === 'video' && !asset.isGif) {
                    const v = document.createElement('video');
                    v.src = asset.url;
                    v.muted = true;
                    v.preload = "auto";
                    v.playsInline = true;
                    
                    clipBlock.previewMedia = v;
                    
                    v.load(); 
                    
                    if (previewCanvas) {
                        renderClipPreview(clipBlock);
                    }
                    
                    const playbackVideo = document.createElement('video');
                    playbackVideo.src = asset.url;
                    playbackVideo.muted = false;
                    playbackVideo.preload = "auto";
                    playbackVideo.load();
                    clipBlock.mediaObj = playbackVideo;
                    
                } else if (asset.type === 'audio') {
                    const a = document.createElement('audio');
                    a.src = asset.url;
                    a.preload = "auto";
                    a.load();
                    clipBlock.mediaObj = a;

                    const waveformCanvas = clipBlock.querySelector('.clip-waveform');
                    if (waveformCanvas) {
                        window.renderAudioWaveform?.(asset.url, waveformCanvas, '#d9fff0');
                    }
                } else if (asset.isGif) {
                    const img = new Image();
                    img.src = asset.url;
                    clipBlock.previewMedia = img;
                    img.onload = () => renderClipPreview(clipBlock);
                    clipBlock.mediaObj = img;
                } else if (asset.type === 'image') {
                    const img = new Image();
                    img.src = asset.url;
                    clipBlock.previewMedia = img;
                    img.onload = () => renderClipPreview(clipBlock);
                    clipBlock.mediaObj = img;
                }

                lane.appendChild(clipBlock);
                selectClip(clipBlock);
                renderClipPreview(clipBlock).catch(() => {});
            } catch (err) {
                console.warn('Clip drop preview failed', err);
            }
        });
    });

    timelineResizeHandle?.addEventListener('mousedown', (e) => {
        if (isTimelineCollapsed) return;
        isTimelineResizing = true;
        document.body.style.cursor = 'row-resize';
        e.preventDefault();
    });

    timelineCollapseToggle?.addEventListener('click', () => {
        isTimelineCollapsed = !isTimelineCollapsed;
        if (!isTimelineCollapsed && timelinePreviousHeight) {
            timelinePanel.dataset.height = `${timelinePreviousHeight}`;
        }
        if (isTimelineCollapsed) {
            timelinePreviousHeight = parseFloat(timelinePanel?.dataset.height || "") || 320;
        }
        applyTimelineCollapseState();
    });

    window.addEventListener('resize', () => {
        if (timelinePanel && !isTimelineCollapsed) {
            const currentHeight = parseFloat(timelinePanel.dataset.height || "") || 320;
            setTimelineHeight(currentHeight);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (activeTrackRenameTarget && (e.key === 'Enter' || e.key === 'Escape')) {
            e.preventDefault();
            finishTrackRename(e.key === 'Escape');
        }
    });

    updateTimelineLayout();
    applyTimelineCollapseState();

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
                } else if (clip.mediaObj && clip.mediaObj.pause && !clip.mediaObj.paused) {
                    clip.mediaObj.pause();
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
                if (media && (media.tagName === 'IMG' || media.tagName === 'VIDEO' || media.tagName === 'CANVAS')) {
                    const mWidth = media.videoWidth || media.naturalWidth || media.width;
                    const mHeight = media.videoHeight || media.naturalHeight || media.height;
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
                if (media && (media.tagName === 'IMG' || media.tagName === 'VIDEO' || media.tagName === 'CANVAS')) {
                    const mWidth = media.videoWidth || media.naturalWidth || media.width;
                    const mHeight = media.videoHeight || media.naturalHeight || media.height;
                    if (mWidth && mHeight) {
                        const scale = Math.min(canvas.width / mWidth, canvas.height / mHeight);
                        ctx.drawImage(media, (canvas.width - (mWidth * scale)) / 2, (canvas.height - (mHeight * scale)) / 2, mWidth * scale, mHeight * scale);
                    }
                }
            });
        }
    }, 100);
});

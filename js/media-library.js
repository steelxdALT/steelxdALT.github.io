document.addEventListener("DOMContentLoaded", () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const mediaGrid = document.getElementById('media-grid');
    const mainPlayer = document.getElementById('main-player');

    if(!dropZone || !fileInput || !mediaGrid || !mainPlayer) {
        console.error("Missing required elements");
        return;
    }

    let mediaRecorder;
    let recordedChunks = [];
    let currentStream = null;
    let activeFolderId = null;
    let audioContext = null;

    const getAudioContext = () => {
        if (!audioContext) {
            const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
            audioContext = AudioContextImpl ? new AudioContextImpl() : null;
        }
        return audioContext;
    };

    function showCameraError() {
        let warning = document.getElementById('camera-error-modal');
        if (!warning) {
            warning = document.createElement('div');
            warning.id = 'camera-error-modal';
            warning.className = 'device-warning';
            warning.innerHTML = `
                <div class="device-warning-content">
                    <h3>📷 Camera Error</h3>
                    <p>No working webcam was found, or the camera is currently in use by another application.</p>
                    <button id="close-camera-error">Dismiss</button>
                </div>
            `;
            document.body.appendChild(warning);
            
            document.getElementById('close-camera-error').addEventListener('click', () => {
                warning.classList.add('hidden');
            });
        }
        warning.classList.remove('hidden');
    }

    const setMenuItemVisible = (menuItem, visible) => {
        if (!menuItem) return;
        menuItem.classList.toggle('hidden', !visible);
        menuItem.style.display = visible ? '' : 'none';
    };

    const folderHeader = document.getElementById("folder-header");
    const folderTitle = document.getElementById("folder-title");
    const btnCloseFolder = document.getElementById("btn-close-folder");

    const menuCreateFolder = document.getElementById("menu-create-folder");
    const menuEmptyFolder = document.getElementById("menu-empty-folder");
    const menuRemoveFromFolder = document.getElementById("menu-remove-from-folder");
    const contextMenu = document.getElementById("context-menu");
    const menuRename = document.getElementById("menu-rename");
    const menuDelete = document.getElementById("menu-delete");
    const menuMeta = document.getElementById("menu-meta");
    const menuAddTag = document.getElementById("menu-add-tag");
    const menuRemoveTag = document.getElementById("menu-remove-tag");

    const metaModal = document.getElementById("meta-modal");
    const metaClose = document.getElementById("meta-close");
    const metaText = document.getElementById("meta-text");
    const metaCopy = document.getElementById("meta-copy");

    const tagModal = document.getElementById("tag-modal");
    const tagClose = document.getElementById("tag-close");
    const tagInput = document.getElementById("tag-input");
    const tagSave = document.getElementById("tag-save");

    const btnScreen = document.getElementById("btn-screen");
    const btnVideo = document.getElementById("btn-video");
    const btnPhoto = document.getElementById("btn-photo");
    const btnAudio = document.getElementById("btn-audio");

    const folderInput = document.getElementById("folder-input");
    const mediaSearch = document.getElementById("media-search");

    const btnImportFiles = document.getElementById('btn-import-files');
    const btnImportFolder = document.getElementById('btn-import-folder');
    if (btnImportFiles && fileInput) btnImportFiles.addEventListener('click', () => fileInput.click());
    if (btnImportFolder && folderInput) btnImportFolder.addEventListener('click', () => folderInput.click());

    const preventDefault = (e) => e.preventDefault();
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-active');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-active');
    });

    fileInput.addEventListener('change', (e) => {
        if(e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
            e.target.value = '';
        }
    });

    folderInput?.addEventListener('change', (e) => {
        if(e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);

            const folderName = files[0].webkitRelativePath ?
                files[0].webkitRelativePath.split('/')[0] :
                "New Folder";

            const folderId = 'folder_' + Date.now();

            createFolderElement(folderName, folderId);
            handleFiles(files, folderId);

            e.target.value = '';
        }
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-active');

        if(!e.dataTransfer.items) {
            handleFiles(e.dataTransfer.files);
            return;
        }

        const items = e.dataTransfer.items;
        const filesToProcess = [];

        const traverseFileTree = async (item, currentParentId = null) => {
            if(item.isFile) {
                const file = await new Promise(res => item.file(res));
                file.customParentId = currentParentId;
                filesToProcess.push(file);
            } else if(item.isDirectory) {
                const newFolderId =
                    'folder_' + Date.now() + '_' + Math.floor(Math.random() * 10000);

                createFolderElement(item.name, newFolderId, currentParentId);

                const dirReader = item.createReader();

                const entries = await new Promise(resolve => {
                    const found = [];

                    const readBatch = () => {
                        dirReader.readEntries(batch => {
                            if(!batch.length) return resolve(found);
                            found.push(...batch);
                            readBatch();
                        });
                    };

                    readBatch();
                });

                for(const entry of entries) {
                    await traverseFileTree(entry, newFolderId);
                }
            }
        };

        const promises = [];
        let fallbackToFiles = false;

        for(const item of items) {
            const entry = item.webkitGetAsEntry?.();

            if(entry) {
                promises.push(traverseFileTree(entry, activeFolderId || 'root'));
            } else {
                fallbackToFiles = true;
            }
        }

        if(fallbackToFiles) {
            handleFiles(e.dataTransfer.files);
            return;
        }

        await Promise.all(promises);
        handleFiles(filesToProcess);
    });

    function saveCaptureToLibrary(blob, filename, mimeType) {
        if(!blob) return;

        const fileObj = new File([blob], filename, {
            type: mimeType
        });
        handleFiles([fileObj]);
    }

    function startRecording(stream, btn, text) {
        recordedChunks = [];
        currentStream = stream;

        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (e) => {
            if(e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.start();

        btn.classList.add("recording");
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = `🛑 ${text}`;
    }

    function stopRecording(btn, filename, mimeType) {
        if(!mediaRecorder || mediaRecorder.state === "inactive") return;

        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, {
                type: mimeType
            });

            saveCaptureToLibrary(blob, filename, mimeType);

            currentStream?.getTracks().forEach(track => track.stop());

            btn.classList.remove("recording");
            btn.innerHTML = btn.dataset.originalText;
        };

        mediaRecorder.stop();
    }

    btnScreen?.addEventListener('click', async () => {
        if(mediaRecorder && mediaRecorder.state === 'recording') {
            stopRecording(
                btnScreen,
                `Screen_Capture_${Date.now()}.webm`,
                'video/webm'
            );
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            startRecording(stream, btnScreen, 'Stop');

            stream.getVideoTracks()[0].onended = () => {
                if(mediaRecorder && mediaRecorder.state === 'recording') {
                    stopRecording(
                        btnScreen,
                        `Screen_Capture_${Date.now()}.webm`,
                        'video/webm'
                    );
                }
            };

        } catch (err) {
            console.error("Screen record cancelled or failed", err);
        }
    });

    btnVideo?.addEventListener('click', async () => {
        if(mediaRecorder && mediaRecorder.state === 'recording') {
            stopRecording(
                btnVideo,
                `Webcam_Video_${Date.now()}.webm`,
                'video/webm'
            );
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            startRecording(stream, btnVideo, 'Stop');

        } catch (err) {
            console.error("Webcam access denied", err);
            showCameraError();
        }
    });

    btnAudio?.addEventListener('click', async () => {
        if(mediaRecorder && mediaRecorder.state === 'recording') {
            stopRecording(
                btnAudio,
                `Audio_Record_${Date.now()}.webm`,
                'audio/webm'
            );
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });

            startRecording(stream, btnAudio, 'Stop');

        } catch (err) {
            console.error("Mic access denied", err);
        }
    });

    btnPhoto?.addEventListener('click', async () => {
        let stream = null;

        const stopStream = () => {
            stream?.getTracks().forEach(track => track.stop());
        };

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: true
            });

            const video = document.createElement('video');
            video.srcObject = stream;

            await new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    video.play();
                    resolve();
                };
            });

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext('2d');
            if(!ctx) {
                stopStream();
                return;
            }

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob((blob) => {
                if(blob) {
                    saveCaptureToLibrary(
                        blob,
                        `Webcam_Photo_${Date.now()}.png`,
                        'image/png'
                    );
                }

                stopStream();
            }, 'image/png');

        } catch (err) {
            console.error("Webcam Error:", err);
            showCameraError();
            stopStream();
        }
    });

    function getMimeType(filename) {
        const parts = filename.split('.');
        const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';

        const map = {
            mp4: 'video/mp4',
            webm: 'video/webm',
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg'
        };

        return map[ext] || '';
    }

    async function renderAudioWaveform(url, canvas, accentColor = '#5cd38d') {
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (canvas.clientWidth === 0) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }

        const dpr = window.devicePixelRatio || 1;
        const cssWidth = canvas.clientWidth || canvas.width || 180;
        const cssHeight = canvas.clientHeight || canvas.height || 80;
        
        const width = Math.max(1, Math.round(cssWidth * dpr));
        const height = Math.max(1, Math.round(cssHeight * dpr));

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssWidth, cssHeight);
        
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioContextInstance = getAudioContext();

            if (!audioContextInstance) {
                throw new Error("AudioContext not available");
            }

            if (audioContextInstance.state === 'suspended') {
                await audioContextInstance.resume();
            }

            const audioBuffer = await audioContextInstance.decodeAudioData(arrayBuffer);
            const channelData = audioBuffer.getChannelData(0);
            
            const centerY = cssHeight / 2;
            const barWidth = 2;
            const gap = 1;
            const step = barWidth + gap;
            const barsCount = Math.floor(cssWidth / step);
            const sampleStep = Math.max(1, Math.floor(channelData.length / barsCount));

            ctx.fillStyle = accentColor;
            
            for (let i = 0; i < barsCount; i++) {
                const start = i * sampleStep;
                const end = Math.min(channelData.length, start + sampleStep);
                let peak = 0;
                
                for (let j = start; j < end; j++) {
                    const val = Math.abs(channelData[j]);
                    if (val > peak) peak = val;
                }
                
                const barHeight = Math.max(2, peak * cssHeight * 0.85); 
                const x = i * step;
                const y = centerY - (barHeight / 2);
                
                ctx.fillRect(x, y, barWidth, barHeight);
            }
        } catch (err) {
            console.warn('Waveform rendering failed', err);
            ctx.fillStyle = '#777';
            ctx.font = '12px sans-serif';
            ctx.fillText('Audio', 12, 24);
        }
    }

    window.renderAudioWaveform = renderAudioWaveform;

    function updateGridView() {
        const currentParent = activeFolderId || 'root';
        const searchValue = (mediaSearch?.value || "").trim();
        const isSearching = searchValue.length > 0;

        const items = mediaGrid.querySelectorAll('.media-item');

        items.forEach(item => {
            if(!isSearching) {
                item.style.display =
                    item.dataset.parentFolder === currentParent ? "" : "none";
            }
        });

        if(activeFolderId && !isSearching) {
            folderHeader.classList.remove('hidden');

            const folderEl = document.querySelector(
                `.media-item[data-folder-id="${activeFolderId}"]`
            );

            const nameEl = folderEl?.querySelector('.media-name');
            folderTitle.textContent = nameEl ? nameEl.textContent : 'Folder';
        } else {
            folderHeader.classList.add('hidden');
        }
    }

    btnCloseFolder?.addEventListener('click', () => {
        activeFolderId = null;
        updateGridView();
    });

    function createFolderElement(folderName, folderId, parentId = null) {
        const item = document.createElement('div');

        item.className = 'media-item folder-item';
        item.dataset.isFolder = "true";
        item.dataset.folderId = folderId;
        item.dataset.parentFolder = parentId || activeFolderId || 'root';

        item.innerHTML = `
        <img class="media-thumbnail" src="icons/folder.png"
             style="object-fit: contain; padding: 10px; background: #1a1a1a1a;">
        <div class="media-name"></div>
    `;

        item.querySelector('.media-name').textContent = folderName;

        item.addEventListener('click', (e) => {
            e.stopPropagation();

            clearSelection();
            selectItem(item);

            item.classList.add('selected');
        });

        item.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            activeFolderId = folderId;
            updateGridView();
        });

        mediaGrid.appendChild(item);
        setupDragAndDrop(item);
        updateGridView();

        return item;
    }

    let selectedItems = [];
    let isMarqueeSelecting = false;

    let marqueeStart = {
        x: 0,
        y: 0
    };

    const marquee = document.getElementById('selection-marquee');
    const dragTooltip = document.getElementById('drag-tooltip');

    function clearSelection() {
        selectedItems.forEach(item => {
            item.classList.remove('selected');
        });

        selectedItems = [];
    }

    function selectItem(item, multi = false) {
        if(!item) return;

        if(!multi) {
            clearSelection();
        }

        if(!selectedItems.includes(item)) {
            selectedItems.push(item);
            item.classList.add('selected');
        }
    }

    function isLowEndDevice() {
        if (navigator.deviceMemory && navigator.deviceMemory < 4) return true;
        if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return true;

        const isMobile = /Mobi|Android|iPhone|iPad|Tablet|Touch/i.test(navigator.userAgent) || window.innerWidth <= 900;
        if (isMobile) return true;

        return false;
    }

    async function handleFiles(files, targetFolderId = null) {
        const LARGE_FILE_THRESHOLD = 200 * 1024 * 1024;

        let hasLargeFile = false;
        let largestFileSizeMB = 0;

        for (const file of files) {
            if (file.size > LARGE_FILE_THRESHOLD) {
                hasLargeFile = true;
                largestFileSizeMB = Math.round(file.size / (1024 * 1024));
                break;
            }
        }

        if (hasLargeFile && isLowEndDevice()) {
            const proceed = confirm(
                `⚠️ Performance Warning:\n\nYou are attempting to upload a large file (${largestFileSizeMB} MB) on a lower-spec or mobile device.\n\nRunning high-resolution or heavy video edits here may cause the browser to crash or run out of memory. Do you want to proceed?`
            );

            if (!proceed) {
                if (fileInput) fileInput.value = "";
                return;
            }
        }
        
        for(const file of files) {
            const type = file.type || getMimeType(file.name) || '';
            const isGif = type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');

            if(!type.startsWith('video/') && !type.startsWith('audio/') && !type.startsWith('image/')) continue;

            const url = URL.createObjectURL(file);

            const item = document.createElement('div');
            item.className = 'media-item';

            const isVideo = type.startsWith('video/');
            const isImage = type.startsWith('image/');
            const isAudio = type.startsWith('audio/');

            item.innerHTML = `
                ${isGif ? `<canvas class="media-thumbnail" width="180" height="110"></canvas>` : ""}
                ${isVideo ? `<video class="media-thumbnail" src="${url}" muted></video>` : ""}
                ${isImage && !isGif ? `<img class="media-thumbnail" src="${url}">` : ""}
                ${isAudio ? `<canvas class="media-thumbnail audio-waveform-canvas" width="180" height="80"></canvas>` : ""}
                <div class="media-name"></div>
            `;

            if (isGif) {
                const thumbCanvas = item.querySelector('canvas.media-thumbnail');
                if (thumbCanvas) {
                    thumbCanvas.style.background = '#111';
                    const ctx = thumbCanvas.getContext('2d');
                    const thumbImg = new Image();
                    thumbImg.onload = () => {
                        if (!ctx) return;
                        ctx.clearRect(0, 0, thumbCanvas.width, thumbCanvas.height);
                        const scale = Math.min(thumbCanvas.width / thumbImg.naturalWidth, thumbCanvas.height / thumbImg.naturalHeight);
                        const drawWidth = thumbImg.naturalWidth * scale;
                        const drawHeight = thumbImg.naturalHeight * scale;
                        ctx.drawImage(thumbImg, (thumbCanvas.width - drawWidth) / 2, (thumbCanvas.height - drawHeight) / 2, drawWidth, drawHeight);
                    };
                    thumbImg.src = url;
                }
            }

            const nameElement = item.querySelector('.media-name');
            if(nameElement) nameElement.textContent = file.name;

            item.dataset.fileUrl = url;
            item.dataset.filename = file.name;
            item.dataset.fullname = file.name;
            item.dataset.filetype = type;
            item.dataset.isGif = isGif ? 'true' : 'false';
            item.dataset.filesize = (file.size / 1024 / 1024).toFixed(2) + ' MB';
            item.dataset.lastmod = file.lastModified ? new Date(file.lastModified).toLocaleString() : 'Unknown';
            item.dataset.tag = "";
            item.dataset.parentFolder = file.customParentId || targetFolderId || activeFolderId || 'root';

            item.dataset.duration = isGif || isImage ? 5 : 12;
            if (isVideo || isAudio) {
                const media = document.createElement(isVideo ? 'video' : 'audio');
                media.preload = 'metadata';
                media.onloadedmetadata = () => {
                    item.dataset.duration = media.duration;
                    if (isVideo) {
                        item.dataset.resolution = `${media.videoWidth || 0}x${media.videoHeight || 0}`;
                        try {
                            const q = media.getVideoPlaybackQuality && media.getVideoPlaybackQuality();
                            if (q && q.totalVideoFrames && media.duration) {
                                item.dataset.fps = (q.totalVideoFrames / media.duration).toFixed(2);
                            }
                        } catch (err) {}
                    }
                    if (isAudio) {
                        try {
                            const ac = getAudioContext();
                            fetch(url).then(r => r.arrayBuffer()).then(buf => ac.decodeAudioData(buf)).then(ab => {
                                item.dataset.audioChannels = ab.numberOfChannels;
                                item.dataset.sampleRate = ab.sampleRate;
                            }).catch(() => {});
                        } catch (err) {}
                    }
                };
                media.src = url;
            }

            if (isAudio) {
                const audioCanvas = item.querySelector('canvas.audio-waveform-canvas');
                if (audioCanvas) {
                    renderAudioWaveform(url, audioCanvas, '#5cd38d');
                }
            }

            item.addEventListener('click', () => {
                clearSelection();
                selectItem(item);
                if(isVideo || isAudio) {
                    if (window.setPreviewMode) window.setPreviewMode(true);
                    mainPlayer.src = url;
                    mainPlayer.play();
                }
            });

            if(nameElement) {
                nameElement.addEventListener('dblclick', () => {
                    nameElement.contentEditable = "true";
                    nameElement.textContent = item.dataset.fullname || item.dataset.filename;
                    nameElement.focus();
                    const range = document.createRange();
                    range.selectNodeContents(nameElement);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                });

                nameElement.addEventListener('blur', () => {
                    nameElement.contentEditable = false;
                    const full = nameElement.textContent;
                    item.dataset.fullname = full;
                    nameElement.textContent = full;
                });
            }

            mediaGrid.appendChild(item);
            setupDragAndDrop(item);
        }
        updateGridView();
    }

    function deleteSelectedItem() {
        if(!selectedItems.length) return;

        selectedItems.forEach(item => {
            const url = item.dataset.fileUrl;
            if(url) {
                URL.revokeObjectURL(url);
            }
            item.remove();
        });

        selectedItems = [];
        contextMenu.classList.add('hidden');
    }

    menuDelete?.addEventListener('click', deleteSelectedItem);

    menuRename?.addEventListener('click', () => {
        contextMenu.classList.add('hidden');

        if (contextMenu.dataset.mode === 'track' && window.__activeTrackRenameTarget) {
            window.startTrackRename?.(window.__activeTrackRenameTarget);
            return;
        }

        if(!selectedItems.length) return;

        const item = selectedItems[0];
        const name = item.querySelector('.media-name');

        if(name) {
            name.dispatchEvent(new Event('dblclick'));
        }
    });

    menuMeta?.addEventListener('click', () => {
        contextMenu.classList.add('hidden');

        if(!selectedItems.length) return;

        const item = selectedItems[0];
        const d = item.dataset;

        const lines = [];
        lines.push(`Name: ${d.filename || 'Unknown'}`);
        lines.push(`Type: ${d.filetype || 'Unknown'}`);
        lines.push(`Duration: ${d.duration ? parseFloat(d.duration).toFixed(2) + 's' : 'N/A'}`);
        lines.push(`Resolution: ${d.resolution || 'N/A'}`);
        if (d.fps) lines.push(`FPS: ${d.fps}`);
        if (d.audioChannels || d.sampleRate) lines.push(`Audio: ${d.audioChannels ? d.audioChannels + 'ch' : ''}${d.sampleRate ? ' @ ' + d.sampleRate + 'Hz' : ''}`);
        lines.push(`Size: ${d.filesize || 'N/A'}`);
        lines.push(`Modified: ${d.lastmod || 'N/A'}`);

        metaText.textContent = lines.join('\n');

        metaModal.classList.remove('hidden');
    });

    metaClose?.addEventListener('click', () => {
        metaModal.classList.add('hidden');
    });

    metaCopy?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(metaText.textContent);
        } catch (err) {
            console.error("Clipboard copy failed", err);
        }
    });

    menuAddTag?.addEventListener('click', () => {
        contextMenu.classList.add('hidden');

        tagInput.value = "";
        tagModal.classList.remove('hidden');
        tagInput.focus();
    });

    const closeTagModal = () => {
        tagModal.classList.add('hidden');
        tagInput.value = ""; 
    };

    const saveTagAction = () => {
        const tag = tagInput.value.trim().toLowerCase().replace(/#/g, '');

        if (tag === "") {
            closeTagModal();
            return;
        }

        if (!selectedItems.length) {
            closeTagModal();
            return;
        }

        selectedItems.forEach(item => {
            item.dataset.tag = tag;

            let badge = item.querySelector('.media-tag-badge');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'media-tag-badge';
                item.appendChild(badge);
            }
            badge.textContent = `#${tag}`;
        });

        closeTagModal();
    };

    tagSave?.addEventListener('click', saveTagAction);
    tagClose?.addEventListener('click', closeTagModal);

    window.addEventListener('keydown', (e) => {
        if (tagModal.classList.contains('hidden')) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            saveTagAction();
        } 
        else if (e.key === 'Escape') {
            closeTagModal();
        } 
        else if (e.key === 'Backspace') {
            if (document.activeElement !== tagInput) {
                closeTagModal();
            }
        }
    });

    menuRemoveTag?.addEventListener('click', () => {
        contextMenu.classList.add('hidden');

        if(!selectedItems.length) return;

        selectedItems.forEach(item => {
            item.dataset.tag = "";
            item.querySelector('.media-tag-badge')?.remove();
        });
    });

    document.addEventListener('click', (e) => {
        if(!e.target.closest('.context-menu')) {
            contextMenu.classList.add('hidden');
        }
    });

    mediaSearch?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();

        document.querySelectorAll('.media-item').forEach(item => {
            const filename = (item.dataset.filename || "").toLowerCase();
            const tag = (item.dataset.tag || "").toLowerCase();

            let match;

            if(term.startsWith('#')) {
                const searchTag = term.slice(1);

                if(searchTag === "") {
                    match = tag !== "";
                } else {
                    match = tag.includes(searchTag);
                }
            } else {
                match = filename.includes(term);
            }

            item.style.display = match ? "" : "none";
        });
    });

    document.getElementById('media-library').addEventListener('contextmenu', (e) => {
        e.preventDefault();

        const targetItem = e.target.closest('.media-item');

        setMenuItemVisible(menuRename, false);
        setMenuItemVisible(menuDelete, false);
        setMenuItemVisible(menuMeta, false);
        setMenuItemVisible(menuCreateFolder, false);
        setMenuItemVisible(menuEmptyFolder, false);
        setMenuItemVisible(menuRemoveFromFolder, false);
        setMenuItemVisible(menuAddTag, false);
        setMenuItemVisible(menuRemoveTag, false);

        if(!targetItem) {
            clearSelection();
            setMenuItemVisible(menuCreateFolder, true);
        } else {
            if(!selectedItems.includes(targetItem)) {
                clearSelection();
                selectItem(targetItem);
            }

            const isMulti = selectedItems.length > 1;

            setMenuItemVisible(menuDelete, true);

            if(!isMulti) {
                setMenuItemVisible(menuRename, true);

                if(targetItem.dataset.isFolder === "true") {
                    setMenuItemVisible(menuEmptyFolder, true);
                } else {
                    setMenuItemVisible(menuMeta, true);

                    const tag = (targetItem.dataset.tag || "").trim();
                    const hasTag = tag !== "";

                    setMenuItemVisible(menuAddTag, !hasTag);
                    setMenuItemVisible(menuRemoveTag, hasTag);
                }
            }

            const anyInFolder = selectedItems.some(item =>
                item.dataset.isFolder !== "true" &&
                item.dataset.parentFolder &&
                item.dataset.parentFolder !== 'root'
            );

            if(anyInFolder) {
                setMenuItemVisible(menuRemoveFromFolder, true);
            }
        }

        contextMenu.style.top = `${e.clientY}px`;
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.classList.remove('hidden');
    });

    menuEmptyFolder?.addEventListener('click', () => {
        contextMenu.classList.add('hidden');

        if(!selectedItems.length) return;

        const folder = selectedItems[0];
        if(folder.dataset.isFolder !== "true") return;

        const targetFolderId = folder.dataset.folderId;
        const parentOfFolder = folder.dataset.parentFolder;

        document.querySelectorAll(
            `.media-item[data-parent-folder="${targetFolderId}"]`
        ).forEach(child => {
            child.dataset.parentFolder = parentOfFolder;
        });

        updateGridView();
    });

    menuRemoveFromFolder?.addEventListener('click', () => {
        contextMenu.classList.add('hidden');

        if(!selectedItems.length) return;

        selectedItems.forEach(item => {
            if(item.dataset.isFolder === "true") return;

            item.dataset.parentFolder = 'root';
        });

        updateGridView();
    })

    menuRename?.addEventListener('click', () => {
        contextMenu.classList.add('hidden');

        if(!selectedItems.length) return;

        const item = selectedItems[0];
        const nameElement = item.querySelector('.media-name');

        if(!nameElement) return;

        nameElement.contentEditable = "true";
        nameElement.focus();

        const range = document.createRange();
        range.selectNodeContents(nameElement);

        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const finishRename = (e) => {
            if(e.type === 'keydown' && e.key !== 'Enter') return;

            if(e.key === 'Enter') e.preventDefault();

            nameElement.contentEditable = "false";
            window.getSelection().removeAllRanges();

            nameElement.removeEventListener('blur', finishRename);
            nameElement.removeEventListener('keydown', finishRename);
        };

        nameElement.addEventListener('blur', finishRename);
        nameElement.addEventListener('keydown', finishRename);
    });

    menuCreateFolder?.addEventListener('click', () => {
        contextMenu.classList.add('hidden');

        const folder = createFolderElement('New Folder', 'folder_' + Date.now());

        setTimeout(() => {
            clearSelection();
            selectItem(folder);
            menuRename.click();
        }, 50);
    });

    const mediaLibrary = document.getElementById('media-library');

    mediaLibrary.addEventListener('mousedown', (e) => {
        if(
            e.target.closest('.media-item') ||
            e.target.closest('.drop-zone') ||
            e.target.closest('.search-container') ||
            e.target.closest('#folder-header')
        ) return;

        clearSelection();

        isMarqueeSelecting = true;
        marqueeStart = {
            x: e.clientX + mediaLibrary.scrollLeft,
            y: e.clientY + mediaLibrary.scrollTop
        };

        if(!marquee) return;

        marquee.classList.remove('hidden');
        marquee.style.left = `${e.clientX}px`;
        marquee.style.top = `${e.clientY}px`;
        marquee.style.width = '0px';
        marquee.style.height = '0px';
    });

    window.addEventListener('mousemove', (e) => {
        if(!isMarqueeSelecting || !marquee) return;

        const currX = e.clientX + mediaLibrary.scrollLeft;
        const currY = e.clientY + mediaLibrary.scrollTop;

        const left = Math.min(marqueeStart.x, currX);
        const top = Math.min(marqueeStart.y, currY);
        const width = Math.abs(marqueeStart.x - currX);
        const height = Math.abs(marqueeStart.y - currY);

        const right = left + width;
        const bottom = top + height;

        marquee.style.left = `${left}px`;
        marquee.style.top = `${top}px`;
        marquee.style.width = `${width}px`;
        marquee.style.height = `${height}px`;

        const items = mediaGrid.querySelectorAll('.media-item');

        items.forEach(item => {
            if(item.style.display === 'none') return;

            const rect = item.getBoundingClientRect();

            const rectAdjusted = {
                left: rect.left + mediaLibrary.scrollLeft,
                right: rect.right + mediaLibrary.scrollLeft,
                top: rect.top + mediaLibrary.scrollTop,
                bottom: rect.bottom + mediaLibrary.scrollTop
            };

            const overlap = !(
                rectAdjusted.right < left ||
                rectAdjusted.left > right ||
                rectAdjusted.bottom < top ||
                rectAdjusted.top > bottom
            );

            if(overlap) {
                if(!selectedItems.includes(item)) {
                    selectItem(item, true);
                }
            } else {
                if(selectedItems.includes(item)) {
                    item.classList.remove('selected');
                    selectedItems = selectedItems.filter(i => i !== item);
                }
            }
        });
    });

    window.addEventListener('mouseup', () => {
        if(!marquee) return;

        isMarqueeSelecting = false;
        marquee.classList.add('hidden');
    });

    function setupDragAndDrop(item) {
        item.setAttribute('draggable', true);

        item.addEventListener('dragstart', (e) => {
            if(!selectedItems.includes(item)) {
                clearSelection();
                selectItem(item);
            }

            item.classList.add('dragging');
            e.dataTransfer.setData('text/plain', 'dragging');
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');

            if(dragTooltip) {
                dragTooltip.classList.add('hidden');
            }

            document.querySelectorAll('.drag-over-folder')
                .forEach(el => el.classList.remove('drag-over-folder'));
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();

            const draggingItem = document.querySelector('.dragging');
            if(!draggingItem || draggingItem === item) return;

            if(item.dataset.isFolder === "true" &&
                draggingItem.dataset.isFolder !== "true") {

                item.classList.add('drag-over-folder');

                if(dragTooltip) {
                    dragTooltip.classList.remove('hidden');
                    dragTooltip.style.left = `${e.clientX}px`;
                    dragTooltip.style.top = `${e.clientY}px`;

                    const nameEl = item.querySelector('.media-name');
                    const name = nameEl ? nameEl.textContent : 'folder';

                    dragTooltip.textContent = `Move to ${name}`;
                }

            } else if(item.dataset.isFolder !== "true") {
                const rect = item.getBoundingClientRect();
                const midpoint = rect.left + rect.width / 2;

                if(e.clientX < midpoint) {
                    mediaGrid.insertBefore(draggingItem, item);
                } else {
                    mediaGrid.insertBefore(draggingItem, item.nextSibling);
                }
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over-folder');

            if(dragTooltip) {
                dragTooltip.classList.add('hidden');
            }
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();

            if(item.dataset.isFolder === "true") {
                const folderId = item.dataset.folderId;

                selectedItems.forEach(selected => {
                    if(selected.dataset.isFolder !== "true") {
                        selected.dataset.parentFolder = folderId;
                    }
                });

                updateGridView();
            }
        });
    }

    const leftPanel = document.querySelector('.left-panel');
    const resizeHandle = document.getElementById('resize-handle');
    const toggleBtn = document.getElementById('toggle-panel');

    let isResizing = false;
    let isCollapsed = false;
    const MIN_WIDTH = 360;
    const getMaxWidth = () => window.innerWidth * 0.5;

    resizeHandle.addEventListener('mousedown', (e) => {
        if(isCollapsed) return;
        isResizing = true;
        document.body.style.cursor = 'ew-resize';
        leftPanel.classList.remove('animating');
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if(!isResizing) return;

        let newWidth = e.clientX;
        const maxWidth = getMaxWidth();

        if(newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
        if(newWidth > maxWidth) newWidth = maxWidth;

        leftPanel.style.width = newWidth + 'px';
    });

    window.addEventListener('mouseup', () => {
        if(isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
        }
    });

    toggleBtn.addEventListener('click', () => {
        leftPanel.classList.add('animating');

        if(!isCollapsed) {
            leftPanel.dataset.prevWidth = leftPanel.offsetWidth || MIN_WIDTH;
            leftPanel.style.width = '0px';
            toggleBtn.textContent = '>';
            isCollapsed = true;
        } else {
            const prevWidth = leftPanel.dataset.prevWidth || MIN_WIDTH;
            leftPanel.style.width = prevWidth + 'px';
            toggleBtn.textContent = '<';
            isCollapsed = false;
        }
    });
});

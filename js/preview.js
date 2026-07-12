document.addEventListener("DOMContentLoaded", () => {
    const video = document.getElementById('main-player'); 
    const canvas = document.getElementById('main-canvas');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const btnStart = document.getElementById('btn-start');
    const btnEnd = document.getElementById('btn-end');
    const btnRewind = document.getElementById('btn-rewind');
    const btnFastForward = document.getElementById('btn-fast-forward');

    window.isPreviewing = true;

    window.setPreviewMode = (isPreviewing) => {
        window.isPreviewing = isPreviewing;
        if (isPreviewing) {
            video.style.display = 'block';
            canvas.style.display = 'none';
        } else {
            video.style.display = 'none';
            canvas.style.display = 'block';
            video.pause();
        }
    };

    if (btnPlayPause) {
        btnPlayPause.addEventListener('click', () => {
            if (window.isPreviewing) {
                if (video.paused || video.ended) video.play();
                else video.pause();
            } else {
                document.dispatchEvent(new Event('timeline-toggle-play'));
            }
        });
    }

    video.addEventListener('play', () => { if (window.isPreviewing) btnPlayPause.textContent = '⏸️'; });
    video.addEventListener('pause', () => { if (window.isPreviewing) btnPlayPause.textContent = '▶️'; });

    document.addEventListener('timeline-playing-status', (e) => {
        if (!window.isPreviewing && btnPlayPause) {
            btnPlayPause.textContent = e.detail.isPlaying ? '⏸️' : '▶️';
        }
    });

    if (btnStart) {
        btnStart.addEventListener('click', () => {
            if (window.isPreviewing) video.currentTime = 0;
            else document.dispatchEvent(new CustomEvent('timeline-seek', { detail: 0 }));
        });
    }

    if (btnRewind) {
        btnRewind.addEventListener('click', () => {
            if (window.isPreviewing) video.currentTime = Math.max(0, video.currentTime - 5);
            else document.dispatchEvent(new CustomEvent('timeline-seek-relative', { detail: -5 }));
        });
    }

    if (btnFastForward) {
        btnFastForward.addEventListener('click', () => {
            if (window.isPreviewing) {
                if (video.duration) video.currentTime = Math.min(video.duration, video.currentTime + 5);
            } else {
                document.dispatchEvent(new CustomEvent('timeline-seek-relative', { detail: 5 }));
            }
        });
    }

    const btnSpeed = document.getElementById('btn-speed');
const speedModal = document.getElementById('speed-modal');
const speedSlider = document.getElementById('speed-slider');
const speedInput = document.getElementById('speed-input');

window.playbackSpeed = 1;

if (btnSpeed && speedModal) {
    btnSpeed.addEventListener('click', (e) => {
        e.stopPropagation();
        speedModal.classList.toggle('hidden');
        if (!speedModal.classList.contains('hidden')) {
            speedInput.focus();
            setTimeout(() => speedInput.select(), 0);
        }
    });

    const applySpeed = (val) => {
        let speed = parseFloat(val);
        if (isNaN(speed) || speed <= 0) return;
        
        window.playbackSpeed = speed;
        video.playbackRate = speed;
        
        btnSpeed.innerHTML = `⏱️ ${speed.toFixed(2)}x`;
        speedInput.value = `${speed.toFixed(2)}x`;
        speedSlider.value = speed;
    };

    speedSlider.addEventListener('input', (e) => applySpeed(e.target.value));
    speedInput.addEventListener('change', (e) => applySpeed(e.target.value.replace('x', '')));
    speedInput.addEventListener('focus', () => setTimeout(() => speedInput.select(), 0));
    speedInput.addEventListener('click', () => speedInput.select());

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.speed-control-wrapper')) {
            speedModal.classList.add('hidden');
        }
    });
}
});

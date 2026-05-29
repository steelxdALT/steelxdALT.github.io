document.addEventListener("DOMContentLoaded", () => {
    const deviceWarning = document.getElementById('device-warning');
    const deviceBtn = document.getElementById('device-warning-btn');

    function isMobileDevice() {
        return /Mobi|Android|iPhone|iPad|Tablet|Touch/i.test(navigator.userAgent)
            || window.innerWidth < 900;
    }

    const dismissed = localStorage.getItem('deviceWarningDismissed');

    if (isMobileDevice() && !dismissed) {
        deviceWarning?.classList.remove('hidden');
    }

    deviceBtn?.addEventListener('click', () => {
        deviceWarning?.classList.add('hidden');
        localStorage.setItem('deviceWarningDismissed', 'true');
    });
});
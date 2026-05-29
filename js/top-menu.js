document.addEventListener("DOMContentLoaded", () => {
    let isMenuOpen = false;
    let activeSubmenu = 'file';

    const menuFileRoot = document.getElementById('menu-file-root');
    const menuFileDropdown = document.getElementById('menu-file-dropdown');
    
    const subUpload = document.getElementById('menu-upload-sub');
    const subExport = document.getElementById('menu-export-sub');
    const subRecord = document.getElementById('menu-record-sub');

    const triggerMenuAction = (action) => {
        closeTopMenu();
        
        switch(action) {
            case 'new-folder': document.getElementById('menu-create-folder')?.click(); break;
            case 'up-files': document.getElementById('file-input')?.click(); break;
            case 'up-folder': document.getElementById('folder-input')?.click(); break;
            case 'rec-screen': document.getElementById('btn-screen')?.click(); break;
            case 'rec-video': document.getElementById('btn-video')?.click(); break;
            case 'rec-audio': document.getElementById('btn-audio')?.click(); break;
            case 'rec-photo': document.getElementById('btn-photo')?.click(); break;
            case 'ex-mp4': console.log("Exporting MP4..."); break; 
            case 'ex-webm': console.log("Exporting WEBM..."); break; 
            case 'ex-mkv': console.log("Exporting MKV..."); break; 
        }
    };

    const closeTopMenu = () => {
        isMenuOpen = false;
        activeSubmenu = 'file';
        menuFileRoot.classList.remove('active');
        menuFileDropdown.classList.add('hidden');
        [subUpload, subExport, subRecord].forEach(sub => sub?.classList.add('hidden'));
        
        document.querySelectorAll('.top-menu-item').forEach(el => el.classList.remove('active'));
    };

    const openTopMenu = () => {
        isMenuOpen = true;
        activeSubmenu = 'file';
        menuFileRoot.classList.add('active');
        menuFileDropdown.classList.remove('hidden');
        menuIndex = -1;
    };

    const openKeyboardSubmenu = (menuName, elementId, subElement) => {
        activeSubmenu = menuName;
        document.querySelectorAll('.top-menu-item').forEach(el => el.classList.remove('active'));
        document.getElementById(elementId)?.classList.add('active');
        [subUpload, subExport, subRecord].forEach(sub => sub?.classList.add('hidden'));
        subElement?.classList.remove('hidden');
    };

    document.getElementById('file-menu-label')?.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isMenuOpen ? closeTopMenu() : openTopMenu();
    });

    document.addEventListener('mousedown', (e) => {
        if (isMenuOpen && !e.target.closest('.top-menu-bar')) closeTopMenu();
    });

    document.getElementById('tm-new-folder')?.addEventListener('click', () => triggerMenuAction('new-folder'));
    document.getElementById('tm-up-files')?.addEventListener('click', () => triggerMenuAction('up-files'));
    document.getElementById('tm-up-folder')?.addEventListener('click', () => triggerMenuAction('up-folder'));
    document.getElementById('tm-ex-mp4')?.addEventListener('click', () => triggerMenuAction('ex-mp4'));
    document.getElementById('tm-ex-webm')?.addEventListener('click', () => triggerMenuAction('ex-webm'));
    document.getElementById('tm-ex-mkv')?.addEventListener('click', () => triggerMenuAction('ex-mkv'));
    document.getElementById('tm-rec-screen')?.addEventListener('click', () => triggerMenuAction('rec-screen'));
    document.getElementById('tm-rec-video')?.addEventListener('click', () => triggerMenuAction('rec-video'));
    document.getElementById('tm-rec-audio')?.addEventListener('click', () => triggerMenuAction('rec-audio'));
    document.getElementById('tm-rec-photo')?.addEventListener('click', () => triggerMenuAction('rec-photo'));

    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();

        if (e.key === 'Alt') {
            e.preventDefault();
            document.body.classList.add('show-mnemonics');
        }

        if (e.altKey && key === 'f') {
            e.preventDefault();
            openTopMenu();
            return;
        }

        if (isMenuOpen) {
            const items = getVisibleMenuItems();
if (!items.length) return;

if (key === 'arrowdown' || (key === 'tab' && !e.shiftKey)) {
    e.preventDefault();
    menuIndex = (menuIndex + 1) % items.length;
    setActiveItem(items, menuIndex);
    return;
}

if (key === 'arrowup' || (key === 'tab' && e.shiftKey)) {
    e.preventDefault();
    menuIndex = (menuIndex - 1 + items.length) % items.length;
    setActiveItem(items, menuIndex);
    return;
}

if (key === 'enter') {
    e.preventDefault();
    items[menuIndex]?.click();
    return;
}

if (key === 'arrowright') {
    const active = items[menuIndex];
    if (active?.classList.contains('has-submenu')) {
        openKeyboardSubmenu(
            active.id.replace('tm-', ''),
            active.id,
            active.querySelector('.submenu')
        );
    }
    return;
}

if (key === 'arrowleft') {
    activeSubmenu = 'file';
    [subUpload, subExport, subRecord].forEach(sub => sub?.classList.add('hidden'));
    return;
}
            e.preventDefault(); 
            e.stopPropagation();

            if (key === 'escape') {
                closeTopMenu();
                return;
            }

            if (activeSubmenu === 'file') {
                if (key === 'n') triggerMenuAction('new-folder');
                else if (key === 'u') openKeyboardSubmenu('upload', 'tm-upload', subUpload);
                else if (key === 'e') openKeyboardSubmenu('export', 'tm-export', subExport);
                else if (key === 'r') openKeyboardSubmenu('record', 'tm-record', subRecord);
            } 
            else if (activeSubmenu === 'upload') {
                if (key === 'f') triggerMenuAction('up-files');
                else if (key === 'o') triggerMenuAction('up-folder');
            } 
            else if (activeSubmenu === 'export') {
                if (key === '4') triggerMenuAction('ex-mp4');
                else if (key === 'w') triggerMenuAction('ex-webm');
                else if (key === 'm') triggerMenuAction('ex-mkv');
            } 
            else if (activeSubmenu === 'record') {
                if (key === 's') triggerMenuAction('rec-screen');
                else if (key === 'v') triggerMenuAction('rec-video');
                else if (key === 'a') triggerMenuAction('rec-audio');
                else if (key === 'p') triggerMenuAction('rec-photo');
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') {
            document.body.classList.remove('show-mnemonics');
        }
    });

    const getVisibleMenuItems = () => {
        return Array.from(
            document.querySelectorAll('.menu-dropdown .top-menu-item')
        ).filter(el => el.offsetParent !== null);
    };

    let menuIndex = -1;

    const setActiveItem = (items, index) => {
        items.forEach(el => el.classList.remove('active'));
        if (items[index]) {
            items[index].classList.add('active');
            items[index].scrollIntoView({ block: 'nearest' });
        }
    };


});
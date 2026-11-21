function domEl(tag, cls, css) {
    var e = $(document.createElement(tag));
    if (cls) e.addClass(cls);
    if (css) e.css(css);
    return e;
}

function makeIcon(type, size) {
    var s = size || '18px';
    var box = domEl('span', '', { width: s, height: s, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 });
    var inner = '';
    if (type === 'star_fill') {
        inner = '<path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>';
    } else if (type === 'star_menu') {
        inner = '<polygon fill="none" stroke="currentColor" stroke-width="2" points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';
    } else if (type === 'sort') {
        inner = '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 4v16M7 4l-3 3M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/>';
    } else if (type === 'copy') {
        inner = '<rect x="9" y="9" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
    } else if (type === 'paste') {
        inner = '<path fill="none" stroke="currentColor" stroke-width="2" d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M12 11v6M9 14l3 3 3-3"/>';
    } else if (type === 'refresh') {
        inner = '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M16 16h5v5"/>';
    } else if (type === 'trash') {
        inner = '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>';
    }
    box[0].innerHTML = '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" style="display:block;width:100%;height:100%;">' + inner + '</svg>';
    return box;
}

function MyTopComponent() {
    var html = domEl('div', 'my-top-page', { height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch' });
    var deleteMode = false;
    var lastScrollTop = 0;
    var headerHidden = false;

    function getNativeBg() {
        try {
            var bg = window.getComputedStyle(document.body).backgroundColor;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
        } catch (e) {}
        return '#1d1f20';
    }

    function iconBtn(type, active) {
        var btn = domEl('div', 'full-start__button selector', {
            flex: '1', minWidth: '0', height: '38px', padding: '0 6px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px'
        });
        if (active) btn.css({ background: '#d9383a', color: '#fff' });
        btn.append(makeIcon(type, '18px'));
        return btn;
    }

    function buildContent() {
        try {
            var savedScroll = html.scrollTop();
            html.empty();
            var top = getTop();
            var units = getSortedUnits();

            var header = domEl('div', '', {
                position: 'sticky', top: '0', zIndex: 20, background: getNativeBg(),
                transition: 'transform 0.22s ease, opacity 0.2s ease',
                transform: headerHidden ? 'translateY(-100%)' : 'translateY(0)',
                opacity: headerHidden ? '0' : '1',
                pointerEvents: headerHidden ? 'none' : 'auto'
            });

            var buttons = domEl('div', '', { display: 'flex', gap: '6px', padding: '12px 16px 8px', alignItems: 'center' });

            var btnSort = iconBtn('sort');
            onceClick(btnSort, function () { startSort(buildContent); });
            buttons.append(btnSort);

            var btnCopy = iconBtn('copy');
            onceClick(btnCopy, function () {
                copyToClipboard(buildTopText(true),
                    function () { notify('Топ скопирован'); },
                    function () { notify('Не удалось скопировать'); });
            });
            buttons.append(btnCopy);

            var btnImport = iconBtn('paste');
            onceClick(btnImport, function () { openImportDialog(buildContent); });
            buttons.append(btnImport);

            var btnEnrich = iconBtn('refresh');
            onceClick(btnEnrich, function () { enrichTop(buildContent); });
            buttons.append(btnEnrich);

            var btnDelete = iconBtn('trash', deleteMode);
            onceClick(btnDelete, function () {
                deleteMode = !deleteMode;
                headerHidden = false;
                buildContent();
            });
            buttons.append(btnDelete);

            header.append(buttons);

            var counterBox = domEl('div', '', { margin: '0 16px 10px', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', color: '#8a8a95', fontSize: '12px' });
            counterBox.append(document.createTextNode('Элементов: '));
            counterBox.append(domEl('b').text(units.length));
            if (deleteMode) {
                counterBox.append(document.createTextNode(' • '));
                counterBox.append(domEl('span', '', { color: '#ff5c5e' }).text('Режим удаления'));
            }
            header.append(counterBox);
            html.append(header);

            html.off('scroll.curtain').on('scroll.curtain', function () {
                var st = html.scrollTop();
                if (st <= 15) {
                    if (headerHidden) { headerHidden = false; header.css({ transform: 'translateY(0)', opacity: '1', pointerEvents: 'auto' }); }
                } else if (st > lastScrollTop + 8) {
                    if (!headerHidden) { headerHidden = true; header.css({ transform: 'translateY(-100%)', opacity: '0', pointerEvents: 'none' }); }
                } else if (st < lastScrollTop - 2) {
                    if (headerHidden) { headerHidden = false; header.css({ transform: 'translateY(0)', opacity: '1', pointerEvents: 'auto' }); }
                }
                lastScrollTop = st;
            });

            if (!units.length) {
                html.append(domEl('div', '', { padding: '40px', textAlign: 'center', color: '#8a8a95' }).text('Список пуст'));
                return;
            }
            var list = domEl('div', '', { padding: '0 16px 120px' });
            units.forEach(function (u) {
                var firstId = u.ids[0];
                var firstItem = top[firstId] || {};
                var placeText = u.place ? '#' + u.place : '—';
                var src = posterUrl(u.poster, 'w200');
                var row = domEl('div', '', { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' });

                function deleteCurrentUnit() {
                    removeFromTopAndViewed(u.ids);
                    notify('Удалено: «' + u.title + '»');
                    buildContent();
                }

                var placeBtn = domEl('div', '', { fontSize: '22px', fontWeight: '700', color: '#ffdd55', minWidth: '44px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }).text(placeText);
                onceClick(placeBtn, function () { if (deleteMode) { deleteCurrentUnit(); return; } editPlace(u.ids, buildContent); });
                row.append(placeBtn);

                var posterWrap = domEl('div', '', { width: '54px', height: '80px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', flexShrink: 0, cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' });
                if (src) {
                    var img = domEl('img', '', { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }).attr('src', src);
                    img.on('error', function () { var d = 'https://tmdb.org' + String(u.poster).replace(/^\/+/, ''); if (img.attr('src') !== d) img.attr('src', d); else img.remove(); });
                    posterWrap.append(img);
                }
                onceClick(posterWrap, function () { if (deleteMode) { deleteCurrentUnit(); return; } openMovieCard(firstItem); });
                row.append(posterWrap);

                var info = domEl('div', '', { flex: 1, minWidth: 0, cursor: 'pointer' });
                if (u.isCollection) info.append(domEl('div', '', { color: '#ffdd55', fontSize: '10px', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '2px' }).text('КОЛЛЕКЦИЯ × ' + u.count));
                var titleDiv = domEl('div', '', { fontSize: '16px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }).text(u.title);
                if (!u.isCollection && firstItem.isSeries) titleDiv.append(' ').append(domEl('span', '', { color: '#ffdd55', fontSize: '11px' }).text('СЕРИАЛ'));
                info.append(titleDiv);
                if (u.isCollection) {
                    var parts = u.ids.map(function (id) { return (top[id] ? top[id].title + ' (' + top[id].year + ')' : id); }).join(' · ');
                    info.append(domEl('div', '', { fontSize: '12px', color: '#8a8a95', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }).text(parts));
                } else {
                    info.append(domEl('div', '', { fontSize: '13px', color: '#8a8a95', marginTop: '4px' }).text(firstItem.year || '—'));
                }
                if (u.note) info.append(domEl('div', '', { fontSize: '12px', color: '#8a8a95', marginTop: '4px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }).text(u.note));
                onceClick(info, function () { if (deleteMode) { deleteCurrentUnit(); return; } openMovieCard(firstItem); });
                row.append(info);

                if (deleteMode) {
                    var delBtn = domEl('div', 'full-start__button selector', { padding: '8px 14px', background: 'rgba(217,56,58,0.22)', border: '1px solid #ff5c5e', color: '#ff5c5e' }).append(domEl('span', '', { fontSize: '15px', fontWeight: '700' }).text('✕'));
                    onceClick(delBtn, deleteCurrentUnit);
                    row.append(delBtn);
                } else {
                    var noteBtn = domEl('div', 'full-start__button selector', { padding: '8px 12px' }).append(domEl('span', '', { fontSize: '12px' }).text('Заметка'));
                    onceClick(noteBtn, function () { if (u.isCollection) editCollectionNotes(u.ids, buildContent); else editNote(firstId, buildContent); });
                    row.append(noteBtn);
                }

                list.append(row);
            });
            html.append(list);

            if (savedScroll > 0) html.scrollTop(savedScroll);
        } catch (e) {
            html.append(domEl('div', '', { padding: '40px', textAlign: 'center', color: '#ff6666' }).text('Ошибка: ' + e.message));
        }
    }

    this.create = function () { deleteMode = false; headerHidden = false; lastScrollTop = 0; syncWithFavorites(true); buildContent(); return html; };
    this.start = function () {};
    this.render = function () { return html; };
    this.destroy = function () { html.remove(); };
}

function registerComponent() {
    if (!window.Lampa || !Lampa.Component || !Lampa.Component.add) return;
    Lampa.Component.add('my_top_page', MyTopComponent);
}
function openTopPage() {
    try { Lampa.Activity.push({ url: '', title: 'Мой топ', component: 'my_top_page', data: {} }); }
    catch (e) { notify('Ошибка открытия: ' + e.message); }
}

function addButtonToFull(e) {
    if (e.type !== 'complite') return;
    var movie = e.data && e.data.movie ? e.data.movie : null;
    if (!movie) return;
    setTimeout(function () {
        if ($('.my-top-btn-card').length > 0) return;
        var btn = domEl('div', 'full-start__button selector view--custom my-top-btn-card', { display: 'flex', alignItems: 'center', justifyContent: 'center' }).append(makeIcon('star_fill', '22px'));
        onceClick(btn, function () { addToTop(movie); });
        var c = $('.full-start__buttons');
        if (c.length) c.append(btn);
        else $('[class*="full-start"][class*="buttons"]').first().append(btn);
    }, 200);
}
function addMenuItem() {
    var attempts = 0, maxAttempts = 20;
    var tryAdd = function () {
        attempts++;
        var lists = $('.menu .menu__list');
        if (lists.length > 0) {
            var first = lists.first();
            if (first.find('.my-top-menu-item').length > 0) return;
            var item = domEl('li', 'menu__item selector my-top-menu-item');
            item.append(domEl('div', 'menu__ico').append(makeIcon('star_menu', '22px')));
            item.append(domEl('div', 'menu__text').text('Мой топ'));
            onceClick(item, openTopPage);
            first.append(item);
        } else if (attempts < maxAttempts) setTimeout(tryAdd, 500);
    };
    setTimeout(tryAdd, 1500);
}
function startPlugin() {
    if (window[PLUGIN_NAME]) return;
    window[PLUGIN_NAME] = true;
    try {
        registerComponent();
        Lampa.Listener.follow('full', addButtonToFull);
        addMenuItem();
    } catch (e) {}
}
if (window.appready) startPlugin();
else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });

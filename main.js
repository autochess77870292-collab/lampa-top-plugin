// main.js — Плагин "Мой топ" для Lampa (v29)
(function () {
    'use strict';

    var PLUGIN_NAME = 'my_top_v29';
    var STORAGE_KEY = 'my_movie_top_v14';

    function notify(msg) {
        try { if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg); } catch (e) {}
    }
    function rawGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
    function rawSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    function parseJSON(s, d) { if (!s) return d; try { var p = JSON.parse(s); return p || d; } catch (e) { return d; } }
    function getTop() {
        var raw = rawGet(STORAGE_KEY, '');
        if (!raw) return {};
        var p = parseJSON(raw, {});
        return (p && typeof p === 'object') ? p : {};
    }
    function saveTop(t) { return rawSet(STORAGE_KEY, JSON.stringify(t)); }

    function shieldInput($el) {
        $el.on('keydown keyup keypress input', function (e) { e.stopPropagation(); });
        return $el;
    }
    function onceClick($el, handler) {
        var busy = false;
        $el.off('click hover:enter').on('click hover:enter', function (e) {
            if (busy) return;
            busy = true;
            try { handler(e); } finally { setTimeout(function () { busy = false; }, 400); }
        });
        return $el;
    }
    function posterUrl(path, size) {
        if (!path) return '';
        size = size || 'w300';
        var clean = String(path).replace(/^\/+/, '');
        try { if (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb && typeof Lampa.Api.sources.tmdb.img === 'function') { var u = Lampa.Api.sources.tmdb.img(path, size); if (u && typeof u === 'string') return u; } } catch (e) {}
        try { if (window.Lampa && Lampa.Api && typeof Lampa.Api.img === 'function') { var u2 = Lampa.Api.img(path, size); if (u2 && typeof u2 === 'string') return u2; } } catch (e) {}
        try { if (window.Lampa && Lampa.Utils && typeof Lampa.Utils.img === 'function') { var u3 = Lampa.Utils.img(path, size); if (u3 && typeof u3 === 'string') return u3; } } catch (e) {}
        try { if (window.Lampa && Lampa.TMDB && typeof Lampa.TMDB.image === 'function') { var u4 = Lampa.TMDB.image('/t/p/' + size + '/' + clean); if (u4 && typeof u4 === 'string') return u4; } } catch (e) {}
        return 'https://image.tmdb.org/t/p/' + size + '/' + clean;
    }

    function isSeries(c) { return !!(c && (c.name || c.first_air_date || c.media_type === 'tv')); }
    function extractCardInfo(card) {
        if (!card) return null;
        var isTV = isSeries(card);
        var title = isTV ? (card.name || card.original_name || 'Без названия') : (card.title || card.original_title || 'Без названия');
        var dateStr = isTV ? (card.first_air_date || '') : (card.release_date || '');
        var col = card.belongs_to_collection || null;
        return {
            id: card.id, title: title,
            year: dateStr ? dateStr.split('-')[0] : '—',
            poster: card.poster_path || '',
            isSeries: isTV,
            collectionId: col ? col.id : null,
            collectionName: col ? col.name : null,
            collectionChecked: true,
            place: null, note: '', addedAt: Date.now()
        };
    }
    function addToTop(card) {
        var info = extractCardInfo(card);
        if (!info || !info.id) { notify('Не удалось определить'); return; }
        var top = getTop();
        if (top[info.id]) { notify('Уже в топе'); return; }
        top[info.id] = info;
        saveTop(top);
        notify('"' + info.title + '" → в топе (' + Object.keys(top).length + ')');
    }
    function importFavorites(silent) {
        try {
            var fav = parseJSON(rawGet('favorite', ''), null);
            if (!fav) { if (!silent) notify('favorite не найден'); return 0; }
            var viewedIds = fav.viewed;
            if (!viewedIds) { if (!silent) notify('Нет viewed'); return 0; }
            var ids = Array.isArray(viewedIds) ? viewedIds : Object.keys(viewedIds);
            if (!ids.length) return 0;
            var top = getTop();
            var added = 0;
            ids.forEach(function (id) {
                var sid = String(id);
                if (top[sid]) return;
                top[sid] = { id: id, title: 'ID ' + id, year: '—', poster: '', isSeries: false, collectionId: null, collectionName: null, collectionChecked: false, place: null, note: '', addedAt: Date.now() };
                added++;
            });
            if (added > 0) saveTop(top);
            if (!silent && added > 0) notify('Импортировано: ' + added);
            return added;
        } catch (e) { console.error('[MyTop] import err:', e); return 0; }
    }
    function fetchTMDB(id, onSuccess, onFail) {
        try {
            var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
            if (!tmdb || !tmdb.full) { onFail('нет tmdb.full'); return; }
            var attempts = [ { id: id, method: 'movie', card: {} }, { id: id, method: 'tv', card: {} } ];
            var idx = 0;
            function tryNext() {
                if (idx >= attempts.length) { onFail('не найдено'); return; }
                var params = attempts[idx++];
                try {
                    tmdb.full(params, function (data) {
                        if (data && (data.title || data.name || data.movie)) onSuccess(data.movie || data);
                        else tryNext();
                    }, function () { tryNext(); });
                } catch (e) { tryNext(); }
            }
            tryNext();
        } catch (e) { onFail('exception'); }
    }
    function enrichTop(onDone) {
        var top = getTop();
        var pending = Object.keys(top).filter(function (id) {
            var item = top[id];
            if (!item) return false;
            if (item.title && item.title.indexOf('ID ') === 0) return true;
            if (item.collectionChecked !== true) return true;
            return false;
        });
        if (!pending.length) { if (onDone) onDone(); return; }
        notify('Загружаю: 0/' + pending.length);
        var index = 0, ok = 0, fail = 0;
        function next() {
            if (index >= pending.length) {
                saveTop(top);
                notify('Готово. ОК: ' + ok + ', ошибок: ' + fail);
                if (onDone) onDone();
                return;
            }
            var id = pending[index++];
            fetchTMDB(id, function (data) {
                var info = extractCardInfo(data);
                if (info && info.id) {
                    var oldItem = top[id];
                    info.id = oldItem.id;
                    info.place = oldItem.place;
                    info.note = oldItem.note || '';
                    info.addedAt = oldItem.addedAt;
                    top[id] = info;
                    ok++;
                } else { if (top[id]) top[id].collectionChecked = true; fail++; }
                if ((index % 10 === 0) || index === pending.length) {
                    notify('Загружено: ' + index + '/' + pending.length + ' (ОК: ' + ok + ')');
                }
                setTimeout(next, 80);
            }, function () {
                if (top[id]) top[id].collectionChecked = true;
                fail++; setTimeout(next, 80);
            });
        }
        next();
    }

    // ============ UNITS (коллекции только если 2+ части) ============
    function getUnits() {
        var top = getTop();
        var colMap = {};
        var order = [];
        Object.keys(top).forEach(function (id) {
            var item = top[id];
            if (item.collectionId && item.collectionId > 0) {
                if (!colMap[item.collectionId]) {
                    colMap[item.collectionId] = [];
                    order.push({ type: 'col', cid: item.collectionId });
                }
                colMap[item.collectionId].push(id);
            } else {
                order.push({ type: 'single', id: id });
            }
        });

        var units = [];
        order.forEach(function (o) {
            if (o.type === 'single') {
                var it = top[o.id];
                units.push({
                    ids: [o.id], isCollection: false,
                    title: it.title, year: it.year, poster: it.poster,
                    place: it.place, addedAt: it.addedAt || 0,
                    note: it.note || ''
                });
            } else {
                var ids = colMap[o.cid];
                // Коллекция только если реально 2+ фильма в топе
                if (ids.length < 2) {
                    var it2 = top[ids[0]];
                    units.push({
                        ids: [ids[0]], isCollection: false,
                        title: it2.title, year: it2.year, poster: it2.poster,
                        place: it2.place, addedAt: it2.addedAt || 0,
                        note: it2.note || ''
                    });
                    return;
                }
                ids.sort(function (a, b) {
                    return (parseInt(top[a].year, 10) || 9999) - (parseInt(top[b].year, 10) || 9999);
                });
                var first = top[ids[0]];
                var p = null;
                for (var i = 0; i < ids.length; i++) { if (top[ids[i]].place) { p = top[ids[i]].place; break; } }
                var minAdded = Infinity;
                ids.forEach(function (x) { if ((top[x].addedAt || 0) < minAdded) minAdded = top[x].addedAt || 0; });
                var notes = [];
                ids.forEach(function (x) { if (top[x].note) notes.push(top[x].note); });
                units.push({
                    ids: ids, isCollection: true, collectionId: o.cid,
                    title: first.collectionName || first.title,
                    year: first.year, poster: first.poster,
                    place: p, addedAt: minAdded, count: ids.length,
                    note: notes.join(' • ')
                });
            }
        });
        return units;
    }
    function getSortedUnits() {
        var units = getUnits();
        units.sort(function (a, b) {
            if (a.place && b.place) return a.place - b.place;
            if (a.place) return -1;
            if (b.place) return 1;
            return (a.addedAt || 0) - (b.addedAt || 0);
        });
        return units;
    }
// ============ КОПИРОВАНИЕ ============
function copyToClipboard(text, onOk, onFail) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(onOk, function () { fallbackCopy(text, onOk, onFail); });
            return;
        }
    } catch (e) {}
    fallbackCopy(text, onOk, onFail);
}
function fallbackCopy(text, onOk, onFail) {
    try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) onOk(); else onFail();
    } catch (e) { onFail(); }
}
function buildTopText(withNotes) {
    var top = getTop();
    var units = getSortedUnits();
    var lines = ['Мой топ (' + units.length + '):', ''];
    units.forEach(function (u, i) {
        var num = u.place || (i + 1);
        if (u.isCollection) {
            lines.push(num + '. ' + u.title + ' (коллекция)');
            u.ids.forEach(function (id) {
                var it = top[id];
                lines.push('   - ' + it.title + ' (' + it.year + ')');
                if (withNotes && it.note) lines.push('     Заметка: ' + it.note);
            });
        } else {
            var it = top[u.ids[0]];
            var line = num + '. ' + it.title + ' (' + it.year + ')' + (it.isSeries ? ' [сериал]' : '');
            lines.push(line);
            if (withNotes && it.note) lines.push('   Заметка: ' + it.note);
        }
    });
    return lines.join('\n');
}

// ============ МОДАЛКА ЗАМЕТКИ (одиночная) ============
function editNote(id, onDone) {
    try {
        var top = getTop();
        var item = top[id];
        if (!item) return;
        var modal = $('<div>').css({
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        });
        var box = $('<div>').css({ background: '#1c1c22', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '500px' });
        box.append($('<div>').css({ color: '#fff', fontSize: '16px', marginBottom: '12px' }).text('Заметка к «' + item.title + '»'));
        var ta = $('<textarea>').css({
            width: '100%', height: '120px', background: '#0f0f12', color: '#e8e8ec',
            border: '1px solid #2c2c34', borderRadius: '8px', padding: '10px',
            fontSize: '14px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box'
        }).val(item.note || '');
        shieldInput(ta);
        var btnRow = $('<div>').css({ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' });
        var btnCancel = $('<div class="full-start__button selector"><span>Отмена</span></div>');
        var btnSave = $('<div class="full-start__button selector"><span>Сохранить</span></div>');
        btnRow.append(btnCancel).append(btnSave);
        box.append(ta).append(btnRow);
        modal.append(box);
        $('body').append(modal);
        modal.on('keydown keyup keypress', function (e) { e.stopPropagation(); });
        onceClick(btnCancel, function () { modal.remove(); });
        onceClick(btnSave, function () {
            var t = getTop();
            if (t[id]) { t[id].note = ta.val() || ''; saveTop(t); }
            modal.remove(); notify('Заметка сохранена');
            if (onDone) onDone();
        });
        setTimeout(function () { ta.focus(); }, 100);
    } catch (e) { console.error('[MyTop] editNote err:', e); }
}

// ============ МОДАЛКА ЗАМЕТОК ДЛЯ КОЛЛЕКЦИИ ============
function editCollectionNotes(ids, onDone) {
    try {
        var modal = $('<div>').css({
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        });
        var box = $('<div>').css({
            background: '#1c1c22', borderRadius: '12px', padding: '20px',
            width: '100%', maxWidth: '520px', maxHeight: '80vh', overflowY: 'auto'
        });
        box.append($('<div>').css({ color: '#fff', fontSize: '16px', marginBottom: '12px' }).text('Заметки к частям коллекции'));

        var textareas = {};
        var top = getTop();
        ids.forEach(function (id) {
            var item = top[id];
            if (!item) return;
            box.append($('<div>').css({ color: '#ffdd55', fontSize: '13px', marginTop: '10px', marginBottom: '6px' }).text(item.title + ' (' + item.year + ')'));
            var ta = $('<textarea>').css({
                width: '100%', height: '60px', background: '#0f0f12', color: '#e8e8ec',
                border: '1px solid #2c2c34', borderRadius: '8px', padding: '8px',
                fontSize: '13px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box'
            }).val(item.note || '');
            shieldInput(ta);
            textareas[id] = ta;
            box.append(ta);
        });

        var btnRow = $('<div>').css({ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' });
        var btnCancel = $('<div class="full-start__button selector"><span>Отмена</span></div>');
        var btnSave = $('<div class="full-start__button selector"><span>Сохранить</span></div>');
        btnRow.append(btnCancel).append(btnSave);
        box.append(btnRow);

        modal.append(box);
        $('body').append(modal);
        modal.on('keydown keyup keypress', function (e) { e.stopPropagation(); });

        onceClick(btnCancel, function () { modal.remove(); });
        onceClick(btnSave, function () {
            var t = getTop();
            Object.keys(textareas).forEach(function (id) {
                if (t[id]) t[id].note = textareas[id].val() || '';
            });
            saveTop(t);
            modal.remove(); notify('Заметки сохранены');
            if (onDone) onDone();
        });
    } catch (e) { console.error('[MyTop] editCollectionNotes err:', e); }
}

// ============ МОДАЛКА НОМЕРА ============
function editPlace(ids, onDone) {
    try {
        var top = getTop();
        var item = top[ids[0]];
        if (!item) return;
        var title = ids.length > 1 ? item.collectionName : item.title;
        var curPlace = '';
        ids.forEach(function (id) { if (top[id] && top[id].place) curPlace = top[id].place; });

        var modal = $('<div>').css({
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        });
        var box = $('<div>').css({ background: '#1c1c22', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '400px' });
        box.append($('<div>').css({ color: '#fff', fontSize: '16px', marginBottom: '12px' }).text('Место для «' + title + '»'));
        var inp = $('<input type="number" min="1">').css({
            width: '100%', background: '#0f0f12', color: '#e8e8ec',
            border: '1px solid #2c2c34', borderRadius: '8px', padding: '10px',
            fontSize: '16px', outline: 'none', boxSizing: 'border-box'
        }).val(curPlace);
        shieldInput(inp);
        box.append(inp);
        box.append($('<div>').css({ color: '#8a8a95', fontSize: '12px', marginTop: '8px' }).text('Пусто — без места. Применяется ко всем частям.'));
        var btnRow = $('<div>').css({ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' });
        var btnCancel = $('<div class="full-start__button selector"><span>Отмена</span></div>');
        var btnSave = $('<div class="full-start__button selector"><span>Сохранить</span></div>');
        btnRow.append(btnCancel).append(btnSave);
        box.append(btnRow);
        modal.append(box);
        $('body').append(modal);
        modal.on('keydown keyup keypress', function (e) { e.stopPropagation(); });

        onceClick(btnCancel, function () { modal.remove(); });
        onceClick(btnSave, function () {
            var val = parseInt(inp.val(), 10);
            var t = getTop();
            var newPlace = (isNaN(val) || val < 1) ? null : val;
            ids.forEach(function (id) { if (t[id]) t[id].place = newPlace; });
            saveTop(t);
            modal.remove();
            if (onDone) onDone();
        });
        setTimeout(function () { inp.focus(); }, 100);
    } catch (e) { console.error('[MyTop] editPlace err:', e); }
}
    function openMovieCard(item) {
        try {
            if (!window.Lampa || !Lampa.Activity || !Lampa.Activity.push) return;
            Lampa.Activity.push({
                url: '', component: 'full',
                id: item.id,
                method: item.isSeries ? 'tv' : 'movie',
                card: {},
                source: (Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null
            });
        } catch (e) { notify('Не удалось открыть'); }
    }

    function startSort(onDone) {
        try {
            var units = getUnits();
            var placed = units.filter(function (u) { return u.place; }).sort(function (a, b) { return a.place - b.place; });
            var unplaced = units.filter(function (u) { return !u.place; }).sort(function (a, b) { return (a.addedAt || 0) - (b.addedAt || 0); });
            if (!unplaced.length) { notify('Все уже расставлены'); if (onDone) onDone(); return; }

            var movieIdx = 0;
            function nextMovie() {
                if (movieIdx >= unplaced.length) { finish(); return; }
                var movie = unplaced[movieIdx];
                var lo = 0, hi = placed.length;
                function ask() {
                    if (lo >= hi) { placed.splice(lo, 0, movie); movieIdx++; nextMovie(); return; }
                    var mid = Math.floor((lo + hi) / 2);
                    showCompareDialog(movie, placed[mid], function (pick) {
                        if (pick === 'movie') hi = mid; else lo = mid + 1;
                        ask();
                    }, function () { notify('Сортировка отменена'); if (onDone) onDone(); });
                }
                ask();
            }
            function finish() {
                var t = getTop();
                placed.forEach(function (u, i) {
                    var place = i + 1;
                    u.ids.forEach(function (id) { if (t[id]) t[id].place = place; });
                });
                saveTop(t); notify('Сортировка завершена');
                if (onDone) onDone();
            }
            nextMovie();
        } catch (e) { console.error('[MyTop] sort err:', e); notify('Ошибка сортировки'); }
    }

    function showCompareDialog(a, b, onPick, onCancel) {
        try {
            var modal;
            var canceled = false;
            function unitTitle(u) { return u.isCollection ? u.title + ' (' + u.count + ')' : u.title; }
            function row(unit, pick) {
                var src = posterUrl(unit.poster, 'w300');
                var wrap = $('<div class="full-start__button selector">').css({
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', padding: '14px', cursor: 'pointer'
                });
                if (src) {
                    var img = $('<img>').attr('src', src).css({
                        width: '120px', height: '180px', objectFit: 'cover',
                        borderRadius: '6px', marginBottom: '10px', background: '#222'
                    });
                    img.on('error', function () {
                        var direct = 'https://image.tmdb.org/t/p/w300/' + String(unit.poster).replace(/^\/+/, '');
                        if (img.attr('src') !== direct) img.attr('src', direct); else img.hide();
                    });
                    wrap.append(img);
                }
                wrap.append($('<div>').css({ color: '#fff', fontSize: '14px', textAlign: 'center' }).text(unitTitle(unit)));
                wrap.append($('<div>').css({ color: '#8a8a95', fontSize: '12px', marginTop: '4px' }).text(unit.year || '—'));
                onceClick(wrap, function () { if (canceled) return; modal.remove(); onPick(pick); });
                return wrap;
            }
            modal = $('<div>').css({
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
                zIndex: 100000, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', padding: '20px'
            });
            modal.append($('<div>').css({ color: '#8a8a95', fontSize: '14px', marginBottom: '20px' }).text('Что лучше?'));
            var rowWrap = $('<div>').css({ display: 'flex', gap: '16px', width: '100%', maxWidth: '600px' });
            rowWrap.append(row(a, 'movie')).append(row(b, 'placed'));
            modal.append(rowWrap);
            var cancel = $('<div class="full-start__button selector" style="margin-top:24px;"><span>Отмена</span></div>');
            onceClick(cancel, function () { if (canceled) return; canceled = true; modal.remove(); onCancel(); });
            modal.append(cancel);
            $('body').append(modal);
        } catch (e) { console.error('[MyTop] compare err:', e); onCancel(); }
    }

    function MyTopComponent() {
        var html = $('<div class="my-top-page" style="height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>');

        function buildContent() {
            try {
                html.empty();
                var top = getTop();
                var units = getSortedUnits();

                var buttons = $('<div style="display:flex;gap:8px;padding:20px 20px 12px;flex-wrap:wrap;"></div>');
                var btnSort = $('<div class="full-start__button selector" style="flex:1;min-width:120px;"><span>Сортировать</span></div>');
                onceClick(btnSort, function () { startSort(buildContent); });
                buttons.append(btnSort);
                var btnCopy = $('<div class="full-start__button selector" style="flex:1;min-width:120px;"><span>Копировать</span></div>');
                onceClick(btnCopy, function () {
                    copyToClipboard(buildTopText(true),
                        function () { notify('Топ скопирован'); },
                        function () { notify('Не удалось скопировать'); });
                });
                buttons.append(btnCopy);
                var btnEnrich = $('<div class="full-start__button selector" style="flex:1;min-width:120px;"><span>Обновить данные</span></div>');
                onceClick(btnEnrich, function () { enrichTop(buildContent); });
                buttons.append(btnEnrich);
                html.append(buttons);

                html.append('<div style="margin:0 20px 20px;padding:12px;background:rgba(0,0,0,0.3);border-radius:8px;color:#8a8a95;font-size:12px;">Элементов: <b>' + units.length + '</b></div>');
                if (!units.length) {
                    html.append('<div style="padding:40px;text-align:center;color:#8a8a95;">Список пуст</div>');
                    return;
                }

                var list = $('<div style="padding:0 20px 120px;"></div>');
                units.forEach(function (u) {
                    var placeText = u.place ? '#' + u.place : '—';
                    var src = posterUrl(u.poster, 'w200');
                    var row = $('<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);"></div>');

                    var placeBtn = $('<div>').css({
                        fontSize: '22px', fontWeight: '700', color: '#ffdd55',
                        minWidth: '44px', textAlign: 'center', cursor: 'pointer', userSelect: 'none'
                    }).text(placeText);
                    onceClick(placeBtn, function () { editPlace(u.ids, buildContent); });
                    row.append(placeBtn);

                    var posterWrap = $('<div>').css({
                        width: '54px', height: '80px', borderRadius: '6px',
                        background: 'rgba(255,255,255,0.05)', flexShrink: 0,
                        cursor: 'pointer', overflow: 'hidden',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    });
                    if (src) {
                        var img = $('<img>').attr('src', src).css({ width: '100%', height: '100%', objectFit: 'cover', display: 'block' });
                        img.on('error', function () {
                            var direct = 'https://image.tmdb.org/t/p/w200/' + String(u.poster).replace(/^\/+/, '');
                            if (img.attr('src') !== direct) img.attr('src', direct); else img.remove();
                        });
                        posterWrap.append(img);
                    }
                    onceClick(posterWrap, function () { openMovieCard(top[u.ids[0]]); });
                    row.append(posterWrap);

                    var info = $('<div>').css({ flex: 1, minWidth: 0, cursor: 'pointer' });

                    // Мелкий жёлтый текст "КОЛЛЕКЦИЯ × N" НАД названием
                    if (u.isCollection) {
                        info.append($('<div>').css({
                            color: '#ffdd55', fontSize: '10px', fontWeight: '700',
                            letterSpacing: '0.5px', marginBottom: '2px'
                        }).text('КОЛЛЕКЦИЯ × ' + u.count));
                    }

                    var titleDiv = $('<div>').css({
                        fontSize: '16px', color: '#fff',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }).text(u.title);
                    if (!u.isCollection && top[u.ids[0]].isSeries) {
                        titleDiv.append(' ').append($('<span>').css({ color: '#ffdd55', fontSize: '11px' }).text('СЕРИАЛ'));
                    }
                    info.append(titleDiv);

                    if (u.isCollection) {
                        var parts = u.ids.map(function (id) { return top[id].title + ' (' + top[id].year + ')'; }).join(' · ');
                        info.append($('<div>').css({
                            fontSize: '12px', color: '#8a8a95', marginTop: '4px',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }).text(parts));
                    } else {
                        info.append($('<div>').css({ fontSize: '13px', color: '#8a8a95', marginTop: '4px' }).text(top[u.ids[0]].year || '—'));
                    }
                    if (u.note) {
                        info.append($('<div>').css({
                            fontSize: '12px', color: '#8a8a95', marginTop: '4px',
                            fontStyle: 'italic', overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }).text(u.note));
                    }
                    onceClick(info, function () { openMovieCard(top[u.ids[0]]); });
                    row.append(info);

                    var noteBtn = $('<div class="full-start__button selector" style="padding:8px 12px;"><span style="font-size:12px;">Заметка</span></div>');
                    onceClick(noteBtn, function () {
                        if (u.isCollection) editCollectionNotes(u.ids, buildContent);
                        else editNote(u.ids[0], buildContent);
                    });
                    row.append(noteBtn);

                    list.append(row);
                });
                html.append(list);
            } catch (e) {
                console.error('[MyTop] buildContent err:', e);
                html.append('<div style="padding:40px;text-align:center;color:#ff6666;">Ошибка: ' + e.message + '</div>');
            }
        }
        this.create = function () { importFavorites(true); buildContent(); return html; };
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

    var STAR_SVG_CARD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:2em;height:2em;min-width:2em;min-height:2em;display:block;flex:0 0 auto;"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
   var STAR_SVG_MENU = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:2em;height:2em;display:block;"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
    function addButtonToFull(e) {
        if (e.type !== 'complite') return;
        var movie = e.data && e.data.movie ? e.data.movie : null;
        if (!movie) return;
        setTimeout(function () {
            if ($('.my-top-btn-card').length > 0) return;
            var btn = $('<div class="full-start__button selector view--custom my-top-btn-card" style="display:flex;align-items:center;justify-content:center;">' + STAR_SVG_CARD + '</div>');
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
                var item = $('<li class="menu__item selector my-top-menu-item"><div class="menu__ico">' + STAR_SVG_MENU + '</div><div class="menu__text">Мой топ</div></li>');
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
        } catch (e) { console.error('[MyTop] start err:', e); }
    }
    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
})();
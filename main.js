// main.js — Автосборка плагина "Мой топ"
(function () {
    'use strict';

    // ===== src/01-utils.js =====
var PLUGIN_NAME = 'my_top_v31';
var STORAGE_KEY = 'my_movie_top_v14';
var LLM_KEY = 'my_top_llm_settings';

function notify(msg) { try { if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg); } catch (e) {} }
function rawGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function rawSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function parseJSON(s, d) { if (!s) return d; try { var p = JSON.parse(s); return p || d; } catch (e) { return d; } }

function getLLMSettings() {
    var s = parseJSON(rawGet(LLM_KEY, '{}'), {});
    return { apiUrl: s.apiUrl || '', apiKey: s.apiKey || '', model: s.model || 'gpt-4o-mini' };
}
function saveLLMSettings(s) { rawSet(LLM_KEY, JSON.stringify(s)); }

function shieldInput($el) { $el.on('keydown keyup keypress input', function (e) { e.stopPropagation(); }); return $el; }
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
    return 'https://image.tmdb.org/t/p/' + size + '/' + clean;
}
function isSeries(c) { return !!(c && (c.name || c.first_air_date || c.media_type === 'tv')); }

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
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) onOk(); else onFail();
    } catch (e) { onFail(); }
}
    // ===== src/02-data.js =====
function getTop() { var raw = rawGet(STORAGE_KEY, ''); if (!raw) return {}; var p = parseJSON(raw, {}); return (p && typeof p === 'object') ? p : {}; }
function saveTop(t) { return rawSet(STORAGE_KEY, JSON.stringify(t)); }

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
        place: null, note: '',
        source: 'manual',
        addedAt: Date.now()
    };
}
function addToTop(card) {
    var info = extractCardInfo(card);
    if (!info || !info.id) { notify('Не удалось определить'); return; }
    var top = getTop();
    if (top[info.id]) { notify('Уже в топе'); return; }
    top[info.id] = info;
    saveTop(top);

    try {
        if (window.Lampa && Lampa.Favorite && typeof Lampa.Favorite.add === 'function') {
            Lampa.Favorite.add('viewed', card);
        }
    } catch (e) {}

    notify('"' + info.title + '" → в топе (' + Object.keys(top).length + ')');
}

function removeFromTopAndViewed(ids) {
    var top = getTop();
    var idStrs = ids.map(String);

    ids.forEach(function (id) {
        delete top[id];
        delete top[String(id)];
    });
    saveTop(top);

    var units = getUnits();
    var placed = units.filter(function (u) { return u.place; }).sort(function (a, b) { return a.place - b.place; });
    placed.forEach(function (u, i) {
        u.ids.forEach(function (id) {
            if (top[id]) top[id].place = i + 1;
        });
    });
    saveTop(top);

    try {
        if (window.Lampa && Lampa.Favorite) {
            ids.forEach(function (id) {
                var numId = parseInt(id, 10) || id;
                if (typeof Lampa.Favorite.remove === 'function') {
                    Lampa.Favorite.remove('viewed', { id: numId });
                } else if (typeof Lampa.Favorite.toggle === 'function') {
                    Lampa.Favorite.toggle('viewed', { id: numId });
                }
            });
        }
        var fav = parseJSON(rawGet('favorite', ''), null);
        if (fav && fav.viewed) {
            if (Array.isArray(fav.viewed)) {
                fav.viewed = fav.viewed.filter(function (v) { return idStrs.indexOf(String(v)) === -1; });
            } else if (typeof fav.viewed === 'object') {
                idStrs.forEach(function (sid) { delete fav.viewed[sid]; });
            }
            if (Array.isArray(fav.card)) {
                fav.card = fav.card.filter(function (c) { return !c || idStrs.indexOf(String(c.id)) === -1; });
            }
            rawSet('favorite', JSON.stringify(fav));
        }
    } catch (e) { console.error('[MyTop] remove viewed err:', e); }
}

function syncWithFavorites(silent) {
    try {
        var fav = parseJSON(rawGet('favorite', ''), null);
        if (!fav) { if (!silent) notify('favorite не найден'); return { added: 0, removed: 0 }; }
        var viewedIds = fav.viewed;
        if (!viewedIds) { if (!silent) notify('Нет viewed'); return { added: 0, removed: 0 }; }

        var ids = Array.isArray(viewedIds) ? viewedIds : Object.keys(viewedIds);
        var viewedSet = {};
        ids.forEach(function (id) { viewedSet[String(id)] = true; });

        var top = getTop();
        var added = 0, removed = 0;
        var changed = false;

        Object.keys(top).forEach(function (id) {
            var item = top[id];
            if (!item) return;
            var wasFromFav = (item.source === 'favorites') || (!item.source);
            if (wasFromFav && !viewedSet[String(id)]) {
                delete top[id];
                removed++;
                changed = true;
            }
        });

        ids.forEach(function (id) {
            var sid = String(id);
            if (!top[sid]) {
                top[sid] = {
                    id: id, title: 'ID ' + id, year: '—', poster: '',
                    isSeries: false, collectionId: null, collectionName: null,
                    collectionChecked: false, place: null, note: '',
                    source: 'favorites',
                    addedAt: Date.now()
                };
                added++;
                changed = true;
            } else if (!top[sid].source) {
                top[sid].source = 'favorites';
            }
        });

        if (changed) saveTop(top);
        if (!silent && (added > 0 || removed > 0)) {
            var msg = [];
            if (added) msg.push('+' + added);
            if (removed) msg.push('−' + removed);
            notify('Синхронизация: ' + msg.join(', '));
        }
        return { added: added, removed: removed };
    } catch (e) { console.error('[MyTop] sync err:', e); return { added: 0, removed: 0 }; }
}
function importFavorites(silent) { return syncWithFavorites(silent); }
    // ===== src/03-tmdb.js =====
(function () {
    var ver = 'V11';
    function showVer() {
        setTimeout(function () { notify(ver); }, 600);
    }
    if (window.appready) showVer();
    else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') showVer(); });
    }
})();

function fetchTMDB(id, onSuccess, onFail) {
    try {
        var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
        if (!tmdb || !tmdb.full) { onFail('нет tmdb.full'); return; }
        var attempts = [ { id: id, method: 'movie', card: {} }, { id: id, method: 'tv', card: {} } ];
        var idx = 0;
        function tryNext() {
            if (idx >= attempts.length) { onFail('не найдено'); return; }
            var p = attempts[idx++];
            try {
                tmdb.full(p, function (d) {
                    if (d && (d.title || d.name || d.movie)) onSuccess(d.movie || d);
                    else tryNext();
                }, function () { tryNext(); });
            } catch (e) { tryNext(); }
        }
        tryNext();
    } catch (e) { onFail('exception'); }
}

function searchTMDBItem(item, callback) {
    var types = item.isSeries ? ['tv', 'movie'] : ['movie', 'tv'];

    function pickBest(results) {
        if (!results || !results.length) return null;
        var best = results[0];
        if (item.year) {
            for (var j = 0; j < results.length; j++) {
                var dt = results[j].release_date || results[j].first_air_date || '';
                if (parseInt(dt.substring(0, 4), 10) === item.year) {
                    best = results[j];
                    break;
                }
            }
        }
        return best;
    }

    function loadFull(best, type) {
        if (!best || !best.id) { callback(null); return; }
        var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
        if (tmdb && typeof tmdb.full === 'function') {
            try {
                tmdb.full({ id: best.id, method: type, card: {}, language: 'ru-RU' }, function (full) {
                    callback((full && (full.movie || full)) || best);
                }, function () {
                    callback(best);
                });
                return;
            } catch (e) {}
        }
        callback(best);
    }

    function extractResults(res) {
        var all = [];
        if (!res) return all;
        if (typeof res === 'string') {
            try { res = JSON.parse(res); } catch (e) { return all; }
        }
        if (Array.isArray(res)) {
            res.forEach(function (group) {
                if (group && Array.isArray(group.results)) all = all.concat(group.results);
                else if (group && group.id) all.push(group);
            });
        } else if (Array.isArray(res.results)) {
            all = res.results;
        }
        return all;
    }

    function tryNativeTmdbApi(ti) {
        if (!window.Lampa || !Lampa.TMDB || typeof Lampa.TMDB.api !== 'function' || ti >= types.length) {
            tryTmdbList(0);
            return;
        }
        var type = types[ti];
        var key = typeof Lampa.TMDB.key === 'function' ? Lampa.TMDB.key() : '';
        var lang = (Lampa.Storage && Lampa.Storage.field) ? Lampa.Storage.field('language') : 'ru';
        var path = 'search/' + type + '?api_key=' + key + '&language=' + lang + '&query=' + encodeURIComponent(item.title);
        var url = Lampa.TMDB.api(path);

        try {
            if (Lampa.Network && typeof Lampa.Network.silent === 'function') {
                Lampa.Network.silent(url, function (res) {
                    var results = extractResults(res);
                    if (results.length) loadFull(pickBest(results), type);
                    else tryNativeTmdbApi(ti + 1);
                }, function () {
                    tryNativeTmdbApi(ti + 1);
                });
                return;
            }
            if (typeof Lampa.Reguest === 'function') {
                var net = new Lampa.Reguest();
                net.silent(url, function (res) {
                    var results = extractResults(res);
                    if (results.length) loadFull(pickBest(results), type);
                    else tryNativeTmdbApi(ti + 1);
                }, function () {
                    tryNativeTmdbApi(ti + 1);
                });
                return;
            }
        } catch (e) {}
        tryTmdbList(0);
    }

    function tryTmdbList(ti) {
        var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
        if (!tmdb || typeof tmdb.list !== 'function' || ti >= types.length) {
            tryApiSearch();
            return;
        }
        var type = types[ti];
        var url = 'search/' + type + '?query=' + encodeURIComponent(item.title) + '&language=ru-RU';
        try {
            tmdb.list({ url: url }, function (res) {
                var results = extractResults(res);
                if (results.length) loadFull(pickBest(results), type);
                else tryTmdbList(ti + 1);
            }, function () {
                tryTmdbList(ti + 1);
            });
        } catch (e) {
            tryTmdbList(ti + 1);
        }
    }

    function tryApiSearch() {
        if (!window.Lampa || !Lampa.Api || typeof Lampa.Api.search !== 'function') {
            callback(null);
            return;
        }
        var finished = false;
        function handleRes(res) {
            if (finished) return;
            finished = true;
            var all = extractResults(res);
            var filtered = all.filter(function (r) {
                var isTV = !!(r.name || r.first_air_date || r.media_type === 'tv');
                return item.isSeries ? isTV : !isTV;
            });
            var best = pickBest(filtered.length ? filtered : all);
            if (best) {
                var detectedType = (best.name || best.first_air_date || best.media_type === 'tv') ? 'tv' : 'movie';
                loadFull(best, detectedType);
            } else {
                callback(null);
            }
        }
        try {
            Lampa.Api.search({
                query: item.title,
                onComplete: handleRes,
                onError: function () { if (!finished) { finished = true; callback(null); } }
            }, handleRes, function () { if (!finished) { finished = true; callback(null); } });
        } catch (e) {
            if (!finished) { finished = true; callback(null); }
        }
    }

    tryNativeTmdbApi(0);
}

function searchTMDBForRecommendation(rec, done) {
    searchTMDBItem({
        title: rec.title,
        year: rec.year ? parseInt(rec.year, 10) : null,
        isSeries: false
    }, done);
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
                info.source = oldItem.source || 'favorites';
                info.addedAt = oldItem.addedAt;
                top[id] = info;
                ok++;
            } else { if (top[id]) top[id].collectionChecked = true; fail++; }
            if ((index % 10 === 0) || index === pending.length) notify('Загружено: ' + index + '/' + pending.length + ' (ОК: ' + ok + ')');
            setTimeout(next, 80);
        }, function () {
            if (top[id]) top[id].collectionChecked = true;
            fail++; setTimeout(next, 80);
        });
    }
    next();
}

    // ===== src/04-units.js =====
function getUnits() {
    var top = getTop();
    var colMap = {}, order = [];
    Object.keys(top).forEach(function (id) {
        var item = top[id];
        if (item.collectionId && item.collectionId > 0) {
            if (!colMap[item.collectionId]) { colMap[item.collectionId] = []; order.push({ type: 'col', cid: item.collectionId }); }
            colMap[item.collectionId].push(id);
        } else order.push({ type: 'single', id: id });
    });
    var units = [];
    order.forEach(function (o) {
        if (o.type === 'single') {
            var it = top[o.id];
            units.push({ ids: [o.id], isCollection: false, title: it.title, year: it.year, poster: it.poster, place: it.place, addedAt: it.addedAt || 0, note: it.note || '' });
        } else {
            var ids = colMap[o.cid];
            if (ids.length < 2) {
                var it2 = top[ids[0]];
                units.push({ ids: [ids[0]], isCollection: false, title: it2.title, year: it2.year, poster: it2.poster, place: it2.place, addedAt: it2.addedAt || 0, note: it2.note || '' });
                return;
            }
            ids.sort(function (a, b) { return (parseInt(top[a].year, 10) || 9999) - (parseInt(top[b].year, 10) || 9999); });
            var first = top[ids[0]];
            var p = null;
            for (var i = 0; i < ids.length; i++) { if (top[ids[i]].place) { p = top[ids[i]].place; break; } }
            var minAdded = Infinity;
            ids.forEach(function (x) { if ((top[x].addedAt || 0) < minAdded) minAdded = top[x].addedAt || 0; });
            var notes = [];
            ids.forEach(function (x) { if (top[x].note) notes.push(top[x].note); });
            units.push({ ids: ids, isCollection: true, collectionId: o.cid, title: first.collectionName || first.title, year: first.year, poster: first.poster, place: p, addedAt: minAdded, count: ids.length, note: notes.join(' • ') });
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
                u.ids.forEach(function (id) { if (t[id]) t[id].place = i + 1; });
            });
            saveTop(t); notify('Сортировка завершена');
            if (onDone) onDone();
        }
        nextMovie();
    } catch (e) {}
}
function showCompareDialog(a, b, onPick, onCancel) {
    try {
        var modal;
        var canceled = false;
        function unitTitle(u) { return u.isCollection ? u.title + ' (' + u.count + ')' : u.title; }
        function row(unit, pick) {
            var src = posterUrl(unit.poster, 'w300');
            var wrap = $('<div class="full-start__button selector">').css({ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px', cursor: 'pointer' });
            if (src) {
                var img = $('<img>').attr('src', src).css({ width: '120px', height: '180px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px', background: '#222' });
                img.on('error', function () { var d = 'https://image.tmdb.org/t/p/w300/' + String(unit.poster).replace(/^\/+/, ''); if (img.attr('src') !== d) img.attr('src', d); else img.hide(); });
                wrap.append(img);
            }
            wrap.append($('<div>').css({ color: '#fff', fontSize: '14px', textAlign: 'center' }).text(unitTitle(unit)));
            wrap.append($('<div>').css({ color: '#8a8a95', fontSize: '12px', marginTop: '4px' }).text(unit.year || '—'));
            onceClick(wrap, function () { if (canceled) return; modal.remove(); onPick(pick); });
            return wrap;
        }
        modal = $('<div>').css({ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 100000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' });
        modal.append($('<div>').css({ color: '#8a8a95', fontSize: '14px', marginBottom: '20px' }).text('Что лучше?'));
        var rowWrap = $('<div>').css({ display: 'flex', gap: '16px', width: '100%', maxWidth: '600px' });
        rowWrap.append(row(a, 'movie')).append(row(b, 'placed'));
        modal.append(rowWrap);
        var cancel = $('<div class="full-start__button selector" style="margin-top:24px;"><span>Отмена</span></div>');
        onceClick(cancel, function () { if (canceled) return; canceled = true; modal.remove(); onCancel(); });
        modal.append(cancel);
        $('body').append(modal);
    } catch (e) { onCancel(); }
}
    // ===== src/05-text.js =====
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

function parseTopLine(raw) {
    var isSeries = false;
    if (/\[сериал\]\s*$/i.test(raw)) { isSeries = true; raw = raw.replace(/\s*\[сериал\]\s*$/i, '').trim(); }
    var year = null;
    var title = raw;
    var ym = raw.match(/\((\d{4})\)\s*$/);
    if (ym) { year = parseInt(ym[1], 10); title = raw.replace(/\s*\(\d{4}\)\s*$/, '').trim(); }
    if (!title) return null;
    return { title: title, year: year, isSeries: isSeries, note: '' };
}

function parseTopText(text) {
    var lines = String(text).split('\n');
    var items = [];
    var currentCol = null;
    var lastItem = null;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line || !line.trim()) continue;
        var nm = line.match(/^\s+Заметка:\s*(.*)$/);
        if (nm) { if (lastItem) lastItem.note = (nm[1] || '').trim(); continue; }
        var cm = line.match(/^\s*-\s+(.+)$/);
        if (cm) {
            if (currentCol) {
                var child = parseTopLine(cm[1].trim());
                if (child) { currentCol.children.push(child); lastItem = child; }
            }
            continue;
        }
        var mm = line.match(/^\s*\d+\.\s+(.+)$/);
        if (mm) {
            var raw = mm[1].trim();
            if (/\(коллекция\)\s*$/i.test(raw)) {
                var colTitle = raw.replace(/\s*\(коллекция\)\s*$/i, '').trim();
                currentCol = { title: colTitle, children: [] };
                items.push({ type: 'collection', data: currentCol });
                lastItem = null;
            } else {
                var single = parseTopLine(raw);
                if (single) { items.push({ type: 'single', data: single }); lastItem = single; currentCol = null; }
            }
        }
    }
    return items;
}

function importFromList(text, onDone) {
    var items = parseTopText(text);
    if (!items.length) { notify('Список пуст или не распознан'); if (onDone) onDone(); return; }

    var queue = [];
    items.forEach(function (it) {
        if (it.type === 'single') queue.push(it.data);
        else if (it.type === 'collection' && it.data.children.length) {
            it.data.children.forEach(function (c) { queue.push(c); });
        }
    });
    if (!queue.length) { notify('Нет фильмов для импорта'); if (onDone) onDone(); return; }

    var top = getTop();
    var hasAnyPlace = Object.keys(top).some(function (id) { return top[id] && top[id].place; });
    var wasEmpty = (Object.keys(top).length === 0) || !hasAnyPlace;
    var baseTime = Date.now();
    var idx = 0, added = 0, skipped = 0, notFound = 0;
    var total = queue.length;
    var importedOrder = [];
    notify('Импорт: 0/' + total);

    function next() {
        if (idx >= total) {
            saveTop(top);
            if (wasEmpty && importedOrder.length) {
                var units = getUnits();
                var placedCols = {};
                var placeNum = 1;
                importedOrder.forEach(function (id) {
                    var u = null;
                    for (var k = 0; k < units.length; k++) {
                        if (units[k].ids.map(String).indexOf(String(id)) !== -1) { u = units[k]; break; }
                    }
                    if (u) {
                        var key = u.isCollection ? 'col_' + u.collectionId : 'id_' + id;
                        if (!placedCols[key]) {
                            placedCols[key] = true;
                            u.ids.forEach(function (uid) { if (top[uid]) top[uid].place = placeNum; });
                            placeNum++;
                        }
                    }
                });
                saveTop(top);
            }
            var msg = 'Импорт: +' + added;
            if (skipped) msg += ', дубли: ' + skipped;
            if (notFound) msg += ', не найдено: ' + notFound;
            notify(msg);
            if (onDone) onDone();
            return;
        }
        var item = queue[idx++];
        if (idx % 3 === 0 || idx === total) notify('Импорт: ' + idx + '/' + total);
        searchTMDBItem(item, function (card) {
            if (!card || !card.id) { notFound++; setTimeout(next, 200); return; }
            var info = extractCardInfo(card);
            if (!info || !info.id) { notFound++; setTimeout(next, 200); return; }
            if (top[info.id]) {
                if (item.note && !top[info.id].note) top[info.id].note = item.note;
                importedOrder.push(info.id);
                skipped++; setTimeout(next, 200); return;
            }
            info.place = null;
            info.note = item.note || '';
            info.source = 'import';
            info.addedAt = baseTime + idx;
            top[info.id] = info;
            importedOrder.push(info.id);
            added++;

            try {
                if (window.Lampa && Lampa.Favorite && typeof Lampa.Favorite.add === 'function') {
                    Lampa.Favorite.add('viewed', card);
                }
            } catch (e) { console.error('[MyTop] Favorite.add err:', e); }

            setTimeout(next, 200);
        });
    }
    next();
}

function openImportDialog(onDone) {
    var modal = $('<div>').css({ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' });
    var box = $('<div>').css({ background: '#1c1c22', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '620px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' });
    box.append($('<div>').css({ color: '#fff', fontSize: '18px', marginBottom: '8px' }).text('Вставить список'));
    box.append($('<div>').css({ color: '#8a8a95', fontSize: '12px', marginBottom: '10px', lineHeight: '1.4' }).text('Формат как у «Копировать». Коллекции: «Название (коллекция)» + вложенные «- Фильм (год)». Заметки: «Заметка: ...». Сериалы: «[сериал]».'));
    var ta = $('<textarea>').attr('placeholder', 'Мой топ (N):\n\n1. Фильм (2020)\n   Заметка: ...\n2. Коллекция (коллекция)\n   - Фильм 1 (2019)\n   - Фильм 2 (2021)').css({ flex: 1, minHeight: '320px', background: '#0f0f12', color: '#e8e8ec', border: '1px solid #2c2c34', borderRadius: '8px', padding: '10px', fontSize: '13px', fontFamily: 'monospace', outline: 'none', resize: 'vertical', boxSizing: 'border-box' });
    shieldInput(ta);
    box.append(ta);
    var row = $('<div>').css({ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' });
    var bCancel = $('<div class="full-start__button selector"><span>Отмена</span></div>');
    var bOk = $('<div class="full-start__button selector"><span>Импортировать</span></div>');
    row.append(bCancel).append(bOk);
    box.append(row);
    modal.append(box);
    $('body').append(modal);
    modal.on('keydown keyup keypress', function (e) { e.stopPropagation(); });
    onceClick(bCancel, function () { modal.remove(); });
    onceClick(bOk, function () {
        var v = ta.val();
        if (!v || !v.trim()) { notify('Пусто'); return; }
        modal.remove();
        importFromList(v, onDone);
    });
    setTimeout(function () { try { ta.focus(); } catch (e) {} }, 100);
}

    // ===== src/07-modals.js =====
function editNote(id, onDone) {
    try {
        var top = getTop();
        var item = top[id];
        if (!item) return;
        var modal = $('<div>').css({ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' });
        var box = $('<div>').css({ background: '#1c1c22', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '500px' });
        box.append($('<div>').css({ color: '#fff', fontSize: '16px', marginBottom: '12px' }).text('Заметка к «' + item.title + '»'));
        var ta = $('<textarea>').css({ width: '100%', height: '120px', background: '#0f0f12', color: '#e8e8ec', border: '1px solid #2c2c34', borderRadius: '8px', padding: '10px', fontSize: '14px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }).val(item.note || '');
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
    } catch (e) {}
}
function editCollectionNotes(ids, onDone) {
    try {
        var modal = $('<div>').css({ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' });
        var box = $('<div>').css({ background: '#1c1c22', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '520px', maxHeight: '80vh', overflowY: 'auto' });
        box.append($('<div>').css({ color: '#fff', fontSize: '16px', marginBottom: '12px' }).text('Заметки к частям'));
        var textareas = {};
        var top = getTop();
        ids.forEach(function (id) {
            var item = top[id];
            if (!item) return;
            box.append($('<div>').css({ color: '#ffdd55', fontSize: '13px', marginTop: '10px', marginBottom: '6px' }).text(item.title + ' (' + item.year + ')'));
            var ta = $('<textarea>').css({ width: '100%', height: '60px', background: '#0f0f12', color: '#e8e8ec', border: '1px solid #2c2c34', borderRadius: '8px', padding: '8px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }).val(item.note || '');
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
            Object.keys(textareas).forEach(function (id) { if (t[id]) t[id].note = textareas[id].val() || ''; });
            saveTop(t); modal.remove(); notify('Заметки сохранены');
            if (onDone) onDone();
        });
    } catch (e) {}
}
function editPlace(ids, onDone) {
    try {
        var top = getTop();
        var item = top[ids[0]];
        if (!item) return;
        var title = ids.length > 1 ? item.collectionName : item.title;
        var curPlace = '';
        ids.forEach(function (id) { if (top[id] && top[id].place) curPlace = top[id].place; });
        var modal = $('<div>').css({ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' });
        var box = $('<div>').css({ background: '#1c1c22', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '400px' });
        box.append($('<div>').css({ color: '#fff', fontSize: '16px', marginBottom: '12px' }).text('Место для «' + title + '»'));
        var inp = $('<input type="number" min="1">').css({ width: '100%', background: '#0f0f12', color: '#e8e8ec', border: '1px solid #2c2c34', borderRadius: '8px', padding: '10px', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }).val(curPlace);
        shieldInput(inp);
        box.append(inp);
        box.append($('<div>').css({ color: '#8a8a95', fontSize: '12px', marginTop: '8px' }).text('Пусто — без места. Остальные сдвинутся.'));
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
            var units = getUnits();
            var myUnit = null, others = [];
            function sameIds(a, b) {
                if (a.length !== b.length) return false;
                var sa = a.map(String).slice().sort();
                var sb = b.map(String).slice().sort();
                for (var i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
                return true;
            }
            units.forEach(function (u) {
                if (sameIds(u.ids, ids)) myUnit = u;
                else others.push(u);
            });
            var t = getTop();
            if (isNaN(val) || val < 1) {
                ids.forEach(function (id) { if (t[id]) t[id].place = null; });
            } else {
                var placed = others.filter(function (u) { return u.place; }).sort(function (a, b) { return a.place - b.place; });
                var unplaced = others.filter(function (u) { return !u.place; }).sort(function (a, b) { return (a.addedAt || 0) - (b.addedAt || 0); });
                var targetIdx = Math.min(val - 1, placed.length);
                if (myUnit) placed.splice(targetIdx, 0, myUnit);
                placed.forEach(function (u, i) {
                    u.ids.forEach(function (id) { if (t[id]) t[id].place = i + 1; });
                });
                unplaced.forEach(function (u) {
                    u.ids.forEach(function (id) { if (t[id]) t[id].place = null; });
                });
            }
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
        Lampa.Activity.push({ url: '', component: 'full', id: item.id, method: item.isSeries ? 'tv' : 'movie', card: {}, source: (Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null });
    } catch (e) { notify('Не удалось открыть'); }
}
    // ===== src/08-component.js =====
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

})();

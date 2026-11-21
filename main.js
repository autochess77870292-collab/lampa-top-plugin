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
    var ver = 'V2';
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
                if (results.length) {
                    loadFull(pickBest(results), type);
                } else {
                    tryTmdbList(ti + 1);
                }
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

    tryTmdbList(0);
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
    var wasEmpty = Object.keys(top).length === 0;
    var baseTime = Date.now();
    var idx = 0, added = 0, skipped = 0, notFound = 0;
    var total = queue.length;
    notify('Импорт: 0/' + total);

    function next() {
        if (idx >= total) {
            if (wasEmpty) {
                var units = getUnits();
                units.sort(function (a, b) { return (a.addedAt || 0) - (b.addedAt || 0); });
                units.forEach(function (u, i) {
                    u.ids.forEach(function (id) { if (top[id]) top[id].place = i + 1; });
                });
            }
            saveTop(top);
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
                skipped++; setTimeout(next, 200); return;
            }
            info.place = null;
            info.note = item.note || '';
            info.source = 'import';
            info.addedAt = baseTime + idx;
            top[info.id] = info;
            added++;

            // Добавляем в "Просмотренные" Lampa
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
    // ===== src/06-llm.js =====
function buildLLMPrompt() {
    var text = buildTopText(true);
    return 'Ты — эксперт по кино. Вот мой персональный топ фильмов и сериалов (от лучшего к худшему):\n\n' + text +
        '\n\nПорекомендуй мне 10 фильмов или сериалов, которых НЕТ в этом списке, опираясь на жанры, темы и стиль моего топа.' +
        '\n\nОтветь СТРОГО в формате JSON, без markdown и без пояснений вокруг:' +
        '\n{"recommendations":[{"title":"Название","year":"2020","reason":"Почему подходит (1 предложение)"}]}';
}
function httpPost(url, headers, bodyStr, onOk, onErr) {
    try {
        if (window.Lampa && Lampa.Request && typeof Lampa.Request.native === 'function') {
            Lampa.Request.native(url, function (response) {
                try { onOk(typeof response === 'string' ? response : JSON.stringify(response)); }
                catch (e) { onErr('parse ' + e.message); }
            }, function (e) { onErr('native ' + (e && e.message ? e.message : 'fail')); },
            { method: 'POST', headers: headers, body: bodyStr });
            return;
        }
    } catch (e) {}
    try {
        fetch(url, { method: 'POST', headers: headers, body: bodyStr })
            .then(function (r) { return r.text(); })
            .then(function (t) { onOk(t); })
            .catch(function (e) { onErr('fetch ' + e.message); });
        return;
    } catch (e) {}
    onErr('нет способа отправить запрос');
}
function requestRecommendations(onOk, onErr) {
    var s = getLLMSettings();
    if (!s.apiUrl || !s.apiKey) { onErr('Укажи API URL и ключ в настройках'); return; }
    var url = s.apiUrl.replace(/\/+$/, '') + '/chat/completions';
    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey };
    var body = JSON.stringify({ model: s.model, messages: [{ role: 'user', content: buildLLMPrompt() }], temperature: 0.7 });
    notify('Запрос к нейросети...');
    httpPost(url, headers, body, function (text) {
        try {
            var resp = JSON.parse(text);
            var content = '';
            if (resp.choices && resp.choices[0] && resp.choices[0].message) content = resp.choices[0].message.content || '';
            else if (resp.content) content = resp.content;
            else { onErr('Неожиданный формат ответа'); return; }
            content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            var fb = content.indexOf('{');
            var lb = content.lastIndexOf('}');
            if (fb === -1 || lb === -1) { onErr('Ответ не содержит JSON'); return; }
            var json = JSON.parse(content.substring(fb, lb + 1));
            if (!json.recommendations || !Array.isArray(json.recommendations)) { onErr('Нет массива recommendations'); return; }
            onOk(json.recommendations);
        } catch (e) { onErr('Парсинг: ' + e.message); }
    }, onErr);
}

function openLLMSettings(onDone) {
    var s = getLLMSettings();
    var modal = $('<div>').css({ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' });
    var box = $('<div>').css({ background: '#1c1c22', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '520px', maxHeight: '85vh', overflowY: 'auto' });
    box.append($('<div>').css({ color: '#fff', fontSize: '18px', marginBottom: '16px' }).text('Настройки нейросети'));
    function field(label, placeholder, value, isPassword) {
        var wrap = $('<div>').css({ marginBottom: '14px' });
        wrap.append($('<div>').css({ color: '#8a8a95', fontSize: '12px', marginBottom: '6px' }).text(label));
        var input = $('<input>').attr('type', isPassword ? 'password' : 'text').attr('placeholder', placeholder).css({ width: '100%', background: '#0f0f12', color: '#e8e8ec', border: '1px solid #2c2c34', borderRadius: '8px', padding: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }).val(value || '');
        shieldInput(input);
        wrap.append(input);
        return { wrap: wrap, input: input };
    }
    var fUrl = field('API URL', 'https://api.deepseek.com/v1', s.apiUrl);
    var fKey = field('API Key', 'sk-...', s.apiKey, true);
    var fModel = field('Модель', 'deepseek-chat', s.model);
    box.append(fUrl.wrap).append(fKey.wrap).append(fModel.wrap);
    box.append($('<div>').css({ color: '#8a8a95', fontSize: '11px', lineHeight: '1.5', marginTop: '6px' }).html('OpenAI-совместимый API: DeepSeek, OpenRouter, Groq, Together. Ключ хранится только на устройстве.'));
    var btnRow = $('<div>').css({ display: 'flex', gap: '8px', marginTop: '18px', justifyContent: 'flex-end' });
    var btnCancel = $('<div class="full-start__button selector"><span>Отмена</span></div>');
    var btnSave = $('<div class="full-start__button selector"><span>Сохранить</span></div>');
    btnRow.append(btnCancel).append(btnSave);
    box.append(btnRow);
    modal.append(box);
    $('body').append(modal);
    modal.on('keydown keyup keypress', function (e) { e.stopPropagation(); });
    onceClick(btnCancel, function () { modal.remove(); });
    onceClick(btnSave, function () {
        saveLLMSettings({ apiUrl: fUrl.input.val().trim(), apiKey: fKey.input.val().trim(), model: fModel.input.val().trim() || 'gpt-4o-mini' });
        modal.remove();
        notify('Настройки сохранены');
        if (onDone) onDone();
    });
}

function showRecommendations(recs, onAddToTop) {
    var modal = $('<div>').css({ position: 'fixed', inset: 0, background: '#0f0f12', zIndex: 100001, display: 'flex', flexDirection: 'column' });
    var header = $('<div>').css({ padding: '16px 20px', background: '#1a1a20', display: 'flex', justifyContent: 'space-between', alignItems: 'center' });
    header.append($('<div>').css({ color: '#fff', fontSize: '18px' }).text('Рекомендации (' + recs.length + ')'));
    var btnClose = $('<div class="full-start__button selector"><span>Закрыть</span></div>');
    onceClick(btnClose, function () { modal.remove(); });
    header.append(btnClose);
    modal.append(header);
    var body = $('<div>').css({ flex: 1, overflowY: 'auto', padding: '16px 20px 60px' });
    modal.append(body);
    recs.forEach(function (rec) {
        var row = $('<div>').css({ display: 'flex', gap: '14px', padding: '14px', background: '#1c1c22', borderRadius: '10px', marginBottom: '12px', alignItems: 'flex-start' });
        var posterBox = $('<div>').css({ width: '70px', height: '105px', borderRadius: '6px', flexShrink: 0, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6a6a75', fontSize: '10px', textAlign: 'center' }).text('…');
        row.append(posterBox);
        var info = $('<div>').css({ flex: 1, minWidth: 0 });
        info.append($('<div>').css({ color: '#fff', fontSize: '15px', fontWeight: '600' }).text(rec.title || '?'));
        info.append($('<div>').css({ color: '#8a8a95', fontSize: '12px', marginTop: '2px' }).text(rec.year || ''));
        info.append($('<div>').css({ color: '#b0b0b8', fontSize: '13px', marginTop: '8px', lineHeight: '1.4' }).text(rec.reason || ''));
        row.append(info);
        var btnBox = $('<div>').css({ display: 'flex', flexDirection: 'column', gap: '6px' });
        var btnAdd = $('<div class="full-start__button selector" style="padding:8px 12px;"><span style="font-size:12px;">В топ</span></div>');
        onceClick(btnAdd, function () { if (rec._card) onAddToTop(rec._card); else notify('Данные ещё загружаются'); });
        btnBox.append(btnAdd);
        row.append(btnBox);
        body.append(row);
        searchTMDBForRecommendation(rec, function (card) {
            if (card) {
                rec._card = card;
                var src = posterUrl(card.poster_path, 'w200');
                if (src) {
                    var img = $('<img>').attr('src', src).css({ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' });
                    img.on('error', function () { img.remove(); posterBox.text('нет'); });
                    posterBox.empty().append(img);
                } else posterBox.text('нет');
            } else posterBox.text('не найдено');
        });
    });
    $('body').append(modal);
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
function MyTopComponent() {
    var html = $('<div class="my-top-page" style="height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>');

    function buildContent() {
        try {
            html.empty();
            var top = getTop();
            var units = getSortedUnits();

            var buttons = $('<div style="display:flex;gap:8px;padding:20px 20px 12px;flex-wrap:wrap;"></div>');

            var btnSort = $('<div class="full-start__button selector" style="flex:1;min-width:110px;"><span>Сортировать</span></div>');
            onceClick(btnSort, function () { startSort(buildContent); });
            buttons.append(btnSort);

            var btnCopy = $('<div class="full-start__button selector" style="flex:1;min-width:110px;"><span>Копировать</span></div>');
            onceClick(btnCopy, function () {
                copyToClipboard(buildTopText(true),
                    function () { notify('Топ скопирован'); },
                    function () { notify('Не удалось скопировать'); });
            });
            buttons.append(btnCopy);

            var btnImport = $('<div class="full-start__button selector" style="flex:1;min-width:110px;"><span>Вставить</span></div>');
            onceClick(btnImport, function () { openImportDialog(buildContent); });
            buttons.append(btnImport);

            var btnEnrich = $('<div class="full-start__button selector" style="flex:1;min-width:110px;"><span>Обновить</span></div>');
            onceClick(btnEnrich, function () { enrichTop(buildContent); });
            buttons.append(btnEnrich);

            var btnRec = $('<div class="full-start__button selector" style="flex:1;min-width:110px;"><span>Рекомендации</span></div>');
            onceClick(btnRec, function () {
                if (!getLLMSettings().apiUrl) { notify('Укажи API в настройках'); openLLMSettings(buildContent); return; }
                requestRecommendations(function (recs) {
                    showRecommendations(recs, function (card) { addToTop(card); });
                }, function (e) { notify('Ошибка: ' + e); });
            });
            buttons.append(btnRec);

            var btnSettings = $('<div class="full-start__button selector" style="flex:1;min-width:110px;"><span>Настройки ИИ</span></div>');
            onceClick(btnSettings, function () { openLLMSettings(buildContent); });
            buttons.append(btnSettings);

            html.append(buttons);
            html.append('<div style="margin:0 20px 20px;padding:12px;background:rgba(0,0,0,0.3);border-radius:8px;color:#8a8a95;font-size:12px;">Элементов: <b>' + units.length + '</b></div>');

            if (!units.length) { html.append('<div style="padding:40px;text-align:center;color:#8a8a95;">Список пуст</div>'); return; }

            var list = $('<div style="padding:0 20px 120px;"></div>');
            units.forEach(function (u) {
                var placeText = u.place ? '#' + u.place : '—';
                var src = posterUrl(u.poster, 'w200');
                var row = $('<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);"></div>');
                var placeBtn = $('<div>').css({ fontSize: '22px', fontWeight: '700', color: '#ffdd55', minWidth: '44px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }).text(placeText);
                onceClick(placeBtn, function () { editPlace(u.ids, buildContent); });
                row.append(placeBtn);
                var posterWrap = $('<div>').css({ width: '54px', height: '80px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', flexShrink: 0, cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' });
                if (src) {
                    var img = $('<img>').attr('src', src).css({ width: '100%', height: '100%', objectFit: 'cover', display: 'block' });
                    img.on('error', function () { var d = 'https://tmdb.org' + String(u.poster).replace(/^\/+/, ''); if (img.attr('src') !== d) img.attr('src', d); else img.remove(); });
                    posterWrap.append(img);
                }
                onceClick(posterWrap, function () { openMovieCard(top[u.ids[0]]); });
                row.append(posterWrap);
                var info = $('<div>').css({ flex: 1, minWidth: 0, cursor: 'pointer' });
                if (u.isCollection) info.append($('<div>').css({ color: '#ffdd55', fontSize: '10px', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '2px' }).text('КОЛЛЕКЦИЯ × ' + u.count));
                var titleDiv = $('<div>').css({ fontSize: '16px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }).text(u.title);
                if (!u.isCollection && top[u.ids[0]].isSeries) titleDiv.append(' ').append($('<span>').css({ color: '#ffdd55', fontSize: '11px' }).text('СЕРИАЛ'));
                info.append(titleDiv);
                if (u.isCollection) {
                    var parts = u.ids.map(function (id) { return top[id].title + ' (' + top[id].year + ')'; }).join(' · ');
                    info.append($('<div>').css({ fontSize: '12px', color: '#8a8a95', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }).text(parts));
                } else {
                    info.append($('<div>').css({ fontSize: '13px', color: '#8a8a95', marginTop: '4px' }).text(top[u.ids[0]].year || '—'));
                }
                if (u.note) info.append($('<div>').css({ fontSize: '12px', color: '#8a8a95', marginTop: '4px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }).text(u.note));
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
            html.append('<div style="padding:40px;text-align:center;color:#ff6666;">Ошибка: ' + e.message + '</div>');
        }
    }

    this.create = function () { syncWithFavorites(true); buildContent(); return html; };
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

var STAR_SVG_CARD = '<svg xmlns="http://w3.org" viewBox="0 0 24 24" style="width:2em;height:2em;min-width:2em;min-height:2em;display:block;flex:0 0 auto;"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
var STAR_SVG_MENU = '<svg xmlns="http://w3.org" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%;display:block;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

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
        notify('V1');
    } catch (e) {}
}
if (window.appready) startPlugin();
else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });

})();

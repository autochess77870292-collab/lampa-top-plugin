// main.js — Плагин "Мой топ" для Lampa (v31) — с LLM и синхронизацией
(function () {
    'use strict';

    var PLUGIN_NAME = 'my_top_v31';
    var STORAGE_KEY = 'my_movie_top_v14';
    var LLM_KEY = 'my_top_llm_settings';

    function notify(msg) { try { if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg); } catch (e) {} }
    function rawGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
    function rawSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    function parseJSON(s, d) { if (!s) return d; try { var p = JSON.parse(s); return p || d; } catch (e) { return d; } }
    function getTop() { var raw = rawGet(STORAGE_KEY, ''); if (!raw) return {}; var p = parseJSON(raw, {}); return (p && typeof p === 'object') ? p : {}; }
    function saveTop(t) { return rawSet(STORAGE_KEY, JSON.stringify(t)); }

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
        notify('"' + info.title + '" → в топе (' + Object.keys(top).length + ')');
    }

    // Синхронизация с "Просмотрено": удаляет из топа то, что убрано в Избранном,
    // и добавляет то, что появилось.
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

            // Удаляем из топа те, что были импортированы и больше не в viewed
            Object.keys(top).forEach(function (id) {
                var item = top[id];
                if (!item) return;
                // Считаем "из избранного" если source=favorites ИЛИ source не задан (старые записи)
                var wasFromFav = (item.source === 'favorites') || (!item.source);
                if (wasFromFav && !viewedSet[String(id)]) {
                    delete top[id];
                    removed++;
                    changed = true;
                }
            });

            // Добавляем новые из viewed
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
// ============ UNITS ============
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
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
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

// ============ LLM ============
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

// ============ НАСТРОЙКИ LLM ============
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

// ============ ОКНО РЕКОМЕНДАЦИЙ ============
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
        onceClick(btnAdd, function () {
            if (rec._card) onAddToTop(rec._card);
            else notify('Данные ещё загружаются');
        });
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
function searchTMDBForRecommendation(rec, done) {
    var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
    if (!tmdb || typeof tmdb.search !== 'function') { done(null); return; }
    try {
        tmdb.search({ query: rec.title, type: 'movie' }, function (res) {
            var m = null;
            try { if (res && res.results && res.results.length) m = res.results[0]; } catch (e) {}
            if (!m) { done(null); return; }
            if (typeof tmdb.full === 'function') {
                tmdb.full({ id: m.id, method: 'movie', card: {} }, function (full) { done((full && full.movie) || m); }, function () { done(m); });
            } else done(m);
        }, function () { done(null); });
    } catch (e) { done(null); }
}
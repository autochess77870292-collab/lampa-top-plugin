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

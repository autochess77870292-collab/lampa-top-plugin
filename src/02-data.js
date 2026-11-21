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

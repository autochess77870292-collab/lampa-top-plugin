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
        var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
        if (tmdb && typeof tmdb.full === 'function' && best && best.id) {
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

    if (window.Lampa && Lampa.Api && typeof Lampa.Api.search === 'function') {
        Lampa.Api.search({ query: item.title }, function (res) {
            var all = [];
            if (res) {
                if (Array.isArray(res)) {
                    res.forEach(function (group) {
                        if (group && Array.isArray(group.results)) all = all.concat(group.results);
                    });
                } else if (Array.isArray(res.results)) {
                    all = res.results;
                }
            }
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
        }, function () {
            callback(null);
        });
        return;
    }

    var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
    if (tmdb && typeof tmdb.list === 'function') {
        function tryType(ti) {
            if (ti >= types.length) { callback(null); return; }
            var type = types[ti];
            var url = 'search/' + type + '?query=' + encodeURIComponent(item.title) + '&language=ru-RU' + (item.year ? '&year=' + item.year : '');
            tmdb.list({ url: url }, function (res) {
                var results = (res && res.results) ? res.results : [];
                if (!results.length) { tryType(ti + 1); return; }
                loadFull(pickBest(results), type);
            }, function () { tryType(ti + 1); });
        }
        tryType(0);
        return;
    }

    callback(null);
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

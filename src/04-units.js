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
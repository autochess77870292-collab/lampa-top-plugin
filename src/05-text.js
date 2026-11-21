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

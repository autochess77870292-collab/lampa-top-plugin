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
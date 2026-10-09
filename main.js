// main.js — Плагин "Мой топ" для Lampa (v25)
(function () {
    'use strict';

    var PLUGIN_NAME = 'my_top_v25';
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

    function isSeries(c) { return !!(c && (c.name || c.first_air_date || c.media_type === 'tv')); }
    function extractCardInfo(card) {
        if (!card) return null;
        var isTV = isSeries(card);
        var title = isTV ? (card.name || card.original_name || 'Без названия') : (card.title || card.original_title || 'Без названия');
        var dateStr = isTV ? (card.first_air_date || '') : (card.release_date || '');
        return {
            id: card.id, title: title,
            year: dateStr ? dateStr.split('-')[0] : '—',
            poster: card.poster_path || '',
            isSeries: isTV, place: null, note: '', addedAt: Date.now()
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
                top[sid] = { id: id, title: 'ID ' + id, year: '—', poster: '', isSeries: false, place: null, note: '', addedAt: Date.now() };
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
            var attempts = [
                { id: id, method: 'movie', card: {} },
                { id: id, method: 'tv', card: {} }
            ];
            var idx = 0;
            function tryNext() {
                if (idx >= attempts.length) { onFail('не найдено'); return; }
                var params = attempts[idx++];
                try {
                    tmdb.full(params, function (data) {
                        if (data && (data.title || data.name || data.movie)) {
                            onSuccess(data.movie || data);
                        } else { tryNext(); }
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
            return item && item.title && item.title.indexOf('ID ') === 0;
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
                } else { fail++; }
                if ((index % 10 === 0) || index === pending.length) {
                    notify('Загружено: ' + index + '/' + pending.length + ' (ОК: ' + ok + ')');
                }
                setTimeout(next, 80);
            }, function () { fail++; setTimeout(next, 80); });
        }
        next();
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

    function buildTopText() {
        var top = getTop();
        var items = Object.keys(top).map(function (id) { return top[id]; });
        items.sort(function (a, b) {
            if (a.place && b.place) return a.place - b.place;
            if (a.place) return -1;
            if (b.place) return 1;
            return (a.addedAt || 0) - (b.addedAt || 0);
        });
        var lines = ['Мой топ (' + items.length + '):', ''];
        items.forEach(function (it, i) {
            var num = it.place || (i + 1);
            var line = num + '. ' + it.title + ' (' + it.year + ')' + (it.isSeries ? ' [сериал]' : '');
            if (it.note) line += ' — ' + it.note;
            lines.push(line);
        });
        return lines.join('\n');
    }
    // ============ МОДАЛКА ЗАМЕТКИ ============
    function editNote(id, onDone) {
        try {
            var top = getTop();
            var item = top[id];
            if (!item) return;
            var title = item.title;
            var note = item.note || '';

            var modal = $('<div>').css({
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
                zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            });
            var box = $('<div>').css({
                background: '#1c1c22', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '500px'
            });
            var header = $('<div>').css({ color: '#fff', fontSize: '16px', marginBottom: '12px' }).text('Заметка к «' + title + '»');
            var ta = $('<textarea>').css({
                width: '100%', height: '120px', background: '#0f0f12', color: '#e8e8ec',
                border: '1px solid #2c2c34', borderRadius: '8px', padding: '10px',
                fontSize: '14px', fontFamily: 'inherit', outline: 'none', resize: 'vertical',
                boxSizing: 'border-box'
            }).val(note);
            var btnRow = $('<div>').css({ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' });
            var btnCancel = $('<div class="full-start__button selector"><span>Отмена</span></div>');
            var btnSave = $('<div class="full-start__button selector"><span>Сохранить</span></div>');
            btnRow.append(btnCancel).append(btnSave);
            box.append(header).append(ta).append(btnRow);
            modal.append(box);
            $('body').append(modal);

            btnCancel.on('click', function () { modal.remove(); });
            btnSave.on('click', function () {
                var val = ta.val() || '';
                var t = getTop();
                if (t[id]) { t[id].note = val; saveTop(t); }
                modal.remove();
                notify('Заметка сохранена');
                if (onDone) onDone();
            });
        } catch (e) {
            console.error('[MyTop] editNote err:', e);
            notify('Ошибка заметки');
        }
    }

    // ============ МОДАЛКА НОМЕРА ============
    function editPlace(id, onDone) {
        try {
            var top = getTop();
            var item = top[id];
            if (!item) return;
            var title = item.title;
            var curPlace = item.place || '';

            var modal = $('<div>').css({
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
                zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            });
            var box = $('<div>').css({
                background: '#1c1c22', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '400px'
            });
            var header = $('<div>').css({ color: '#fff', fontSize: '16px', marginBottom: '12px' }).text('Место для «' + title + '»');
            var inp = $('<input type="number" min="1">').css({
                width: '100%', background: '#0f0f12', color: '#e8e8ec',
                border: '1px solid #2c2c34', borderRadius: '8px', padding: '10px',
                fontSize: '16px', outline: 'none', boxSizing: 'border-box'
            }).val(curPlace);
            var hint = $('<div>').css({ color: '#8a8a95', fontSize: '12px', marginTop: '8px' }).text('Пусто — без места');
            var btnRow = $('<div>').css({ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' });
            var btnCancel = $('<div class="full-start__button selector"><span>Отмена</span></div>');
            var btnSave = $('<div class="full-start__button selector"><span>Сохранить</span></div>');
            btnRow.append(btnCancel).append(btnSave);
            box.append(header).append(inp).append(hint).append(btnRow);
            modal.append(box);
            $('body').append(modal);

            btnCancel.on('click', function () { modal.remove(); });
            btnSave.on('click', function () {
                var val = parseInt(inp.val(), 10);
                var t = getTop();
                if (t[id]) {
                    t[id].place = (isNaN(val) || val < 1) ? null : val;
                    saveTop(t);
                }
                modal.remove();
                if (onDone) onDone();
            });
        } catch (e) {
            console.error('[MyTop] editPlace err:', e);
            notify('Ошибка места');
        }
    }

    // ============ ОТКРЫТИЕ КАРТОЧКИ ============
    function openMovieCard(item) {
        try {
            if (!window.Lampa || !Lampa.Activity || !Lampa.Activity.push) {
                notify('Навигация недоступна'); return;
            }
            Lampa.Activity.push({
                url: '',
                component: 'full',
                id: item.id,
                method: item.isSeries ? 'tv' : 'movie',
                card: {},
                source: (Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null
            });
        } catch (e) {
            console.error('[MyTop] openCard err:', e);
            notify('Не удалось открыть');
        }
    }

    // ============ СОРТИРОВКА ============
    function startSort(onDone) {
        try {
            var top = getTop();
            var placed = Object.keys(top)
                .filter(function (id) { return top[id].place; })
                .map(function (id) { return top[id]; })
                .sort(function (a, b) { return a.place - b.place; });

            var unplaced = Object.keys(top)
                .filter(function (id) { return !top[id].place; })
                .map(function (id) { return top[id]; })
                .sort(function (a, b) { return (a.addedAt || 0) - (b.addedAt || 0); });

            if (!unplaced.length) { notify('Все уже расставлены'); if (onDone) onDone(); return; }

            var movieIdx = 0;

            function nextMovie() {
                if (movieIdx >= unplaced.length) { finish(); return; }
                var movie = unplaced[movieIdx];
                var lo = 0, hi = placed.length;

                function ask() {
                    if (lo >= hi) {
                        placed.splice(lo, 0, movie);
                        movieIdx++;
                        nextMovie();
                        return;
                    }
                    var mid = Math.floor((lo + hi) / 2);
                    showCompareDialog(movie, placed[mid], function (pick) {
                        if (pick === 'movie') hi = mid;
                        else lo = mid + 1;
                        ask();
                    }, function () {
                        notify('Сортировка отменена');
                        if (onDone) onDone();
                    });
                }
                ask();
            }

            function finish() {
                var t = getTop();
                placed.forEach(function (m, i) { if (t[m.id]) t[m.id].place = i + 1; });
                saveTop(t);
                notify('Сортировка завершена');
                if (onDone) onDone();
            }

            nextMovie();
        } catch (e) {
            console.error('[MyTop] sort err:', e);
            notify('Ошибка сортировки');
        }
    }

    function showCompareDialog(a, b, onPick, onCancel) {
        try {
            var modal;
            function row(item, pick) {
                var poster = item.poster ? 'https://image.tmdb.org/t/p/w200' + item.poster : '';
                var wrap = $('<div class="full-start__button selector">').css({
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', padding: '14px', cursor: 'pointer'
                });
                if (poster) {
                    var img = $('<img>').attr('src', poster).css({
                        width: '100px', height: '150px', objectFit: 'cover',
                        borderRadius: '6px', marginBottom: '10px'
                    });
                    wrap.append(img);
                }
                wrap.append($('<div>').css({ color: '#fff', fontSize: '14px', textAlign: 'center' }).text(item.title));
                wrap.append($('<div>').css({ color: '#8a8a95', fontSize: '12px', marginTop: '4px' }).text(item.year));
                wrap.on('click', function () { modal.remove(); onPick(pick); });
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
            cancel.on('click', function () { modal.remove(); onCancel(); });
            modal.append(cancel);

            $('body').append(modal);
        } catch (e) {
            console.error('[MyTop] compare err:', e);
            onCancel();
        }
    }

    // ============ КОМПОНЕНТ ============
    function MyTopComponent() {
        var html = $('<div class="my-top-page" style="height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>');

        function buildContent() {
            try {
                html.empty();
                var top = getTop();
                var ids = Object.keys(top);

                var buttons = $('<div style="display:flex;gap:8px;padding:20px 20px 12px;flex-wrap:wrap;"></div>');

                var btnSort = $('<div class="full-start__button selector" style="flex:1;min-width:120px;"><span>Сортировать</span></div>');
                btnSort.on('hover:enter click', function () { startSort(buildContent); });
                buttons.append(btnSort);

                var btnCopy = $('<div class="full-start__button selector" style="flex:1;min-width:120px;"><span>Копировать</span></div>');
                btnCopy.on('hover:enter click', function () {
                    var text = buildTopText();
                    copyToClipboard(text,
                        function () { notify('Топ скопирован'); },
                        function () { notify('Не удалось скопировать'); }
                    );
                });
                buttons.append(btnCopy);

                var btnEnrich = $('<div class="full-start__button selector" style="flex:1;min-width:120px;"><span>Обновить названия</span></div>');
                btnEnrich.on('hover:enter click', function () { enrichTop(buildContent); });
                buttons.append(btnEnrich);

                html.append(buttons);

                html.append('<div style="margin:0 20px 20px;padding:12px;background:rgba(0,0,0,0.3);border-radius:8px;color:#8a8a95;font-size:12px;">Элементов: <b>' + ids.length + '</b></div>');

                if (!ids.length) {
                    html.append('<div style="padding:40px;text-align:center;color:#8a8a95;">Список пуст</div>');
                    return;
                }

                var items = ids.map(function (id) { return top[id]; });
                items.sort(function (a, b) {
                    if (a.place && b.place) return a.place - b.place;
                    if (a.place) return -1;
                    if (b.place) return 1;
                    return (a.addedAt || 0) - (b.addedAt || 0);
                });

                var list = $('<div style="padding:0 20px 120px;"></div>');

                items.forEach(function (item) {
                    var placeText = item.place ? '#' + item.place : '—';
                    var poster = item.poster ? 'https://image.tmdb.org/t/p/w200' + item.poster : '';

                    var row = $('<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);"></div>');

                    var placeBtn = $('<div>').css({
                        fontSize: '22px', fontWeight: '700', color: '#ffdd55',
                        minWidth: '44px', textAlign: 'center', cursor: 'pointer', userSelect: 'none'
                    }).text(placeText);
                    placeBtn.on('click', function () { editPlace(item.id, buildContent); });
                    row.append(placeBtn);

                    if (poster) {
                        var img = $('<img>').attr('src', poster).css({
                            width: '54px', height: '80px', objectFit: 'cover',
                            borderRadius: '6px', cursor: 'pointer'
                        });
                        img.on('error', function () { img.hide(); });
                        img.on('click', function () { openMovieCard(item); });
                        row.append(img);
                    }

                    var info = $('<div>').css({ flex: 1, minWidth: 0, cursor: 'pointer' });
                    var titleDiv = $('<div>').css({
                        fontSize: '16px', color: '#fff',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }).text(item.title);
                    if (item.isSeries) {
                        titleDiv.append(' ').append($('<span>').css({ color: '#ffdd55', fontSize: '11px' }).text('СЕРИАЛ'));
                    }
                    info.append(titleDiv);
                    info.append($('<div>').css({ fontSize: '13px', color: '#8a8a95', marginTop: '4px' }).text(item.year || '—'));
                    if (item.note) {
                        info.append($('<div>').css({
                            fontSize: '12px', color: '#8a8a95', marginTop: '4px',
                            fontStyle: 'italic', overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }).text(item.note));
                    }
                    info.on('click', function () { openMovieCard(item); });
                    row.append(info);

                    var noteBtn = $('<div class="full-start__button selector" style="padding:8px 12px;"><span style="font-size:12px;">Заметка</span></div>');
                    noteBtn.on('click', function () { editNote(item.id, buildContent); });
                    row.append(noteBtn);

                    list.append(row);
                });

                html.append(list);
            } catch (e) {
                console.error('[MyTop] buildContent err:', e);
                html.append('<div style="padding:40px;text-align:center;color:#ff6666;">Ошибка отрисовки: ' + e.message + '</div>');
            }
        }

        this.create = function () {
            importFavorites(true);
            buildContent();
            return html;
        };
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
            var busy = false;
            btn.on('click', function () {
                if (busy) return;
                busy = true;
                setTimeout(function () { busy = false; }, 700);
                addToTop(movie);
            });
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
                item.on('click hover:enter', openTopPage);
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
            notify('Плагин "Мой топ" v25 запущен');
        } catch (e) { console.error('[MyTop] start err:', e); }
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
})();

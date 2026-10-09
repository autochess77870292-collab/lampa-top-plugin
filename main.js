// main.js — Плагин "Мой топ" для Lampa (v24)
(function () {
    'use strict';

    var PLUGIN_NAME = 'my_top_v24';
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
    }

    function fetchTMDB(id, onSuccess, onFail) {
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

    // ============ ДИАЛОГ ЗАМЕТКИ ============
    function editNote(id, onDone) {
        var top = getTop();
        var item = top[id];
        if (!item) return;
        var modal = $(
            '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;">' +
            '<div style="background:#1c1c22;border-radius:12px;padding:20px;width:100%;max-width:500px;">' +
            '<div style="color:#fff;font-size:16px;margin-bottom:12px;">Заметка к «' + item.title + '»</div>' +
            '<textarea id="my-top-note-input" style="width:100%;height:120px;background:#0f0f12;color:#e8e8ec;border:1px solid #2c2c34;border-radius:8px;padding:10px;font-size:14px;font-family:inherit;outline:none;resize:vertical;">' + (item.note || '') + '</textarea>' +
            '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">' +
            '<div class="full-start__button selector" id="my-top-note-cancel"><span>Отмена</span></div>' +
            '<div class="full-start__button selector" id="my-top-note-save"><span>Сохранить</span></div>' +
            '</div></div></div>'
        );
        $('body').append(modal);
        var $ta = modal.find('#my-top-note-input');
        $ta.focus();
        modal.find('#my-top-note-cancel').on('click', function () { modal.remove(); });
        modal.find('#my-top-note-save').on('click', function () {
            var val = $ta.val() || '';
            var t = getTop();
            if (t[id]) { t[id].note = val; saveTop(t); }
            modal.remove();
            notify('Заметка сохранена');
            if (onDone) onDone();
        });
    }

    // ============ ДИАЛОГ НОМЕРА ============
    function editPlace(id, onDone) {
        var top = getTop();
        var item = top[id];
        if (!item) return;
        var modal = $(
            '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;">' +
            '<div style="background:#1c1c22;border-radius:12px;padding:20px;width:100%;max-width:400px;">' +
            '<div style="color:#fff;font-size:16px;margin-bottom:12px;">Место для «' + item.title + '»</div>' +
            '<input id="my-top-place-input" type="number" min="1" value="' + (item.place || '') + '" style="width:100%;background:#0f0f12;color:#e8e8ec;border:1px solid #2c2c34;border-radius:8px;padding:10px;font-size:16px;outline:none;">' +
            '<div style="color:#8a8a95;font-size:12px;margin-top:8px;">Пусто — оставить без места</div>' +
            '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">' +
            '<div class="full-start__button selector" id="my-top-place-cancel"><span>Отмена</span></div>' +
            '<div class="full-start__button selector" id="my-top-place-save"><span>Сохранить</span></div>' +
            '</div></div></div>'
        );
        $('body').append(modal);
        var $inp = modal.find('#my-top-place-input');
        $inp.focus();
        modal.find('#my-top-place-cancel').on('click', function () { modal.remove(); });
        modal.find('#my-top-place-save').on('click', function () {
            var val = parseInt($inp.val(), 10);
            var t = getTop();
            if (t[id]) {
                t[id].place = (isNaN(val) || val < 1) ? null : val;
                saveTop(t);
            }
            modal.remove();
            if (onDone) onDone();
        });
    }

    // ============ ОТКРЫТИЕ КАРТОЧКИ ============
    function openMovieCard(item) {
        try {
            Lampa.Activity.push({
                url: '',
                component: 'full',
                id: item.id,
                method: item.isSeries ? 'tv' : 'movie',
                card: {},
                source: Lampa.Api.sources.tmdb
            });
        } catch (e) { notify('Не удалось открыть: ' + e.message); }
    }

    // ============ СОРТИРОВКА ПОПАРНО ============
    // Показывает два фильма и спрашивает какой лучше. Собирает места 1..N.
    function startSort(onDone) {
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
                    // отмена
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
    }

    function showCompareDialog(a, b, onPick, onCancel) {
        function row(item) {
            var poster = item.poster ? 'https://image.tmdb.org/t/p/w200' + item.poster : '';
            return '<div class="full-start__button selector" data-pick="' + (item === a ? 'movie' : 'placed') + '" ' +
                'style="flex:1;display:flex;flex-direction:column;align-items:center;padding:14px;cursor:pointer;">' +
                (poster ? '<img src="' + poster + '" style="width:100px;height:150px;object-fit:cover;border-radius:6px;margin-bottom:10px;">' : '') +
                '<div style="color:#fff;font-size:14px;text-align:center;">' + item.title + '</div>' +
                '<div style="color:#8a8a95;font-size:12px;margin-top:4px;">' + item.year + '</div>' +
                '</div>';
        }
        var modal = $(
            '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;">' +
            '<div style="color:#8a8a95;font-size:14px;margin-bottom:20px;">Что лучше?</div>' +
            '<div style="display:flex;gap:16px;width:100%;max-width:600px;">' +
            row(a) + row(b) +
            '</div>' +
            '<div class="full-start__button selector" id="my-top-cmp-cancel" style="margin-top:24px;"><span>Отмена</span></div>' +
            '</div>'
        );
        $('body').append(modal);
        modal.find('[data-pick]').on('click', function () {
            var pick = $(this).data('pick');
            modal.remove();
            onPick(pick);
        });
        modal.find('#my-top-cmp-cancel').on('click', function () {
            modal.remove();
            onCancel();
        });
    }

    // ============ КОМПОНЕНТ ============
    function MyTopComponent() {
        var html = $('<div class="my-top-page" style="height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>');

        function buildContent() {
            html.empty();
            var top = getTop();
            var ids = Object.keys(top);

            // Тулбар
            var buttons = $('<div style="display:flex;gap:8px;padding:20px 20px 12px;"></div>');

            var btnSort = $('<div class="full-start__button selector" style="flex:1;"><span>Сортировать</span></div>');
            btnSort.on('hover:enter click', function () { startSort(buildContent); });
            buttons.append(btnSort);

            var btnCopy = $('<div class="full-start__button selector" style="flex:1;"><span>Копировать</span></div>');
            btnCopy.on('hover:enter click', function () {
                var text = buildTopText();
                copyToClipboard(text,
                    function () { notify('Топ скопирован'); },
                    function () { notify('Не удалось скопировать'); }
                );
            });
            buttons.append(btnCopy);

            var btnEnrich = $('<div class="full-start__button selector" style="flex:1;"><span>Обновить названия</span></div>');
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
                var notePreview = item.note ? '<div style="font-size:12px;color:#8a8a95;margin-top:4px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + item.note + '</div>' : '';

                var row = $(
                    '<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);">' +
                    '<div class="my-top-place-btn" style="font-size:22px;font-weight:700;color:#ffdd55;min-width:44px;text-align:center;cursor:pointer;user-select:none;">' + placeText + '</div>' +
                    (poster ? '<img class="my-top-poster" src="' + poster + '" style="width:54px;height:80px;object-fit:cover;border-radius:6px;cursor:pointer;" onerror="this.style.display=\'none\'">' : '') +
                    '<div class="my-top-open" style="flex:1;min-width:0;cursor:pointer;">' +
                    '<div style="font-size:16px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + item.title + (item.isSeries ? ' <span style="color:#ffdd55;font-size:11px;">СЕРИАЛ</span>' : '') + '</div>' +
                    '<div style="font-size:13px;color:#8a8a95;margin-top:4px;">' + (item.year || '—') + '</div>' +
                    notePreview +
                    '</div>' +
                    '<div class="my-top-note-btn full-start__button selector" style="padding:8px 12px;" title="Заметка"><span style="font-size:12px;">Заметка</span></div>' +
                    '</div>'
                );

                row.find('.my-top-place-btn').on('click', function () {
                    editPlace(item.id, buildContent);
                });
                row.find('.my-top-poster, .my-top-open').on('click', function () {
                    openMovieCard(item);
                });
                row.find('.my-top-note-btn').on('click', function () {
                    editNote(item.id, buildContent);
                });

                list.append(row);
            });

            html.append(list);
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
    var STAR_SVG_MENU = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0
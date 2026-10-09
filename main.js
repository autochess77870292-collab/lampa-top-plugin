// main.js — Плагин "Мой топ" для Lampa (v17)
// Обогащение через tmdb.full. Исправлен значок в меню.
(function () {
    'use strict';

    var PLUGIN_NAME = 'my_top_v17';
    var STORAGE_KEY = 'my_movie_top_v14'; // тот же ключ — фильмы не пропадут

    function notify(msg) {
        try {
            if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg);
        } catch (e) {}
    }

    function rawGet(key, def) {
        try { var v = localStorage.getItem(key); return (v === null) ? def : v; }
        catch (e) { return def; }
    }
    function rawSet(key, val) {
        try { localStorage.setItem(key, val); return true; } catch (e) { return false; }
    }
    function parseJSON(str, def) {
        if (!str) return def;
        try { var p = JSON.parse(str); return p || def; } catch (e) { return def; }
    }

    function getTop() {
        var raw = rawGet(STORAGE_KEY, '');
        if (!raw) return {};
        var p = parseJSON(raw, {});
        return (p && typeof p === 'object') ? p : {};
    }
    function saveTop(top) { return rawSet(STORAGE_KEY, JSON.stringify(top)); }

    function isSeries(c) {
        return !!(c && (c.name || c.first_air_date || c.media_type === 'tv' || c.number_of_seasons !== undefined));
    }
    function extractCardInfo(card) {
        if (!card) return null;
        var isTV = isSeries(card);
        var title = isTV ? (card.name || card.original_name || 'Без названия') : (card.title || card.original_title || 'Без названия');
        var dateStr = isTV ? (card.first_air_date || '') : (card.release_date || '');
        return {
            id: card.id,
            title: title,
            year: dateStr ? dateStr.split('-')[0] : '—',
            poster: card.poster_path || '',
            isSeries: isTV,
            place: null,
            addedAt: Date.now()
        };
    }
    function addToTop(card) {
        var info = extractCardInfo(card);
        if (!info || !info.id) { notify('Не удалось определить карточку'); return; }
        var top = getTop();
        if (top[info.id]) { notify('Уже в топе'); return; }
        top[info.id] = info;
        saveTop(top);
        notify('"' + info.title + '" → в топе (' + Object.keys(top).length + ')');
    }

    function importFavorites() {
        var fav = parseJSON(rawGet('favorite', ''), null);
        if (!fav) { notify('favorite не найден'); return; }
        var viewedIds = fav.viewed;
        if (!viewedIds) { notify('Нет viewed'); return; }
        var ids = Array.isArray(viewedIds) ? viewedIds : Object.keys(viewedIds);
        if (ids.length === 0) { notify('viewed пуст'); return; }

        var top = getTop();
        var added = 0;
        ids.forEach(function (id) {
            var sid = String(id);
            if (top[sid]) return;
            top[sid] = {
                id: id, title: 'ID ' + id, year: '—', poster: '',
                isSeries: false, place: null, addedAt: Date.now()
            };
            added++;
        });
        saveTop(top);
        notify('Импортировано: ' + added);
    }

    // ============ ЗАПРОС В TMDB (через tmdb.full) ============
    function tmdbRequest(id, onSuccess, onFail) {
        var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
        if (!tmdb || !tmdb.full) { onFail('нет tmdb.full'); return; }

        // Пробуем разные комбинации method
        var attempts = [
            { method: 'movie', id: id },
            { method: 'tv', id: id }
        ];

        var idx = 0;
        function tryNext() {
            if (idx >= attempts.length) { onFail('все варианты не сработали'); return; }
            var params = attempts[idx++];
            try {
                tmdb.full(params, function (data) {
                    if (data && (data.title || data.name || data.id)) {
                        onSuccess(data);
                    } else {
                        tryNext();
                    }
                }, function () { tryNext(); });
            } catch (e) {
                tryNext();
            }
        }
        tryNext();
    }

    // ============ ОБОГАЩЕНИЕ ============
    function enrichTop(onDone) {
        var top = getTop();
        var ids = Object.keys(top);
        var pending = ids.filter(function (id) {
            var item = top[id];
            return item && item.title && item.title.indexOf('ID ') === 0;
        });

        if (pending.length === 0) { notify('Все уже с метаданными'); if (onDone) onDone(); return; }

        notify('Загружаю: 0/' + pending.length);
        var index = 0, ok = 0, fail = 0;

        function next() {
            if (index >= pending.length) {
                saveTop(top);
                notify('Готово. Успешно: ' + ok + ', ошибок: ' + fail);
                if (onDone) onDone();
                return;
            }
            var id = pending[index++];
            tmdbRequest(id, function (data) {
                var info = extractCardInfo(data);
                if (info && info.id) {
                    var oldItem = top[id];
                    info.id = oldItem.id;
                    info.place = oldItem.place;
                    info.addedAt = oldItem.addedAt;
                    top[id] = info;
                    ok++;
                } else {
                    fail++;
                }
                if ((index % 10 === 0) || index === pending.length) {
                    notify('Загружено: ' + index + '/' + pending.length + ' (ок: ' + ok + ')');
                }
                setTimeout(next, 80);
            }, function (reason) {
                fail++;
                if (index === 1) notify('Ошибка запроса: ' + reason);
                setTimeout(next, 80);
            });
        }
        next();
    }

    // ============ КОМПОНЕНТ ============
    function MyTopComponent() {
        var html = $('<div class="my-top-page" style="height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>');

        function buildContent() {
            html.empty();
            var top = getTop();
            var ids = Object.keys(top);

            var buttons = $('<div style="display:flex;flex-wrap:wrap;gap:8px;padding:20px 20px 12px;"></div>');

            var btnImport = $('<div class="full-start__button selector" style="flex:1;min-width:140px;"><span>Импорт из избранного</span></div>');
            btnImport.on('hover:enter click', function () { importFavorites(); buildContent(); });
            buttons.append(btnImport);

            var btnEnrich = $('<div class="full-start__button selector" style="flex:1;min-width:140px;"><span>Загрузить названия</span></div>');
            btnEnrich.on('hover:enter click', function () { enrichTop(buildContent); });
            buttons.append(btnEnrich);

            var btnClear = $('<div class="full-start__button selector" style="flex:1;min-width:140px;"><span>Очистить</span></div>');
            btnClear.on('hover:enter click', function () {
                saveTop({});
                notify('Топ очищен');
                buildContent();
            });
            buttons.append(btnClear);

            html.append(buttons);

            html.append('<div style="margin:0 20px 20px;padding:12px;background:rgba(0,0,0,0.3);border-radius:8px;color:#8a8a95;font-size:12px;">' +
                'Элементов: <b>' + ids.length + '</b></div>');

            if (ids.length === 0) {
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

            var list = $('<div style="padding:0 20px 60px;"></div>');
            items.forEach(function (item) {
                var placeText = item.place ? '#' + item.place : '—';
                var poster = item.poster ? 'https://image.tmdb.org/t/p/w200' + item.poster : '';
                var row = $(
                    '<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">' +
                    '<div style="font-size:22px;font-weight:700;color:#ffdd55;min-width:44px;text-align:center;">' + placeText + '</div>' +
                    (poster ? '<img src="' + poster + '" style="width:54px;height:80px;object-fit:cover;border-radius:6px;" onerror="this.style.display=\'none\'">' : '') +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="font-size:16px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + item.title + (item.isSeries ? ' <span style="color:#ffdd55;font-size:11px;">СЕРИАЛ</span>' : '') + '</div>' +
                    '<div style="font-size:13px;color:#8a8a95;margin-top:4px;">' + (item.year || '—') + '</div>' +
                    '</div></div>'
                );
                list.append(row);
            });
            html.append(list);
        }

        this.create = function () { buildContent(); return html; };
        this.start = function () {};
        this.render = function () { return html; };
        this.destroy = function () { html.remove(); };
    }

    function registerComponent() {
        if (!window.Lampa || !Lampa.Component || !Lampa.Component.add) return;
        Lampa.Component.add('my_top_page', MyTopComponent);
    }

    function openTopPage() {
        try {
            Lampa.Activity.push({ url: '', title: 'Мой топ', component: 'my_top_page', data: {} });
        } catch (e) { notify('Ошибка открытия: ' + e.message); }
    }

    // ============ ЗНАЧОК-ЗВЕЗДА ============
    // Уменьшен до 1em, добавлен vertical-align для меню.
    var STAR_SVG_CARD =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
        'style="width:2em;height:2em;min-width:2em;min-height:2em;display:block;flex:0 0 auto;">' +
        '<path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>' +
        '</svg>';

    var STAR_SVG_MENU =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
        'style="width:1.2em;height:1.2em;vertical-align:middle;display:inline-block;">' +
        '<path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>' +
        '</svg>';

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
            var container = $('.full-start__buttons');
            if (container.length) container.append(btn);
            else $('[class*="full-start"][class*="buttons"]').first().append(btn);
        }, 200);
    }

    // ============ МЕНЮ ============
    function addMenuItem() {
        var attempts = 0, maxAttempts = 20;
        var tryAdd = function () {
            attempts++;
            var lists = $('.menu .menu__list');
            if (lists.length > 0) {
                var first = lists.first();
                if (first.find('.my-top-menu-item').length > 0) return;

                var item = $(
                    '<li class="menu__item selector my-top-menu-item">' +
                    '<div class="menu__ico" style="display:flex;align-items:center;justify-content:center;">' + STAR_SVG_MENU + '</div>' +
                    '<div class="menu__text">Мой топ</div>' +
                    '</li>'
                );
                item.on('click hover:enter', openTopPage);
                first.append(item);
            } else if (attempts < maxAttempts) setTimeout(tryAdd, 500);
        };
        setTimeout(tryAdd, 1500);
    }

    function startPlugin() {
        if (window[PLUGIN_NAME]) return;
        window[PLUGIN_NAME] = true;
        registerComponent();
        Lampa.Listener.follow('full', addButtonToFull);
        addMenuItem();
        notify('Плагин "Мой топ" v17 запущен');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
})();
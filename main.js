// main.js — Плагин "Мой топ" для Lampa (v22) — ДИАГНОСТИКА URL
(function () {
    'use strict';

    var PLUGIN_NAME = 'my_top_v22';
    var STORAGE_KEY = 'my_movie_top_v14';

    function notify(msg) {
        try { if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg); } catch (e) {}
        console.log('[MyTop]', msg);
    }
    function rawGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
    function rawSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    function parseJSON(s, d) { if (!s) return d; try { var p = JSON.parse(s); return p || d; } catch (e) { return d; } }
    function getTop() { var raw = rawGet(STORAGE_KEY, ''); if (!raw) return {}; var p = parseJSON(raw, {}); return (p && typeof p === 'object') ? p : {}; }
    function saveTop(t) { return rawSet(STORAGE_KEY, JSON.stringify(t)); }
    function isSeries(c) { return !!(c && (c.name || c.first_air_date || c.media_type === 'tv')); }
    function extractCardInfo(card) {
        if (!card) return null;
        var isTV = isSeries(card);
        var title = isTV ? (card.name || card.original_name || 'Без названия') : (card.title || card.original_title || 'Без названия');
        var dateStr = isTV ? (card.first_air_date || '') : (card.release_date || '');
        return { id: card.id, title: title, year: dateStr ? dateStr.split('-')[0] : '—', poster: card.poster_path || '', isSeries: isTV, place: null, addedAt: Date.now() };
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
    function importFavorites() {
        var fav = parseJSON(rawGet('favorite', ''), null);
        if (!fav) { notify('favorite не найден'); return; }
        var viewedIds = fav.viewed;
        if (!viewedIds) { notify('Нет viewed'); return; }
        var ids = Array.isArray(viewedIds) ? viewedIds : Object.keys(viewedIds);
        if (!ids.length) { notify('viewed пуст'); return; }
        var top = getTop();
        var added = 0;
        ids.forEach(function (id) {
            var sid = String(id);
            if (top[sid]) return;
            top[sid] = { id: id, title: 'ID ' + id, year: '—', poster: '', isSeries: false, place: null, addedAt: Date.now() };
            added++;
        });
        saveTop(top);
        notify('Импортировано: ' + added);
    }

    // ============ ДИАГНОСТИКА 2 ============
    function shortInfo(d) {
        if (d === undefined || d === null) return 'null/undefined';
        if (typeof d === 'string') return 'str:' + d.slice(0, 60);
        if (typeof d === 'object') {
            if (d.title) return 'title=' + d.title;
            if (d.name) return 'name=' + d.name;
            if (d.results) return 'results[' + d.results.length + ']';
            if (d.movie) return 'movie=' + (d.movie.title || d.movie.name);
            return 'keys:' + Object.keys(d).slice(0, 6).join(',');
        }
        return typeof d;
    }

    function diag() {
        if (!window.Lampa || !Lampa.Api || !Lampa.Api.sources) { notify('нет API'); return; }
        var tmdb = Lampa.Api.sources.tmdb;
        if (!tmdb || !tmdb.main) { notify('нет tmdb.main'); return; }

        notify('Тест main...');

        // 1. main({url: 'movie/155'})
        setTimeout(function () {
            try {
                tmdb.main({ url: 'movie/155' }, function (d) {
                    notify('1 {url}: ' + shortInfo(d));
                }, function (e) { notify('1 ERR: ' + shortInfo(e)); });
            } catch (e) { notify('1 throw: ' + e.message); }
        }, 100);

        // 2. main({url: '/movie/155'})
        setTimeout(function () {
            try {
                tmdb.main({ url: '/movie/155' }, function (d) {
                    notify('2 {url /}: ' + shortInfo(d));
                }, function (e) { notify('2 ERR: ' + shortInfo(e)); });
            } catch (e) { notify('2 throw: ' + e.message); }
        }, 2700);

        // 3. main('movie/155')
        setTimeout(function () {
            try {
                tmdb.main('movie/155', function (d) {
                    notify('3 str: ' + shortInfo(d));
                }, function (e) { notify('3 ERR: ' + shortInfo(e)); });
            } catch (e) { notify('3 throw: ' + e.message); }
        }, 5300);

        // 4. main({url: 'movie/155', language: 'ru'})
        setTimeout(function () {
            try {
                tmdb.main({ url: 'movie/155', language: 'ru' }, function (d) {
                    notify('4 +lang: ' + shortInfo(d));
                }, function (e) { notify('4 ERR: ' + shortInfo(e)); });
            } catch (e) { notify('4 throw: ' + e.message); }
        }, 7900);

        // 5. full({id: 155, method: 'movie', card: {}})
        setTimeout(function () {
            try {
                tmdb.full({ id: 155, method: 'movie', card: {} }, function (d) {
                    notify('5 full+card: ' + shortInfo(d));
                }, function (e) { notify('5 ERR: ' + shortInfo(e)); });
            } catch (e) { notify('5 throw: ' + e.message); }
        }, 10500);

        // 6. main с callback-ом err в 4-м аргументе
        setTimeout(function () {
            try {
                tmdb.main({ url: 'movie/155' }, function (d) {
                    notify('6 cb4: ' + shortInfo(d));
                }, false, function (e) { notify('6 ERR: ' + shortInfo(e)); });
            } catch (e) { notify('6 throw: ' + e.message); }
        }, 13100);
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

            var btnDiag = $('<div class="full-start__button selector" style="flex:1;min-width:140px;"><span>Тест main</span></div>');
            btnDiag.on('hover:enter click', function () { diag(); });
            buttons.append(btnDiag);

            var btnClear = $('<div class="full-start__button selector" style="flex:1;min-width:140px;"><span>Очистить</span></div>');
            btnClear.on('hover:enter click', function () { saveTop({}); notify('Топ очищен'); buildContent(); });
            buttons.append(btnClear);

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

            var list = $('<div style="padding:0 20px 60px;"></div>');
            items.forEach(function (item) {
                var placeText = item.place ? '#' + item.place : '—';
                var poster = item.poster ? 'https://image.tmdb.org/t/p/w200' + item.poster : '';
                list.append(
                    '<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">' +
                    '<div style="font-size:22px;font-weight:700;color:#ffdd55;min-width:44px;text-align:center;">' + placeText + '</div>' +
                    (poster ? '<img src="' + poster + '" style="width:54px;height:80px;object-fit:cover;border-radius:6px;" onerror="this.style.display=\'none\'">' : '') +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="font-size:16px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + item.title + (item.isSeries ? ' <span style="color:#ffdd55;font-size:11px;">СЕРИАЛ</span>' : '') + '</div>' +
                    '<div style="font-size:13px;color:#8a8a95;margin-top:4px;">' + (item.year || '—') + '</div>' +
                    '</div></div>'
                );
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
        registerComponent();
        Lampa.Listener.follow('full', addButtonToFull);
        addMenuItem();
        notify('Плагин "Мой топ" v22 запущен');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
})();
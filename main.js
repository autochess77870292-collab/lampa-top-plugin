// main.js — Плагин "Мой топ" для Lampa (v6)
// Отладка: click + hover:enter, тестовые кнопки, сырой JSON
(function () {
    'use strict';

    var PLUGIN_NAME = 'my_top_plugin_v6';
    var STORAGE_KEY = 'my_movie_top_v6'; // новый ключ, чтобы не путаться

    function notify(msg) {
        try {
            if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg);
            else console.log('[MyTop]', msg);
        } catch (e) { console.error('[MyTop] Noty:', e); }
    }

    function rawGet(key, def) {
        try {
            var v = localStorage.getItem(key);
            return (v === null || v === undefined) ? def : v;
        } catch (e) { return def; }
    }

    function rawSet(key, value) {
        try { localStorage.setItem(key, value); return true; }
        catch (e) { console.error('[MyTop] rawSet:', e); return false; }
    }

    function getTop() {
        var raw = rawGet(STORAGE_KEY, '');
        if (!raw) return {};
        try {
            var p = JSON.parse(raw);
            return (p && typeof p === 'object') ? p : {};
        } catch (e) { return {}; }
    }

    function saveTop(top) {
        return rawSet(STORAGE_KEY, JSON.stringify(top));
    }

    function isSeries(card) {
        return !!(card && (card.name || card.first_air_date || card.media_type === 'tv' || card.number_of_seasons !== undefined));
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
        notify('"' + info.title + '" → добавлен (всего: ' + Object.keys(top).length + ')');
    }

    // ============ СТРАНИЦА ТОПА ============
    function renderTopPage() {
        var top = getTop();
        var ids = Object.keys(top);
        var rawJson = rawGet(STORAGE_KEY, '(пусто)');

        var debugBlock = '<div class="my-top-debug">' +
            '<b>Отладка:</b><br>' +
            'Ключ: <code>' + STORAGE_KEY + '</code><br>' +
            'Элементов: <b>' + ids.length + '</b><br>' +
            'Сырой JSON:<br>' +
            '<div class="my-top-raw">' + rawJson.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' +
            '</div>';

        if (ids.length === 0) {
            return '<div class="my-top-page">' +
                '<div class="my-top-empty">Список пуст.</div>' +
                '<div class="my-top-test-buttons">' +
                '<div class="my-top-btn" id="my-top-test-add">🧪 Добавить тестовый фильм</div>' +
                '<div class="my-top-btn my-top-btn-danger" id="my-top-test-clear">🗑 Очистить топ</div>' +
                '</div>' +
                debugBlock +
                '</div>';
        }

        var items = ids.map(function (id) { return top[id]; });
        items.sort(function (a, b) {
            if (a.place && b.place) return a.place - b.place;
            if (a.place) return -1;
            if (b.place) return 1;
            return (a.addedAt || 0) - (b.addedAt || 0);
        });

        var list = '<div class="my-top-list">';
        items.forEach(function (item) {
            var placeText = item.place ? '#' + item.place : '—';
            var poster = item.poster ? 'https://image.tmdb.org/t/p/w200' + item.poster : '';
            var badge = item.isSeries ? '<span class="my-top-badge">СЕРИАЛ</span>' : '';
            list += '<div class="my-top-item">' +
                '<div class="my-top-place">' + placeText + '</div>' +
                (poster ? '<div class="my-top-poster"><img src="' + poster + '"></div>' : '') +
                '<div class="my-top-info">' +
                '<div class="my-top-title">' + item.title + badge + '</div>' +
                '<div class="my-top-year">' + (item.year || '—') + '</div>' +
                '</div>' +
                '</div>';
        });
        list += '</div>';

        return '<div class="my-top-page">' + list +
            '<div class="my-top-test-buttons">' +
            '<div class="my-top-btn" id="my-top-test-add">🧪 Добавить тестовый фильм</div>' +
            '<div class="my-top-btn my-top-btn-danger" id="my-top-test-clear">🗑 Очистить топ</div>' +
            '</div>' +
            debugBlock + '</div>';
    }

    function pageStyles() {
        return '<style>' +
            '.my-top-page{padding-bottom:60px;}' +
            '.my-top-empty{padding:30px 20px;text-align:center;color:#8a8a95;font-size:15px;}' +
            '.my-top-list{display:flex;flex-direction:column;gap:10px;padding:8px 16px;}' +
            '.my-top-item{display:flex;align-items:center;gap:12px;background:#1c1c22;border-radius:10px;padding:12px;}' +
            '.my-top-place{font-size:20px;font-weight:700;color:#3a6df0;min-width:40px;text-align:center;}' +
            '.my-top-poster img{width:50px;height:75px;object-fit:cover;border-radius:6px;}' +
            '.my-top-info{flex:1;min-width:0;}' +
            '.my-top-title{font-size:15px;font-weight:600;color:#e8e8ec;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
            '.my-top-badge{display:inline-block;margin-left:8px;padding:2px 6px;font-size:10px;font-weight:700;background:#3a6df0;color:#fff;border-radius:4px;vertical-align:middle;}' +
            '.my-top-year{font-size:13px;color:#8a8a95;margin-top:4px;}' +
            '.my-top-test-buttons{display:flex;gap:10px;padding:16px;}' +
            '.my-top-btn{flex:1;padding:12px;background:#2c2c34;color:#e8e8ec;border-radius:8px;text-align:center;font-size:13px;cursor:pointer;}' +
            '.my-top-btn-danger{background:#5a2020;}' +
            '.my-top-debug{margin:16px;padding:12px;background:#141418;border:1px solid #2c2c34;border-radius:8px;color:#8a8a95;font-size:12px;line-height:1.6;}' +
            '.my-top-raw{margin-top:6px;padding:8px;background:#0a0a0e;border-radius:4px;color:#6a6a75;font-family:monospace;font-size:11px;max-height:150px;overflow:auto;word-break:break-all;}' +
            '</style>';
    }

    function bindPageButtons() {
        setTimeout(function () {
            $('#my-top-test-add').off('click').on('click', function () {
                addToTop({ id: 999999, title: 'Тестовый фильм', release_date: '2024-01-01', poster_path: '' });
                if (window.Lampa && Lampa.Activity && Lampa.Activity.active) {
                    var act = Lampa.Activity.active();
                    if (act && act.component === 'my_top_page') {
                        $('.my-top-page').parent().html(renderTopPage() + pageStyles());
                        bindPageButtons();
                    }
                }
            });
            $('#my-top-test-clear').off('click').on('click', function () {
                saveTop({});
                if (window.Lampa && Lampa.Activity && Lampa.Activity.active) {
                    var act = Lampa.Activity.active();
                    if (act && act.component === 'my_top_page') {
                        $('.my-top-page').parent().html(renderTopPage() + pageStyles());
                        bindPageButtons();
                    }
                }
                notify('Топ очищен');
            });
        }, 100);
    }

    function registerTopComponent() {
        if (!window.Lampa || !Lampa.Component || !Lampa.Component.add) return;
        Lampa.Component.add('my_top_page', {
            create: function () {
                var html = $('<div class="my-top-page-wrapper"></div>');
                html.html(renderTopPage() + pageStyles());
                this.html = html;
                bindPageButtons();
                return html;
            },
            start: function () {
                if (this.html) {
                    this.html.html(renderTopPage() + pageStyles());
                    bindPageButtons();
                }
            },
            render: function () { return this.html; }
        });
    }

    function openTopPage() {
        try {
            Lampa.Activity.push({ url: '', title: '⭐ Мой топ', component: 'my_top_page', data: {} });
        } catch (e) { notify('Ошибка открытия'); }
    }

    function addButtonToFull(e) {
        if (e.type !== 'complite') return;
        var movie = e.data && e.data.movie ? e.data.movie : null;
        if (!movie) return;

        var label = isSeries(movie) ? '⭐ В мой топ (сериал)' : '⭐ В мой топ';
        var btn = $('<div class="full-start__button view--custom"><span>' + label + '</span></div>');

        // Ловим и клик, и hover:enter
        btn.on('click', function () { addToTop(movie); });
        btn.on('hover:enter', function () { addToTop(movie); });

        if (e.object && e.object.activity) {
            e.object.activity.render().find('.view--custom').last().after(btn);
        }
    }

    function addMenuItem() {
        var attempts = 0, maxAttempts = 20;
        var tryAdd = function () {
            attempts++;
            var lists = $('.menu .menu__list');
            if (lists.length > 0) {
                var first = lists.first();
                if (first.find('.my-top-menu-item').length > 0) return;
                var item = $('<li class="menu__item selector my-top-menu-item"><div class="menu__text">⭐ Мой топ</div></li>');
                item.on('click hover:enter', openTopPage);
                first.append(item);
            } else if (attempts < maxAttempts) {
                setTimeout(tryAdd, 500);
            }
        };
        setTimeout(tryAdd, 1500);
    }

    function startPlugin() {
        if (window[PLUGIN_NAME]) return;
        window[PLUGIN_NAME] = true;
        registerTopComponent();
        Lampa.Listener.follow('full', addButtonToFull);
        addMenuItem();
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
})();
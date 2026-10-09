// main.js — Плагин "Мой топ" для Lampa (v10)
// v10: звезда-кнопка + диагностика localStorage + автопарсинг избранного.
(function () {
    'use strict';

    var PLUGIN_NAME = 'my_top_v10';
    var STORAGE_KEY = 'my_movie_top_v10';

    function notify(msg) {
        try {
            if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg);
            else console.log('[MyTop]', msg);
        } catch (e) {}
    }

    function rawGet(key, def) {
        try { var v = localStorage.getItem(key); return (v === null) ? def : v; }
        catch (e) { return def; }
    }
    function rawSet(key, val) {
        try { localStorage.setItem(key, val); return true; } catch (e) { return false; }
    }

    function getTop() {
        var raw = rawGet(STORAGE_KEY, '');
        if (!raw) return {};
        try { var p = JSON.parse(raw); return (p && typeof p === 'object') ? p : {}; }
        catch (e) { return {}; }
    }
    function saveTop(top) { return rawSet(STORAGE_KEY, JSON.stringify(top)); }

    function isSeries(c) {
        return !!(c && (c.name || c.first_air_date || c.media_type === 'tv' || c.number_of_seasons !== undefined));
    }
    function extractCardInfo(card) {
        if (!card) return null;
        var isTV = isSeries(card);
        var title = isTV ? (card.name || 'Без названия') : (card.title || 'Без названия');
        var dateStr = isTV ? (card.first_air_date || '') : (card.release_date || '');
        return {
            id: card.id, title: title, year: dateStr ? dateStr.split('-')[0] : '—',
            poster: card.poster_path || '', isSeries: isTV, place: null, addedAt: Date.now()
        };
    }

    function addToTop(card) {
        var info = extractCardInfo(card);
        if (!info || !info.id) { notify('⚠ Не удалось определить карточку'); return; }
        var top = getTop();
        if (top[info.id]) { notify('Уже в топе'); return; }
        top[info.id] = info;
        var ok = saveTop(top);
        notify(ok ? ('✔ "' + info.title + '" → в топе (' + Object.keys(top).length + ')') : '✖ Ошибка сохранения');
    }

    // ============ ИМПОРТ ИЗ "ИЗБРАННОГО" LAMPA ============
    // В Lampa ключ 'favorite' — это объект, где каждая категория это массив ID.
    // Нам нужна категория, в которой 64 элемента (то, что пользователь видит как "Просмотрено").
    // Точное имя категории мы определим по факту, поэтому пробуем всё сразу.
    function importFavorites() {
        var raw = rawGet('favorite', '');
        if (!raw) { notify('Ключ favorite пуст'); return 0; }

        var data;
        try { data = JSON.parse(raw); } catch (e) { notify('favorite не JSON: ' + e.message); return 0; }
        if (!data || typeof data !== 'object') { notify('favorite не объект'); return 0; }

        // Категории, которые, вероятно, значат "просмотрено"
        var candidates = ['viewed', 'wath', 'history', 'view', 'watched', 'seen'];
        var found = null;
        var report = [];
        Object.keys(data).forEach(function (k) {
            var v = data[k];
            var count = Array.isArray(v) ? v.length : (typeof v === 'object' ? Object.keys(v).length : 0);
            report.push(k + ':' + count);
            if (candidates.indexOf(k) !== -1 && count > 0) found = k;
        });

        notify('Категории favorite: ' + report.join(', '));

        if (!found) {
            notify('Не нашёл категорию "просмотрено". Смотри диагностику.');
            return 0;
        }

        var top = getTop();
        var added = 0;
        var ids = Array.isArray(data[found]) ? data[found] : Object.keys(data[found]);
        ids.forEach(function (id) {
            var sid = String(id);
            if (!top[sid]) {
                top[sid] = {
                    id: id,
                    title: 'ID ' + id + ' (нужно название)',
                    year: '—',
                    poster: '',
                    isSeries: false,
                    place: null,
                    addedAt: Date.now()
                };
                added++;
            }
        });
        saveTop(top);
        notify('Импортировано из "' + found + '": ' + added);
        return added;
    }

    // ============ ДИАГНОСТИКА localStorage ============
    function buildDiagHTML() {
        var keys = Object.keys(localStorage).sort();
        var html = '<div style="padding:12px;color:#e8e8ec;font-family:monospace;font-size:11px;line-height:1.5;">';
        html += '<div style="margin-bottom:12px;"><b style="font-size:14px;">Всего ключей: ' + keys.length + '</b></div>';

        keys.forEach(function (k) {
            var val = localStorage.getItem(k) || '';
            var preview = val.length > 400 ? val.substring(0, 400) + '...' : val;
            preview = preview.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html += '<div style="margin-bottom:10px;padding:8px;background:#141418;border:1px solid #2c2c34;border-radius:6px;">';
            html += '<div style="color:#3a6df0;font-weight:bold;">' + k + '</div>';
            html += '<div style="color:#6a6a75;margin:4px 0;">Размер: ' + val.length + ' байт</div>';
            html += '<div style="color:#8a8a95;word-break:break-all;">' + preview + '</div>';
            html += '</div>';
        });

        html += '</div>';
        return html;
    }

    // ============ СТРАНИЦА ТОПА ============
    function renderTopPage() {
        var top = getTop();
        var ids = Object.keys(top);
        var rawJson = rawGet(STORAGE_KEY, '(пусто)');

        var debug = '<div class="my-top-debug"><b>Отладка</b><br>' +
            'Ключ: <code>' + STORAGE_KEY + '</code><br>' +
            'Элементов в топе: <b>' + ids.length + '</b>' +
            '</div>';

        var buttons =
            '<div class="my-top-test-buttons">' +
            '<div class="my-top-btn" id="my-top-test-import">📥 Импорт из избранного</div>' +
            '<div class="my-top-btn" id="my-top-test-diag">🔍 Все ключи</div>' +
            '</div>' +
            '<div class="my-top-test-buttons">' +
            '<div class="my-top-btn" id="my-top-test-add">🧪 Тестовый</div>' +
            '<div class="my-top-btn my-top-btn-danger" id="my-top-test-clear">🗑 Очистить</div>' +
            '</div>';

        if (ids.length === 0) {
            return '<div class="my-top-page"><div class="my-top-empty">Список пуст.</div>' + buttons + debug + '</div>';
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
                '</div></div>';
        });
        list += '</div>';

        return '<div class="my-top-page">' + list + buttons + debug + '</div>';
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
            '.my-top-test-buttons{display:flex;gap:10px;padding:0 16px 12px;}' +
            '.my-top-btn{flex:1;padding:12px;background:#2c2c34;color:#e8e8ec;border-radius:8px;text-align:center;font-size:13px;cursor:pointer;}' +
            '.my-top-btn-danger{background:#5a2020;}' +
            '.my-top-debug{margin:16px;padding:12px;background:#141418;border:1px solid #2c2c34;border-radius:8px;color:#8a8a95;font-size:12px;line-height:1.6;}' +
            '</style>';
    }

    function refreshPage() {
        var wrapper = $('.my-top-page-wrapper');
        if (wrapper.length) {
            wrapper.html(renderTopPage() + pageStyles());
            bindPageButtons();
        }
    }

    function bindPageButtons() {
        setTimeout(function () {
            $('#my-top-test-import').off('click').on('click', function () {
                importFavorites();
                refreshPage();
            });
            $('#my-top-test-diag').off('click').on('click', function () {
                var wrapper = $('.my-top-page-wrapper');
                var backBtn = '<div style="padding:12px;"><div class="my-top-btn" id="my-top-back">← Назад</div></div>';
                wrapper.html(backBtn + buildDiagHTML());
                $('#my-top-back').on('click', function () { refreshPage(); });
            });
            $('#my-top-test-add').off('click').on('click', function () {
                addToTop({ id: 999999, title: 'Тестовый фильм', release_date: '2024-01-01', poster_path: '' });
                refreshPage();
            });
            $('#my-top-test-clear').off('click').on('click', function () {
                saveTop({});
                refreshPage();
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
                if (this.html) { this.html.html(renderTopPage() + pageStyles()); bindPageButtons(); }
            },
            render: function () { return this.html; }
        });
    }

    function openTopPage() {
        try { Lampa.Activity.push({ url: '', title: '⭐ Мой топ', component: 'my_top_page', data: {} }); }
        catch (e) { notify('Ошибка открытия'); }
    }

    // ============ КНОПКА-ЗВЕЗДА НА КАРТОЧКЕ ============
    function addButtonToFull(e) {
        if (e.type !== 'complite') return;

        var movie = e.data && e.data.movie ? e.data.movie : null;
        if (!movie) return;

        setTimeout(function () {
            if ($('.my-top-btn-card').length > 0) return;

            var svg =
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
                'style="width:2em;height:2em;min-width:2em;min-height:2em;display:block;flex:0 0 auto;">' +
                '<path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>' +
                '</svg>';

            var btn = $('<div class="full-start__button selector view--custom my-top-btn-card" ' +
                'style="display:flex;align-items:center;justify-content:center;">' + svg + '</div>');

            var busy = false;
            btn.on('click', function () {
                if (busy) return;
                busy = true;
                setTimeout(function () { busy = false; }, 700);
                addToTop(movie);
            });

            var container = $('.full-start__buttons');
            if (container.length) container.append(btn);
            else {
                var fb = $('.full-start-new__buttons');
                if (fb.length) fb.append(btn);
                else $('[class*="full-start"][class*="buttons"]').first().append(btn);
            }
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
                var item = $('<li class="menu__item selector my-top-menu-item"><div class="menu__text">⭐ Мой топ</div></li>');
                item.on('click hover:enter', openTopPage);
                first.append(item);
            } else if (attempts < maxAttempts) setTimeout(tryAdd, 500);
        };
        setTimeout(tryAdd, 1500);
    }

    // ============ СТАРТ ============
    function startPlugin() {
        if (window[PLUGIN_NAME]) return;
        window[PLUGIN_NAME] = true;

        registerTopComponent();
        Lampa.Listener.follow('full', addButtonToFull);
        addMenuItem();

        notify('⭐ Плагин "Мой топ" v10 запущен');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
})();
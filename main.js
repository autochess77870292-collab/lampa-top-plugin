// main.js — Плагин "Мой топ" для Lampa (v11)
// Отказ от Lampa.Component. Своя страница через overlay.
(function () {
    'use strict';

    var PLUGIN_NAME = 'my_top_v11';
    var STORAGE_KEY = 'my_movie_top_v11';

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

    // ============ ИМПОРТ ============
    function importFavorites() {
        var raw = rawGet('favorite', '');
        if (!raw) { notify('Ключ favorite пуст'); return; }

        var data;
        try { data = JSON.parse(raw); } catch (e) { notify('favorite не JSON'); return; }
        if (!data || typeof data !== 'object') { notify('favorite не объект'); return; }

        var report = [];
        Object.keys(data).forEach(function (k) {
            var v = data[k];
            var count = Array.isArray(v) ? v.length : (typeof v === 'object' ? Object.keys(v).length : 0);
            report.push(k + ':' + count);
        });
        notify('favorite → ' + report.join(', '));
    }

    // ============ HTML СТРАНИЦЫ ============
    function buildPageHTML() {
        var top = getTop();
        var ids = Object.keys(top);

        var html = '';
        html += '<div style="display:flex;gap:8px;padding:12px;flex-wrap:wrap;">';
        html += '<button class="myt-btn" data-act="import" style="flex:1;padding:14px;background:#3a6df0;color:#fff;border:0;border-radius:8px;font-size:14px;">📥 Импорт из избранного</button>';
        html += '<button class="myt-btn" data-act="diag" style="flex:1;padding:14px;background:#2c2c34;color:#e8e8ec;border:0;border-radius:8px;font-size:14px;">🔍 Все ключи</button>';
        html += '</div>';

        html += '<div style="display:flex;gap:8px;padding:0 12px 12px;">';
        html += '<button class="myt-btn" data-act="test" style="flex:1;padding:12px;background:#2c2c34;color:#e8e8ec;border:0;border-radius:8px;font-size:13px;">🧪 Тест</button>';
        html += '<button class="myt-btn" data-act="clear" style="flex:1;padding:12px;background:#5a2020;color:#e8e8ec;border:0;border-radius:8px;font-size:13px;">🗑 Очистить</button>';
        html += '</div>';

        html += '<div style="margin:12px;padding:12px;background:#141418;border:1px solid #2c2c34;border-radius:8px;color:#8a8a95;font-size:12px;line-height:1.6;">';
        html += '<b>Отладка</b><br>Ключ: <code>' + STORAGE_KEY + '</code><br>Элементов: <b>' + ids.length + '</b>';
        html += '</div>';

        if (ids.length === 0) {
            html += '<div style="padding:30px;text-align:center;color:#8a8a95;">Список пуст</div>';
            return html;
        }

        var items = ids.map(function (id) { return top[id]; });
        items.sort(function (a, b) {
            if (a.place && b.place) return a.place - b.place;
            if (a.place) return -1;
            if (b.place) return 1;
            return (a.addedAt || 0) - (b.addedAt || 0);
        });

        html += '<div style="padding:0 12px;">';
        items.forEach(function (item) {
            var placeText = item.place ? '#' + item.place : '—';
            var poster = item.poster ? 'https://image.tmdb.org/t/p/w200' + item.poster : '';
            html += '<div style="display:flex;align-items:center;gap:12px;background:#1c1c22;border-radius:10px;padding:12px;margin-bottom:10px;">';
            html += '<div style="font-size:20px;font-weight:700;color:#3a6df0;min-width:40px;text-align:center;">' + placeText + '</div>';
            if (poster) html += '<div><img src="' + poster + '" style="width:50px;height:75px;object-fit:cover;border-radius:6px;"></div>';
            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="font-size:15px;font-weight:600;color:#e8e8ec;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + item.title + '</div>';
            html += '<div style="font-size:13px;color:#8a8a95;margin-top:4px;">' + (item.year || '—') + '</div>';
            html += '</div></div>';
        });
        html += '</div>';

        return html;
    }

    function buildDiagHTML() {
        var keys = Object.keys(localStorage).sort();
        var html = '<div style="padding:12px;color:#e8e8ec;font-family:monospace;font-size:11px;line-height:1.5;">';
        html += '<div style="margin-bottom:12px;"><b style="font-size:14px;">Всего ключей: ' + keys.length + '</b></div>';

        keys.forEach(function (k) {
            var val = localStorage.getItem(k) || '';
            var preview = val.length > 500 ? val.substring(0, 500) + '...' : val;
            preview = preview.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html += '<div style="margin-bottom:10px;padding:8px;background:#141418;border:1px solid #2c2c34;border-radius:6px;">';
            html += '<div style="color:#3a6df0;font-weight:bold;word-break:break-all;">' + k + '</div>';
            html += '<div style="color:#6a6a75;margin:4px 0;">Размер: ' + val.length + ' байт</div>';
            html += '<div style="color:#8a8a95;word-break:break-all;">' + preview + '</div>';
            html += '</div>';
        });

        html += '</div>';
        return html;
    }

    // ============ OVERLAY ============
    function openTopPage() {
        // Удаляем старый, если есть
        $('#my-top-overlay').remove();

        var overlay = $(
            '<div id="my-top-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;' +
            'background:#0f0f12;z-index:99999;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;">' +

            '<div style="position:sticky;top:0;background:#1a1a20;padding:16px;display:flex;justify-content:space-between;align-items:center;z-index:10;">' +
            '<div style="font-size:18px;color:#e8e8ec;">⭐ Мой топ</div>' +
            '<div id="my-top-close" style="padding:8px 16px;background:#2c2c34;border-radius:6px;color:#e8e8ec;cursor:pointer;font-size:14px;">Закрыть</div>' +
            '</div>' +

            '<div id="my-top-content"></div>' +
            '</div>'
        );

        $('body').append(overlay);
        renderContent();
    }

    function renderContent() {
        var $content = $('#my-top-content');
        $content.html(buildPageHTML());
        bindButtons();
    }

    function bindButtons() {
        $('.myt-btn').off('click').on('click', function () {
            var act = $(this).data('act');

            if (act === 'import') {
                importFavorites();
            } else if (act === 'diag') {
                var $content = $('#my-top-content');
                $content.html(
                    '<div style="padding:12px;">' +
                    '<button id="myt-back" style="padding:10px 16px;background:#2c2c34;color:#e8e8ec;border:0;border-radius:8px;font-size:14px;">← Назад</button>' +
                    '</div>' + buildDiagHTML()
                );
                $('#myt-back').on('click', function () { renderContent(); });
            } else if (act === 'test') {
                addToTop({ id: 999999, title: 'Тестовый фильм', release_date: '2024-01-01', poster_path: '' });
                renderContent();
            } else if (act === 'clear') {
                saveTop({});
                notify('Топ очищен');
                renderContent();
            }
        });

        $('#my-top-close').off('click').on('click', function () {
            $('#my-top-overlay').remove();
        });
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

        Lampa.Listener.follow('full', addButtonToFull);
        addMenuItem();

        notify('⭐ Плагин "Мой топ" v11 запущен');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
})();
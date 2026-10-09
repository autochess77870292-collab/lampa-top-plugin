// main.js — Плагин "Мой топ" для Lampa (v13)
// Импорт из "viewed" + метаданные из "card". Прокручиваемая диагностика.
(function () {
    'use strict';

    var PLUGIN_NAME = 'my_top_v13';
    var STORAGE_KEY = 'my_movie_top_v13';

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
        if (!info || !info.id) { notify('⚠ Не удалось определить карточку'); return; }
        var top = getTop();
        if (top[info.id]) { notify('Уже в топе'); return; }
        top[info.id] = info;
        saveTop(top);
        notify('✔ "' + info.title + '" → в топе (' + Object.keys(top).length + ')');
    }

    // ============ ИМПОРТ ИЗ "ИЗБРАННОГО" ============
    function importFavorites() {
        var fav = parseJSON(rawGet('favorite', ''), null);
        if (!fav) { notify('Ключ favorite не найден или пуст'); return; }

        // Берём категорию "viewed" (просмотрено)
        var viewedIds = fav.viewed;
        if (!viewedIds) { notify('Нет категории viewed'); return; }

        // viewed может быть массивом или объектом
        var ids = Array.isArray(viewedIds) ? viewedIds : Object.keys(viewedIds);
        if (ids.length === 0) { notify('viewed пуст'); return; }

        // Пробуем получить полные карточки из ключа "card"
        var cards = parseJSON(rawGet('card', ''), {});
        var hasCards = cards && typeof cards === 'object' && Object.keys(cards).length > 0;

        var top = getTop();
        var added = 0;
        var withMeta = 0;

        ids.forEach(function (id) {
            var sid = String(id);
            if (top[sid]) return;

            var info;
            // card может быть: { "12345": {title: ...}, ... } — ищем по ID
            var rawCard = hasCards ? (cards[sid] || cards[id]) : null;

            if (rawCard && (rawCard.title || rawCard.name)) {
                info = extractCardInfo(rawCard);
                if (info) withMeta++;
            }

            if (!info) {
                info = {
                    id: id,
                    title: 'ID ' + id,
                    year: '—',
                    poster: '',
                    isSeries: false,
                    place: null,
                    addedAt: Date.now()
                };
            }

            info.id = id; // всегда оригинальный ID
            info.place = null;
            info.addedAt = Date.now();

            top[sid] = info;
            added++;
        });

        saveTop(top);
        notify('Импортировано: ' + added + ' (с метаданными: ' + withMeta + ')');
    }

    // ============ КОМПОНЕНТ ============
    function MyTopComponent() {
        var self = this;
        var html = $('<div class="my-top-page" style="height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>');

        function buildContent() {
            html.empty();

            var top = getTop();
            var ids = Object.keys(top);

            // Кнопки
            var buttons = $('<div style="display:flex;flex-wrap:wrap;gap:8px;padding:20px 20px 12px;"></div>');

            var btnImport = $('<div class="full-start__button selector" style="flex:1;min-width:140px;"><span>📥 Импорт (viewed)</span></div>');
            btnImport.on('hover:enter click', function () { importFavorites(); buildContent(); });
            buttons.append(btnImport);

            var btnDiag = $('<div class="full-start__button selector" style="flex:1;min-width:140px;"><span>🔍 Ключи</span></div>');
            btnDiag.on('hover:enter click', function () { showDiag(); });
            buttons.append(btnDiag);

            var btnClear = $('<div class="full-start__button selector" style="flex:1;min-width:140px;"><span>🗑 Очистить</span></div>');
            btnClear.on('hover:enter click', function () {
                saveTop({});
                notify('Топ очищен');
                buildContent();
            });
            buttons.append(btnClear);

            html.append(buttons);

            // Отладка
            html.append('<div style="margin:0 20px 20px;padding:12px;background:rgba(0,0,0,0.3);border-radius:8px;color:#8a8a95;font-size:12px;">' +
                'Ключ: <code>' + STORAGE_KEY + '</code> · Элементов: <b>' + ids.length + '</b></div>');

            if (ids.length === 0) {
                html.append('<div style="padding:40px;text-align:center;color:#8a8a95;">Список пуст. Нажми "📥 Импорт (viewed)".</div>');
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

        function showDiag() {
            var keys = Object.keys(localStorage).sort();
            html.empty();

            var back = $('<div style="padding:20px;"><div class="full-start__button selector" style="display:inline-block;"><span>← Назад</span></div></div>');
            back.find('.full-start__button').on('hover:enter click', function () { buildContent(); });
            html.append(back);

            html.append('<div style="padding:0 20px 12px;color:#8a8a95;font-size:13px;">Всего ключей: <b style="color:#fff;">' + keys.length + '</b></div>');

            keys.forEach(function (k) {
                var val = localStorage.getItem(k) || '';
                var preview = val.length > 2000 ? val.substring(0, 2000) + '...' : val;
                preview = preview.replace(/</g, '&lt;').replace(/>/g, '&gt;');

                var box = $(
                    '<div style="margin:0 20px 12px;padding:10px;background:rgba(0,0,0,0.35);border-radius:6px;font-family:monospace;font-size:11px;">' +
                    '<div style="color:#ffdd55;font-weight:bold;word-break:break-all;">' + k + '</div>' +
                    '<div style="color:#6a6a75;margin:4px 0;">' + val.length + ' байт</div>' +
                    '<div style="color:#8a8a95;word-break:break-all;">' + preview + '</div>' +
                    '</div>'
                );
                html.append(box);
            });
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
            Lampa.Activity.push({
                url: '',
                title: '⭐ Мой топ',
                component: 'my_top_page',
                data: {}
            });
        } catch (e) { notify('Ошибка открытия: ' + e.message); }
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
                var item = $('<li class="menu__item selector my-top-menu-item"><div class="menu__text">⭐ Мой топ</div></li>');
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
        notify('⭐ Плагин "Мой топ" v13 запущен');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
})();
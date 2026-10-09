// main.js — Плагин "Мой топ" для Lampa (v4)
// Фильмы + сериалы. Одна кнопка меню. Видимая диагностика.
(function () {
    'use strict';

    var PLUGIN_NAME = 'my_top_plugin_v4';
    var STORAGE_KEY = 'my_movie_top';

    // ============ УТИЛИТЫ ============
    function notify(msg) {
        try {
            if (window.Lampa && Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show(msg);
            } else {
                console.log('[MyTop]', msg);
            }
        } catch (e) { console.error('[MyTop] Noty:', e); }
    }

    function safeGet(key, def) {
        try {
            if (window.Lampa && Lampa.Storage && Lampa.Storage.get) {
                return Lampa.Storage.get(key, def);
            }
        } catch (e) { console.error('[MyTop] get:', e); }
        return def;
    }

    function safeSet(key, val) {
        try {
            if (window.Lampa && Lampa.Storage && Lampa.Storage.set) {
                Lampa.Storage.set(key, val);
            }
        } catch (e) { console.error('[MyTop] set:', e); }
    }

    // Приводим данные к объекту — работает и если Lampa вернула строку, и если объект
    function toObject(data, def) {
        if (data === undefined || data === null) return def;
        if (typeof data === 'string') {
            try { return JSON.parse(data) || def; } catch (e) { return def; }
        }
        if (typeof data === 'object') return data;
        return def;
    }

    function isSeries(card) {
        return !!(card && (
            card.name || card.first_air_date ||
            card.media_type === 'tv' ||
            card.number_of_seasons !== undefined
        ));
    }

    function extractCardInfo(card) {
        if (!card) return null;
        var isTV = isSeries(card);
        var title = isTV
            ? (card.name || card.original_name || 'Без названия')
            : (card.title || card.original_title || 'Без названия');
        var dateStr = isTV ? (card.first_air_date || '') : (card.release_date || '');
        var year = dateStr ? dateStr.split('-')[0] : '—';
        return {
            id: card.id,
            title: title,
            year: year,
            poster: card.poster_path || '',
            isSeries: isTV,
            place: null,
            addedAt: Date.now()
        };
    }

    // ============ ТОП ============
    function getTop() {
        var data = safeGet(STORAGE_KEY, {});
        return toObject(data, {});
    }

    function saveTop(top) {
        // Сохраняем как объект — Lampa сама разберётся с сериализацией
        safeSet(STORAGE_KEY, top);
    }

    function addToTop(card) {
        var info = extractCardInfo(card);
        if (!info || !info.id) {
            notify('Не удалось определить карточку');
            return;
        }
        var top = getTop();
        if (top[info.id]) {
            notify('Уже в топе');
            return;
        }
        top[info.id] = info;
        saveTop(top);
        // Проверим, что действительно сохранилось
        var check = getTop();
        var savedCount = Object.keys(check).length;
        notify('"' + info.title + '" добавлен (всего: ' + savedCount + ')');
    }

    // ============ ДИАГНОСТИКА ============
    function getFavoritesIds() {
        var raw = safeGet('favorite', {});
        var parsed = toObject(raw, {});
        var ids = [];
        Object.keys(parsed).forEach(function (k) {
            var v = parsed[k];
            if (Array.isArray(v)) {
                v.forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
            }
        });
        return ids;
    }

    // ============ СТРАНИЦА ТОПА ============
    function renderTopPage() {
        var top = getTop();
        var ids = Object.keys(top);
        var favIds = getFavoritesIds();

        var debugInfo =
            '<div class="my-top-debug">' +
            '<b>Диагностика:</b><br>' +
            'В топе (хранилище): <b>' + ids.length + '</b><br>' +
            'В избранном Lampa: <b>' + favIds.length + '</b><br>' +
            'Ключ: <code>' + STORAGE_KEY + '</code>' +
            '</div>';

        if (ids.length === 0) {
            return '<div class="my-top-page">' +
                '<div class="my-top-empty">Топ пуст.<br>Добавь карточку кнопкой «В мой топ» на странице фильма.</div>' +
                debugInfo +
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

        return '<div class="my-top-page">' + list + debugInfo + '</div>';
    }

    function pageStyles() {
        return '<style>' +
            '.my-top-page{padding-bottom:40px;}' +
            '.my-top-empty{padding:40px 20px;text-align:center;color:#8a8a95;font-size:15px;line-height:1.6;}' +
            '.my-top-list{display:flex;flex-direction:column;gap:10px;padding:16px;}' +
            '.my-top-item{display:flex;align-items:center;gap:12px;background:#1c1c22;border-radius:10px;padding:12px;}' +
            '.my-top-place{font-size:20px;font-weight:700;color:#3a6df0;min-width:40px;text-align:center;}' +
            '.my-top-poster img{width:50px;height:75px;object-fit:cover;border-radius:6px;}' +
            '.my-top-info{flex:1;min-width:0;}' +
            '.my-top-title{font-size:15px;font-weight:600;color:#e8e8ec;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
            '.my-top-badge{display:inline-block;margin-left:8px;padding:2px 6px;font-size:10px;font-weight:700;background:#3a6df0;color:#fff;border-radius:4px;vertical-align:middle;}' +
            '.my-top-year{font-size:13px;color:#8a8a95;margin-top:4px;}' +
            '.my-top-debug{margin:16px;padding:12px;background:#141418;border:1px solid #2c2c34;border-radius:8px;color:#8a8a95;font-size:12px;line-height:1.6;}' +
            '.my-top-debug code{color:#e8e8ec;background:#22222a;padding:1px 4px;border-radius:3px;}' +
            '</style>';
    }

    // ============ РЕГИСТРАЦИЯ КОМПОНЕНТА ============
    function registerTopComponent() {
        if (!window.Lampa || !Lampa.Component || !Lampa.Component.add) {
            console.error('[MyTop] Component.add недоступен');
            return;
        }

        Lampa.Component.add('my_top_page', {
            create: function () {
                this.html = $('<div class="my-top-page-wrapper"></div>');
                this.html.html(renderTopPage() + pageStyles());
                return this.html;
            },
            start: function () {
                // Перерисовываем при каждом входе — чтобы свежие данные
                if (this.html) {
                    this.html.html(renderTopPage() + pageStyles());
                }
            },
            render: function () { return this.html; }
        });
    }

    function openTopPage() {
        try {
            Lampa.Activity.push({
                url: '',
                title: 'Мой топ',
                component: 'my_top_page',
                data: {}
            });
        } catch (e) {
            console.error('[MyTop] Activity.push:', e);
            notify('Ошибка открытия');
        }
    }

    // ============ КНОПКА НА КАРТОЧКЕ ============
    function addButtonToFull(e) {
        if (e.type !== 'complite') return;
        var movie = e.data && e.data.movie ? e.data.movie : null;
        if (!movie) return;

        var label = isSeries(movie) ? '⭐ В мой топ (сериал)' : '⭐ В мой топ';

        var btn = $(
            '<div class="full-start__button view--custom">' +
            '<span>' + label + '</span>' +
            '</div>'
        );

        btn.on('hover:enter', function () {
            addToTop(movie);
        });

        if (e.object && e.object.activity) {
            e.object.activity.render().find('.view--custom').last().after(btn);
        }
    }

    // ============ ПУНКТ МЕНЮ (только первый) ============
    function addMenuItem() {
        var attempts = 0;
        var maxAttempts = 20;

        var tryAdd = function () {
            attempts++;
            var lists = $('.menu .menu__list');

            if (lists.length > 0) {
                // Берём ТОЛЬКО первый список (главное меню разделов)
                var first = lists.first();

                // Если уже добавили — выходим
                if (first.find('.my-top-menu-item').length > 0) {
                    console.log('[MyTop] Пункт уже есть в меню');
                    return;
                }

                var item = $(
                    '<li class="menu__item selector my-top-menu-item">' +
                    '<div class="menu__text">⭐ Мой топ</div>' +
                    '</li>'
                );

                item.on('hover:enter', openTopPage);
                first.append(item);
                console.log('[MyTop] Пункт меню добавлен в первый .menu__list');
            } else if (attempts < maxAttempts) {
                setTimeout(tryAdd, 500);
            } else {
                console.warn('[MyTop] Меню не найдено');
            }
        };

        setTimeout(tryAdd, 1500);
    }

    // ============ ИНИЦИАЛИЗАЦИЯ ============
    function startPlugin() {
        if (window[PLUGIN_NAME]) return;
        window[PLUGIN_NAME] = true;
        console.log('[MyTop] v4 запущен');

        window.addEventListener('error', function (e) {
            if (e.filename && e.filename.indexOf('main.js') !== -1) {
                console.error('[MyTop] JS ERROR:', e.message, e.lineno);
            }
        });

        registerTopComponent();
        Lampa.Listener.follow('full', addButtonToFull);
        addMenuItem();
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }
})();
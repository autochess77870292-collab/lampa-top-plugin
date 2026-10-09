// main.js — Плагин "Мой топ" для Lampa (v2)
// Берёт фильмы из раздела "Избранное", строит отдельную страницу с сортировкой.
(function () {
    'use strict';

    var PLUGIN_NAME = 'my_top_plugin_v2';
    var STORAGE_KEY = 'my_movie_top';

    // ========================
    // 1. БЕЗОПАСНЫЕ ВЫЗОВЫ
    // ========================
    function notify(msg) {
        try {
            if (window.Lampa && Lampa.Noty && typeof Lampa.Noty.show === 'function') {
                Lampa.Noty.show(msg);
            } else {
                console.log('[MyTop]', msg);
            }
        } catch (e) {
            console.error('[MyTop] Noty error:', e);
        }
    }

    function safeGet(key, def) {
        try {
            if (window.Lampa && Lampa.Storage && Lampa.Storage.get) {
                return Lampa.Storage.get(key, def);
            }
        } catch (e) {
            console.error('[MyTop] Storage.get error:', e);
        }
        return def;
    }

    function safeSet(key, val) {
        try {
            if (window.Lampa && Lampa.Storage && Lampa.Storage.set) {
                Lampa.Storage.set(key, val);
            }
        } catch (e) {
            console.error('[MyTop] Storage.set error:', e);
        }
    }

    // ========================
    // 2. ЧТЕНИЕ ИЗБРАННОГО ИЗ LAMPA
    // ========================
    // Lampa хранит избранное в localStorage под ключом 'favorite'.
    // Формат примерно такой:
    // { "like": [123, 456], "book": [789], "wath": [...], "history": [...] }
    // Точный формат нужно проверить на твоём устройстве.
    function getFavorites() {
        var raw = safeGet('favorite', '{}');
        var parsed;

        // Пробуем распарсить, если это строка
        if (typeof raw === 'string') {
            try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        } else {
            parsed = raw;
        }

        if (!parsed || typeof parsed !== 'object') {
            console.warn('[MyTop] Не удалось прочитать избранное. raw =', raw);
            return [];
        }

        // Собираем все ID из всех категорий
        var allIds = [];
        Object.keys(parsed).forEach(function (category) {
            var val = parsed[category];
            if (Array.isArray(val)) {
                val.forEach(function (id) {
                    if (allIds.indexOf(id) === -1) allIds.push(id);
                });
            }
        });

        return allIds;
    }

    // ========================
    // 3. РАБОТА С ТОПОМ (локальное хранилище плагина)
    // ========================
    function getTop() {
        var data = safeGet(STORAGE_KEY, '{}');
        if (typeof data === 'string') {
            try { return JSON.parse(data) || {}; } catch (e) { return {}; }
        }
        return data || {};
    }

    function saveTop(top) {
        safeSet(STORAGE_KEY, JSON.stringify(top));
    }

    // Фильм в топе? (id -> { place, title })
    function isInTop(movieId) {
        var top = getTop();
        return !!top[movieId];
    }

    // Добавить в топ без места (place = null)
    function addToTop(movie) {
        if (!movie || !movie.id) {
            notify('Не удалось определить фильм');
            return;
        }
        var top = getTop();
        if (top[movie.id]) {
            notify('Этот фильм уже в топе');
            return;
        }
        top[movie.id] = {
            id: movie.id,
            title: movie.title || 'Без названия',
            year: movie.release_date ? movie.release_date.split('-')[0] : '—',
            poster: movie.poster_path || '',
            place: null,          // ← изначально места нет, будет прочерк
            addedAt: Date.now()
        };
        saveTop(top);
        notify('"' + (movie.title || 'Фильм') + '" добавлен в топ');
    }

    // ========================
    // 4. СТРАНИЦА "МОЙ ТОП" (отдельный экран)
    // ========================
    function renderTopPage() {
        var top = getTop();
        var ids = Object.keys(top);

        if (ids.length === 0) {
            return '<div class="my-top-empty">Топ пока пуст. Добавь фильмы через кнопку на карточке.</div>';
        }

        // Сортируем: сначала с местом (по возрастанию), потом без места (по дате добавления)
        var items = ids.map(function (id) { return top[id]; });
        items.sort(function (a, b) {
            if (a.place && b.place) return a.place - b.place;
            if (a.place) return -1;
            if (b.place) return 1;
            return a.addedAt - b.addedAt;
        });

        var html = '<div class="my-top-list">';
        items.forEach(function (item) {
            var placeText = item.place ? '#' + item.place : '—';
            var poster = item.poster
                ? 'https://image.tmdb.org/t/p/w200' + item.poster
                : '';
            html += '<div class="my-top-item">' +
                '<div class="my-top-place">' + placeText + '</div>' +
                (poster ? '<div class="my-top-poster"><img src="' + poster + '" alt=""></div>' : '') +
                '<div class="my-top-info">' +
                '<div class="my-top-title">' + item.title + '</div>' +
                '<div class="my-top-year">' + item.year + '</div>' +
                '</div>' +
                '</div>';
        });
        html += '</div>';

        // Стили (инжектим один раз)
        html += '<style>' +
            '.my-top-empty{padding:40px;text-align:center;color:#8a8a95;font-size:15px;}' +
            '.my-top-list{display:flex;flex-direction:column;gap:10px;padding:16px;}' +
            '.my-top-item{display:flex;align-items:center;gap:12px;background:#1c1c22;border-radius:10px;padding:12px;}' +
            '.my-top-place{font-size:20px;font-weight:700;color:#3a6df0;min-width:40px;text-align:center;}' +
            '.my-top-poster img{width:50px;height:75px;object-fit:cover;border-radius:6px;}' +
            '.my-top-info{flex:1;min-width:0;}' +
            '.my-top-title{font-size:15px;font-weight:600;color:#e8e8ec;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
            '.my-top-year{font-size:13px;color:#8a8a95;margin-top:4px;}' +
            '</style>';

        return html;
    }

    // Регистрируем компонент для страницы
    function registerTopComponent() {
        if (!window.Lampa || !Lampa.Component || !Lampa.Component.add) {
            console.error('[MyTop] Lampa.Component.add недоступен');
            return;
        }

        Lampa.Component.add('my_top_page', {
            create: function () {
                this.html = $('<div class="my-top-page"></div>');
                this.html.html(renderTopPage());
                return this.html;
            },
            start: function () {
                // можно обновить при входе
            },
            render: function () {
                return this.html;
            }
        });
    }

    function openTopPage() {
        try {
            if (window.Lampa && Lampa.Activity && Lampa.Activity.push) {
                Lampa.Activity.push({
                    url: '',
                    title: 'Мой топ',
                    component: 'my_top_page',
                    data: {}
                });
            } else {
                notify('Навигация недоступна');
            }
        } catch (e) {
            console.error('[MyTop] Activity.push error:', e);
            notify('Ошибка открытия страницы');
        }
    }

    // ========================
    // 5. КНОПКА НА КАРТОЧКЕ ФИЛЬМА (со значком)
    // ========================
    function addButtonToFull(e) {
        if (e.type !== 'complite') return;
        var movie = e.data && e.data.movie ? e.data.movie : null;
        if (!movie) return;

        // Кнопка со SVG-звездой (значок вернул)
        var btn = $(
            '<div class="full-start__button view--custom">' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24px" height="24px">' +
            '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>' +
            '</svg>' +
            '<span>В мой топ</span>' +
            '</div>'
        );

        btn.on('hover:enter', function () {
            addToTop(movie);
        });

        if (e.object && e.object.activity) {
            e.object.activity.render().find('.view--custom').last().after(btn);
        }
    }

    // ========================
    // 6. ПУНКТ МЕНЮ
    // ========================
    function addMenuItem() {
        var attempts = 0;
        var maxAttempts = 20;

        var tryAdd = function () {
            attempts++;
            var menuList = $('.menu .menu__list');
            if (menuList.length > 0) {
                if (menuList.find('.my-top-menu-item').length > 0) return;

                var item = $(
                    '<li class="menu__item selector my-top-menu-item">' +
                    '<div class="menu__text">Мой топ</div>' +
                    '</li>'
                );

                item.on('hover:enter', openTopPage);
                menuList.append(item);
                console.log('[MyTop] Пункт меню добавлен');
            } else if (attempts < maxAttempts) {
                setTimeout(tryAdd, 500);
            } else {
                console.warn('[MyTop] Меню не найдено');
            }
        };

        setTimeout(tryAdd, 1500);
    }

    // ========================
    // 7. ДИАГНОСТИКА ИЗБРАННОГО (для отладки)
    // ========================
    function debugFavorites() {
        var raw = safeGet('favorite', '{}');
        console.log('[MyTop] Сырое значение favorite:', raw);
        var ids = getFavorites();
        console.log('[MyTop] Найдено ID в избранном:', ids.length, ids);
    }

    // ========================
    // 8. ИНИЦИАЛИЗАЦИЯ
    // ========================
    function startPlugin() {
        if (window[PLUGIN_NAME]) return;
        window[PLUGIN_NAME] = true;

        console.log('[MyTop] Плагин v2 запущен');

        window.addEventListener('error', function (e) {
            if (e.filename && e.filename.indexOf('main.js') !== -1) {
                console.error('[MyTop] JS ERROR:', e.message, e.filename, e.lineno);
            }
        });

        registerTopComponent();
        Lampa.Listener.follow('full', addButtonToFull);
        addMenuItem();

        // Для отладки — вывести избранное в консоль
        setTimeout(debugFavorites, 3000);
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }
})();

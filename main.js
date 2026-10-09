// main.js - Плагин "Мой топ" для Lampa
(function () {
    'use strict';

    var PLUGIN_NAME = 'my_top_plugin';
    var STORAGE_KEY = 'my_movie_top';

    // --- Вспомогательные функции для работы с хранилищем ---
    function getTop() {
        try {
            var data = Lampa.Storage.get(STORAGE_KEY, '[]');
            return JSON.parse(data);
        } catch (e) {
            console.error('[' + PLUGIN_NAME + '] Ошибка чтения:', e);
            return [];
        }
    }

    function saveTop(top) {
        Lampa.Storage.set(STORAGE_KEY, JSON.stringify(top));
    }

    function isMovieInTop(movieId) {
        var top = getTop();
        return top.some(function (item) { return item.id === movieId; });
    }

    function addToTop(movie) {
        if (isMovieInTop(movie.id)) {
            Lampa.Noty.show('Этот фильм уже в топе');
            return;
        }

        var top = getTop();
        top.push({
            id: movie.id,
            title: movie.title || 'Без названия',
            year: movie.release_date ? movie.release_date.split('-')[0] : '—',
            poster: movie.poster_path || '',
            addedAt: Date.now()
        });
        saveTop(top);

        Lampa.Noty.show('"' + (movie.title || 'Фильм') + '" добавлен в топ');
    }

    // --- Отображение топа (тестовая версия) ---
    function showTop() {
        var top = getTop();
        if (top.length === 0) {
            Lampa.Noty.show('Топ пока пуст');
            return;
        }
        Lampa.Noty.show('В топе ' + top.length + ' фильмов');
        console.log('[' + PLUGIN_NAME + '] Мой топ:', top);
    }

    // --- Добавление кнопки на страницу фильма ---
    function addButtonToFull(e) {
        if (e.type !== 'complite') return;

        // Получаем данные фильма
        var movie = e.data && e.data.movie ? e.data.movie : null;
        if (!movie) return;

        // Создаём кнопку
        var btn = $('<div class="full-start__button view--custom">' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24px" height="24px">' +
            '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>' +
            '</svg>' +
            '<span>В мой топ</span>' +
            '</div>');

        // Действие при нажатии
        btn.on('hover:enter', function () {
            addToTop(movie);
        });

        // Добавляем кнопку на страницу
        if (e.object && e.object.activity) {
            e.object.activity.render().find('.view--custom').last().after(btn);
        }
    }

    // --- Добавление пункта "Мой топ" в главное меню ---
    function addMenuItem() {
        // Ждём, пока меню отрисуется
        setTimeout(function () {
            var menuList = $('.menu .menu__list');
            if (menuList.length === 0) return;

            var item = $('<li class="menu__item selector">' +
                '<div class="menu__text">Мой топ</div>' +
                '</li>');

            item.on('hover:enter', showTop);
            menuList.append(item);
        }, 1000);
    }

    // --- Инициализация плагина ---
    function startPlugin() {
        // Защита от повторной загрузки
        if (window[PLUGIN_NAME]) return;
        window[PLUGIN_NAME] = true;

        console.log('[' + PLUGIN_NAME + '] Плагин загружен');

        // Подписываемся на события страницы фильма
        Lampa.Listener.follow('full', addButtonToFull);

        // Добавляем пункт в меню
        addMenuItem();
    }

    // --- Запуск ---
    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                startPlugin();
            }
        });
    }
})();

// main.js — плагин для Lampa: локальный топ фильмов
(function () {
    'use strict';

    // Ключ для хранения твоего топа в localStorage
    const STORAGE_KEY = 'my_movie_top';

    // 1. Получаем текущий топ из хранилища
    function getTop() {
        return JSON.parse(Lampa.Storage.get(STORAGE_KEY, '[]'));
    }

    // 2. Сохраняем топ в хранилище
    function saveTop(top) {
        Lampa.Storage.set(STORAGE_KEY, JSON.stringify(top));
    }

    // 3. Добавляем фильм в топ
    function addToTop(movieData) {
        const top = getTop();
        // Проверяем, нет ли уже такого фильма (по ID)
        if (top.some(item => item.id === movieData.id)) {
            Lampa.Noty.show('Этот фильм уже в топе');
            return;
        }
        // Добавляем в конец списка (позже можно сделать ранжирование)
        top.push({
            id: movieData.id,
            title: movieData.title,
            year: movieData.year,
            addedAt: Date.now()
        });
        saveTop(top);
        Lampa.Noty.show(`"${movieData.title}" добавлен в топ`);
    }

    // 4. Функция для добавления кнопки на карточку фильма
    function addTopButton(e) {
        // Проверяем, что это страница с полной информацией о фильме
        if (e.type !== 'complite') return;

        // Создаём кнопку
        var btn = $(`
            <div class="full-start__button view--custom">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24px" height="24px">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>
                </svg>
                <span>В мой топ</span>
            </div>
        `);

        // Обработчик нажатия
        btn.on('hover:enter', function () {
            const movie = e.data.movie;
            if (movie) {
                addToTop({
                    id: movie.id,
                    title: movie.title,
                    year: movie.release_date ? movie.release_date.split('-')[0] : null
                });
            }
        });

        // Добавляем кнопку на страницу
        if (e.object && e.object.activity) {
            e.object.activity.render().find('.full-start__buttons').append(btn);
        }
    }

    // 5. Функция для показа твоего топа
    function showTop() {
        const top = getTop();
        if (top.length === 0) {
            Lampa.Noty.show('Твой топ пока пуст');
            return;
        }
        // Здесь можно создать компонент для отображения списка
        // Для простоты покажем уведомление с количеством
        Lampa.Noty.show(`В твоём топе ${top.length} фильмов`);
        // В реальном плагине здесь нужно отрисовать список
        console.log('Мой топ:', top);
    }

    // 6. Добавляем кнопку "Мой топ" в главное меню
    function addTopMenuItem() {
        var item = $(`
            <li class="menu__item selector">
                <div class="menu__ico">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24px" height="24px">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>
                    </svg>
                </div>
                <div class="menu__text">Мой топ</div>
            </li>
        `);

        item.on('hover:enter', showTop);

        // Добавляем в меню (нужно найти подходящий селектор)
        setTimeout(function () {
            $('.menu .menu__list').append(item);
        }, 1000);
    }

    // 7. Инициализация плагина
    function startPlugin() {
        window.plugin_my_top_ready = true;

        // Подписываемся на события открытия карточки фильма
        Lampa.Listener.follow('full', addTopButton);

        // Добавляем пункт меню
        addTopMenuItem();

        console.log('Плагин "Мой топ" запущен');
    }

    // Запуск после готовности приложения
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

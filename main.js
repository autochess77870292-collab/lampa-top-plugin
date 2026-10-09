// main.js — ДИАГНОСТИКА (показывает всё через Noty)
(function () {
    'use strict';

    var TAG = 'DIAG';

    // Уведомления в очередь, чтобы не перекрывали друг друга
    var queue = [];
    var showing = false;

    function say(msg) {
        console.log('[' + TAG + ']', msg);
        queue.push(msg);
        if (!showing) next();
    }

    function next() {
        if (queue.length === 0) { showing = false; return; }
        showing = true;
        var msg = queue.shift();
        try {
            if (window.Lampa && Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('[' + TAG + '] ' + msg);
            }
        } catch (e) {}
        setTimeout(function () {
            try {
                if (window.Lampa && Lampa.Noty && Lampa.Noty.hide) Lampa.Noty.hide();
            } catch (e) {}
            setTimeout(next, 300);
        }, 2500);
    }

    function run() {
        say('1/6 плагин запущен');

        // Проверка Lampa и модулей
        var mods = [];
        if (window.Lampa) {
            ['Noty', 'Storage', 'Listener', 'Activity', 'Component', 'Menu', 'Utils', 'Arrays'].forEach(function (m) {
                if (Lampa[m]) mods.push(m);
            });
        }
        say('2/6 Lampa: ' + (window.Lampa ? 'да' : 'НЕТ') + ' | модули: ' + (mods.join(',') || 'нет'));

        // Проверка localStorage
        var lsOK = 'нет';
        try {
            localStorage.setItem('__diag_test', '1');
            if (localStorage.getItem('__diag_test') === '1') lsOK = 'да';
            localStorage.removeItem('__diag_test');
        } catch (e) { lsOK = 'ошибка: ' + e.message; }
        say('3/6 localStorage: ' + lsOK);

        // Проверка что мы вообще видим интерфейс
        setTimeout(function () {
            var menu = document.querySelector('.menu__list');
            say('4/6 menu__list: ' + (menu ? 'найден' : 'НЕТ'));

            // Подписываемся на все события full
            if (window.Lampa && Lampa.Listener) {
                try {
                    Lampa.Listener.follow('full', function (e) {
                        say('EVENT full: ' + (e && e.type ? e.type : '?'));
                    });
                    say('5/6 подписка на full: OK');
                } catch (e) {
                    say('5/6 подписка на full: ОШИБКА ' + e.message);
                }
            } else {
                say('5/6 Lampa.Listener недоступен');
            }

            // Смотрим все подписки (что уже слушает Lampa)
            setTimeout(function () {
                say('6/6 открой любую карточку фильма и смотри что придёт');
            }, 1500);
        }, 2000);
    }

    if (window.appready) {
        run();
    } else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') run();
        });
    } else {
        // Ждём появления Lampa
        var tries = 0;
        var iv = setInterval(function () {
            tries++;
            if (window.Lampa && window.appready) {
                clearInterval(iv);
                run();
            } else if (tries > 40) {
                clearInterval(iv);
                say('НЕ ДОЖДАЛИСЬ Lampa');
            }
        }, 500);
    }
})();
# Contributing

**English** · [Русский](#участие-в-разработке)

Thanks for wanting to help. hh-ru-job-automation-bot is a Chrome extension that automates hh.ru job applications, and it is maintained
by one person — so a well-described issue is worth as much as a pull request.

## Reporting a bug

Open a [bug report](https://github.com/N0deZ3r0/hh-ru-job-automation-bot/issues/new?template=bug_report.yml).
The form asks for the version, environment and steps to reproduce — please fill
those in, because "it does not work" cannot be acted on.

Found a **security** problem? Do not open a public issue —
[report it privately](https://github.com/N0deZ3r0/hh-ru-job-automation-bot/security/advisories/new).

## Running it locally

1. Clone the repository.
2. Open `chrome://extensions/` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. After editing a file, press the reload icon on the extension card.

## Checks before you push

```bash
node .github/scripts/validate.mjs js        # syntax-check every .js file
node .github/scripts/validate.mjs json      # parse every .json file
node .github/scripts/validate.mjs manifest  # sanity-check manifest.json
```

CI runs exactly these three commands on every push and pull request, so if they
pass locally they will pass there.

## Pull requests

- **One change per pull request.** A PR that fixes a bug *and* renames files is
  hard to review and hard to revert.
- **Explain the why, not only the what.** The diff already shows what changed.
- **Match the surrounding code.** Same naming, same indentation, same comment
  density as the file you are editing — do not reformat untouched lines.
- **Say how you tested it.** Even "loaded unpacked in Chrome 141 and clicked
  through the popup" is useful.

Small fixes — typos, dead links, a clearer sentence — do not need an issue first.
Just open the pull request.

## Language

Issues and pull requests in **English or Russian** are equally welcome.

---

# Участие в разработке

[English](#contributing) · **Русский**

Спасибо, что хотите помочь. Проект ведёт один человек, поэтому подробно
описанная задача ценится не меньше, чем пул-реквест.

## Сообщить об ошибке

Откройте [баг-репорт](https://github.com/N0deZ3r0/hh-ru-job-automation-bot/issues/new?template=bug_report.yml).
Форма просит версию, окружение и шаги воспроизведения — заполните их,
потому что по «не работает» сделать ничего нельзя.

Нашли **уязвимость**? Не создавайте публичную задачу —
[сообщите приватно](https://github.com/N0deZ3r0/hh-ru-job-automation-bot/security/advisories/new).

## Запуск у себя

1. Склонируйте репозиторий.
2. Откройте `chrome://extensions/` и включите **режим разработчика**.
3. Нажмите **Загрузить распакованное расширение** и выберите папку репозитория.
4. После правки файла нажмите значок перезагрузки на карточке расширения.

## Проверки перед отправкой

```bash
node .github/scripts/validate.mjs js        # синтаксис всех .js
node .github/scripts/validate.mjs json      # разбор всех .json
node .github/scripts/validate.mjs manifest  # проверка manifest.json
```

CI на каждый push и pull request выполняет ровно эти три команды — если локально
проходит, пройдёт и там.

## Пул-реквесты

- **Одно изменение — один пул-реквест.** PR, который чинит баг *и* переименовывает
  файлы, тяжело ревьюить и тяжело откатывать.
- **Объясняйте зачем, а не что.** Что изменилось, видно из диффа.
- **Держитесь стиля вокруг.** Те же имена, отступы и плотность комментариев, что
  в файле, который правите; не переформатируйте нетронутые строки.
- **Напишите, как проверяли.** Даже «загрузил распакованным в Chrome 141 и
  прокликал попап» — полезно.

Мелкие правки — опечатки, битые ссылки, более понятная формулировка — можно
слать пул-реквестом сразу, без задачи.

## Язык

Задачи и пул-реквесты на **русском или английском** одинаково приветствуются.

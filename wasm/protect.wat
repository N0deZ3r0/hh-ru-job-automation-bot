;; ============================================================================
;; protect.wat — модуль защиты от снятия отпечатка для HH Авто-отклик
;;
;; Пересобирается из этого исходника: node wasm/build.mjs
;;
;; Почему модуль переписан с нуля. Предыдущий protect.wasm собирался
;; эмскриптеном и экспортировал 30 функций, из которых JS вызывал четыре.
;; Замеры остальных показали, что подключать их нельзя:
;;   should_skip_canvas_noise  велел ПРОПУСКАТЬ холсты 1x1, 16x16 и 200x60,
;;                             а шуметь 1920x1080 — ровно наоборот нужному
;;   get_fake_shader_precision писала 23/23/0 вместо 127/127/23
;;   normalize_timing          сдвигала 1000.57 в 1002.083 (до 1.5 мс)
;;   get_fake_battery_level    возвращала аргумент без изменений
;;   get_random_int(100)       возвращала 31 при каждом вызове
;;   substitute_text_metrics   добавляла константу 0.0001 к любой метрике
;; Плюс 34 КБ бинарника и 30 КБ клея ради четырёх рабочих функций.
;;
;; Здесь нет импортов и нет аллокатора: JS пишет данные в память по
;; фиксированному смещению и при необходимости растит её сам.
;;
;; Весь шум ДЕТЕРМИНИРОВАН: значение зависит от сида сессии и от индекса
;; элемента, а не от порядка вызовов. Прежний модуль вёл поток случайных
;; чисел, поэтому повторное чтение того же холста давало другой результат.
;; ============================================================================

(module
  ;; Память: 1 страница (64 КБ). JS растит её под размер буфера.
  ;; Первые 1024 байта зарезервированы, рабочая область начинается с 1024.
  (memory (export "memory") 1)

  ;; Сид сессии для детерминированного шума
  (global $seed (mut i32) (i32.const 0x9E3779B9))
  ;; Отдельное состояние потокового генератора (random_int)
  (global $rng (mut i32) (i32.const 0x6D2B79F5))

  ;; ── splitmix32: перемешивает индекс с сидом сессии ────────────────────────
  ;; Даёт равномерный 32-битный хеш от (seed, x) без хранения состояния,
  ;; поэтому результат не зависит от того, в каком порядке звали функции.
  (func $mix (param $x i32) (result i32)
    (local $h i32)
    (local.set $h (i32.add (local.get $x) (global.get $seed)))
    (local.set $h (i32.mul
      (i32.xor (local.get $h) (i32.shr_u (local.get $h) (i32.const 16)))
      (i32.const 0x21F0AAAD)))
    (local.set $h (i32.mul
      (i32.xor (local.get $h) (i32.shr_u (local.get $h) (i32.const 15)))
      (i32.const 0x735A2D97)))
    (i32.xor (local.get $h) (i32.shr_u (local.get $h) (i32.const 15)))
  )

  ;; ── xorshift32 для потоковой случайности ──────────────────────────────────
  (func $next (result i32)
    (local $x i32)
    (local.set $x (global.get $rng))
    (local.set $x (i32.xor (local.get $x) (i32.shl   (local.get $x) (i32.const 13))))
    (local.set $x (i32.xor (local.get $x) (i32.shr_u (local.get $x) (i32.const 17))))
    (local.set $x (i32.xor (local.get $x) (i32.shl   (local.get $x) (i32.const 5))))
    ;; состояние xorshift не должно вырождаться в ноль
    (if (i32.eqz (local.get $x)) (then (local.set $x (i32.const 0x6D2B79F5))))
    (global.set $rng (local.get $x))
    (local.get $x)
  )

  ;; ── seed(a, b) ────────────────────────────────────────────────────────────
  ;; Вызывается один раз при старте значениями из crypto.getRandomValues.
  (func (export "seed") (param $a i32) (param $b i32)
    (global.set $seed (i32.or (local.get $a) (i32.const 1)))
    (global.set $rng  (select (local.get $b) (i32.const 0x6D2B79F5) (local.get $b)))
  )

  ;; ── should_noise_canvas(w, h) -> 0|1 ──────────────────────────────────────
  ;; Шумим всё вплоть до 1 мегапикселя. Отпечаток снимают с маленьких холстов
  ;; (200x60, 280x60, 300x150); всё, что крупнее мегапикселя, — реальная
  ;; графика страницы, её трогать не нужно. Прежняя функция делала наоборот.
  (func (export "should_noise_canvas") (param $w i32) (param $h i32) (result i32)
    (if (i32.or (i32.le_s (local.get $w) (i32.const 0))
                (i32.le_s (local.get $h) (i32.const 0)))
      (then (return (i32.const 0))))
    ;; отсекаем заведомо большие стороны до умножения, чтобы не переполнить i32
    (if (i32.or (i32.gt_s (local.get $w) (i32.const 8192))
                (i32.gt_s (local.get $h) (i32.const 8192)))
      (then (return (i32.const 0))))
    (i32.le_s (i32.mul (local.get $w) (local.get $h)) (i32.const 1048576))
  )

  ;; ── canvas_noise(ptr, len) ────────────────────────────────────────────────
  ;; RGBA-байты по адресу ptr. Меняем ровно один цветовой канал примерно у
  ;; половины пикселей на +-1. Альфа не трогается никогда: сдвиг альфы —
  ;; известная сигнатура антидетект-расширений.
  (func (export "canvas_noise") (param $ptr i32) (param $len i32)
    (local $i i32) (local $h i32) (local $p i32) (local $v i32)
    (local.set $i (i32.const 0))
    (block $done
      (loop $lp
        (br_if $done (i32.ge_u (local.get $i) (local.get $len)))
        (local.set $h (call $mix (local.get $i)))
        ;; шумим пиксель, если младший бит выборки нулевой (примерно 50%)
        (if (i32.eqz (i32.and (i32.shr_u (local.get $h) (i32.const 7)) (i32.const 1)))
          (then
            ;; канал 0..2 — R, G или B
            (local.set $p (i32.add (i32.add (local.get $ptr) (local.get $i))
              (i32.rem_u (i32.shr_u (local.get $h) (i32.const 11)) (i32.const 3))))
            (local.set $v (i32.load8_u (local.get $p)))
            (if (i32.and (i32.shr_u (local.get $h) (i32.const 3)) (i32.const 1))
              (then (local.set $v (i32.add (local.get $v) (i32.const 1))))
              (else (local.set $v (i32.sub (local.get $v) (i32.const 1)))))
            ;; клампинг: Uint8ClampedArray на стороне JS обрезал бы сам,
            ;; но модуль пишет в память напрямую и обязан сделать это тут
            (if (i32.lt_s (local.get $v) (i32.const 0))
              (then (local.set $v (i32.const 0))))
            (if (i32.gt_s (local.get $v) (i32.const 255))
              (then (local.set $v (i32.const 255))))
            (i32.store8 (local.get $p) (local.get $v))
          ))
        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $lp)
      )
    )
  )

  ;; ── text_width(width, ptr, len) -> width' ─────────────────────────────────
  ;; Перечисление шрифтов делают, измеряя ширину строки в разных гарнитурах.
  ;; Сдвигаем ширину на величину, зависящую от сида и от самой строки:
  ;; относительный сдвиг не больше 2e-5 (на 936 px это 0.019 px — вёрстка
  ;; не двигается), но таблица ширин становится уникальной для профиля.
  ;; Одна и та же строка всегда даёт один и тот же результат.
  (func (export "text_width") (param $w f64) (param $ptr i32) (param $len i32) (result f64)
    (local $h i32) (local $i i32)
    ;; FNV-1a по байтам строки, засеянный сидом сессии
    (local.set $h (i32.xor (global.get $seed) (i32.const 0x811C9DC5)))
    (local.set $i (i32.const 0))
    (block $done
      (loop $lp
        (br_if $done (i32.ge_u (local.get $i) (local.get $len)))
        (local.set $h (i32.mul
          (i32.xor (local.get $h) (i32.load8_u (i32.add (local.get $ptr) (local.get $i))))
          (i32.const 0x01000193)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $lp)
      )
    )
    (local.set $h (call $mix (local.get $h)))
    ;; width * (1 + ((h % 2001) - 1000) * 2e-8)
    (f64.mul
      (local.get $w)
      (f64.add
        (f64.const 1)
        (f64.mul
          (f64.convert_i32_s
            (i32.sub (i32.rem_u (local.get $h) (i32.const 2001)) (i32.const 1000)))
          (f64.const 2e-8))))
  )

  ;; ── audio_noise(ptr, count, intensity) ────────────────────────────────────
  ;; count чисел f32 по адресу ptr. Сдвиг не больше intensity по модулю;
  ;; при intensity 1e-4 это около -80 дБ — неслышимо, но отпечаток
  ;; OfflineAudioContext + DynamicsCompressor уже другой.
  (func (export "audio_noise") (param $ptr i32) (param $count i32) (param $intensity f32)
    (local $i i32) (local $h i32) (local $p i32)
    (local.set $i (i32.const 0))
    (block $done
      (loop $lp
        (br_if $done (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $h (call $mix (i32.xor (local.get $i) (i32.const 0x5BF03635))))
        (local.set $p (i32.add (local.get $ptr) (i32.shl (local.get $i) (i32.const 2))))
        (f32.store (local.get $p)
          (f32.add
            (f32.load (local.get $p))
            (f32.mul
              (f32.div
                (f32.convert_i32_s
                  (i32.sub (i32.rem_u (local.get $h) (i32.const 2001)) (i32.const 1000)))
                (f32.const 1000))
              (local.get $intensity))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $lp)
      )
    )
  )

  ;; ── shader_precision(precisionType, outPtr) ───────────────────────────────
  ;; Пишет три i32: rangeMin, rangeMax, precision.
  ;; Значения сняты с настоящего Chrome 152: float 127/127/23, int 31/30/0 —
  ;; одинаково для вершинного и фрагментного шейдера, поэтому тип шейдера
  ;; на результат не влияет и в параметрах не нужен.
  (func (export "shader_precision") (param $pt i32) (param $out i32)
    (if (i32.and (i32.ge_u (local.get $pt) (i32.const 0x8DF0))
                 (i32.le_u (local.get $pt) (i32.const 0x8DF2)))
      (then ;; LOW_FLOAT / MEDIUM_FLOAT / HIGH_FLOAT
        (i32.store (local.get $out) (i32.const 127))
        (i32.store (i32.add (local.get $out) (i32.const 4)) (i32.const 127))
        (i32.store (i32.add (local.get $out) (i32.const 8)) (i32.const 23)))
      (else ;; LOW_INT / MEDIUM_INT / HIGH_INT
        (i32.store (local.get $out) (i32.const 31))
        (i32.store (i32.add (local.get $out) (i32.const 4)) (i32.const 30))
        (i32.store (i32.add (local.get $out) (i32.const 8)) (i32.const 0))))
  )

  ;; ── max_anisotropy() -> f32 ───────────────────────────────────────────────
  (func (export "max_anisotropy") (result f32)
    (f32.const 16)
  )

  ;; ── random_int(max) -> [0, max) ───────────────────────────────────────────
  ;; Прежняя версия возвращала 31 при каждом вызове.
  (func (export "random_int") (param $max i32) (result i32)
    (if (i32.le_s (local.get $max) (i32.const 0))
      (then (return (i32.const 0))))
    (i32.rem_u (i32.and (call $next) (i32.const 0x7FFFFFFF)) (local.get $max))
  )
)

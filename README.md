# Telegram Business Bot & Xavfsiz Boshqaruv Paneli

Telegram Business orqali mijozlarga Gemini AI yordamida avtomatik aqlli javob beruvchi bot va xavfsiz monitoring paneli.

---

## 📁 Loyiha Strukturasi (Modular Architecture)

Loyiha qulaylik, kengaytirish va professional arxitektura standartlariga mos ravishda to'liq modulli shaklga keltirildi:

```
├── src/
│   ├── index.js                     # Barcha xizmatlarni (server + bot) ishga tushiruvchi yagona markaz
│   ├── config/                      # Sozlamalar va muhit o'zgaruvchilari
│   │   ├── index.js                 # .env, tokenlar va port konfiguratsiyasi
│   │   └── prompt.js                # Botning xarakteri va tizim ko'rsatmasi (System Prompt)
│   ├── bot/                         # Telegram bot boshqaruvi
│   │   ├── index.js                 # Bot yaratilishi va hayotiy sikli (startBot, shutdown)
│   │   ├── state.js                 # Xotiradagi holat (polling, diagnostika, conflict hisobi)
│   │   ├── polling.js               # Polling tsikli va 409 Conflict avto-boshqaruvi
│   │   └── handlers/                # Hodisalarni qayta ishlovchi modullar
│   │       ├── index.js             # Barcha handlerlarni botga ulash
│   │       ├── updates.js           # Kelgan update'larni qayd qilish middleware'i
│   │       ├── businessConnection.js# Biznes akkaunt ulanish hodisasi
│   │       └── businessMessage.js   # Biznes xabarlarini qayta ishlash & Gemini javobi
│   ├── services/                    # Tashqi xizmatlar va integratsiyalar
│   │   ├── gemini.service.js        # Google Gemini AI (zaxira modellar bilan chidamli javob)
│   │   ├── telegram.service.js      # Telegram API diagnostika va Webhook reset xizmati
│   │   ├── activity.service.js      # Faoliyat hodisalari va jonli statistika jurnali
│   │   └── render.service.js        # SSRF-himoyalangan Render serverini tekshirish
│   ├── server/                      # HTTP Web server & Dashboard API
│   │   ├── index.js                 # HTTP server bootstrap
│   │   ├── auth.js                  # Basic Auth, Bearer va x-admin-password himoyasi
│   │   ├── static.js                # Web dashboard va statik fayllar yetkazib berish
│   │   └── routes/                  # API yo'nalishlari (routes)
│   │       ├── index.js             # Bosh router dispetcheri
│   │       ├── health.routes.js     # /health (ochiq monitoring)
│   │       ├── status.routes.js     # /api/status (jonli status)
│   │       ├── activities.routes.js # /api/activities (hodisalar)
│   │       ├── errors.routes.js     # /api/errors & /api/errors/clear
│   │       ├── gemini.routes.js     # /api/test-gemini (AI sinovi)
│   │       ├── render.routes.js     # /api/ping-render (Render tekshiruvi)
│   │       └── telegram.routes.js   # /api/polling/toggle, reset-webhook, info
│   └── utils/                       # Umumiy yordamchi modullar
│       ├── errors.js                # Xatoliklarni xavfsiz jurnalga yozish (kalitlarni yashirish)
│       ├── http.js                  # sendJson va readBody funksiyalari
│       └── sleep.js                 # Async tanaffus (sleep / delay) funksiyasi
├── public/                          # Dashboard web interfeysi
│   └── index.html                   # Zamonaviy Tailwind CSS dashboard
├── bot.js                           # Orqaga moslik uchun asosiy kirish nuqtasi
├── server.js                        # Orqaga moslik uchun server eksporti
└── config.js, activity.js, ...      # Re-export fayllari (eski importlar buzilmasligi uchun)
```

---

## 🔒 Xavfsizlik va Himoya Tizimi

1. **Veb-sayt ichidagi qulay interfeys (In-Website UI Auth):**
   - Brauzerning tashqi noqulay alert / popup oynasi (`WWW-Authenticate`) to'liq olib tashlandi.
   - Saytning o'zida zamonaviy va chiroyli login formasi joylashgan bo'lib, parolni kiritish orqali boshqaruv paneli ochiladi.
   - Parol bir marta kiritilgach, brauzer sessiyasida eslab qolinadi va har safar qayta so'ramaydi. Istalgan vaqtda "Chiqish" tugmasi orqali sessiyani yopish mumkin.
   - Agar server muhitida `ADMIN_PASSWORD` kiritilmagan bo'lsa, sukut bo'yicha `admin123` paroli bilan kirish mumkin.
2. **Ochiq Monitoring (`/health`):**
   - UptimeRobot va tashqi monitoring xizmatlari uchun `/health` marshruti ochiq qoldirilgan (parol talab qilmaydi, doimiy `200 OK` qaytaradi).
3. **SSRF Himoyasi va CORS:**
   - Ochiq CORS to'liq olib tashlandi.
   - `POST /api/ping-render` serverga ixtiyoriy tashqi URL berishni taqiqlaydi va faqat belgilangan Render serverini (`RENDER_EXTERNAL_URL`) tekshiradi.
4. **Telegram 409 Conflict Oldini Olish:**
   - AI Studio muhitida bot polling'i sukut bo'yicha to'xtatilgan (Standby) holatda bo'ladi (`ENABLE_POLLING=false`).
   - Render serveringiz esa bot xabarlarini to'siqsiz qabul qiladi.
5. **Gemini 404 Zaxira Modellarga Avto-O'tish:**
   - Asosiy model o'chirilgan yoki topilmagan taqdirda (404 Not Found), tizim darhol zaxira modellarga (`gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-flash-latest`) o'tadi.

---

## ⚙️ Muhit O'zgaruvchilari (Environment Variables)

| O'zgaruvchi | Majburiy | Tavsif |
|---|---|---|
| `BOT_TOKEN` | Ha | @BotFather dan olingan Telegram bot tokeni |
| `GEMINI_API_KEY` | Ha | Google Gemini AI API kaliti |
| `ADMIN_PASSWORD` | Ha | Dashboard va API ga kirish uchun administrator paroli |
| `RENDER_EXTERNAL_URL` | Yo'q | Render ilovangiz manzili (sukut: `https://telegram-bot-imap.onrender.com`) |
| `ENABLE_POLLING` | Yo'q | Polling holati (`true` Render'da, `false` AI Studio'da) |
| `PORT` | Yo'q | Server porti (sukut: `3000`) |

---

## 🚀 Render'da Ishga Tushirish Qadamlari

1. **Render → Dashboard → Environment:**
   - `ADMIN_PASSWORD` o'zgaruvchisini qo'shing (uzun, ishonchli parol).
   - `BOT_TOKEN` va `GEMINI_API_KEY` mavjudligini tekshiring.
2. **UptimeRobot sozlamasi:**
   - Monitoring manzilini `https://telegram-bot-imap.onrender.com/health` ga o'zgartiring.
3. **Dashboard'ga kirish:**
   - Brauzerda ochganda login: `admin`, parol: siz kiritgan `ADMIN_PASSWORD`.

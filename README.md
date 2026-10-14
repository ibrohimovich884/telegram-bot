# Telegram Business Bot & Xavfsiz Boshqaruv Paneli

Telegram Business orqali mijozlarga Gemini AI yordamida avtomatik aqlli javob beruvchi bot va xavfsiz monitoring paneli.

---

## 🔒 Xavfsizlik va Himoya Tizimi

1. **Dashboard va API himoyasi (HTTP Basic Auth):**
   - Boshqaruv paneli (`/`), barcha `/api/*` marshrutlari va `/errors` maxfiy administrator paroli bilan yopilgan.
   - Brauzerda sahifani ochganda tizim login va parol so'raydi (login: istalgan, masalan `admin`, parol: `ADMIN_PASSWORD`).
   - `ADMIN_PASSWORD` o'rnatilmagan bo'lsa, dashboard va API'lar xavfsizlik maqsadida **503 Service Unavailable** holatida yopiq turadi.
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

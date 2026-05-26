# SARH WhatsApp Demo Agent

مشروع MVP داخلي لعرض مساعد واتساب ذكي لشركة **فضاء المحركات / Cars Space**.
النظام يرد على الرسائل الواردة فقط، يدعم التدخل البشري، ويتيح ضبط السلوك بالكامل من لوحة عربية.

## تنبيه مهم
هذا المشروع **Demo داخلي فقط**، وليس للإرسال الجماعي أو السبام.

## المتطلبات
- Node.js 18+
- واتساب أو واتساب Business على الجوال لمسح QR

## التثبيت
```bash
npm install
```

## التشغيل العادي
```bash
npm start
```
ثم افتح:
`http://localhost:3000`

## طريقة التشغيل النهائية للعرض الإداري
1. شغّل:
`start-demo.bat`

أو PowerShell:
`powershell -ExecutionPolicy Bypass -File .\start-demo.ps1`

2. افتح:
`http://localhost:3000`

3. في الإعداد الأولي:
- أدخل بيانات الشركة.
- أدخل رقم التواصل `0578448146`.
- اختر مزود الذكاء.
- أدخل API Key.
- أدخل اسم النموذج.
- اضغط **اختبار الاتصال**.

4. في اتصال واتساب:
- افتح واتساب أو WhatsApp Business.
- الأجهزة المرتبطة.
- ربط جهاز.
- امسح QR.

5. بعد الاتصال:
- عدّل قواعد الردود من صفحة **قواعد الردود**.
- عدّل شخصية المساعد من صفحة **عقل المساعد**.
- تابع المحادثات من صفحة **المحادثات**.
- استخدم التدخل البشري عند الحاجة.

## إعداد البيئة (.env)
استخدم `.env.example`:

```env
PORT=3000
APP_NAME="SARH WhatsApp Demo Agent"
APP_SECRET="change-this-long-random-secret"
SESSION_DIR="./storage/sessions"
DATABASE_PATH="./server/database/database.sqlite"
ENABLE_GROUPS=false
ADMIN_PASSWORD=change-me
AI_MODE=rules_first
AI_PROVIDER=rules_only
AI_BASE_URL=
AI_MODEL=
AI_TEMPERATURE=0.3
AI_MAX_OUTPUT_TOKENS=250
```

## أهم الصفحات
- `/setup` الإعداد الأولي (Wizard)
- `/` الرئيسية
- `/connection` اتصال واتساب
- `/conversations` المحادثات
- `/rules` قواعد الردود
- `/ai-brain` عقل المساعد
- `/logs` السجلات
- `/analytics` التحليلات

## قاعدة البيانات
الجداول الأساسية:
- `settings`
- `rules`
- `contacts`
- `messages`
- `logs`
- `analytics_events`
- `knowledge_entries`
- `setup_state`
- `ai_provider_settings`
- `company_profile`

## API
### الحالة والتحكم
- `GET /api/status`
- `GET /api/dashboard`
- `GET /api/analytics`
- `POST /api/connection/restart`
- `POST /api/session/reset`

### الإعداد الأولي
- `GET /api/setup/state`
- `GET /api/setup/data`
- `POST /api/setup/company`
- `POST /api/setup/locations`
- `POST /api/setup/provider`
- `POST /api/setup/assistant`
- `POST /api/setup/complete`

### مزود الذكاء
- `GET /api/provider`
- `PUT /api/provider`
- `POST /api/provider/test`

### المحادثات
- `GET /api/conversations`
- `GET /api/conversations/:jid/messages`
- `POST /api/conversations/:jid/reply`
- `POST /api/conversations/:jid/handoff`

### القواعد
- `GET /api/rules`
- `POST /api/rules`
- `PUT /api/rules/:id`
- `DELETE /api/rules/:id`
- `POST /api/rules/test`

### عقل المساعد والمعرفة
- `GET /api/ai-brain`
- `PUT /api/ai-brain`
- `POST /api/ai-brain/test`
- `GET /api/knowledge`
- `POST /api/knowledge`
- `PUT /api/knowledge/:id`
- `DELETE /api/knowledge/:id`

### الإعدادات والسجلات
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/logs`
- `DELETE /api/logs`

## ملاحظات تشغيل
- إذا لم يكتمل الإعداد الأولي، سيتم تحويل صفحات الإدارة إلى `/setup`.
- API Key لا يُعرض بصيغته الخام بعد الحفظ.
- النظام لا يبدأ محادثات من نفسه.
- لا يوجد Broadcast ولا Mass Messaging.

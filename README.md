# نكهة بسكرة

صفحة عربية للبيع وطلب باك من التوابل البسكرية، مصممة للهاتف أولًا. تتضمن نموذج طلب، ولوحة إدارة محمية لقراءة الطلبات وتعديل محتوى الباك وإضافة عدد مفتوح من الفيديوهات والمقاطع الصوتية.

## الروابط

- صفحة المتجر: https://azzeddinecharef-netizen.github.io/tawabil/
- إرسال طلب: https://azzeddinecharef-netizen.github.io/tawabil/#order
- لوحة الإدارة والطلبات: https://azzeddinecharef-netizen.github.io/tawabil/admin.html

## البنية والنشر

- الواجهة العامة ولوحة الإدارة: GitHub Pages من مجلد `public/`.
- حفظ الطلبات وإعدادات المتجر والجلسات: Supabase Database مع تفعيل RLS.
- المعالجة الخلفية: Edge Function باسم `course-api`.
- النشر: سير GitHub Actions في `.github/workflows/deploy-pages.yml`.

## إعداد قاعدة البيانات وSupabase

نفّذ ملفات `supabase/migrations/` بالترتيب في SQL Editor. إذا كان المخطط الأول مستخدمًا من صفحة الدورة السابقة، نفّذ migration `20261015020000_spice_orders_and_media.sql` لإضافة جدول الطلبات وحقل الوسائط.

انشر `supabase/functions/course-api/index.ts` كدالة باسم `course-api`. أوقف خيار `Verify JWT with legacy secret`؛ الدالة تستخدم جلسات إدارة خاصة، وتتحقق من الطلبات قبل عرضها أو تعديل محتوى المتجر.

أضف كلمة مرور إدارة قوية وفريدة في Supabase Edge Function Secrets بالاسم الدقيق `ADMIN_PASSWORD`. لا تضع كلمات المرور أو مفاتيح Supabase في هذا المستودع أو في ملفات الواجهة.

## المقاطع

من لوحة الإدارة أضف لكل مقطع نوعه وعنوانه ورابطه. تظهر فيديوهات YouTube وGoogle Drive داخل الصفحة بمشغل مدمج. تظهر روابط الصوت المباشرة بأشرطة تشغيل صوتية، وروابط Google Drive داخل مشغل مدمج. اضبط مشاركة ملفات Drive على "أي شخص لديه الرابط" حتى يتمكن الزائر من مشاهدتها أو الاستماع إليها.

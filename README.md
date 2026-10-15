# مسار | صفحة الدورة والتسجيل

موقع عربي متوافق مع الهاتف، يحتوي على صفحة تعريفية بالدورة ونموذج تسجيل ولوحة إدارة محمية.

## الاستضافة

- الواجهة العامة ولوحة الإدارة: GitHub Pages من مجلد public/.
- حفظ الطلبات وإعدادات الدورة وجلسات الإدارة: قاعدة بيانات Supabase.
- المعالجة الخلفية: Supabase Edge Function باسم course-api.

الروابط بعد تفعيل النشر:

- صفحة الدورة: https://azzeddinecharef-netizen.github.io/tawabil/
- التسجيل: https://azzeddinecharef-netizen.github.io/tawabil/#register
- لوحة الإدارة: https://azzeddinecharef-netizen.github.io/tawabil/admin.html

## إعداد Supabase

1. شغّل supabase/migrations/20261015010000_course_schema.sql في SQL Editor.
2. انشر supabase/functions/course-api/index.ts كـ Edge Function باسم course-api، واجعل Verify JWT متوقفًا للدالة حتى تصل طلبات الزوار العامة؛ الدالة تتحقق من جلسة الإدارة بنفسها.
3. أضف سر الدالة باسم ADMIN_PASSWORD من صفحة Secrets في لوحة Supabase. اختر كلمة مرور إدارة قوية وفريدة، ولا تستخدم كلمة مرور قاعدة البيانات.
4. القيمتان القياسيتان SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY متاحتان للدوال في بيئة Supabase. لا تضف مفتاح الخدمة أو كلمة مرور قاعدة البيانات إلى ملفات الواجهة أو GitHub.
5. فعّل GitHub Pages باستخدام GitHub Actions. سير العمل في .github/workflows/publish.yml ينشر محتوى public/ تلقائيًا مع كل تحديث إلى main.

تستخدم الدالة جلسات إدارية عشوائية قصيرة العمر وتخزن بصمتها فقط. لا يستطيع زوار الموقع قراءة جدول التسجيلات مباشرة؛ تتم القراءة عبر الدالة بعد التحقق من الجلسة.
